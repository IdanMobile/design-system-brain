/**
 * Figma-as-entry fix loop — per-step failing screens, paths, golden commands, agent prompts.
 */

import { join } from "node:path";
import {
  FIGMA_ENTRY_STEPS,
  FIGMA_ENTRY_STEP_ORDER,
  ORIGINAL_PARITY_LEG_IDS,
  recommendFigmaEntryAction
} from "./figma-entry-portfolio-config.mjs";
import {
  discoverFigmaScreens,
  readScreenStepResult,
  FIGMA_SCREEN_DIFFS_DIR
} from "./figma-screen-portfolio.mjs";
import { fixPromptFromTestReport, loadTestReport, figmaScreenTestReportPath } from "./test-report-build.mjs";

export { FIGMA_ENTRY_STEP_ORDER, ORIGINAL_PARITY_LEG_IDS };

export function isFigmaEntryFixSuite(suiteId) {
  return FIGMA_ENTRY_STEP_ORDER.includes(suiteId);
}

export function figmaEntryStepMeta(stepId) {
  return FIGMA_ENTRY_STEPS.find((s) => s.id === stepId) ?? null;
}

/** @param {string} repoRoot @param {string} stepId */
export function findFigmaEntryFailingScreens(repoRoot, stepId, { includeNotTested = false } = {}) {
  const order = { error: 0, fail: 1, warn: 2, not_tested: 3, pass: 4 };
  const screens = discoverFigmaScreens(repoRoot);
  const rows = [];
  for (const { screenId } of screens) {
    const rec = readScreenStepResult(repoRoot, screenId, stepId);
    const status = rec?.status ?? "not_tested";
    if (status === "pass" || status === "skipped") continue;
    if (status === "not_tested" && !includeNotTested) continue;
    rows.push({ screenId, rec, status, percent: rec?.percent ?? 0 });
  }
  return rows.sort((a, b) => {
    const s = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    if (s !== 0) return s;
    return (b.percent ?? 0) - (a.percent ?? 0);
  });
}

function screenManifestPath(repoRoot, screenId) {
  const hit = discoverFigmaScreens(repoRoot).find((s) => s.screenId === screenId);
  return hit?.manifestPath ?? null;
}

function parityDir(repoRoot, screenId) {
  return join(repoRoot, FIGMA_SCREEN_DIFFS_DIR, screenId, "originalParity");
}

/**
 * @param {string} repoRoot
 * @param {string} screenId
 * @param {string} stepId
 */
export function figmaEntryStoryFromStep(repoRoot, screenId, stepId) {
  const meta = figmaEntryStepMeta(stepId);
  if (!meta) return null;
  const rec = readScreenStepResult(repoRoot, screenId, stepId);
  const status = rec?.status ?? "not_tested";
  const parityBase = parityDir(repoRoot, screenId);

  /** @type {Record<string, string | null>} */
  const paths = {
    reportHtml: rec?.reportHtml ?? join(parityBase, "report.html"),
    comparePng: rec?.diffPng ?? null,
    storybookPng: rec?.targetPng ?? join(parityBase, "storybook.png"),
    figmaPng: join(parityBase, "figmaLive.png"),
    diffPng: rec?.diffPng ?? null,
    artifactPath: rec?.contractPath ?? join(repoRoot, "artifacts/figma-screens", `${screenId}.contract.json`),
    manifestPath: screenManifestPath(repoRoot, screenId),
    contractPath: rec?.contractPath ?? join(repoRoot, "artifacts/figma-screens", `${screenId}.contract.json`),
    referencePng: rec?.originalPng ?? join(repoRoot, "artifacts/figma-screens", `${screenId}.png`),
    testReportPath:
      rec?.testReportPath ?? figmaScreenTestReportPath(repoRoot, screenId, stepId)
  };

  if (stepId === "manifestContract") {
    paths.comparePng = rec?.diffPng ?? join(parityBase, "manifestContract", "diff.png");
    paths.artifactPath = paths.manifestPath;
    paths.contractPath = rec?.contractPath ?? paths.contractPath;
  } else if (ORIGINAL_PARITY_LEG_IDS.includes(stepId)) {
    const legFile =
      stepId === "vsFigmaLive"
        ? "figmaLive"
        : stepId === "vsStorybook"
          ? "storybook"
          : "reactHtml";
    paths.comparePng = rec?.diffPng ?? join(parityBase, `diff-original-${legFile}.png`);
    paths.storybookPng = join(parityBase, "storybook.png");
    paths.figmaPng = join(parityBase, "figmaLive.png");
    paths.diffPng = paths.comparePng;
  } else if (stepId === "logic") {
    paths.reportHtml = rec?.specPath ?? join(repoRoot, "lab-memory/logic/specs", `${screenId}.spec.json`);
    paths.artifactPath = paths.reportHtml;
  }

  return {
    storyId: screenId,
    screenId,
    status,
    percent: rec?.percent ?? 0,
    maxRegionPercent: rec?.worstRegion?.pct ?? rec?.maxRegionPercent ?? null,
    error: rec?.error ?? null,
    suiteId: stepId,
    suiteLabel: meta.label,
    stepId,
    tolerance: rec?.tolerance ?? 0.1,
    regionTolerance: rec?.tolerance ?? 0.1,
    paths,
    actionHint: recommendFigmaEntryAction(stepId, status, {
      percent: rec?.percent,
      error: rec?.error
    })
  };
}

