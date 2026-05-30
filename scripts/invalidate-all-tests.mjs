#!/usr/bin/env node
/**
 * Clear stored test results so portfolio rows return to not_tested.
 * Keeps PNG/HTML artifacts; removes result.json and test-report.json only.
 */
import { readdirSync, unlinkSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const RESULT_FILES = new Set(["result.json", "test-report.json"]);

const BY_STORY_SUITE_DIRS = [
  "pixel-diffs",
  "figma-diffs",
  "figma-live-diffs",
  "delivery-diffs",
  "logic-audit-diffs",
  "storybook-parity-diffs"
];

function safeUnlink(path) {
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

function walkRemoveResults(dir, removed) {
  if (!existsSync(dir)) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      walkRemoveResults(full, removed);
      continue;
    }
    if (RESULT_FILES.has(ent.name) && safeUnlink(full)) {
      removed.push(full);
    }
  }
}

function invalidateByStorySuites(repoRoot, removed) {
  for (const suiteDir of BY_STORY_SUITE_DIRS) {
    walkRemoveResults(join(repoRoot, suiteDir, "by-story"), removed);
  }
}

function invalidateFigmaScreenSteps(repoRoot, removed) {
  const base = join(repoRoot, "figma-screen-diffs", "by-screen");
  if (!existsSync(base)) return;
  for (const screen of readdirSync(base)) {
    const screenDir = join(base, screen);
    if (!statSync(screenDir).isDirectory()) continue;
    for (const step of readdirSync(screenDir)) {
      const stepDir = join(screenDir, step);
      if (!statSync(stepDir).isDirectory()) continue;
      for (const name of RESULT_FILES) {
        const path = join(stepDir, name);
        if (existsSync(path) && safeUnlink(path)) removed.push(path);
      }
    }
  }
}

function refreshPortfolio(repoRoot) {
  const r = spawnSync("node", ["scripts/test-portfolio-merge.mjs"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "portfolio merge failed");
  }
}

export function invalidateAllTests(repoRoot = ROOT) {
  const removed = [];
  invalidateByStorySuites(repoRoot, removed);
  invalidateFigmaScreenSteps(repoRoot, removed);
  refreshPortfolio(repoRoot);
  return { removedCount: removed.length, removedPaths: removed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { removedCount } = invalidateAllTests();
  console.log(`Invalidated ${removedCount} result file(s); portfolio refreshed.`);
}
