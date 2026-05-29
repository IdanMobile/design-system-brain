/**
 * Figma-as-entry-point pipeline — sequential steps (inverse of Storybook ingress).
 *
 *   Manifest → Contract → Figma live → Storybook → 4-way → Logic
 *   (No Delivery 3-way — that track is Storybook-centric only.)
 *   4-way: original PNG · Figma live · Storybook @lab/ui · honest React HTML (strict 0.1%).
 */

export const FIGMA_ENTRY_STEP_ORDER = [
  "manifestContract",
  "contractFigma",
  "storybook",
  "fourWay",
  "logic"
];

export const FIGMA_ENTRY_STEPS = [
  {
    id: "manifestContract",
    label: "Manifest → Contract",
    dir: "figma-screen-diffs",
    actionId: "figma:screen:manifest"
  },
  {
    id: "contractFigma",
    label: "Contract → Figma",
    dir: "figma-screen-diffs",
    actionId: "figma:screen:golden",
    needsRelay: true
  },
  {
    id: "storybook",
    label: "Storybook",
    dir: "figma-screen-diffs",
    actionId: "figma:screen:storybook"
  },
  {
    id: "fourWay",
    label: "4-way (strict)",
    dir: "figma-screen-diffs",
    actionId: "figma:screen:four-way"
  },
  {
    id: "logic",
    label: "Logic audit",
    dir: "figma-screen-diffs",
    actionId: "figma:screen:logic"
  }
];

export function isFigmaEntryStepPassing(status) {
  return status === "pass" || status === "skipped";
}

export function canRunFigmaEntryStep(stepId, cells) {
  const idx = FIGMA_ENTRY_STEP_ORDER.indexOf(stepId);
  if (idx < 0) return { ok: false, blockedBy: stepId, reason: "Unknown step" };
  for (let i = 0; i < idx; i += 1) {
    const priorId = FIGMA_ENTRY_STEP_ORDER[i];
    const priorStatus = cells[priorId]?.status ?? "not_tested";
    if (!isFigmaEntryStepPassing(priorStatus)) {
      const priorLabel =
        FIGMA_ENTRY_STEPS.find((s) => s.id === priorId)?.label ?? priorId;
      const stepLabel =
        FIGMA_ENTRY_STEPS.find((s) => s.id === stepId)?.label ?? stepId;
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

export function recommendFigmaEntryAction(stepId, status, detail = {}) {
  if (status === "not_tested") {
    const step = FIGMA_ENTRY_STEPS.find((s) => s.id === stepId);
    return `Run ${step?.label ?? stepId}`;
  }
  if (status === "skipped") return "—";
  if (status === "pass") return "—";
  if (status === "error") {
    return detail.error
      ? `Investigate: ${String(detail.error).slice(0, 80)}`
      : "Investigate test error";
  }
  if (status === "fail") {
    if (stepId === "manifestContract") return "Fix adapter — manifestToContract";
    if (stepId === "contractFigma") return "Fix importer — re-run Contract → Figma live";
    if (stepId === "storybook") return "Fix contract render-html / Storybook fixture";
    if (stepId === "fourWay") return "Fix Storybook↔Figma gap — see fourWay/report.html (residual step hides this)";
    if (stepId === "logic") return "Fix logic audit harness";
    return "Fix pipeline";
  }
  if (status === "warn") {
    const pct = detail.percent != null ? ` (${detail.percent.toFixed(2)}%)` : "";
    if (stepId === "logic") {
      const n = detail.percent != null ? Math.round(detail.percent) : 0;
      return n > 0 ? `Write logic spec — ${n} gap${n === 1 ? "" : "s"}` : "Review logic gaps";
    }
    return `Polish to strict pass${pct}`;
  }
  return "—";
}

export function recommendFigmaEntryActionForRow(stepId, status, cells, detail = {}) {
  if (status === "not_tested") {
    const gate = canRunFigmaEntryStep(stepId, cells);
    if (!gate.ok) return gate.reason;
  }
  return recommendFigmaEntryAction(stepId, status, detail);
}
