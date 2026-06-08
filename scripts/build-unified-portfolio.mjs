/**
 * Unified test portfolio — Figma + Storybook entry points in one table.
 *
 * Parity steps (all vs Original at PIXEL_PERFECT_TOLERANCE):
 *   → Figma live · → Storybook · → ReactHtml · → ReactTsx
 */

import { PIXEL_PERFECT_TOLERANCE } from "./pixel-perfect-tolerance.mjs";
import {
  FIGMA_ENTRY_STEPS,
  FIGMA_ENTRY_STEP_ORDER,
  ORIGINAL_PARITY_LEG_IDS
} from "./figma-entry-portfolio-config.mjs";
import {
  buildFigmaScreenPortfolioState,
  readScreenStepResult,
  FIGMA_SCREEN_DIFFS_DIR,
  FIGMA_SCREENS_DIR
} from "./figma-screen-portfolio.mjs";
import {
  canRunFigmaEntryStep
} from "./figma-entry-portfolio-config.mjs";
import {
  TEST_STEPS,
  TEST_STEP_ORDER,
  canRunStep,
  resolvePipelineStatuses,
  recommendActionForRow,
  isStepPassing
} from "./test-portfolio-config.mjs";
import {
  canRunUnifiedStep,
  storybookFigmaLiveColumnStatus
} from "./unified-step-gate.mjs";
import { existsSync, readFileSync } from "node:fs";
import { join as pathJoin } from "node:path";
import { testReportViewUrls } from "./test-report-build.mjs";
import { attachUnifiedStepReports, writeUnifiedStepsIndex } from "./unified-step-reports.mjs";
import { attachStepPreviewUrl } from "./step-preview-url.mjs";
import { buildManualPreviewManifest } from "./build-manual-preview-manifest.mjs";

export { PIXEL_PERFECT_TOLERANCE, ORIGINAL_PARITY_LEG_IDS };

/** Shared visual leg columns (same labels for every entry point). */
export const UNIFIED_VISUAL_LEG_IDS = [
  "vsFigmaLive",
  "vsStorybook",
  "vsReactHtml",
  "vsReactTsx"
];

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
    id: "vsReactTsx",
    label: "→ React delivery",
    dir: "figma-screen-diffs",
    actionId: "figma:screen:reacttsx"
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
  vsReactTsx: "delivery",
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