/** @param {string} repoRoot @param {string} screenId @param {string} stepId */
export function readFigmaEntryStoryStatus(repoRoot, screenId, stepId) {
  const story = figmaEntryStoryFromStep(repoRoot, screenId, stepId);
  if (!story) return null;
  return {
    status: story.status,
    percent: story.percent,
    maxRegionPercent: story.maxRegionPercent ?? null,
    error: story.error ?? null
  };
}

/** Golden re-test command for one screen + step. */
export function figmaEntryGoldenSpawn(stepId, screenId, repoRoot) {
  const manifestPath = screenManifestPath(repoRoot, screenId);
  if (!manifestPath) return null;
  const artifactArg = ["--artifact", manifestPath];
  switch (stepId) {
    case "manifestContract":
      return {
        bin: "node",
        args: ["scripts/figma-screen-manifest-test.mjs", ...artifactArg],
        tag: `figmaEntry:${stepId}:${screenId}`
      };
    case "vsFigmaLive":
      return {
        bin: "node",
        args: ["scripts/figma-screen-test.mjs", ...artifactArg],
        tag: `figmaEntry:vsFigmaLive:${screenId}`
      };
    case "vsStorybook":
      return {
        bin: "node",
        args: ["scripts/figma-screen-storybook-test.mjs", ...artifactArg],
        tag: `figmaEntry:vsStorybook:${screenId}`
      };
    case "vsReactHtml":
      return {
        bin: "node",
        args: ["scripts/figma-screen-reacthtml-test.mjs", ...artifactArg],
        tag: `figmaEntry:vsReactHtml:${screenId}`
      };
    case "logic":
      return {
        bin: "node",
        args: ["scripts/figma-screen-logic-test.mjs", ...artifactArg],
        tag: `figmaEntry:${stepId}:${screenId}`
      };
    default:
      return null;
  }
}

export function figmaEntryGoldenActionId(stepId) {
  const meta = figmaEntryStepMeta(stepId);
  return meta?.actionId ?? null;
}

export function figmaEntryFixMode(stepId) {
  if (stepId === "vsFigmaLive") return "live";
  if (stepId === "manifestContract") return "adapter";
  if (stepId === "logic") return "logic";
  return "figmaEntry";
}

export function figmaEntryNeedsPluginBuild(stepId) {
  return stepId === "vsFigmaLive";
}

export function figmaEntryNeedsRelay(stepId) {
  return stepId === "vsFigmaLive";
}

