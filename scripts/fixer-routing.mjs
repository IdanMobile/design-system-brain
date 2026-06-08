/**
 * Fixer routing — testId → fixer, allowlists, verify commands, regression scope.
 * Single source of truth for test harnesses and fix dispatch.
 */

import { PIXEL_PERFECT_TOLERANCE } from "./pixel-perfect-tolerance.mjs";

/** @typedef {import('../packages/contract/src/test-report.ts').TestId} TestId */
/** @typedef {import('../packages/contract/src/test-report.ts').FixerId} FixerId */
/** @typedef {import('../packages/contract/src/test-report.ts').FailedTestRef} FailedTestRef */

export const FIXER_ALLOWLIST = {
  "figma-manifest-export": {
    allow: ["(Guing export plugin — outside this repo)"],
    forbidden: [
      "packages/**",
      "scripts/figma-manifest-to-contract.mjs",
      "artifacts/**/*.png"
    ]
  },
  "pipeline-enrichment": {
    allow: [
      "scripts/figma-screen-test.mjs",
      "scripts/figma-screen-reference-align.mjs",
      "scripts/figma-manifest-to-contract.mjs",
      "packages/contract/**"
    ],
    forbidden: [
      "packages/figma-importer-plugin/src/code-v2.ts",
      "packages/ui/**",
      "artifacts/**/*.png"
    ]
  },
  "manifest-to-contract": {
    allow: [
      "scripts/figma-manifest-to-contract.mjs",
      "scripts/figma-screen-reference-align.mjs",
      "packages/contract/**"
    ],
    forbidden: [
      "packages/figma-importer-plugin/**",
      "packages/extractor-playwright/**",
      "packages/pixel-test/src/render-html.ts",
      "packages/ui/**",
      "artifacts/**/*.png"
    ]
  },
  "storybook-to-contract": {
    allow: ["packages/extractor-playwright/src/extract.ts", "packages/contract/**"],
    forbidden: [
      "packages/figma-importer-plugin/**",
      "packages/pixel-test/src/render-html.ts",
      "packages/pixel-test/src/scene-to-html.ts",
      "packages/storybook-lab/**",
      "artifacts/**/*.png"
    ]
  },
  "contract-to-storybook": {
    allow: [
      "packages/pixel-test/src/render-html.ts",
      "packages/storybook-lab/**"
    ],
    forbidden: [
      "packages/figma-importer-plugin/**",
      "packages/extractor-playwright/**",
      "scripts/bake-figma-screen-ui.mjs",
      "packages/ui/src/components/Screen*/**",
      "artifacts/**/*.png"
    ]
  },
  "contract-to-figma": {
    allow: [
      "packages/figma-importer-plugin/src/code-v2.ts",
      "packages/pixel-test/src/scene-to-html.ts"
    ],
    forbidden: [
      "packages/extractor-playwright/**",
      "packages/pixel-test/src/render-html.ts",
      "packages/storybook-lab/**",
      "packages/ui/**",
      "artifacts/**/*.png"
    ]
  },
  "code-creator": {
    allow: [
      "scripts/bake-figma-screen-ui.mjs",
      "packages/ui/**",
      "packages/developer-playground/**"
    ],
    forbidden: [
      "Using reference PNG as UI background to pass parity",
      "artifacts/figma-screens/*.png as component assets",
      "packages/figma-importer-plugin/**"
    ]
  },
  "logic-audit": {
    allow: ["lab-memory/logic/specs/**", "scripts/figma-screen-logic-test.mjs", "scripts/logic-audit*.mjs"],
    forbidden: ["Pixel/visual hacks for logic gaps"]
  }
};

