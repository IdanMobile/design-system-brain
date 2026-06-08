/**
 * Unified Fix-story row gates — console columns vs internal storybook suites.
 */

import { canRunFigmaEntryStep, FIGMA_ENTRY_STEPS } from "./figma-entry-portfolio-config.mjs";
import { isStepPassing, TEST_STEPS } from "./test-portfolio-config.mjs";
import { readStoryResultFromDisk } from "./test-console-run-settings.mjs";

export const UNIFIED_ROW_STEP_ORDER = [
  "structural",
  "vsFigmaLive",
  "vsStorybook",
  "vsReactHtml",
  "vsReactTsx",
  "logic"
];

const UNIFIED_LABELS = {
  structural: "Structural",
  vsFigmaLive: "→ Figma live",
  vsStorybook: "→ Storybook",
  vsReactHtml: "→ ReactHtml",
  vsReactTsx: "→ ReactTsx",
  logic: "Logic audit"
};

/** Fix-story canRun for a unified column (not internal pixel→figma→live chain). */
export function canRunUnifiedStep(entryPoint, stepId, cells) {
  if (entryPoint === "figma") {
    return canRunFigmaEntryStep(stepId, {
      manifestContract: cells.structural,
      vsFigmaLive: cells.vsFigmaLive,
      vsStorybook: cells.vsStorybook,
      vsReactHtml: cells.vsReactHtml,
      vsReactTsx: cells.vsReactTsx
    });
  }

  const idx = UNIFIED_ROW_STEP_ORDER.indexOf(stepId);
  if (idx < 0) {
    return { ok: false, blockedBy: stepId, reason: "Unknown step" };
  }
  for (let i = 0; i < idx; i += 1) {
    const priorId = UNIFIED_ROW_STEP_ORDER[i];
    const priorStatus = cells[priorId]?.status ?? "not_tested";
    if (!isStepPassing(priorStatus)) {
      const priorLabel = UNIFIED_LABELS[priorId] ?? priorId;
      const stepLabel = UNIFIED_LABELS[stepId] ?? stepId;
      return {
        ok: false,
        blockedBy: priorId,
        reason: `Blocked — ${priorLabel} is ${priorStatus} (required before ${stepLabel})`,
        priorStatus
      };
    }
  }
  return { ok: true };
}

/** Storybook vsFigmaLive column status from internal figma mock + live suites. */
export function storybookFigmaLiveColumnStatus(figmaStatus, figmaLiveStatus) {
  if (figmaLiveStatus === "pass") return "pass";
  if (figmaStatus === "fail" || figmaLiveStatus === "fail") return "fail";
  if (figmaStatus === "warn" || figmaLiveStatus === "warn") return "warn";
  if (figmaStatus === "error" || figmaLiveStatus === "error") return "error";
  if (figmaStatus === "not_tested" && figmaLiveStatus === "not_tested") return "not_tested";
  return figmaLiveStatus !== "not_tested" ? figmaLiveStatus : figmaStatus;
}

/**
 * Fixer suite for a unified cell — storybook vsFigmaLive runs mock then live internally.
 * @param {string} entryPoint
 * @param {string} stepId
 * @param {string} [storyId]
 * @param {string} [repoRoot]
 */
export function resolveFixSuiteForCell(entryPoint, stepId, storyId, repoRoot) {
  if (entryPoint === "figma") {
    if (stepId === "structural") return "manifestContract";
    if (stepId === "logic") return "logic";
    return stepId;
  }
  const storybookMap = {
    structural: "pixel",
    vsFigmaLive: "figmaLive",
    vsStorybook: "pixel",
    vsReactHtml: "delivery",
    logic: "logic"
  };
  if (
    entryPoint === "storybook" &&
    stepId === "vsFigmaLive" &&
    storyId &&
    repoRoot
  ) {
    const mock = readStoryResultFromDisk(repoRoot, "figma", storyId);
    if (mock?.status !== "pass" && mock?.status !== "skipped") {
      return "figma";
    }
  }
  return storybookMap[stepId] ?? stepId;
}

export { FIGMA_ENTRY_STEPS };
