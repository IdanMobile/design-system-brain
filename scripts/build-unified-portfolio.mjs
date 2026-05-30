/**
 * Unified test portfolio — Figma + Storybook entry points in one table.
 *
 * Visual gates (all vs Original at PIXEL_PERFECT_TOLERANCE):
 *   → Figma live · → Storybook · → ReactHtml
 */

import { PIXEL_PERFECT_TOLERANCE } from "./pixel-perfect-tolerance.mjs";
import {
  FIGMA_ENTRY_STEPS,
  FIGMA_ENTRY_STEP_ORDER,
  ORIGINAL_PARITY_LEG_IDS
} from "./figma-entry-portfolio-config.mjs";
import { buildFigmaScreenPortfolioState } from "./figma-screen-portfolio.mjs";
import {
  TEST_STEPS,
  TEST_STEP_ORDER,
  canRunStep,
  resolvePipelineStatuses,
  recommendActionForRow,
  isStepPassing
} from "./test-portfolio-config.mjs";
import { existsSync, readFileSync } from "node:fs";
import { join as pathJoin } from "node:path";

export { PIXEL_PERFECT_TOLERANCE, ORIGINAL_PARITY_LEG_IDS };

/** Shared visual leg columns (same labels for every entry point). */
export const UNIFIED_VISUAL_LEG_IDS = ["vsFigmaLive", "vsStorybook", "vsReactHtml"];

export const UNIFIED_STEP_ORDER = [
  "structural",
  ...UNIFIED_VISUAL_LEG_IDS,
  "logic"
];

export const UNIFIED_STEPS = [
  {
    id: "structural",
    label: "Structural",
    dir: "test-portfolio",
    actionId: null
  },
  {
    id: "vsFigmaLive",
    label: "→ Figma live",
    dir: "figma-screen-diffs",
    actionId: "figma:screen:parity",
    needsRelay: true
  },
  {
    id: "vsStorybook",
    label: "→ Storybook",
    dir: "figma-screen-diffs",
    actionId: "figma:screen:parity"
  },
  {
    id: "vsReactHtml",
    label: "→ ReactHtml",
    dir: "figma-screen-diffs",
    actionId: "figma:screen:parity"
  },
  {
    id: "logic",
    label: "Logic audit",
    dir: "logic-audit-diffs",
    actionId: "logic:golden"
  }
];