/** @type {Record<string, Omit<FailedTestRef, 'verifyCommand'> & { verifyTemplate: (ctx: object) => string }>} */
export const TEST_ROUTING = {
  manifestContract: {
    testId: "manifestContract",
    label: "Manifest → Contract",
    compare: { reference: "manifest", target: "contract" },
    primaryFixer: "manifest-to-contract",
    fixerChain: ["figma-manifest-export", "manifest-to-contract"],
    allowlist: FIXER_ALLOWLIST["manifest-to-contract"].allow,
    forbidden: FIXER_ALLOWLIST["manifest-to-contract"].forbidden,
    regressionScope: "all-screens-manifest",
    verifyTemplate: (ctx) =>
      `pnpm test:figma:screen:manifest -- --artifact ${ctx.manifestPath ?? "artifacts/figma-screens/<screen>.manifest.json"}`
  },
  structural: {
    testId: "structural",
    label: "Structural (Storybook → contract replay)",
    compare: { reference: "storybook", target: "renderedHtml" },
    primaryFixer: "storybook-to-contract",
    fixerChain: ["storybook-to-contract", "contract-to-storybook"],
    allowlist: FIXER_ALLOWLIST["storybook-to-contract"].allow,
    forbidden: FIXER_ALLOWLIST["storybook-to-contract"].forbidden,
    regressionScope: "tier-a",
    verifyTemplate: (ctx) =>
      ctx.storyId
        ? `pnpm test:pixel:golden -- --story ${ctx.storyId}`
        : "pnpm test:pixel:golden"
  },
  pixel: {
    testId: "pixel",
    label: "Pixel (Storybook vs rendered HTML)",
    compare: { reference: "storybook", target: "renderedHtml" },
    primaryFixer: "contract-to-storybook",
    fixerChain: ["storybook-to-contract", "contract-to-storybook"],
    allowlist: FIXER_ALLOWLIST["contract-to-storybook"].allow,
    forbidden: FIXER_ALLOWLIST["contract-to-storybook"].forbidden,
    regressionScope: "tier-a",
    verifyTemplate: (ctx) =>
      ctx.storyId
        ? `pnpm test:pixel:golden -- --story ${ctx.storyId}`
        : "pnpm test:pixel:golden"
  },
  vsFigmaLive: {
    testId: "vsFigmaLive",
    label: "Original → Figma live",
    compare: { reference: "original", target: "figmaLive" },
    primaryFixer: "contract-to-figma",
    fixerChain: ["manifest-to-contract", "contract-to-figma"],
    allowlist: FIXER_ALLOWLIST["contract-to-figma"].allow,
    forbidden: FIXER_ALLOWLIST["contract-to-figma"].forbidden,
    regressionScope: "tier-c",
    verifyTemplate: (ctx) =>
      `pnpm test:figma:screen -- --artifact ${ctx.manifestPath ?? "artifacts/figma-screens/<screen>.manifest.json"}`
  },
  figmaMock: {
    testId: "figmaMock",
    label: "Storybook → Figma mock",
    compare: { reference: "storybook", target: "figmaMock" },
    primaryFixer: "contract-to-figma",
    fixerChain: ["storybook-to-contract", "contract-to-figma"],
    allowlist: FIXER_ALLOWLIST["contract-to-figma"].allow,
    forbidden: FIXER_ALLOWLIST["contract-to-figma"].forbidden,
    regressionScope: "tier-c",
    verifyTemplate: (ctx) =>
      ctx.storyId ? `pnpm figma:iterate --story ${ctx.storyId}` : "pnpm test:figma:golden"
  },
  figmaLive: {
    testId: "figmaLive",
    label: "Storybook → Figma live",
    compare: { reference: "storybook", target: "figmaLive" },
    primaryFixer: "contract-to-figma",
    fixerChain: ["storybook-to-contract", "contract-to-figma"],
    allowlist: FIXER_ALLOWLIST["contract-to-figma"].allow,
    forbidden: FIXER_ALLOWLIST["contract-to-figma"].forbidden,
    regressionScope: "tier-c",
    verifyTemplate: (ctx) =>
      ctx.storyId ? `pnpm figma:live-iterate --story ${ctx.storyId}` : "pnpm test:figma:live:golden"
  },
  vsStorybook: {
    testId: "vsStorybook",
    label: "Original → Storybook",
    compare: { reference: "original", target: "storybook" },
    primaryFixer: "contract-to-storybook",
    fixerChain: ["manifest-to-contract", "contract-to-storybook"],
    allowlist: FIXER_ALLOWLIST["contract-to-storybook"].allow,
    forbidden: [
      ...FIXER_ALLOWLIST["contract-to-storybook"].forbidden,
      "Embedding Original PNG in @lab/ui to pass test"
    ],
    regressionScope: "tier-a",
    verifyTemplate: (ctx) =>
      `pnpm test:figma:screen:storybook -- --artifact ${ctx.manifestPath ?? "artifacts/figma-screens/<screen>.manifest.json"}`
  },
  vsReactHtml: {
    testId: "vsReactHtml",
    label: "Original → ReactHtml",
    compare: { reference: "original", target: "reactHtml" },
    primaryFixer: "contract-to-storybook",
    fixerChain: ["manifest-to-contract", "contract-to-storybook"],
    allowlist: FIXER_ALLOWLIST["contract-to-storybook"].allow,
    forbidden: FIXER_ALLOWLIST["contract-to-storybook"].forbidden,
    regressionScope: "tier-a",
    verifyTemplate: (ctx) =>
      `pnpm test:figma:screen:reacthtml -- --artifact ${ctx.manifestPath ?? "artifacts/figma-screens/<screen>.manifest.json"}`
  },
  delivery: {
    testId: "delivery",
    label: "Delivery (Storybook vs dev playground)",
    compare: { reference: "storybook", target: "reactHtml" },
    primaryFixer: "code-creator",
    fixerChain: ["contract-to-storybook", "code-creator"],
    allowlist: FIXER_ALLOWLIST["code-creator"].allow,
    forbidden: FIXER_ALLOWLIST["code-creator"].forbidden,
    regressionScope: "tier-a",
    verifyTemplate: (ctx) =>
      ctx.storyId ? `pnpm test:delivery:golden -- --story ${ctx.storyId}` : "pnpm test:delivery:golden"
  },
  logic: {
    testId: "logic",
    label: "Logic audit",
    compare: { reference: "contract", target: "storybook" },
    primaryFixer: "logic-audit",
    fixerChain: ["logic-audit"],
    allowlist: FIXER_ALLOWLIST["logic-audit"].allow,
    forbidden: FIXER_ALLOWLIST["logic-audit"].forbidden,
    regressionScope: "target-only",
    verifyTemplate: (ctx) =>
      ctx.manifestPath
        ? `pnpm test:figma:screen:logic -- --artifact ${ctx.manifestPath}`
        : "pnpm test:logic:audit:all"
  }
};

