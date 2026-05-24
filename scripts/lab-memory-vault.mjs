/**
 * Obsidian lab-memory vault — automated investigation stubs from test results.
 * Phase 4-lite (local Mac): writes markdown; optional git commit via LAB_MEMORY_AUTO_COMMIT=1.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/** @param {string} [repoRoot] */
export function resolveRepoRoot(repoRoot) {
  return repoRoot ? resolve(repoRoot) : resolve(SCRIPT_DIR, "..");
}

/** @param {string} repoRoot */
export function labMemoryDir(repoRoot) {
  return join(resolveRepoRoot(repoRoot), "lab-memory");
}

/** @param {string} repoRoot @param {string} storyId */
export function vaultStoryPath(repoRoot, storyId) {
  return join(labMemoryDir(repoRoot), "stories", `${storyId}.md`);
}

const SUITE_STEP = {
  pixel: "pixel",
  figma: "figma mock",
  figmaLive: "figma live",
  delivery: "delivery",
  logic: "logic"
};

/**
 * @param {string} repoRoot
 * @param {string} abs
 */
function relRepoPath(repoRoot, abs) {
  if (!abs || typeof abs !== "string") return "";
  const root = resolveRepoRoot(repoRoot);
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/**
 * @param {string} repoRoot
 * @param {string} storyId
 */
export function ensureStoryNote(repoRoot, storyId) {
  const storiesDir = join(labMemoryDir(repoRoot), "stories");
  const path = vaultStoryPath(repoRoot, storyId);
  if (existsSync(path)) return path;

  mkdirSync(storiesDir, { recursive: true });
  const templatePath = join(labMemoryDir(repoRoot), "templates", "story.md");
  let body = `# ${storyId}\n\n## Status\n\n| Step | ID | Pass |\n| --- | --- | --- |\n| 1 | pixel | |\n| 2 | figma mock | |\n| 3 | figma live | |\n| 4 | delivery | |\n\n## Timeline\n\n`;
  if (existsSync(templatePath)) {
    body = readFileSync(templatePath, "utf8").replace(/\{\{storyId\}\}/g, storyId);
  }
  writeFileSync(path, body, "utf8");
  return path;
}

/**
 * @param {string} repoRoot
 * @param {string} suiteId
 * @param {string} storyId
 * @param {(id: string) => string} safeSegment
 * @param {{ dir: string }} cfg
 */
export function loadByStoryResult(repoRoot, suiteId, storyId, cfg, safeSegment) {
  const path = join(resolveRepoRoot(repoRoot), cfg.dir, "by-story", safeSegment(storyId), "result.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {object} row
 * @param {string} repoRoot
 * @param {string} suiteId
 * @param {string} storyId
 * @param {{ dir: string }} cfg
 * @param {(id: string) => string} safeSegment
 */
function regionRowsFromResult(row, repoRoot, suiteId, storyId, cfg, safeSegment) {
  const relBase = `${cfg.dir}/${safeSegment(storyId)}`;
  const regions = row?.diffRegions ?? [];
  if (regions.length) {
    return regions.map((r) => {
      const compareRel = r.compare ?? `regions/region-${String(r.index).padStart(2, "0")}-compare.png`;
      const pct = r.rect?.percent != null ? `${r.rect.percent.toFixed(2)}% hotspot` : "diff region";
      return `| region-${String(r.index).padStart(2, "0")} | ${pct} | \`${join(relBase, compareRel)}\` |`;
    });
  }
  return [`| region-01 | see compare PNG | \`${relBase}/regions/region-01-compare.png\` |`];
}

/**
 * @param {object} opts
 * @param {string} opts.repoRoot
 * @param {string} opts.storyId
 * @param {string} opts.suiteId
 * @param {string} [opts.jobId]
 * @param {string} [opts.source]
 * @param {number} [opts.attempt]
 * @param {object} opts.story — from storyFromReportRow (+ optional tolerance)
 * @param {object} [opts.resultRow] — by-story result.json when available
 */
export function appendTestInvestigation(opts) {
  const {
    repoRoot,
    storyId,
    suiteId,
    jobId,
    source = "test-console hook",
    attempt,
    story,
    resultRow
  } = opts;

  if (!storyId || !suiteId || !story) {
    return { ok: false, reason: "missing storyId, suiteId, or story" };
  }
  if (story.status === "pass") {
    return { ok: false, reason: "story passed" };
  }

  const root = resolveRepoRoot(repoRoot);
  const path = ensureStoryNote(root, storyId);
  const step = SUITE_STEP[suiteId] ?? suiteId;
  const date = new Date().toISOString();
  const metrics = resultRow ?? story;
  const status = metrics.status ?? story.status ?? "unknown";
  const percent = metrics.percent ?? story.percent ?? 0;
  const maxRegion = metrics.maxRegionPercent ?? story.maxRegionPercent ?? null;
  const failReason = metrics.failReason ?? metrics.error ?? story.error ?? "—";

  const fingerprint = [
    suiteId,
    status,
    percent.toFixed(3),
    maxRegion != null ? maxRegion.toFixed(3) : "na",
    attempt ?? 0,
    source
  ].join("|");

  const existing = readFileSync(path, "utf8");
  if (existing.includes(`<!-- vault-fingerprint: ${fingerprint} -->`)) {
    return { ok: true, path, skipped: true, reason: "duplicate fingerprint" };
  }

  /** @type {string[]} */
  let regionLines = [];
  if (resultRow?.diffRegions?.length) {
    const relBase = story.paths?.comparePng
      ? dirname(relRepoPath(root, story.paths.comparePng))
      : `figma-live-diffs/${storyId.replace(/--/g, "-")}`;
    regionLines = resultRow.diffRegions.map((r) => {
      const compareRel = r.compare ?? `regions/region-${String(r.index).padStart(2, "0")}-compare.png`;
      const pct = r.rect?.percent != null ? `${r.rect.percent.toFixed(2)}% hotspot` : "diff region";
      return `| region-${String(r.index).padStart(2, "0")} | ${pct} | \`${join(relBase, compareRel)}\` |`;
    });
  } else if (story.paths?.worstRegionCompare) {
    regionLines = [
      `| region-01 | worst hotspot | \`${relRepoPath(root, story.paths.worstRegionCompare)}\` |`
    ];
  } else if (story.paths?.comparePng) {
    regionLines = [`| region-01 | compare | \`${relRepoPath(root, story.paths.comparePng)}\` |`];
  } else {
    regionLines = ["| region-01 | | |"];
  }

  const attemptLine = attempt != null ? `\n**Fix attempt:** ${attempt}\n` : "";
  const block = `
## Investigation — ${storyId} / ${step}

**Job ID:** ${jobId ?? "n/a"}  
**Date:** ${date}  
**Source:** ${source} (automated)${attemptLine}

### Metrics

| Field | Value |
| --- | --- |
| Status | ${status} |
| Global diff | ${percent.toFixed(2)}% |
| Worst hotspot | ${maxRegion != null ? `${maxRegion.toFixed(2)}%` : "n/a"} |
| Fail reason | ${failReason} |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
${regionLines.join("\n")}

### Artifacts

- Compare: \`${relRepoPath(root, story.paths?.worstRegionCompare ?? story.paths?.comparePng)}\`
- Storybook PNG: \`${relRepoPath(root, story.paths?.storybookPng)}\`
- Figma PNG: \`${relRepoPath(root, story.paths?.figmaPng)}\`
- Artifact JSON: \`${relRepoPath(root, story.paths?.artifactPath)}\`
- Scene JSON: \`${relRepoPath(root, story.paths?.sceneJsonPath)}\`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at ${date}

<!-- vault-fingerprint: ${fingerprint} -->
`;

  appendFileSync(path, block, "utf8");

  const commit = maybeCommitVault(root, storyId);
  return { ok: true, path, skipped: false, committed: commit };
}

/**
 * @param {string} repoRoot
 * @param {object} story
 * @param {string} suiteId
 * @param {string} [jobId]
 * @param {string} [source]
 * @param {number} [attempt]
 * @param {{ dir: string }} cfg
 * @param {(id: string) => string} safeSegment
 */
export function recordStoryFailureInVault(
  repoRoot,
  story,
  suiteId,
  { jobId, source, attempt, cfg, safeSegment } = {}
) {
  if (!story?.storyId || story.status === "pass") return { ok: false, reason: "pass or no story" };
  const resultRow =
    cfg && safeSegment ? loadByStoryResult(repoRoot, suiteId, story.storyId, cfg, safeSegment) : null;
  return appendTestInvestigation({
    repoRoot,
    storyId: story.storyId,
    suiteId,
    jobId,
    source,
    attempt,
    story,
    resultRow
  });
}

/**
 * @param {string} repoRoot
 * @param {string} storyId
 */
function maybeCommitVault(repoRoot, storyId) {
  if (process.env.LAB_MEMORY_AUTO_COMMIT !== "1") return false;
  const git = spawnSync("git", ["rev-parse", "--git-dir"], { cwd: repoRoot, encoding: "utf8" });
  if (git.status !== 0) return false;

  spawnSync("git", ["add", "lab-memory/"], { cwd: repoRoot, encoding: "utf8" });
  const commit = spawnSync(
    "git",
    ["commit", "-m", `memory: ${storyId} test investigation`, "--", "lab-memory/"],
    { cwd: repoRoot, encoding: "utf8" }
  );
  return commit.status === 0;
}
