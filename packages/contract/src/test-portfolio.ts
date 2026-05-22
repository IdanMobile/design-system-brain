/**
 * Cross-suite test portfolio — story list and step definitions for reports / console.
 */

import { DEV_STORIES } from "./stories.ts";

export type TestStepId = "pixel" | "figma" | "figmaLive" | "delivery" | "logic";

export type StepStatus = "not_tested" | "pass" | "warn" | "fail" | "error" | "skipped";

export interface TestStepDef {
  id: TestStepId;
  label: string;
  /** Report output directory under repo root */
  dir: string;
  /** Test console action id */
  actionId: string;
  /** Must not run concurrently with other stories (Figma live relay) */
  serialOnly?: boolean;
}

export const TEST_STEPS: TestStepDef[] = [
  { id: "pixel", label: "Pixel (schema)", dir: "pixel-diffs", actionId: "pixel:golden" },
  { id: "figma", label: "Figma emulator", dir: "figma-diffs", actionId: "figma:golden" },
  {
    id: "figmaLive",
    label: "Figma live",
    dir: "figma-live-diffs",
    actionId: "figma:live:golden",
    serialOnly: true
  },
  { id: "delivery", label: "Delivery (3-way)", dir: "delivery-diffs", actionId: "delivery:golden" },
  { id: "logic", label: "Logic audit", dir: "logic-audit-diffs", actionId: "logic:golden" }
];

/** Default portfolio story ids (full lab registry). */
export const PORTFOLIO_STORY_IDS: string[] = DEV_STORIES.map((s) => s.id);

/** Sequential pipeline order — step N requires all prior steps to pass. */
export const TEST_STEP_ORDER: readonly TestStepId[] = [
  "pixel",
  "figma",
  "figmaLive",
  "delivery",
  "logic"
] as const;

export function isStepPassing(status: StepStatus | undefined): boolean {
  return status === "pass" || status === "skipped";
}

/**
 * Effective pipeline status per step — ignores downstream result files when a prior
 * step did not pass (sequential gate). Prevents illegal --no-gate runs from showing
 * as pass/warn on later columns.
 */
export function resolvePipelineStatuses(
  raw: Partial<Record<TestStepId, StepStatus>>,
  detail?: { storybookOnly?: boolean }
): Record<TestStepId, StepStatus> {
  const effective = {} as Record<TestStepId, StepStatus>;
  for (const stepId of TEST_STEP_ORDER) {
    const cellsSoFar: Partial<Record<TestStepId, { status?: StepStatus }>> = {};
    for (const id of TEST_STEP_ORDER) {
      if (effective[id] !== undefined) {
        cellsSoFar[id] = { status: effective[id] };
      }
    }
    const gate = canRunStep(stepId, cellsSoFar, detail);
    if (!gate.ok) {
      effective[stepId] =
        detail?.storybookOnly && stepId === "delivery" ? "skipped" : "not_tested";
    } else {
      const rawStatus = raw[stepId];
      effective[stepId] =
        rawStatus && rawStatus !== "not_tested" ? rawStatus : "not_tested";
    }
  }
  return effective;
}

export interface StepGateDenial {
  ok: false;
  blockedBy: TestStepId;
  reason: string;
  priorStatus: StepStatus;
}

export type StepGateResult = { ok: true } | StepGateDenial;

export function canRunStep(
  stepId: TestStepId,
  cells: Partial<Record<TestStepId, { status?: StepStatus }>>,
  detail?: { storybookOnly?: boolean }
): StepGateResult {
  if (detail?.storybookOnly && stepId === "delivery") {
    return {
      ok: false,
      blockedBy: "delivery",
      reason: "Storybook-only — delivery dev leg N/A",
      priorStatus: "skipped"
    };
  }
  const idx = TEST_STEP_ORDER.indexOf(stepId);
  for (let i = 0; i < idx; i += 1) {
    const priorId = TEST_STEP_ORDER[i]!;
    const priorStatus = (cells[priorId]?.status ?? "not_tested") as StepStatus;
    if (!isStepPassing(priorStatus)) {
      const priorLabel = TEST_STEPS.find((s) => s.id === priorId)?.label ?? priorId;
      const stepLabel = TEST_STEPS.find((s) => s.id === stepId)?.label ?? stepId;
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

export function recommendAction(
  stepId: TestStepId,
  status: StepStatus,
  detail?: { percent?: number; storybookOnly?: boolean; error?: string }
): string {
  if (detail?.storybookOnly && stepId === "delivery") {
    return "Storybook-only — delivery dev leg N/A";
  }
  if (status === "not_tested") {
    const step = TEST_STEPS.find((s) => s.id === stepId);
    return `Run ${step?.label ?? stepId}`;
  }
  if (status === "skipped") return "—";
  if (status === "pass") return "—";
  if (status === "error") {
    return detail?.error ? `Investigate: ${detail.error.slice(0, 80)}` : "Investigate test error";
  }
  if (status === "fail") {
    if (stepId === "figmaLive") return "Fix renderer — reload plugin, re-run live";
    if (stepId === "figma") return "Fix code-v2.ts — mock golden";
    if (stepId === "pixel") return "Fix schema / scene-to-html";
    if (stepId === "delivery") return "Fix SB ↔ dev ↔ Figma pipeline";
    if (stepId === "logic") return "Fix audit harness / Delivery showcase load";
    return "Fix pipeline";
  }
  if (status === "warn") {
    const pct = detail?.percent != null ? ` (${detail.percent.toFixed(2)}%)` : "";
    if (stepId === "logic") {
      const n = detail?.percent != null ? Math.round(detail.percent) : 0;
      return n > 0 ? `Write logic spec — ${n} static control${n === 1 ? "" : "s"}` : "Review logic audit gaps";
    }
    if (stepId === "figma") return `Tighten mock renderer${pct}`;
    if (stepId === "figmaLive") return `Tighten live export${pct}`;
    return `Polish to strict pass${pct}`;
  }
  return "—";
}

/** Row-aware recommendation — surfaces sequential gate when a later step is not_tested. */
export function recommendActionForRow(
  stepId: TestStepId,
  status: StepStatus,
  cells: Partial<Record<TestStepId, { status?: StepStatus }>>,
  detail?: { percent?: number; storybookOnly?: boolean; error?: string }
): string {
  if (status === "not_tested") {
    const gate = canRunStep(stepId, cells, detail);
    if (!gate.ok) return gate.reason;
  }
  return recommendAction(stepId, status, detail);
}