/** Storybook ingress — original parity legs + legacy fallbacks. */
function readStorybookParityResult(repoRoot, storyId, stepId) {
  const path = pathJoin(
    repoRoot,
    "storybook-parity-diffs",
    "by-story",
    safeSegment(storyId),
    stepId,
    "result.json"
  );
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** Fallback when storybook-parity result missing. */
const STORYBOOK_LEGACY_MAP = {
  structural: "pixel",
  vsFigmaLive: "figmaLive",
  vsReactHtml: "delivery",
  logic: "logic"
};

function safeSegment(input) {
  return String(input)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function readStoryResult(repoRoot, suiteId, storyId) {
  const dirs = {
    pixel: "pixel-diffs",
    figma: "figma-diffs",
    figmaLive: "figma-live-diffs",
    delivery: "delivery-diffs",
    logic: "logic-audit-diffs"
  };
  const dir = dirs[suiteId];
  if (!dir) return null;
  const path = pathJoin(repoRoot, dir, "by-story", safeSegment(storyId), "result.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function toRepoPath(repoRoot, absPath) {
  if (!absPath || typeof absPath !== "string") return null;
  const normalized = absPath.replace(/\\/g, "/");
  const repo = repoRoot.replace(/\\/g, "/");
  if (normalized.startsWith(repo)) {
    return `/repo/${normalized.slice(repo.length).replace(/^\//, "")}`;
  }
  return null;
}

function buildStorybookUnifiedRows(repoRoot, storyIds, storybookOnlyFn) {
  return storyIds.map((storyId) => {
    const storybookOnly = storybookOnlyFn(storyId);
    const rawStatuses = {};
    for (const step of TEST_STEPS) {
      const rec = readStoryResult(repoRoot, step.id === "figmaLive" ? "figmaLive" : step.id, storyId);
      rawStatuses[step.id] = rec?.status ?? "not_tested";
    }
    const effective = resolvePipelineStatuses(rawStatuses, { storybookOnly });
    const statusByStep = {};
    for (const step of TEST_STEPS) {
      statusByStep[step.id] = { status: effective[step.id] };
    }

    const cells = {};

    const pixelRec = readStoryResult(repoRoot, "pixel", storyId);
    const pixelStatus = effective.pixel;
    const pixelGate = canRunStep("pixel", {}, { storybookOnly });
    cells.structural = {
      status: pixelStatus,
      percent: pixelStatus !== "not_tested" && pixelStatus !== "skipped" ? pixelRec?.percent : undefined,
      testedAt: pixelRec?.testedAt ?? null,
      canRun: pixelGate.ok,
      blockedBy: pixelGate.blockedBy ?? null,
      blockedReason: pixelGate.reason ?? null,
      action: recommendActionForRow("pixel", pixelStatus, statusByStep, {
        storybookOnly,
        percent: pixelRec?.percent
      }),
      compareUrl: pixelRec?.diffPng ? toRepoPath(repoRoot, pixelRec.diffPng) : null,
      testReportUrl: pixelRec?.testReportPath ? toRepoPath(repoRoot, pixelRec.testReportPath) : null
    };

    for (const legId of UNIFIED_VISUAL_LEG_IDS) {
      const parityRec = readStorybookParityResult(repoRoot, storyId, legId);
      if (parityRec) {
        cells[legId] = {
          status: parityRec.status ?? "not_tested",
          percent: parityRec.percent,
          testedAt: parityRec.testedAt ?? null,
          canRun: true,
          blockedBy: null,
          blockedReason: null,
          action: parityRec.status === "pass" ? "—" : `Fix ${legId} (see test report)`,
          compareUrl: parityRec.diffPng ? toRepoPath(repoRoot, parityRec.diffPng) : null,
          testReportUrl: parityRec.testReportPath ? toRepoPath(repoRoot, parityRec.testReportPath) : null
        };
        continue;
      }
      const legacyId = STORYBOOK_LEGACY_MAP[legId];
      if (!legacyId) {
        cells[legId] = {
          status: "not_tested",
          canRun: false,
          blockedBy: legId,
          blockedReason: "Storybook original parity harness pending",
          action: "Run pnpm test:parity:storybook when available"
        };
        continue;
      }
      const suiteKey = legacyId === "figmaLive" ? "figmaLive" : legacyId;
      const rec = readStoryResult(repoRoot, suiteKey, storyId);
      const status = effective[suiteKey] ?? "not_tested";
      const gate = canRunStep(suiteKey, statusByStep, { storybookOnly });
      cells[legId] = {
        status,
        percent: status !== "not_tested" && status !== "skipped" ? rec?.percent : undefined,
        maxRegionPercent: rec?.maxRegionPercent,
        testedAt: rec?.testedAt ?? null,
        canRun: gate.ok,
        blockedBy: gate.blockedBy ?? null,
        blockedReason: gate.reason ?? null,
        action: recommendActionForRow(suiteKey, status, statusByStep, {
          storybookOnly,
          percent: rec?.percent
        }),
        compareUrl: rec?.diffPng ? toRepoPath(repoRoot, rec.diffPng) : null,
        testReportUrl: rec?.testReportPath ? toRepoPath(repoRoot, rec.testReportPath) : null
      };
    }

    const logicRec = readStoryResult(repoRoot, "logic", storyId);
    const logicStatus = effective.logic;
    const logicGate = canRunStep("logic", statusByStep, { storybookOnly });
    cells.logic = {
      status: logicStatus,
      percent: logicStatus !== "not_tested" ? logicRec?.percent : undefined,
      testedAt: logicRec?.testedAt ?? null,
      canRun: logicGate.ok,
      blockedBy: logicGate.blockedBy ?? null,
      blockedReason: logicGate.reason ?? null,
      action: recommendActionForRow("logic", logicStatus, statusByStep, { storybookOnly }),
      compareUrl: logicRec?.reportHtml ? toRepoPath(repoRoot, logicRec.reportHtml) : null
    };

    return {
      entryPoint: "storybook",
      storyId,
      storybookOnly,
      cells
    };
  });
}

function mapFigmaRow(figmaRow) {
  const c = figmaRow.cells;
  return {
    entryPoint: "figma",
    storyId: figmaRow.storyId,
    cells: {
      structural: {
        ...c.manifestContract,
        action: c.manifestContract?.action ?? "Run Manifest → Contract"
      },
      vsFigmaLive: c.vsFigmaLive,
      vsStorybook: c.vsStorybook,
      vsReactHtml: c.vsReactHtml,
      logic: c.logic
    }
  };
}

/** @param {string} repoRoot @param {string[]} storyIds @param {(id: string) => boolean} storybookOnlyFn */
export function buildUnifiedPortfolioState(repoRoot, storyIds, storybookOnlyFn) {
  const figmaState = buildFigmaScreenPortfolioState(repoRoot);
  const figmaRows = figmaState.rows.map(mapFigmaRow);
  const storybookRows = buildStorybookUnifiedRows(repoRoot, storyIds, storybookOnlyFn);
  const rows = [...figmaRows, ...storybookRows];

  return {
    generatedAt: new Date().toISOString(),
    storyCount: rows.length,
    source: "unified",
    itemLabel: "Item",
    entryPointLabel: "EntryPoint",
    steps: UNIFIED_STEPS,
    stepIds: UNIFIED_STEP_ORDER,
    tolerance: PIXEL_PERFECT_TOLERANCE,
    rows,
    htmlUrl: "/repo/test-portfolio/report.html"
  };
}

export { FIGMA_ENTRY_STEPS, FIGMA_ENTRY_STEP_ORDER };
