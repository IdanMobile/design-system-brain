/**
 * Sequential step gate (mirrors packages/contract/src/test-portfolio.ts for .mjs).
 */

import { isStorybookOnlyStory } from "./test-portfolio-config.mjs";

export const TEST_STEP_ORDER = ["pixel", "figma", "figmaLive", "delivery"];

export function isStepPassing(status) {
  return status === "pass" || status === "skipped";
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
      const priorLabel =
        { pixel: "Pixel (schema)", figma: "Figma emulator", figmaLive: "Figma live", delivery: "Delivery (3-way)" }[
          priorId
        ] ?? priorId;
      const stepLabel =
        { pixel: "Pixel (schema)", figma: "Figma emulator", figmaLive: "Figma live", delivery: "Delivery (3-way)" }[
          stepId
        ] ?? stepId;
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

export const ACTION_STEP = {
  "pixel:golden": "pixel",
  "figma:golden": "figma",
  "figma:live:golden": "figmaLive",
  "delivery:golden": "delivery",
  "logic:golden": "logic"
};

export function gateDisabledEnv() {
  const env = process.env.TEST_SKIP_STEP_GATE;
  return env === "1" || env === "true";
}

/** Match packages/pixel-test safeStorySegment — collapse `--` in story ids for by-story paths. */
export function safeStorySegment(storyId) {
  return storyId
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function loadStoryStepCellsFromDisk(repoRoot, storyId, readFileSync, existsSync, join) {
  const dirs = {
    pixel: "pixel-diffs",
    figma: "figma-diffs",
    figmaLive: "figma-live-diffs",
    delivery: "delivery-diffs",
    logic: "logic-audit-diffs"
  };
  const cells = {};
  const seg = safeStorySegment(storyId);
  for (const stepId of TEST_STEP_ORDER) {
    const path = join(repoRoot, dirs[stepId], "by-story", seg, "result.json");
    if (!existsSync(path)) {
      cells[stepId] = { status: "not_tested" };
      continue;
    }
    try {
      const rec = JSON.parse(readFileSync(path, "utf8"));
      cells[stepId] = { status: rec.status === "gap" ? "warn" : (rec.status ?? "not_tested") };
    } catch {
      cells[stepId] = { status: "not_tested" };
    }
  }
  return cells;
}

export function assertActionGate(repoRoot, storyId, actionId, readFileSync, existsSync, join) {
  if (gateDisabledEnv()) return { ok: true };
  const stepId = ACTION_STEP[actionId];
  if (!stepId) return { ok: true };
  const cells = loadStoryStepCellsFromDisk(repoRoot, storyId, readFileSync, existsSync, join);
  return canRunStep(stepId, cells, { storybookOnly: isStorybookOnlyStory(storyId) });
}