/**
 * @param {string} testId
 * @param {object} ctx — itemId, manifestPath, storyId, entryPoint
 * @returns {FailedTestRef | null}
 */
export function resolveFailedTest(testId, ctx = {}) {
  const route = TEST_ROUTING[testId];
  if (!route) return null;
  const { verifyTemplate, ...rest } = route;
  return {
    ...rest,
    verifyCommand: verifyTemplate(ctx)
  };
}

/**
 * @param {object} mismatch
 * @param {FailedTestRef} failedTest
 * @param {object} ctx
 */
export function buildMismatchFixPrompt(mismatch, failedTest, ctx = {}) {
  const lines = [
    `Failed test: ${failedTest.testId} (${failedTest.label})`,
    `Primary fixer: ${failedTest.primaryFixer}`,
    `Fixer chain (upstream if contract wrong): ${failedTest.fixerChain.join(" → ")}`,
    "",
    "── Ground rules ──",
    "• Fix the general algorithm — NOT per-item pixel hacks.",
    "• Screenshots are for investigation only — do NOT change UI/code to match PNGs.",
    "• Do NOT embed reference PNGs as assets to pass parity.",
    "",
    "── Allowlisted files ──",
    ...failedTest.allowlist.map((p) => `• ${p}`),
    "",
    "── Forbidden ──",
    ...failedTest.forbidden.map((p) => `• ${p}`),
    "",
    `── Mismatch ${mismatch.id} ──`,
    `Region: (${mismatch.bbox.x}, ${mismatch.bbox.y}) ${mismatch.bbox.width}×${mismatch.bbox.height}px`,
    `Wrong pixels: ${mismatch.wrongPixels} (${mismatch.percentInRegion.toFixed(3)}% in region)`,
    ...(mismatch.evidence?.message ? [`Evidence: ${mismatch.evidence.message}`] : []),
    ...(mismatch.images.compareSideBySide ? [`Compare crop: ${mismatch.images.compareSideBySide}`] : []),
    "",
    `Verify: ${failedTest.verifyCommand}`,
    "Regression scope: " + failedTest.regressionScope,
    ctx.itemId ? `Item: ${ctx.itemId}` : ""
  ].filter(Boolean);
  return lines.join("\n");
}

export function defaultTolerance() {
  return PIXEL_PERFECT_TOLERANCE;
}

/** Map legacy fix-all suiteId to testId */
export function suiteIdToTestId(suiteId) {
  const map = {
    pixel: "pixel",
    figma: "figmaMock",
    figmaLive: "figmaLive",
    delivery: "delivery",
    manifestContract: "manifestContract",
    vsFigmaLive: "vsFigmaLive",
    vsStorybook: "vsStorybook",
    vsReactHtml: "vsReactHtml",
    logic: "logic",
    structural: "structural"
  };
  return map[suiteId] ?? suiteId;
}
