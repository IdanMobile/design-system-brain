/**
 * Pack developer React TSX tarball for quick-component-generation.
 * Does not modify global FIGMA_SCREEN_COMPONENT maps.
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
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import {
  STORY_TSX_STAMP,
  safeStorySegment,
  storyDownloadDir
} from "./story-package.mjs";

/** re-export name fix */
const STORY_TSX_TARBALL = "component-tsx.tgz";

/**
 * @param {string} repo
 * @param {string} screenId
 * @param {string} componentName
 */
export function bakeQuickScreen(repo, screenId, componentName) {
  execSync(
    `node scripts/bake-figma-screen-ui.mjs --screen ${screenId} --component ${componentName}`,
    { cwd: repo, stdio: "pipe" }
  );
}

/**
 * @param {string} repo
 * @param {string} componentName
 */
function componentSource(repo, componentName) {
  const uiComponents = join(repo, "packages/ui/src/components");
  const dirPath = join(uiComponents, componentName);
  if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
    return { kind: "dir", src: dirPath };
  }
  const filePath = join(uiComponents, `${componentName}.tsx`);
  if (existsSync(filePath)) {
    return { kind: "file", src: filePath };
  }
  return null;
}

/**
 * @param {string} repo
 * @param {string} screenId
 * @param {string} componentName
 * @returns {Promise<{ tarballPath: string, files: Array<{ path: string, content: string }> }>}
 */
export async function packQuickComponentTsx(repo, screenId, componentName) {
  bakeQuickScreen(repo, screenId, componentName);

  const comp = componentSource(repo, componentName);
  if (!comp) {
    throw new Error(`Component source missing after bake: ${componentName}`);
  }

  const seg = safeStorySegment(screenId);
  const outDir = storyDownloadDir(repo, screenId);
  const workDir = join(repo, ".test-console/story-pack-tsx-work", seg);
  mkdirSync(outDir, { recursive: true });
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(join(workDir, "src/components", componentName), { recursive: true });

  const componentDir = join(workDir, "src/components", componentName);
  if (comp.kind === "dir") {
    for (const entry of readdirSync(comp.src, { withFileTypes: true })) {
      const srcPath = join(comp.src, entry.name);
      const destPath = join(componentDir, entry.name);
      if (entry.isDirectory()) cpSync(srcPath, destPath, { recursive: true });
      else cpSync(srcPath, destPath);
    }
  } else {
    cpSync(comp.src, join(componentDir, `${componentName}.tsx`));
  }
  cpSync(join(repo, "packages/ui/src/styles.css"), join(workDir, "src/styles.css"));

  const uiPkg = JSON.parse(readFileSync(join(repo, "packages/ui/package.json"), "utf8"));
  writeFileSync(
    join(workDir, "package.json"),
    `${JSON.stringify(
      {
        name: `@guing/${componentName.toLowerCase()}`,
        version: uiPkg.version ?? "0.0.0",
        private: true,
        type: "module",
        peerDependencies: {
          react: "^18.0.0 || ^19.0.0",
          "react-dom": "^18.0.0 || ^19.0.0"
        }
      },
      null,
      2
    )}\n`
  );

  writeFileSync(
    join(workDir, "src/index.ts"),
    `export { ${componentName} } from "./components/${componentName}/${componentName}";\n`
  );

  const tarballPath = join(outDir, STORY_TSX_TARBALL);
  execSync(`tar -czf "${tarballPath}" -C "${workDir}" .`, { cwd: repo, stdio: "pipe" });

  writeFileSync(
    join(outDir, STORY_TSX_STAMP),
    `${JSON.stringify(
      {
        portfolioStoryId: screenId,
        component: componentName,
        variant: "quick-component-generation",
        packedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`
  );

  /** @type {Array<{ path: string, content: string }>} */
  const files = [];
  function walk(dir, prefix = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (!entry.name.endsWith(".tgz")) {
        files.push({ path: rel, content: readFileSync(full, "utf8") });
      }
    }
  }
  walk(workDir);

  return { tarballPath, files, workDir };
}

export { STORY_TSX_TARBALL };
