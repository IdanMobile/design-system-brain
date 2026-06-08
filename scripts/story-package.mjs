#!/usr/bin/env node
/**
 * Per-story delivery component tarball — one React component + story defaults.
 */

import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  copyFileSync
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { storyIdForScreen } from "./figma-screen-story-map.mjs";

export const STORY_TARBALL = "component.tgz";
export const STORY_TSX_TARBALL = "component-tsx.tgz";
export const STORY_STAMP = ".pack-stamp.json";
export const STORY_TSX_STAMP = ".pack-stamp-tsx.json";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".test-console"]);
const SKIP_EXT = [".tgz"];

/** Figma screen portfolio ids → @lab/ui component (when not in DEV_STORIES). */
const FIGMA_SCREEN_COMPONENT = {
  screen_1: "Screen1",
  screen_notification_avater: "ScreenNotificationAvater"
};

const SCREEN_BAKE = {
  Screen1: { screen: "screen_1", component: "Screen1" },
  ScreenNotificationAvater: {
    screen: "screen_notification_avater",
    component: "ScreenNotificationAvater"
  }
};

/** @param {string} storyId */
export function safeStorySegment(storyId) {
  return storyId
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** @param {string} repo */
export function storyDownloadsRoot(repo) {
  return join(repo, "packages/developer-playground/public/downloads/stories");
}

/** @param {string} repo @param {string} portfolioStoryId */
export function storyDownloadDir(repo, portfolioStoryId) {
  return join(storyDownloadsRoot(repo), safeStorySegment(portfolioStoryId));
}

/** @param {string} dir @param {number} max */
function walkMaxMtime(dir, max = 0) {
  if (!existsSync(dir)) return max;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      max = walkMaxMtime(path, max);
      continue;
    }
    if (SKIP_EXT.some((ext) => entry.name.endsWith(ext))) continue;
    max = Math.max(max, statSync(path).mtimeMs);
  }
  return max;
}

/** @param {string} repo */
async function loadStoriesModule(repo) {
  return import(resolve(repo, "packages/contract/src/stories.ts"));
}

/**
 * @param {string} repo
 * @param {string} portfolioStoryId
 */
export async function resolveStoryPackageTarget(repo, portfolioStoryId) {
  const deliveryStoryId = storyIdForScreen(portfolioStoryId) ?? portfolioStoryId;
  const storiesModule = await loadStoriesModule(repo);
  const entry = storiesModule.DEV_STORY_BY_ID[deliveryStoryId];
  if (entry) {
    if (entry.storybookOnly) return null;
    return {
      portfolioStoryId,
      deliveryStoryId,
      component: entry.component,
      args: entry.args ?? {}
    };
  }
  const component = FIGMA_SCREEN_COMPONENT[portfolioStoryId];
  if (!component) return null;
  return {
    portfolioStoryId,
    deliveryStoryId: portfolioStoryId,
    component,
    args: {}
  };
}

/** @param {string} repo @param {string} componentName */
function componentSource(repo, componentName) {
  const uiComponents = join(repo, "packages/ui/src/components");
  const dirPath = join(uiComponents, componentName);
  if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
    return {
      kind: "dir",
      src: dirPath,
      exportPath: `./components/${componentName}/${componentName}`
    };
  }
  const filePath = join(uiComponents, `${componentName}.tsx`);
  if (existsSync(filePath)) {
    return { kind: "file", src: filePath, exportPath: `./components/${componentName}` };
  }
  return null;
}

/** @param {string} repo @param {{ component: string }} target */
function storySourceMaxMtime(repo, target) {
  const comp = componentSource(repo, target.component);
  if (!comp) return 0;
  if (comp.kind === "dir") return walkMaxMtime(comp.src, 0);
  return statSync(comp.src).mtimeMs;
}

