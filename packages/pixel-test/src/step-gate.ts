/**
 * Sequential step gate — enforce pixel → figma → figmaLive → delivery per story.
 */

import { resolve } from "node:path";
import {
  canRunStep,
  TEST_STEPS,
  type StepStatus,
  type TestStepId
} from "../../contract/src/test-portfolio.ts";
import { DEV_STORIES } from "../../contract/src/stories.ts";
import { readPerStoryResult, type StoryResultRecord } from "./report-portfolio.ts";

export function gateDisabled(flags: { noGate?: boolean }): boolean {
  if (flags.noGate) return true;
  const env = process.env.TEST_SKIP_STEP_GATE;
  return env === "1" || env === "true";
}

export function isStorybookOnly(storyId: string): boolean {
  return DEV_STORIES.some((s) => s.id === storyId && s.storybookOnly);
}

export async function loadStoryStepCells(
  repoRoot: string,
  storyId: string
): Promise<Partial<Record<TestStepId, { status?: StepStatus }>>> {
  const cells: Partial<Record<TestStepId, { status?: StepStatus }>> = {};
  for (const step of TEST_STEPS) {
    const rec = await readPerStoryResult(resolve(repoRoot, step.dir), storyId);
    cells[step.id] = { status: (rec?.status ?? "not_tested") as StepStatus };
  }
  return cells;
}

export async function assertStoryStepGate(options: {
  repoRoot: string;
  storyId: string;
  stepId: TestStepId;
  noGate?: boolean;
}): Promise<{ allowed: true } | { allowed: false; reason: string; blockedBy: TestStepId }> {
  if (gateDisabled(options)) return { allowed: true };
  const cells = await loadStoryStepCells(options.repoRoot, options.storyId);
  const gate = canRunStep(options.stepId, cells, {
    storybookOnly: isStorybookOnly(options.storyId)
  });
  if (gate.ok) return { allowed: true };
  return { allowed: false, reason: gate.reason, blockedBy: gate.blockedBy };
}

/** Skipped by gate — not written to by-story (prior result preserved). */
export function gateSkippedResult(
  storyId: string,
  reason: string
): StoryResultRecord & { storyId: string; status: "skipped" } {
  return {
    storyId,
    percent: 0,
    status: "skipped",
    error: reason,
    testedAt: new Date().toISOString()
  };
}
