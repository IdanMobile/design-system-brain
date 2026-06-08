/**
 * Figma-as-entry pipeline — sequential steps.
 *
 *   Manifest → Contract → Original parity (3 legs vs Guing PNG) → Logic
 *
 * Original parity compares ONLY against the reference PNG:
 *   Original → Figma live · Original → Storybook · Original → ReactHtml · Original → ReactTsx
 */

export const FIGMA_ENTRY_STEP_ORDER = [
  "manifestContract",
  "vsFigmaLive",
  "vsStorybook",
  "vsReactHtml",
  "vsReactTsx",
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
    id: "vsFigmaLive",
    label: "→ Figma live",
    dir: "figma-screen-diffs",
    actionId: "figma:screen:golden",
    needsRelay: true
  },
  {
    id: "vsStorybook",
    label: "→ Storybook",
    dir: "figma-screen-diffs",
    actionId: "figma:screen:storybook"
  },
  {
    id: "vsReactHtml",
    label: "→ ReactHtml",
    dir: "figma-screen-diffs",
    actionId: "figma:screen:reacthtml"
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
    dir: "figma-screen-diffs",
    actionId: "figma:screen:logic"
  }
];

/** Visual parity legs — each has its own contract-first test script. */
export const ORIGINAL_PARITY_LEG_IDS = [
  "vsFigmaLive",
  "vsStorybook",
  "vsReactHtml",
  "vsReactTsx"
];

export function isFigmaEntryStepPassing(status) {
  return status === "pass" || status === "skipped";
}

export function canRunFigmaEntryStep(stepId, cells) {
  if (ORIGINAL_PARITY_LEG_IDS.includes(stepId)) {
    const manifestStatus = cells.manifestContract?.status ?? "not_tested";
    if (!isFigmaEntryStepPassing(manifestStatus)) {
      return {
        ok: false,
        blockedBy: "manifestContract",
        reason: `Blocked — Manifest → Contract is ${manifestStatus} (required before original parity)`,
        priorStatus: manifestStatus
      };
    }
    return { ok: true };
  }
  if (stepId === "logic") {
    for (const legId of ORIGINAL_PARITY_LEG_IDS) {
      const legStatus = cells[legId]?.status ?? "not_tested";
      if (!isFigmaEntryStepPassing(legStatus)) {
        const legLabel = FIGMA_ENTRY_STEPS.find((s) => s.id === legId)?.label ?? legId;
        return {
          ok: false,
          blockedBy: legId,
          reason: `Blocked — ${legLabel} is ${legStatus} (required before Logic audit)`,
          priorStatus: legStatus
        };
      }
    }
    return { ok: true };
  }
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
    if (stepId === "vsFigmaLive") return "Fix importer — contract → Figma live (code-v2.ts)";
    if (stepId === "vsStorybook") return "Fix render-html.ts / contract HTML renderer (Storybook leg)";
    if (stepId === "vsReactHtml") return "Fix render-html.ts / contract HTML renderer (ReactHtml leg)";
    if (stepId === "vsReactTsx") return "Fix contract-to-tsx codegen / render-tsx.ts (ReactTsx leg)";
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
