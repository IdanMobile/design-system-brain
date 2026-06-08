#!/usr/bin/env node
/**
 * Delete one portfolio row and all related test artifacts.
 *
 *   node scripts/delete-portfolio-row.mjs --story screen_2 --entry figma
 *   node scripts/delete-portfolio-row.mjs --story lab-button--primary --entry storybook
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  discoverFigmaScreens,
  FIGMA_SCREENS_DIR,
  FIGMA_SCREEN_DIFFS_DIR,
  mergeFigmaScreenReport,
  safeScreenSegment
} from "./figma-screen-portfolio.mjs";
import { storyDownloadDir } from "./story-package.mjs";
import {
  investigationPath,
  logicSpecsDir
} from "./lab-memory-paths.mjs";
import { loadParkedStories } from "./test-console-worker-supervisor.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXCLUDED_STORIES_PATH = ".test-console/excluded-stories.json";

export const STORYBOOK_SUITE_DIRS = [
  "pixel-diffs",
  "figma-diffs",
  "figma-live-diffs",
  "delivery-diffs",
  "logic-audit-diffs",
  "storybook-parity-diffs"
];

const NESTED_STEP_DIRS = [
  "pixel",
  "figma",
  "figmaLive",
  "delivery",
  "logic",
  "vsFigmaLive",
  "vsStorybook",
  "vsReactHtml",
  "vsReactTsx",
  "structural"
];

/** Same segment rules as packages/pixel-test/src/report-portfolio.ts */
export function safeStorySegment(storyId) {
  return String(storyId)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function excludedStoriesPath(repoRoot) {
  return join(repoRoot, EXCLUDED_STORIES_PATH);
}

export function loadExcludedStoryIds(repoRoot) {
  const path = excludedStoriesPath(repoRoot);
  if (!existsSync(path)) return new Set();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return new Set((raw.storyIds ?? []).filter(Boolean));
  } catch {
    return new Set();
  }
}

export function addExcludedStoryId(repoRoot, storyId) {
  mkdirSync(join(repoRoot, ".test-console"), { recursive: true });
  const ids = loadExcludedStoryIds(repoRoot);
  ids.add(storyId);
  writeFileSync(
    excludedStoriesPath(repoRoot),
    JSON.stringify(
      { updatedAt: new Date().toISOString(), storyIds: [...ids].sort() },
      null,
      2
    ) + "\n",
    "utf8"
  );
}

function rmPath(path, removed) {
  if (!existsSync(path)) return;
  try {
    const st = statSync(path);
    if (st.isDirectory()) {
      rmSync(path, { recursive: true, force: true });
    } else {
      unlinkSync(path);
    }
    removed.push(path);
  } catch {
    /* ok */
  }
}

/** @param {string} repoRoot @param {string} storyId */
export function collectStorybookArtifactDirs(repoRoot, storyId) {
  const seg = safeStorySegment(storyId);
  const dirs = new Set();
  for (const suite of STORYBOOK_SUITE_DIRS) {
    dirs.add(join(repoRoot, suite, "by-story", seg));
    dirs.add(join(repoRoot, suite, seg));
    for (const step of NESTED_STEP_DIRS) {
      dirs.add(join(repoRoot, suite, "by-story", seg, step));
    }
  }
  return [...dirs];
}

/** @param {string} repoRoot @param {string} screenId */
export function collectFigmaScreenSourcePaths(repoRoot, screenId) {
  const screensDir = join(repoRoot, FIGMA_SCREENS_DIR);
  const paths = [];
  if (!existsSync(screensDir)) return paths;
  const prefixes = [`${screenId}.`, `${screenId}-`];
  for (const name of readdirSync(screensDir)) {
    if (prefixes.some((p) => name.startsWith(p))) {
      paths.push(join(screensDir, name));
    }
  }
  return paths;
}

/** @param {string} repoRoot @param {string} storyId */
export function collectFigmaDiffDirs(repoRoot, storyId) {
  const seg = safeScreenSegment(storyId);
  return [
    join(repoRoot, FIGMA_SCREEN_DIFFS_DIR, seg),
    join(repoRoot, FIGMA_SCREEN_DIFFS_DIR, "by-screen", seg)
  ];
}

/** @param {string} repoRoot @param {string} storyId */
export function collectLabMemoryPaths(repoRoot, storyId) {
  return [
    investigationPath(repoRoot, storyId, "active"),
    investigationPath(repoRoot, storyId, "archive"),
    join(logicSpecsDir(repoRoot), `${storyId}.spec.json`)
  ];
}

