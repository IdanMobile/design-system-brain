/**
 * Sandbox promote gate — baseline metrics, verify no regression, discard or promote.
 * ROADMAP / sandbox-promote-pipeline spec.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isSandboxPromotableCodeFile } from "./sandbox-worktree.mjs";

export const ADAPTER_BACKUP_FILES = [
  "packages/figma-importer-plugin/src/code-v2.ts",
  "packages/pixel-test/src/scene-to-html.ts",
  "packages/pixel-test/src/render-html.ts"
];

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
  const tracked = paths.filter((p) => {
    if (!p || p.startsWith(".test-console/")) return false;
    if (isSandboxPromotableCodeFile(p)) return false;
    const r = spawnSync("git", ["ls-files", "--error-unmatch", "--", p], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return r.status === 0;
  });
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

/**
 * Snapshot allowlisted adapter files before a fix attempt (pre-attempt baseline).
 * @param {string} repoRoot
 * @param {string} jobId
 * @param {string} storyId
 * @param {number} attempt
 */
export function backupAdapterForAttempt(repoRoot, jobId, storyId, attempt) {
  const dir = join(repoRoot, ".test-console/attempt-backups", jobId, `${storyId}-try${attempt}`);
  mkdirSync(dir, { recursive: true });
  for (const rel of ADAPTER_BACKUP_FILES) {
    const src = join(repoRoot, rel);
    if (!existsSync(src)) continue;
    const safe = rel.replace(/\//g, "__");
    copyFileSync(src, join(dir, safe));
  }
  return dir;
}

/**
 * Restore tracked adapter files to git HEAD (fallback when attempt backup missing).
 * @param {string} repoRoot
 * @param {string[]} [pathsFilter]
 */
export function gitRestoreAdapterFromHead(repoRoot, pathsFilter) {
  const files = (
    pathsFilter?.length ? pathsFilter.filter(isSandboxPromotableCodeFile) : ADAPTER_BACKUP_FILES
  ).filter((rel) => {
    const r = spawnSync("git", ["ls-files", "--error-unmatch", "--", rel], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return r.status === 0;
  });
  if (!files.length) return { ok: true, restored: [] };
  const r = spawnSync("git", ["restore", "--source=HEAD", "--", ...files], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { ok: r.status === 0, restored: files, stderr: r.stderr?.trim() ?? "" };
}

/**
 * Restore adapter files from pre-attempt backup (WORSE_METRICS — not git HEAD).
 * Falls back to git HEAD when backup dir was lost (e.g. sandbox worktree teardown).
 * @param {string} repoRoot
 * @param {string} backupDir
 * @param {string[]} [pathsFilter]
 */
export function restoreAdapterFromAttemptBackup(repoRoot, backupDir, pathsFilter) {
  const want = pathsFilter?.length
    ? new Set(pathsFilter.filter(isSandboxPromotableCodeFile))
    : null;
  const restored = [];
  for (const rel of ADAPTER_BACKUP_FILES) {
    if (want && !want.has(rel)) continue;
    const bak = join(backupDir, rel.replace(/\//g, "__"));
    const dest = join(repoRoot, rel);
    if (!existsSync(bak)) continue;
    copyFileSync(bak, dest);
    restored.push(rel);
  }
  return restored;
}

/**
 * Restore adapter code after a regressed attempt — backup first, then git HEAD.
 * @param {string} repoRoot
 * @param {string} backupDir
 * @param {string[]} [pathsFilter]
 */
export function restoreAdapterAfterRegression(repoRoot, backupDir, pathsFilter) {
  let restored = restoreAdapterFromAttemptBackup(repoRoot, backupDir, pathsFilter);
  if (!restored.length) {
    restored = restoreAdapterFromAttemptBackup(repoRoot, backupDir);
  }
  if (!restored.length) {
    const head = gitRestoreAdapterFromHead(repoRoot, pathsFilter);
    restored = head.restored;
  }
  return restored;
}

export function sandboxWorktreeEnabled() {
  const env = process.env.FIX_ALL_SANDBOX;
  if (env === "main" || env === "off" || env === "0" || env === "false") return false;
  return true;
}