function resolveOriginalPreviewUrl(repoRoot, entryPoint, storyId) {
  const seg = safeSegment(storyId);
  const candidates =
    entryPoint === "figma"
      ? [
          pathJoin(repoRoot, FIGMA_SCREEN_DIFFS_DIR, seg, "originalParity", "original.png"),
          pathJoin(repoRoot, FIGMA_SCREENS_DIR, `${storyId}.png`),
          pathJoin(repoRoot, FIGMA_SCREEN_DIFFS_DIR, seg, "reference.png")
        ]
      : [
          pathJoin(repoRoot, "pixel-diffs", seg, "storybook.png"),
          pathJoin(repoRoot, "pixel-diffs", "by-story", seg, "storybook.png"),
          pathJoin(
            repoRoot,
            "storybook-parity-diffs",
            "by-story",
            seg,
            "vsFigmaLive",
            "original.png"
          )
        ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return toRepoPath(repoRoot, candidate);
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
    const cellsForGate = {};

    const pixelRec = readStoryResult(repoRoot, "pixel", storyId);
    const pixelStatus = effective.pixel;
    const pixelGate = canRunUnifiedStep("storybook", "structural", cellsForGate);
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
      ...testReportViewUrls(repoRoot, pixelRec?.testReportPath)
    };
    cellsForGate.structural = { status: cells.structural.status };

    for (const legId of UNIFIED_VISUAL_LEG_IDS) {
      const parityRec = readStorybookParityResult(repoRoot, storyId, legId);
      if (parityRec) {
        const gate = canRunUnifiedStep("storybook", legId, cellsForGate);
        cells[legId] = {
          status: parityRec.status ?? "not_tested",
          percent: parityRec.percent,
          testedAt: parityRec.testedAt ?? null,
          canRun: gate.ok,
          blockedBy: gate.blockedBy ?? null,
          blockedReason: gate.reason ?? null,
          action: parityRec.status === "pass" ? "—" : `Fix ${legId} (see test report)`,
          compareUrl: parityRec.diffPng ? toRepoPath(repoRoot, parityRec.diffPng) : null,
          ...testReportViewUrls(repoRoot, parityRec.testReportPath)
        };
        cellsForGate[legId] = { status: cells[legId].status };
        continue;
      }
      const legacyId = STORYBOOK_LEGACY_MAP[legId];
      if (!legacyId) {
        const gate = canRunUnifiedStep("storybook", legId, cellsForGate);
        cells[legId] = {
          status: "not_tested",
          canRun: gate.ok,
          blockedBy: gate.blockedBy ?? legId,
          blockedReason: gate.ok
            ? "Storybook original parity harness pending"
            : gate.reason,
          action: gate.ok
            ? "Run pnpm test:parity:storybook when available"
            : gate.reason
        };
        cellsForGate[legId] = { status: "not_tested" };
        continue;
      }
      const suiteKey = legacyId === "figmaLive" ? "figmaLive" : legacyId;
      const rec =
        legId === "vsFigmaLive"
          ? readStoryResult(repoRoot, "figmaLive", storyId)
          : readStoryResult(repoRoot, suiteKey, storyId);
      const figmaRec = legId === "vsFigmaLive" ? readStoryResult(repoRoot, "figma", storyId) : null;
      const status =
        legId === "vsFigmaLive"
          ? storybookFigmaLiveColumnStatus(effective.figma, effective.figmaLive)
          : effective[suiteKey] ?? "not_tested";
      const gate = canRunUnifiedStep("storybook", legId, cellsForGate);
      cells[legId] = {
        status,
        percent:
          status !== "not_tested" && status !== "skipped"
            ? legId === "vsFigmaLive"
              ? rec?.percent ?? figmaRec?.percent
              : rec?.percent
            : undefined,
        maxRegionPercent: rec?.maxRegionPercent,
        testedAt: rec?.testedAt ?? figmaRec?.testedAt ?? null,
        canRun: gate.ok,
        blockedBy: gate.blockedBy ?? null,
        blockedReason: gate.reason ?? null,
        action: recommendActionForRow(
          legId === "vsFigmaLive" && effective.figma !== "pass" ? "figma" : suiteKey,
          status,
          statusByStep,
          {
            storybookOnly,
            percent: rec?.percent ?? figmaRec?.percent
          }
        ),
        compareUrl: rec?.diffPng ? toRepoPath(repoRoot, rec.diffPng) : null,
        ...testReportViewUrls(repoRoot, rec?.testReportPath ?? figmaRec?.testReportPath)
      };
      cellsForGate[legId] = { status: cells[legId].status };
    }

    const logicRec = readStoryResult(repoRoot, "logic", storyId);
    const logicStatus = effective.logic;
    const logicGate = canRunUnifiedStep("storybook", "logic", cellsForGate);
    cells.logic = {
      status: logicStatus,
      percent: logicStatus !== "not_tested" ? logicRec?.percent : undefined,
      testedAt: logicRec?.testedAt ?? null,
      canRun: logicGate.ok,
      blockedBy: logicGate.blockedBy ?? null,
      blockedReason: logicGate.reason ?? null,
      action: recommendActionForRow("logic", logicStatus, statusByStep, { storybookOnly }),
      compareUrl: logicRec?.reportHtml ? toRepoPath(repoRoot, logicRec.reportHtml) : null,
      ...testReportViewUrls(repoRoot, logicRec?.testReportPath)
    };

    return {
      entryPoint: "storybook",
      storyId,
      storybookOnly,
      originalUrl: resolveOriginalPreviewUrl(repoRoot, "storybook", storyId),
      cells
    };
  });
}

function parityCellFromRec(repoRoot, rec) {
  if (!rec) return null;
  const status = rec.status ?? "not_tested";
  const tested = status !== "not_tested" && status !== "skipped";
  return {
    status,
    percent: tested ? rec.percent : undefined,
    maxRegionPercent: tested ? rec.maxRegionPercent : undefined,
    testedAt: tested ? rec.testedAt ?? null : null,
    canRun: true,
    blockedBy: null,
    blockedReason: null,
    action: status === "pass" ? "—" : "Fix parity leg (see test report)",
    compareUrl: tested && rec.diffPng ? toRepoPath(repoRoot, rec.diffPng) : null,
    ...testReportViewUrls(repoRoot, rec.testReportPath)
  };
}