function clearParkedForStory(repoRoot, storyId) {
  const path = join(repoRoot, ".test-console/parked-stories.json");
  if (!existsSync(path)) return;
  const data = loadParkedStories(repoRoot);
  const items = (data.items ?? []).filter((i) => i.storyId !== storyId);
  if (items.length === (data.items ?? []).length) return;
  writeFileSync(
    path,
    JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 2) + "\n",
    "utf8"
  );
}

function clearLocksForStory(repoRoot, storyId) {
  const locksDir = join(repoRoot, ".test-console", "locks");
  if (!existsSync(locksDir)) return [];
  const removed = [];
  const seg = safeStorySegment(storyId);
  for (const name of readdirSync(locksDir)) {
    if (!name.endsWith(".lock")) continue;
    if (name.includes(storyId) || name.includes(seg)) {
      rmPath(join(locksDir, name), removed);
    }
  }
  return removed;
}

function clearAttemptBackupsForStory(repoRoot, storyId) {
  const base = join(repoRoot, ".test-console/attempt-backups");
  if (!existsSync(base)) return [];
  const removed = [];
  const seg = safeStorySegment(storyId);
  for (const jobId of readdirSync(base)) {
    const jobDir = join(base, jobId);
    if (!statSync(jobDir).isDirectory()) continue;
    for (const entry of readdirSync(jobDir)) {
      if (entry.startsWith(`${storyId}-try`) || entry.startsWith(`${seg}-try`)) {
        rmPath(join(jobDir, entry), removed);
      }
    }
  }
  return removed;
}

function refreshPortfolio(repoRoot) {
  const merge = spawnSync("node", ["scripts/test-portfolio-merge.mjs"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (merge.status !== 0) {
    throw new Error(merge.stderr || merge.stdout || "portfolio merge failed");
  }
  mergeFigmaScreenReport(repoRoot);
}

/**
 * @param {string} repoRoot
 * @param {{ storyId: string, entryPoint?: "figma"|"storybook", skipPortfolioRefresh?: boolean }} opts
 */
export function deletePortfolioRow(repoRoot, { storyId, entryPoint = "storybook", skipPortfolioRefresh = false }) {
  if (!storyId || typeof storyId !== "string") {
    throw new Error("storyId is required");
  }
  const ep = entryPoint === "figma" ? "figma" : "storybook";
  const removed = [];

  if (ep === "figma") {
    const known = discoverFigmaScreens(repoRoot).some((s) => s.screenId === storyId);
    if (!known) {
      throw new Error(`Figma screen not found: ${storyId}`);
    }
    for (const p of collectFigmaScreenSourcePaths(repoRoot, storyId)) {
      rmPath(p, removed);
    }
    for (const d of collectFigmaDiffDirs(repoRoot, storyId)) {
      rmPath(d, removed);
    }
  } else {
    addExcludedStoryId(repoRoot, storyId);
    for (const d of collectStorybookArtifactDirs(repoRoot, storyId)) {
      rmPath(d, removed);
    }
  }

  for (const p of collectLabMemoryPaths(repoRoot, storyId)) {
    rmPath(p, removed);
  }
  rmPath(storyDownloadDir(repoRoot, storyId), removed);
  removed.push(...clearLocksForStory(repoRoot, storyId));
  removed.push(...clearAttemptBackupsForStory(repoRoot, storyId));
  clearParkedForStory(repoRoot, storyId);

  if (!skipPortfolioRefresh) {
    refreshPortfolio(repoRoot);
  }

  return {
    ok: true,
    storyId,
    entryPoint: ep,
    removedCount: removed.length,
    removedPaths: removed
  };
}

function parseCli() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v.startsWith("--") && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) {
      args.set(v.slice(2), process.argv[i + 1]);
      i++;
    } else if (v.startsWith("--story=")) {
      args.set("story", v.slice("--story=".length));
    } else if (v.startsWith("--entry=")) {
      args.set("entry", v.slice("--entry=".length));
    }
  }
  return {
    storyId: args.get("story") ?? null,
    entryPoint: args.get("entry") ?? "storybook"
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { storyId, entryPoint } = parseCli();
  if (!storyId) {
    console.error("Usage: node scripts/delete-portfolio-row.mjs --story <id> [--entry figma|storybook]");
    process.exit(1);
  }
  const result = deletePortfolioRow(ROOT, { storyId, entryPoint });
  console.log(`Deleted ${result.storyId} (${result.entryPoint}) — ${result.removedCount} path(s)`);
}