/** @param {string} repo @param {string} portfolioStoryId */
export function readStoryPackStamp(repo, portfolioStoryId) {
  const path = join(storyDownloadDir(repo, portfolioStoryId), STORY_STAMP);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {string} repo
 * @param {string} portfolioStoryId
 * @param {Awaited<ReturnType<typeof resolveStoryPackageTarget>>} target
 */
export function isStoryPackStale(repo, portfolioStoryId, target) {
  if (!target) return false;
  const tarball = join(storyDownloadDir(repo, portfolioStoryId), STORY_TARBALL);
  if (!existsSync(tarball)) return true;
  const version = JSON.parse(readFileSync(join(repo, "packages/ui/package.json"), "utf8")).version;
  const stamp = readStoryPackStamp(repo, portfolioStoryId);
  if (!stamp || stamp.version !== version || stamp.component !== target.component) return true;
  if (stamp.deliveryStoryId !== target.deliveryStoryId) return true;
  if (JSON.stringify(stamp.args ?? {}) !== JSON.stringify(target.args ?? {})) return true;
  if (semanticInputMaxMtime(repo, target) > (stamp.sourceMaxMtime ?? 0) + 500) return true;
  return false;
}

/** @param {{ component: string }} target */
function isCodegenScreenTarget(target) {
  return Boolean(SCREEN_BAKE[target.component]);
}

/** Minimal CSS shim — real styles come from @lab/ui peer dependency. */
const SEMANTIC_STYLES = `/* @lab/story semantic delivery — import @lab/ui/styles.css in your app */
.lab-semantic-screen,
.lab-semantic-screen * {
  box-sizing: border-box;
}
`;

/** @param {string} repo @param {{ deliveryStoryId: string, component: string }} target */
async function resolveContractForStory(repo, target) {
  const contractPath = join(repo, "packages/ui/src/components", target.component, "contract.json");
  if (existsSync(contractPath)) {
    return JSON.parse(readFileSync(contractPath, "utf8"));
  }
  const seg = safeStorySegment(target.deliveryStoryId);
  for (const dir of ["pixel-diffs", "delivery-diffs"]) {
    const artifactPath = join(repo, dir, seg, "artifact.v2.json");
    if (existsSync(artifactPath)) {
      return JSON.parse(readFileSync(artifactPath, "utf8"));
    }
  }
  return null;
}

/** @param {string} repo @param {object} target */
async function generateSemanticPackSource(repo, target) {
  const { renderSemanticFromContract, renderSemanticComponentFile } = await import(
    resolve(repo, "packages/pixel-test/src/render-semantic-tsx.ts")
  );
  const contract = await resolveContractForStory(repo, target);
  if (contract) {
    const ingress =
      contract.root?.source?.kind === "figma" || contract.root?.source?.dataset?.figmaNodeType
        ? "figma"
        : "storybook";
    return renderSemanticFromContract(contract, {
      rootComponent: target.component,
      storyId: target.deliveryStoryId,
      storyArgs: target.args ?? {},
      exportName: target.component,
      ingress
    });
  }
  const semantic = {
    schemaVersion: "1.0",
    rootComponent: target.component,
    storyArgs: target.args ?? {},
    ingress: "storybook",
    root: {
      kind: "component",
      componentId: target.component,
      props: target.args ?? {}
    }
  };
  return {
    semantic,
    source: renderSemanticComponentFile(semantic, target.component),
    usedComponents: [target.component]
  };
}

/** @param {string} repo @param {{ component: string }} target */
function semanticInputMaxMtime(repo, target) {
  const codegenPaths = [
    join(repo, "packages/pixel-test/src/render-semantic-tsx.ts"),
    join(repo, "packages/pixel-test/src/contract-to-semantic.ts"),
    join(repo, "packages/pixel-test/src/figma-component-bindings.ts"),
    join(repo, "packages/pixel-test/src/html-to-jsx.ts"),
    join(repo, "packages/pixel-test/src/render-html.ts"),
    join(repo, "packages/contract/src/semantic-graph.ts")
  ];
  let max = packInputMaxMtime(repo, target);
  for (const p of codegenPaths) {
    if (existsSync(p)) max = Math.max(max, statSync(p).mtimeMs);
  }
  const contractPath = join(repo, "packages/ui/src/components", target.component, "contract.json");
  if (existsSync(contractPath)) max = Math.max(max, statSync(contractPath).mtimeMs);
  return max;
}

/** @param {string} repo @param {string} portfolioStoryId @param {object} target */
function writeStoryPackStamp(repo, portfolioStoryId, target, semanticMeta = {}) {
  const version = JSON.parse(readFileSync(join(repo, "packages/ui/package.json"), "utf8")).version;
  writeFileSync(
    join(storyDownloadDir(repo, portfolioStoryId), STORY_STAMP),
    `${JSON.stringify(
      {
        version,
        portfolioStoryId: target.portfolioStoryId,
        deliveryStoryId: target.deliveryStoryId,
        component: target.component,
        args: target.args ?? {},
        variant: "semantic",
        usedComponents: semanticMeta.usedComponents ?? [],
        sourceMaxMtime: semanticInputMaxMtime(repo, target),
        packedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`
  );
}

/** Files touched by bake that do not change delivery content (timestamps only). */
const PACK_MTIME_SKIP = new Set([
  "baked.meta.ts",
  "figma-export.png",
  "figma-live-export.png"
]);

/** @param {string} repo @param {{ component: string }} target */
function packInputMaxMtime(repo, target) {
  const comp = componentSource(repo, target.component);
  if (!comp) return 0;
  if (comp.kind === "file") return statSync(comp.src).mtimeMs;
  let max = 0;
  for (const entry of readdirSync(comp.src, { withFileTypes: true })) {
    if (PACK_MTIME_SKIP.has(entry.name)) continue;
    const path = join(comp.src, entry.name);
    if (entry.isDirectory()) {
      max = Math.max(max, walkMaxMtime(path, 0));
    } else {
      max = Math.max(max, statSync(path).mtimeMs);
    }
  }
  return max;
}

/** @param {string} repo @param {{ component: string }} target */
function maybeBakeScreen(repo, target, skipBake) {
  if (skipBake) return;
  const bake = SCREEN_BAKE[target.component];
  if (!bake) return;
  execSync(
    `node scripts/bake-figma-screen-ui.mjs --screen ${bake.screen} --component ${bake.component}`,
    { cwd: repo, stdio: "pipe" }
  );
}

/** Minimal CSS for codegen TSX screens (inline styles carry layout). */
const CODEGEN_STYLES = `/* @lab/story codegen TSX — layout is inline; this file is for app wiring */
.lab-figma-screen,
.lab-figma-screen *,
.lab-figma-screen *::before,
.lab-figma-screen *::after {
  box-sizing: border-box;
}
`;

/** @param {string} repo @param {string} componentName */
async function codegenTsxSource(repo, componentName) {
  const contractPath = join(repo, "packages/ui/src/components", componentName, "contract.json");
  if (!existsSync(contractPath)) {
    throw new Error(`Missing contract for codegen TSX: ${contractPath}`);
  }
  const doc = JSON.parse(readFileSync(contractPath, "utf8"));
  const { renderToReactComponentFile } = await import(
    resolve(repo, "packages/pixel-test/src/render-tsx.ts")
  );
  return renderToReactComponentFile(doc, componentName);
}

/** @param {string} repo @param {string} portfolioStoryId */
export function readStoryPackTsxStamp(repo, portfolioStoryId) {
  const path = join(storyDownloadDir(repo, portfolioStoryId), STORY_TSX_STAMP);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {string} repo
 * @param {string} portfolioStoryId
 * @param {Awaited<ReturnType<typeof resolveStoryPackageTarget>>} target
 */
export function isStoryPackTsxStale(repo, portfolioStoryId, target) {
  if (!target) return false;
  const tarball = join(storyDownloadDir(repo, portfolioStoryId), STORY_TSX_TARBALL);
  if (!existsSync(tarball)) return true;
  const version = JSON.parse(readFileSync(join(repo, "packages/ui/package.json"), "utf8")).version;
  const stamp = readStoryPackTsxStamp(repo, portfolioStoryId);
  const codegenPaths = [
    join(repo, "packages/pixel-test/src/render-tsx.ts"),
    join(repo, "packages/pixel-test/src/html-to-jsx.ts"),
    join(repo, "packages/pixel-test/src/render-html.ts")
  ];
  const codegenMax = Math.max(
    packInputMaxMtime(repo, target),
    ...codegenPaths.map((p) => (existsSync(p) ? statSync(p).mtimeMs : 0))
  );
  if (!stamp || stamp.version !== version || stamp.component !== target.component) return true;
  if (stamp.deliveryStoryId !== target.deliveryStoryId) return true;
  if (JSON.stringify(stamp.args ?? {}) !== JSON.stringify(target.args ?? {})) return true;
  if (codegenMax > (stamp.sourceMaxMtime ?? 0) + 500) return true;
  return false;
}

/** @param {string} repo @param {string} portfolioStoryId @param {object} target @param {boolean} codegen */
function writeStoryPackTsxStamp(repo, portfolioStoryId, target, codegen) {
  const version = JSON.parse(readFileSync(join(repo, "packages/ui/package.json"), "utf8")).version;
  writeFileSync(
    join(storyDownloadDir(repo, portfolioStoryId), STORY_TSX_STAMP),
    `${JSON.stringify(
      {
        version,
        portfolioStoryId: target.portfolioStoryId,
        deliveryStoryId: target.deliveryStoryId,
        component: target.component,
        args: target.args ?? {},
        codegen,
        sourceMaxMtime: packInputMaxMtime(repo, target),
        packedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`
  );
}

/** @type {Map<string, Promise<{ packed: boolean, reason: string }>>} */
const packTsxInFlight = new Map();

export function storyPackTsxInFlight(storyId) {
  return packTsxInFlight.has(safeStorySegment(storyId));
}

/**
 * @param {string} repo
 * @param {string} portfolioStoryId
 * @param {{ force?: boolean, quiet?: boolean, reason?: string }} [options]
 */
export async function packStoryComponentTsx(repo, portfolioStoryId, options = {}) {
  const { quiet = false, skipBake = false } = options;
  const target = await resolveStoryPackageTarget(repo, portfolioStoryId);
  if (!target) {
    throw new Error(`No delivery component for story ${portfolioStoryId}`);
  }

  maybeBakeScreen(repo, target, skipBake);

  const comp = componentSource(repo, target.component);
  if (!comp) throw new Error(`Missing component source: ${target.component}`);

  const seg = safeStorySegment(portfolioStoryId);
  const outDir = storyDownloadDir(repo, portfolioStoryId);
  const workDir = join(repo, ".test-console/story-pack-tsx-work", seg);
  mkdirSync(outDir, { recursive: true });
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(join(workDir, "src/components"), { recursive: true });

  const codegen = isCodegenScreenTarget(target);
  const componentDir = join(workDir, "src/components", target.component);
  mkdirSync(componentDir, { recursive: true });

  if (codegen) {
    const tsxSource = await codegenTsxSource(repo, target.component);
    writeFileSync(join(componentDir, `${target.component}.tsx`), tsxSource, "utf8");
    writeFileSync(join(workDir, "src/styles.css"), CODEGEN_STYLES, "utf8");
  } else if (comp.kind === "dir") {
    for (const entry of readdirSync(comp.src, { withFileTypes: true })) {
      if (entry.name === "contract.json" || entry.name === "baked.meta.ts") continue;
      const srcPath = join(comp.src, entry.name);
      const destPath = join(componentDir, entry.name);
      if (entry.isDirectory()) {
        cpSync(srcPath, destPath, { recursive: true });
      } else {
        cpSync(srcPath, destPath);
      }
    }
    cpSync(join(repo, "packages/ui/src/styles.css"), join(workDir, "src/styles.css"));
  } else {
    cpSync(comp.src, join(componentDir, `${target.component}.tsx`));
    cpSync(join(repo, "packages/ui/src/styles.css"), join(workDir, "src/styles.css"));
  }

  const uiPkg = JSON.parse(readFileSync(join(repo, "packages/ui/package.json"), "utf8"));
  const packageName = `@lab/story-${seg}-tsx`;
  const exportPath = `./components/${target.component}/${target.component}`;

  writeFileSync(
    join(workDir, "src/story-meta.json"),
    `${JSON.stringify(
      {
        portfolioStoryId: target.portfolioStoryId,
        deliveryStoryId: target.deliveryStoryId,
        component: target.component,
        args: target.args ?? {},
        variant: "tsx",
        codegen
      },
      null,
      2
    )}\n`
  );

  writeFileSync(
    join(workDir, "src/index.ts"),
    `import "./styles.css";
export { ${target.component} } from "${exportPath}";
import storyMetaJson from "./story-meta.json";

export const storyMeta = storyMetaJson;
export const defaultStoryArgs = storyMetaJson.args as Record<string, unknown>;
`
  );

  writeFileSync(
    join(workDir, "package.json"),
    `${JSON.stringify(
      {
        name: packageName,
        version: uiPkg.version,
        description: `React TSX delivery for ${target.portfolioStoryId}${
          codegen ? " (codegen layout)" : ""
        }`,
        type: "module",
        files: ["src", "README.md", "package.json"],
        exports: {
          ".": "./src/index.ts",
          "./styles.css": "./src/styles.css"
        },
        peerDependencies: {
          react: uiPkg.peerDependencies?.react ?? "^18.0.0",
          "react-dom": uiPkg.peerDependencies?.["react-dom"] ?? "^18.0.0"
        }
      },
      null,
      2
    )}\n`
  );

  const argsPreview =
    Object.keys(target.args ?? {}).length > 0
      ? `\n<${target.component} {...defaultStoryArgs} />`
      : `\n<${target.component} />`;

  writeFileSync(
    join(workDir, "README.md"),
    [
      `# ${packageName}`,
      "",
      codegen
        ? `Codegen React TSX layout for Figma screen \`${target.portfolioStoryId}\` — real element tree (no contract runtime).`
        : `Hand-written React TSX for story \`${target.portfolioStoryId}\` (\`${target.component}\`).`,
      "",
      "```bash",
      `pnpm add ./${STORY_TSX_TARBALL}`,
      "```",
      "",
      "```tsx",
      `import "${packageName}/styles.css";`,
      `import { ${target.component}, defaultStoryArgs } from "${packageName}";`,
      argsPreview,
      "```"
    ].join("\n")
  );

  execSync("npm pack", { cwd: workDir, stdio: quiet ? "pipe" : "inherit" });
  const packed = readdirSync(workDir).find((name) => name.endsWith(".tgz"));
  if (!packed) throw new Error("npm pack did not produce a tarball");
  copyFileSync(join(workDir, packed), join(outDir, STORY_TSX_TARBALL));
  rmSync(join(workDir, packed));

  const meta = {
    name: packageName,
    version: uiPkg.version,
    portfolioStoryId: target.portfolioStoryId,
    deliveryStoryId: target.deliveryStoryId,
    component: target.component,
    args: target.args ?? {},
    codegen,
    variant: "tsx",
    file: STORY_TSX_TARBALL,
    href: `/downloads/stories/${encodeURIComponent(seg)}/${STORY_TSX_TARBALL}`
  };
  writeFileSync(join(outDir, "meta-tsx.json"), `${JSON.stringify(meta, null, 2)}\n`);
  writeStoryPackTsxStamp(repo, portfolioStoryId, target, codegen);

  if (!quiet) {
    console.log(`✓ Packed ${packageName} → ${join(outDir, STORY_TSX_TARBALL)}`);
  }
  return meta;
}

/**
 * @param {string} repo
 * @param {string} portfolioStoryId
 * @param {{ force?: boolean, quiet?: boolean, reason?: string }} [options]
 */
export async function ensureStoryPackTsx(repo, portfolioStoryId, options = {}) {
  const { force = false, quiet = false, reason = "", skipBake = false } = options;
  const target = await resolveStoryPackageTarget(repo, portfolioStoryId);
  if (!target) {
    return { packed: false, reason: "unavailable", available: false };
  }
  if (!force && !isStoryPackTsxStale(repo, portfolioStoryId, target)) {
    return { packed: false, reason: "fresh", available: true };
  }
  const key = `${safeStorySegment(portfolioStoryId)}:tsx`;
  if (packTsxInFlight.has(key)) return packTsxInFlight.get(key);

  const job = packStoryComponentTsx(repo, portfolioStoryId, { quiet, reason, skipBake })
    .then(() => ({ packed: true, reason: reason || "stale", available: true }))
    .finally(() => {
      packTsxInFlight.delete(key);
    });
  packTsxInFlight.set(key, job);
  return job;
}

/**
 * @param {string} repo
 * @param {string} portfolioStoryId
 */
export async function ensureStoryPacks(repo, portfolioStoryId, options = {}) {
  const target = await resolveStoryPackageTarget(repo, portfolioStoryId);
  if (!target) return;
  maybeBakeScreen(repo, target, false);
  await ensureStoryPack(repo, portfolioStoryId, { ...options, skipBake: true });
}


/** @type {Map<string, Promise<{ packed: boolean, reason: string }>>} */
const packInFlight = new Map();

export function storyPackInFlight(storyId) {
  return packInFlight.has(safeStorySegment(storyId));
}

/**
 * @param {string} repo
 * @param {string} portfolioStoryId
 * @param {{ force?: boolean, quiet?: boolean, reason?: string }} [options]
 */
export async function packStoryComponent(repo, portfolioStoryId, options = {}) {
  const { quiet = false, skipBake = false } = options;
  const target = await resolveStoryPackageTarget(repo, portfolioStoryId);
  if (!target) {
    throw new Error(`No delivery component for story ${portfolioStoryId}`);
  }

  maybeBakeScreen(repo, target, skipBake);

  const { source, usedComponents, semantic } = await generateSemanticPackSource(repo, target);

  const seg = safeStorySegment(portfolioStoryId);
  const outDir = storyDownloadDir(repo, portfolioStoryId);
  const workDir = join(repo, ".test-console/story-pack-work", seg);
  mkdirSync(outDir, { recursive: true });
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(join(workDir, "src/components", target.component), { recursive: true });

  writeFileSync(join(workDir, "src/components", target.component, `${target.component}.tsx`), source, "utf8");
  writeFileSync(join(workDir, "src/styles.css"), SEMANTIC_STYLES, "utf8");

  const uiPkg = JSON.parse(readFileSync(join(repo, "packages/ui/package.json"), "utf8"));
  const packageName = `@lab/story-${seg}`;

  writeFileSync(
    join(workDir, "src/story-meta.json"),
    `${JSON.stringify(
      {
        portfolioStoryId: target.portfolioStoryId,
        deliveryStoryId: target.deliveryStoryId,
        component: target.component,
        args: target.args ?? {},
        variant: "semantic",
        ingress: semantic.ingress,
        usedComponents
      },
      null,
      2
    )}\n`
  );

  writeFileSync(
    join(workDir, "src/index.ts"),
    `import "./styles.css";
export { ${target.component} } from "./components/${target.component}/${target.component}";
import storyMetaJson from "./story-meta.json";

export const storyMeta = storyMetaJson;
export const defaultStoryArgs = storyMetaJson.args as Record<string, unknown>;
`
  );

  writeFileSync(
    join(workDir, "package.json"),
    `${JSON.stringify(
      {
        name: packageName,
        version: uiPkg.version,
        description: `Semantic React delivery for ${target.portfolioStoryId} (@lab/ui components)`,
        type: "module",
        files: ["src", "README.md", "package.json"],
        exports: {
          ".": "./src/index.ts",
          "./styles.css": "./src/styles.css"
        },
        peerDependencies: {
          react: uiPkg.peerDependencies?.react ?? "^18.0.0",
          "react-dom": uiPkg.peerDependencies?.["react-dom"] ?? "^18.0.0",
          "@lab/ui": uiPkg.version
        }
      },
      null,
      2
    )}\n`
  );

  const argsPreview =
    Object.keys(target.args ?? {}).length > 0
      ? `\n<${target.component} {...defaultStoryArgs} />`
      : `\n<${target.component} />`;

  writeFileSync(
    join(workDir, "README.md"),
    [
      `# ${packageName}`,
      "",
      `Semantic React delivery for \`${target.portfolioStoryId}\` — real \`@lab/ui\` components (\`${target.component}\`).`,
      "",
      "Install peer dependency:",
      "",
      "```bash",
      `pnpm add @lab/ui`,
      `pnpm add ./${STORY_TARBALL}`,
      "```",
      "",
      "```tsx",
      `import "@lab/ui/styles.css";`,
      `import { ${target.component}, defaultStoryArgs } from "${packageName}";`,
      argsPreview,
      "```"
    ].join("\n")
  );

  execSync("npm pack", { cwd: workDir, stdio: quiet ? "pipe" : "inherit" });
  const packed = readdirSync(workDir).find((name) => name.endsWith(".tgz"));
  if (!packed) throw new Error("npm pack did not produce a tarball");
  copyFileSync(join(workDir, packed), join(outDir, STORY_TARBALL));
  rmSync(join(workDir, packed));

  const meta = {
    name: packageName,
    version: uiPkg.version,
    portfolioStoryId: target.portfolioStoryId,
    deliveryStoryId: target.deliveryStoryId,
    component: target.component,
    args: target.args ?? {},
    variant: "semantic",
    ingress: semantic.ingress,
    usedComponents,
    file: STORY_TARBALL,
    href: `/downloads/stories/${encodeURIComponent(seg)}/${STORY_TARBALL}`
  };
  writeFileSync(join(outDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  writeStoryPackStamp(repo, portfolioStoryId, target, { usedComponents });

  if (!quiet) {
    console.log(`✓ Packed ${packageName} → ${join(outDir, STORY_TARBALL)}`);
  }
  return meta;
}

/**
 * @param {string} repo
 * @param {string} portfolioStoryId
 * @param {{ force?: boolean, quiet?: boolean, reason?: string }} [options]
 */
export async function ensureStoryPack(repo, portfolioStoryId, options = {}) {
  const { force = false, quiet = false, reason = "", skipBake = false } = options;
  const target = await resolveStoryPackageTarget(repo, portfolioStoryId);
  if (!target) {
    return { packed: false, reason: "unavailable", available: false };
  }
  if (!force && !isStoryPackStale(repo, portfolioStoryId, target)) {
    return { packed: false, reason: "fresh", available: true };
  }
  const key = safeStorySegment(portfolioStoryId);
  if (packInFlight.has(key)) return packInFlight.get(key);

  const job = packStoryComponent(repo, portfolioStoryId, { quiet, reason, skipBake })
    .then(() => ({ packed: true, reason: reason || "stale", available: true }))
    .finally(() => {
      packInFlight.delete(key);
    });
  packInFlight.set(key, job);
  return job;
}

/**
 * @param {string} repo
 * @param {string} portfolioStoryId
 */
export async function readStoryPackageDownloadState(repo, portfolioStoryId) {
  const target = await resolveStoryPackageTarget(repo, portfolioStoryId);
  if (!target) {
    return {
      available: false,
      building: false,
      unsupported: true,
      storyId: portfolioStoryId,
      component: null,
      package: null
    };
  }

  const seg = safeStorySegment(portfolioStoryId);
  const dir = storyDownloadDir(repo, portfolioStoryId);

  const readMeta = (file) => {
    const path = join(dir, file);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
  };

  const meta = readMeta("meta.json");
  const building = storyPackInFlight(portfolioStoryId);

  if (!existsSync(join(dir, STORY_TARBALL)) && !building) {
    void ensureStoryPack(repo, portfolioStoryId, { quiet: true, reason: "auto" });
  }

  const tarball = join(dir, STORY_TARBALL);

  const pkg = {
    available: existsSync(tarball),
    building,
    variant: "semantic",
    label: "React component",
    storyId: portfolioStoryId,
    component: target.component,
    name: meta?.name ?? `@lab/story-${seg}`,
    version: meta?.version ?? null,
    file: STORY_TARBALL,
    href: `/downloads/stories/${encodeURIComponent(seg)}/${STORY_TARBALL}`,
    args: target.args ?? {},
    ingress: meta?.ingress ?? null,
    usedComponents: meta?.usedComponents ?? []
  };

  return {
    unsupported: false,
    storyId: portfolioStoryId,
    component: target.component,
    package: pkg
  };
}

/** @param {string} pathname */
export function safeStoryDownloadFile(repo, pathname) {
  const prefix = "/downloads/stories/";
  if (!pathname.startsWith(prefix)) return null;
  const rest = decodeURIComponent(pathname.slice(prefix.length));
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const seg = rest.slice(0, slash);
  const file = rest.slice(slash + 1);
  if (!seg || !file || seg.includes("..") || file.includes("..")) return null;
  const root = join(storyDownloadsRoot(repo), seg);
  const resolved = resolve(root, file);
  if (!resolved.startsWith(root + "/") && resolved !== root) return null;
  return resolved;
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const repo = resolve(process.cwd());
  const storyArg = process.argv.find((a) => a.startsWith("--story="))?.slice("--story=".length);
  if (!storyArg) {
    console.error("Usage: node scripts/story-package.mjs --story=<storyId> [--force]");
    process.exit(1);
  }
  ensureStoryPacks(repo, storyArg, {
    force: process.argv.includes("--force"),
    quiet: false,
    reason: "cli"
  })
    .then(() => {
      console.log("✓ Story package ready (semantic React delivery)");
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
