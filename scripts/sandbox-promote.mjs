/**
 * Sandbox promote gate — baseline metrics, verify no regression, discard or promote.
 * ROADMAP / sandbox-promote-pipeline spec.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** @typedef {{ status: string, percent: number, maxRegionPercent?: number | null }} StoryMetrics */

/**
 * @param {string} repoRoot
 * @param {string} suiteId
 * @param {string[]} storyIds
 * @param {(suiteId: string, storyId: string) => StoryMetrics | null} readStory
 */
export function captureSuiteMetrics(repoRoot, suiteId, storyIds, readStory) {
  /** @type {Record<string, StoryMetrics>} */
  const stories = {};
  for (const id of storyIds) {
    const m = readStory(suiteId, id);
    stories[id] = {
      status: m?.status ?? "not_tested",
      percent: m?.percent ?? 100,
      maxRegionPercent: m?.maxRegionPercent ?? null
    };
  }
  return {
    capturedAt: new Date().toISOString(),
    repoRoot,
    suiteId,
    storyIds: [...storyIds],
    stories
  };
}

/**
 * @param {StoryMetrics} before
 * @param {StoryMetrics} after
 */
export function isStoryWorse(before, after) {
  if (before.status === "pass" && after.status !== "pass") return true;
  if (after.percent > before.percent + 0.01) return true;
  const bReg = before.maxRegionPercent ?? 0;
  const aReg = after.maxRegionPercent ?? 0;
  if (aReg > bReg + 0.01) return true;
  return false;
}

/**
 * @param {StoryMetrics} before
 * @param {StoryMetrics} after
 */
export function isStoryImproved(before, after) {
  if (before.status !== "pass" && after.status === "pass") return true;
  if (after.percent < before.percent - 0.01) return true;
  const bReg = before.maxRegionPercent ?? 0;
  const aReg = after.maxRegionPercent ?? 0;
  if (aReg < bReg - 0.01) return true;
  return false;
}

/**
 * @param {ReturnType<typeof captureSuiteMetrics>} baseline
 * @param {ReturnType<typeof captureSuiteMetrics>} after
 */
export function evaluatePromotion(baseline, after) {
  /** @type {Array<{ storyId: string, before: StoryMetrics, after: StoryMetrics }>} */
  const worse = [];
  /** @type {Array<{ storyId: string, before: StoryMetrics, after: StoryMetrics }>} */
  const improved = [];
  let passBefore = 0;
  let passAfter = 0;

  for (const id of baseline.storyIds) {
    const b = baseline.stories[id];
    const a = after.stories[id] ?? { status: "not_tested", percent: 100, maxRegionPercent: null };
    if (b.status === "pass") passBefore += 1;
    if (a.status === "pass") passAfter += 1;
    if (isStoryWorse(b, a)) worse.push({ storyId: id, before: b, after: a });
    if (isStoryImproved(b, a)) improved.push({ storyId: id, before: b, after: a });
  }

  const failBefore = baseline.storyIds.length - passBefore;
  const failAfter = after.storyIds.filter((id) => after.stories[id]?.status !== "pass").length;

  const discard = worse.length > 0;
  const promote =
    !discard &&
    (passAfter > passBefore || failAfter < failBefore || improved.length > 0);

  return {
    promote,
    discard,
    neutral: !promote && !discard,
    worse,
    improved,
    passBefore,
    passAfter,
    failBefore,
    failAfter
  };
}

/**
 * @param {string} repoRoot
 * @param {string} jobId
 * @param {object} baseline
 */
export function writeBaselineSnapshot(repoRoot, jobId, baseline) {
  const dir = join(repoRoot, ".test-console", "sandbox-baseline");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${jobId}.json`);
  writeFileSync(path, JSON.stringify(baseline, null, 2));
  return path;
}

/**
 * @param {string} repoRoot
 * @param {string} jobId
 */
export function readBaselineSnapshot(repoRoot, jobId) {
  const path = join(repoRoot, ".test-console", "sandbox-baseline", `${jobId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Restore tracked files to HEAD (discard sandbox edits on main).
 * @param {string} repoRoot
 * @param {string[]} paths
 */
export function gitRestorePaths(repoRoot, paths) {
  const tracked = paths.filter((p) => p && !p.startsWith(".test-console/"));
  if (!tracked.length) return { ok: true, restored: [] };
  const r = spawnSync("git", ["restore", "--source=HEAD", "--", ...tracked], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  return {
    ok: r.status === 0,
    restored: tracked,
    stderr: r.stderr?.trim() ?? ""
  };
}

export function sandboxWorktreeEnabled() {
  const env = process.env.FIX_ALL_SANDBOX;
  return env === "worktree" || env === "1" || env === "true";
}