export function figmaEntryRerunCommand(stepId, screenId) {
  const manifest = `artifacts/figma-screens/${screenId}.manifest.json`;
  switch (stepId) {
    case "manifestContract":
      return `pnpm test:figma:screen:manifest -- --artifact ${manifest}`;
    case "vsFigmaLive":
      return `pnpm test:figma:screen -- --artifact ${manifest}`;
    case "vsStorybook":
      return `pnpm test:figma:screen:storybook -- --artifact ${manifest}`;
    case "vsReactHtml":
      return `pnpm test:figma:screen:reacthtml -- --artifact ${manifest}`;
    case "logic":
      return `pnpm test:figma:screen:logic -- --artifact ${manifest}`;
    default:
      return `pnpm test:figma:screen:parity -- --artifact ${manifest}`;
  }
}

/**
 * @param {ReturnType<typeof figmaEntryStoryFromStep>} story
 * @param {string} stepId
 */
export function buildFigmaEntryFixPromptLines(story, stepId, extra = "") {
  const report = loadTestReport(story.paths?.testReportPath);
  if (report) {
    return fixPromptFromTestReport(report, extra).split("\n");
  }
  const mode = figmaEntryFixMode(stepId);
  const lines = [
    mode === "live" ? "make fixes after live test" : "run until pass",
    "",
    `Figma entry · ${story.suiteLabel} · screen ${story.storyId}`,
    `Status: ${story.status} · ${story.percent.toFixed(2)}% global${
      story.maxRegionPercent != null ? ` · worst hotspot ${story.maxRegionPercent.toFixed(2)}%` : ""
    }`,
    "",
    `Recommended: ${story.actionHint}`,
    "",
    "── Artifacts (open before editing) ──"
  ];

  if (story.paths.comparePng) lines.push(`Compare / diff: ${story.paths.comparePng}`);
  if (story.paths.referencePng) lines.push(`Original Guing PNG: ${story.paths.referencePng}`);
  if (story.paths.storybookPng) lines.push(`Storybook leg: ${story.paths.storybookPng}`);
  if (story.paths.figmaPng) lines.push(`Figma leg: ${story.paths.figmaPng}`);
  if (story.paths.manifestPath) lines.push(`Manifest: ${story.paths.manifestPath}`);
  if (story.paths.contractPath) lines.push(`Contract: ${story.paths.contractPath}`);
  if (story.paths.reportHtml) lines.push(`Report: ${story.paths.reportHtml}`);

  lines.push(
    "",
    "── Fix area by step ──",
    stepId === "manifestContract"
      ? "Fix scripts/figma-manifest-to-contract.mjs — GROUP child rebase, skip TEXT in shell fills, preserve figmaRelativeTransform."
      : stepId === "vsFigmaLive"
        ? "Fix packages/figma-importer-plugin/src/code-v2.ts + adapter. Original → Figma live leg only."
        : stepId === "vsStorybook"
          ? "Fix packages/pixel-test/src/render-html.ts — contract → HTML (Storybook leg). Original → Storybook only."
          : stepId === "vsReactHtml"
            ? "Fix packages/pixel-test/src/render-html.ts — contract → HTML (ReactHtml leg). Original → ReactHtml only."
            : stepId === "logic"
              ? "Write lab-memory/logic/specs/<screenId>.spec.json from logic audit gaps."
              : "Fix figma entry pipeline.",
    "",
    "── Fixer mandate (code edits required) ──",
    "You are a CODE fixer — not an investigator. The harness kills sessions with 0 code edits after 8 minutes.",
    "Use Grep on allowlisted files only. First edit within 5 minutes. Max 3 PNG reads before editing.",
    stepId === "vsFigmaLive"
      ? "Plugin bundles src/code.ts → imports code-v2.ts. Edit code-v2.ts only; harness runs plugin:build."
      : "Edit render-html.ts or figma-manifest-to-contract.mjs only for this step.",
    "",
    "Read lab-memory/visual/patterns/figma-guing-screen-roundtrip.md and .cursor/skills/figma-screen-until-pass/SKILL.md.",
    "",
    `After fix: ${figmaEntryRerunCommand(stepId, story.storyId)}`,
    "Then: pnpm test:portfolio:refresh"
  );

  if (extra) lines.push("", extra);
  return lines;
}
