/**
 * Test portfolio config (mirrors packages/contract/src/test-portfolio.ts for .mjs consumers).
 */

export const TEST_STEP_ORDER = ["pixel", "figma", "figmaLive", "delivery", "logic"];

export function isStepPassing(status) {
  return status === "pass" || status === "skipped";
}

export function resolvePipelineStatuses(raw, detail = {}) {
  const effective = {};
  for (const stepId of TEST_STEP_ORDER) {
    const cellsSoFar = {};
    for (const id of TEST_STEP_ORDER) {
      if (effective[id] !== undefined) {
        cellsSoFar[id] = { status: effective[id] };
      }
    }
    const gate = canRunStep(stepId, cellsSoFar, detail);
    if (!gate.ok) {
      effective[stepId] =
        detail.storybookOnly && stepId === "delivery" ? "skipped" : "not_tested";
    } else {
      const rawStatus = raw[stepId];
      effective[stepId] =
        rawStatus && rawStatus !== "not_tested" ? rawStatus : "not_tested";
    }
  }
  return effective;
}

export function canRunStep(stepId, cells, detail = {}) {
  if (detail.storybookOnly && stepId === "delivery") {
    return {
      ok: false,
      blockedBy: "delivery",
      reason: "Storybook-only — delivery dev leg N/A",
      priorStatus: "skipped"
    };
  }
  const idx = TEST_STEP_ORDER.indexOf(stepId);
  for (let i = 0; i < idx; i += 1) {
    const priorId = TEST_STEP_ORDER[i];
    const priorStatus = cells[priorId]?.status ?? "not_tested";
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

export const TEST_STEPS = [
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

export function recommendAction(stepId, status, detail = {}) {
  if (detail.storybookOnly && stepId === "delivery") {
    return "Storybook-only — delivery dev leg N/A";
  }
  if (status === "not_tested") {
    const step = TEST_STEPS.find((s) => s.id === stepId);
    return `Run ${step?.label ?? stepId}`;
  }
  if (status === "pass" || status === "skipped") return "—";
  if (status === "error") {
    return detail.error
      ? `Investigate: ${String(detail.error).slice(0, 80)}`
      : "Investigate test error";
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
    const pct = detail.percent != null ? ` (${detail.percent.toFixed(2)}%)` : "";
    if (stepId === "logic") {
      const n = detail.percent != null ? Math.round(detail.percent) : 0;
      return n > 0 ? `Write logic spec — ${n} static control${n === 1 ? "" : "s"}` : "Review logic audit gaps";
    }
    if (stepId === "figma") return `Tighten mock renderer${pct}`;
    if (stepId === "figmaLive") return `Tighten live export${pct}`;
    return `Polish to strict pass${pct}`;
  }
  return "—";
}

export function recommendActionForRow(stepId, status, cells, detail = {}) {
  if (status === "not_tested") {
    const gate = canRunStep(stepId, cells, detail);
    if (!gate.ok) return gate.reason;
  }
  return recommendAction(stepId, status, detail);
}

export function isStorybookOnlyStory(storyId) {
  return false;
}

export function loadPortfolioStoryIds(repoRoot, readFileSync, existsSync, join) {
  const portfolioPath = join(repoRoot, "test-portfolio", "portfolio.json");
  if (existsSync(portfolioPath)) {
    try {
      const raw = JSON.parse(readFileSync(portfolioPath, "utf8"));
      if (raw.stories?.length) return raw.stories;
    } catch {
      /* fall through */
    }
  }
  const indexPath = join(repoRoot, "artifacts", "stories.index.json");
  if (existsSync(indexPath)) {
    try {
      const raw = JSON.parse(readFileSync(indexPath, "utf8"));
      const ids = (raw.stories ?? []).map((s) => s.id).filter(Boolean);
      if (ids.length) return [...ids].sort();
    } catch {
      /* fall through */
    }
  }
  return [];
}
