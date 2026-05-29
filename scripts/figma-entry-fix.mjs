/**
 * Figma-as-entry fix loop — per-step failing screens, paths, golden commands, agent prompts.
 * Used by test-console-server, agent-bridge, and fix-all-iterate.
 */

import { join } from "node:path";
import {
  FIGMA_ENTRY_STEPS,
  FIGMA_ENTRY_STEP_ORDER,
  recommendFigmaEntryAction
} from "./figma-entry-portfolio-config.mjs";
import {
  discoverFigmaScreens,
  readScreenStepResult,
  FIGMA_SCREEN_DIFFS_DIR
} from "./figma-screen-portfolio.mjs";

export { FIGMA_ENTRY_STEP_ORDER };

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

function screenDiffDir(repoRoot, screenId) {
  return join(repoRoot, FIGMA_SCREEN_DIFFS_DIR, screenId);
}

function stepSubdir(repoRoot, screenId, stepId) {
  return join(repoRoot, FIGMA_SCREEN_DIFFS_DIR, screenId, stepId);
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
  const diffBase = screenDiffDir(repoRoot, screenId);
  const stepBase = stepSubdir(repoRoot, screenId, stepId);

  /** @type {Record<string, string | null>} */
  const paths = {
    reportHtml: null,
    comparePng: null,
    storybookPng: null,
    figmaPng: null,
    diffPng: null,
    artifactPath: null,
    manifestPath: screenManifestPath(repoRoot, screenId),
    contractPath: join(repoRoot, "artifacts/figma-screens", `${screenId}.contract.json`),
    referencePng: join(repoRoot, "artifacts/figma-screens", `${screenId}.png`)
  };

  if (stepId === "manifestContract") {
    paths.comparePng = rec?.diffPng ?? join(diffBase, "manifestContract", "diff.png");
    paths.artifactPath = paths.manifestPath;
    paths.contractPath = rec?.contractPath ?? paths.contractPath;
  } else if (stepId === "contractFigma") {
    paths.comparePng = rec?.diffPng ?? join(diffBase, "diff.png");
    paths.storybookPng = rec?.referencePng ?? join(diffBase, "reference.png");
    paths.figmaPng = rec?.renderedPng ?? rec?.figmaPng ?? join(diffBase, "rendered.png");
    paths.diffPng = paths.comparePng;
    paths.artifactPath = paths.contractPath;
    paths.reportHtml = join(diffBase, "report.html");
  } else if (stepId === "storybook") {
    paths.comparePng = rec?.diffPng ?? join(diffBase, "storybook", "diff.png");
    paths.storybookPng = rec?.renderedPng ?? join(diffBase, "storybook", "rendered.png");
    paths.figmaPng = rec?.referencePng ?? join(diffBase, "storybook", "reference.png");
    paths.diffPng = paths.comparePng;
    paths.artifactPath = paths.contractPath;
  } else if (stepId === "fourWay") {
    const worstPair =
      rec?.pairs?.find((p) => p.status !== "pass") ??
      rec?.pairs?.find((p) => p.a === "original" && p.b === "figma") ??
      rec?.pairs?.[0];
    paths.comparePng = worstPair?.diffFile ?? join(stepBase, "diff-original-figma.png");
    paths.storybookPng = rec?.legs?.storybook ?? rec?.legs?.original ?? join(stepBase, "storybook.png");
    paths.figmaPng = rec?.legs?.figma ?? join(stepBase, "figma.png");
    paths.diffPng = paths.comparePng;
    paths.reportHtml = rec?.reportHtml ?? join(stepBase, "report.html");
    paths.artifactPath = paths.contractPath;
  } else if (stepId === "logic") {
    paths.reportHtml = rec?.specPath ?? join(repoRoot, "lab-memory/logic/specs", `${screenId}.spec.json`);
    paths.artifactPath = paths.reportHtml;
  }

  return {
    storyId: screenId,
    screenId,
    status,
    percent: rec?.percent ?? rec?.worstPairPercent ?? 0,
    maxRegionPercent: rec?.worstRegion?.pct ?? rec?.regions?.[0]?.pct ?? null,
    error: rec?.error ?? null,
    suiteId: stepId,
    suiteLabel: meta.label,
    stepId,
    tolerance: rec?.tolerance ?? 0.1,
    regionTolerance: rec?.regionTolerance ?? 0.1,
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
      return { bin: "node", args: ["scripts/figma-screen-manifest-test.mjs", ...artifactArg], tag: `figmaEntry:${stepId}:${screenId}` };
    case "contractFigma":
      return { bin: "node", args: ["scripts/figma-screen-test.mjs", ...artifactArg], tag: `figmaEntry:${stepId}:${screenId}` };
    case "storybook":
      return { bin: "node", args: ["scripts/figma-screen-storybook-test.mjs", ...artifactArg], tag: `figmaEntry:${stepId}:${screenId}` };
    case "fourWay":
      return { bin: "node", args: ["scripts/figma-screen-four-way-test.mjs", ...artifactArg], tag: `figmaEntry:${stepId}:${screenId}` };
    case "logic":
      return { bin: "node", args: ["scripts/figma-screen-logic-test.mjs", ...artifactArg], tag: `figmaEntry:${stepId}:${screenId}` };
    default:
      return null;
  }
}