function mapFigmaRow(figmaRow, repoRoot) {
  const c = figmaRow.cells;
  const screenId = figmaRow.storyId;
  const cellsForGate = {
    manifestContract: { status: c.manifestContract?.status ?? "not_tested" }
  };

  const leg = (stepId, legacyKey) => {
    const fromDisk =
      readScreenStepResult(repoRoot, screenId, stepId) ??
      (legacyKey ? readScreenStepResult(repoRoot, screenId, legacyKey) : null);
    const built = parityCellFromRec(repoRoot, fromDisk);
    const status = built?.status ?? fromDisk?.status ?? "not_tested";
    const gate = canRunFigmaEntryStep(stepId, cellsForGate);
    cellsForGate[stepId] = { status };

    if (built) {
      return {
        ...built,
        canRun: gate.ok,
        blockedBy: gate.blockedBy ?? null,
        blockedReason: gate.reason ?? null,
        action:
          gate.ok && status === "not_tested"
            ? `Run ${UNIFIED_STEPS.find((s) => s.id === stepId)?.label ?? stepId}`
            : built.action
      };
    }

    return {
      status,
      canRun: gate.ok,
      blockedBy: gate.blockedBy ?? null,
      blockedReason: gate.reason ?? null,
      action: gate.ok
        ? `Run ${UNIFIED_STEPS.find((s) => s.id === stepId)?.label ?? stepId}`
        : gate.reason ?? "Run parity test"
    };
  };

  const vsFigmaLive = leg("vsFigmaLive", "contractFigma");
  const vsStorybook = leg("vsStorybook", "storybook");
  const vsReactHtml = leg("vsReactHtml", "fourWay");
  const vsReactTsx = leg("vsReactTsx", null);

  const logicStatus = c.logic?.status ?? "not_tested";
  const logicGate = canRunFigmaEntryStep("logic", cellsForGate);

  return {
    entryPoint: "figma",
    storyId: screenId,
    originalUrl: resolveOriginalPreviewUrl(repoRoot, "figma", screenId),
    cells: {
      structural: {
        ...c.manifestContract,
        action: c.manifestContract?.action ?? "Run Manifest → Contract"
      },
      vsFigmaLive,
      vsStorybook,
      vsReactHtml,
      vsReactTsx,
      logic: {
        ...c.logic,
        status: logicStatus,
        canRun: logicGate.ok,
        blockedBy: logicGate.blockedBy ?? null,
        blockedReason: logicGate.reason ?? null,
        action: logicGate.ok
          ? logicStatus === "not_tested"
            ? "Run Logic audit"
            : c.logic?.action ?? "Run Logic audit"
          : logicGate.reason ?? c.logic?.action
      }
    }
  };
}

function enrichRowStepPreviews(repoRoot, rows) {
  return rows.map((row) => {
    const entryPoint = row.entryPoint ?? "storybook";
    const cells = {};
    for (const [stepId, cell] of Object.entries(row.cells ?? {})) {
      const rec =
        entryPoint === "figma" ? readScreenStepResult(repoRoot, row.storyId, stepId) : null;
      const withPreview = attachStepPreviewUrl(cell ?? {}, repoRoot, {
        stepId,
        entryPoint,
        storyId: row.storyId,
        rec,
        status: cell?.status
      });
      cells[stepId] = {
        ...withPreview,
        previewLabel: rec?.previewLabel ?? withPreview.previewLabel ?? null,
        referenceLabel: rec?.referenceLabel ?? null,
        gateMode: rec?.gateMode ?? null,
        compositedPreviewUrl: rec?.compositedPng ? toRepoPath(repoRoot, rec.compositedPng) : null,
        originalFullUrl: rec?.originalFullPng ? toRepoPath(repoRoot, rec.originalFullPng) : null
      };
    }
    const originalFullUrl = pathJoin(
      repoRoot,
      FIGMA_SCREEN_DIFFS_DIR,
      safeSegment(row.storyId),
      "originalParity",
      "original-full.png"
    );
    return {
      ...row,
      originalFullUrl: existsSync(originalFullUrl) ? toRepoPath(repoRoot, originalFullUrl) : null,
      cells
    };
  });
}

/** @param {string} repoRoot @param {string[]} storyIds @param {(id: string) => boolean} storybookOnlyFn */
export function buildUnifiedPortfolioState(repoRoot, storyIds, storybookOnlyFn) {
  const figmaState = buildFigmaScreenPortfolioState(repoRoot);
  const figmaRows = figmaState.rows.map((row) => mapFigmaRow(row, repoRoot));
  const storybookRows = buildStorybookUnifiedRows(repoRoot, storyIds, storybookOnlyFn);
  const rows = enrichRowStepPreviews(repoRoot, [...figmaRows, ...storybookRows]);

  const generatedAt = new Date().toISOString();
  const draft = {
    generatedAt,
    storyCount: rows.length,
    source: "unified",
    itemLabel: "Item",
    entryPointLabel: "EntryPoint",
    steps: UNIFIED_STEPS,
    stepIds: UNIFIED_STEP_ORDER,
    tolerance: PIXEL_PERFECT_TOLERANCE,
    rows,
    htmlUrl: "/repo/test-portfolio/unified-steps/index.html"
  };

  draft.steps = attachUnifiedStepReports(repoRoot, draft);
  writeUnifiedStepsIndex(repoRoot, draft);

  void buildManualPreviewManifest(repoRoot, { unified: draft }).catch((err) => {
    console.error("[manual-preview] manifest refresh failed:", err?.message ?? err);
  });

  return draft;
}

export { FIGMA_ENTRY_STEPS, FIGMA_ENTRY_STEP_ORDER };