export function figmaEntryGoldenActionId(stepId) {
  const meta = figmaEntryStepMeta(stepId);
  return meta?.actionId ?? null;
}

export function figmaEntryFixMode(stepId) {
  if (stepId === "contractFigma") return "live";
  if (stepId === "manifestContract") return "adapter";
  if (stepId === "logic") return "logic";
  return "figmaEntry";
}

export function figmaEntryNeedsPluginBuild(stepId) {
  return stepId === "contractFigma" || stepId === "storybook" || stepId === "fourWay";
}

export function figmaEntryNeedsRelay(stepId) {
  return stepId === "contractFigma";
}

export function figmaEntryRerunCommand(stepId, screenId) {
  const meta = figmaEntryStepMeta(stepId);
  if (!meta) return "re-run from test console Figma tab";
  const manifest = `artifacts/figma-screens/${screenId}.manifest.json`;
  switch (stepId) {
    case "manifestContract":
      return `pnpm test:figma:screen:manifest -- --artifact ${manifest}`;
    case "contractFigma":
      return `pnpm test:figma:screen -- --artifact ${manifest}`;
    case "storybook":
      return `pnpm test:figma:screen:storybook -- --artifact ${manifest}`;
    case "fourWay":
      return `pnpm test:figma:screen:four-way -- --artifact ${manifest}`;
    case "logic":
      return `pnpm test:figma:screen:logic -- --artifact ${manifest}`;
    default:
      return `pnpm test:figma:screen -- --artifact ${manifest}`;
  }
}

/**
 * @param {ReturnType<typeof figmaEntryStoryFromStep>} story
 * @param {string} stepId
 */
export function buildFigmaEntryFixPromptLines(story, stepId, extra = "") {
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
  if (story.paths.storybookPng) lines.push(`Reference leg: ${story.paths.storybookPng}`);
  if (story.paths.figmaPng) lines.push(`Figma leg: ${story.paths.figmaPng}`);
  if (story.paths.manifestPath) lines.push(`Manifest: ${story.paths.manifestPath}`);
  if (story.paths.contractPath) lines.push(`Contract: ${story.paths.contractPath}`);
  if (story.paths.reportHtml) lines.push(`Report: ${story.paths.reportHtml}`);

  lines.push(
    "",
    "── Fix area by step ──",
    stepId === "manifestContract"
      ? "Fix scripts/figma-manifest-to-contract.mjs — GROUP child rebase, skip TEXT in shell fills, preserve figmaRelativeTransform."
      : stepId === "contractFigma"
        ? "Fix packages/figma-importer-plugin/src/code-v2.ts + adapter (figma-manifest-to-contract.mjs). Live export only."
        : stepId === "storybook"
          ? "Fix contract render-html / scripts/bake-figma-screen-ui.mjs / packages/ui Screen component. Delivery Storybook uses ORIGINAL Guing PNG — rebuild storybook after bake."
          : stepId === "fourWay"
            ? "Triage four-way report — fix the failing leg (original↔figma usually = live importer; original↔storybook = bake + storybook rebuild)."
            : stepId === "logic"
              ? "Write lab-memory/logic/specs/<screenId>.spec.json from logic audit gaps."
              : "Fix figma entry pipeline.",
    "",
    "Read lab-memory/visual/patterns/figma-guing-screen-roundtrip.md and .cursor/skills/figma-screen-until-pass/SKILL.md.",
    "",
    `After fix: ${figmaEntryRerunCommand(stepId, story.storyId)}`,
    "Then: pnpm test:portfolio:refresh"
  );

  if (extra) lines.push("", extra);
  return lines;
}
