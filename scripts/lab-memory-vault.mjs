/**
 * Obsidian lab-memory vault — automated investigation stubs from test results.
 * Phase 4-lite (local Mac): writes markdown; optional git commit via LAB_MEMORY_AUTO_COMMIT=1.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveRepoRoot,
  labMemoryRoot,
  patternsDir,
  investigationsActiveDir,
  resolveInvestigationPath,
  investigationPath,
  PATTERN_WIKI_PREFIX
} from "./lab-memory-paths.mjs";

export { resolveRepoRoot } from "./lab-memory-paths.mjs";

/** @param {string} repoRoot */
export function labMemoryDir(repoRoot) {
  return labMemoryRoot(repoRoot);
}

/** @param {string} repoRoot @param {string} storyId */
export function vaultStoryPath(repoRoot, storyId) {
  return resolveInvestigationPath(repoRoot, storyId);
}

const SUITE_STEP = {
  pixel: "pixel",
  figma: "figma mock",
  figmaLive: "figma live",
  delivery: "delivery",
  logic: "logic"
};

const CODE_V2_PATH = "packages/figma-importer-plugin/src/code-v2.ts";
const EXTRACT_PATH = "packages/extractor-playwright/src/extract.ts";

/** @param {string} text */
export function isInfraFailure(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.toLowerCase();
  return (
    t.includes("page.goto") ||
    t.includes("timeout") && t.includes("exceeded") ||
    t.includes("net::err") ||
    t.includes("econnrefused") ||
    t.includes("storybook") && t.includes("not reachable") ||
    t.includes("cannot fetch") && t.includes("index.json")
  );
}

/** @param {'live' | 'emulator' | 'pixel'} mode */
export function primaryFixPathForMode(mode) {
  if (mode === "pixel") return PIXEL_RENDER_HTML_PATH;
  return CODE_V2_PATH;
}

/**
 * @param {string} repoRoot
 * @param {string} body
 * @returns {{ id: string, title: string, summary?: string }[]}
 */
export function loadLinkedPatternsFromStory(repoRoot, body) {
  const patterns = [];
  const wiki = [
    ...body.matchAll(/\[\[(?:visual\/)?patterns\/([^\]]+)\]\]/g)
  ];
  for (const m of wiki) {
    const id = m[1].replace(/\.md$/, "");
    if (patterns.some((p) => p.id === id)) continue;
    patterns.push({ id, title: id });
  }
  const dir = patternsDir(repoRoot);
  for (const p of patterns) {
    const path = join(dir, `${p.id}.md`);
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, "utf8");
    const title = raw.match(/^# (.+)/m)?.[1] ?? p.id;
    const summary =
      raw.match(/## Rule\s*\n\n([\s\S]*?)(?=\n## |\n<!--|$)/)?.[1]?.trim() ||
      raw.match(/## Symptom\s*\n\n([\s\S]*?)(?=\n## )/)?.[1]?.trim().split("\n")[0];
    p.title = title;
    p.summary = summary;
  }
  return patterns;
}

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
  const path = resolveInvestigationPath(repoRoot, storyId);
  if (existsSync(path)) return path;

  const activeDir = investigationsActiveDir(repoRoot);
  mkdirSync(activeDir, { recursive: true });
  const newPath = investigationPath(repoRoot, storyId, "active");
  const templatePath = join(labMemoryDir(repoRoot), "templates", "story.md");
  let body = `# ${storyId}\n\n## Status\n\n| Step | ID | Pass |\n| --- | --- | --- |\n| 1 | pixel | |\n| 2 | figma mock | |\n| 3 | figma live | |\n| 4 | delivery | |\n\n## Timeline\n\n`;
  if (existsSync(templatePath)) {
    body = readFileSync(templatePath, "utf8").replace(/\{\{storyId\}\}/g, storyId);
  }
  writeFileSync(newPath, body, "utf8");
  return newPath;
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
  const infra = isInfraFailure(String(failReason));

  const fingerprint = [
    infra ? "infra" : suiteId,
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

${
  infra
    ? "Infrastructure — Storybook/Playwright load failed (timeout or unreachable). Lower parallelism (`STORYBOOK_PARALLEL` ≤ 12), confirm `pnpm storybook:serve`, re-run golden. Do not edit renderer until a real visual fail reproduces."
    : "<!-- pending — agent fills after systematic-debugging -->"
}

### Recommended fix area

${
  infra
    ? "<!-- infra — no adapter edit until visual failure is confirmed -->"
    : "<!-- pending — see primary fix path for this suite in agent prompt -->"
}

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

/** v2 schema pixel replay — NOT scene-to-html.ts (mock/Figma emulator only). */
export const PIXEL_RENDER_HTML_PATH = "packages/pixel-test/src/render-html.ts";

/**
 * True when lab-memory has a filled root-cause block for this story/step (not pending).
 * Used by fix-all investigator gate before dispatching fixer agents.
 * @param {string} repoRoot
 * @param {string} storyId
 * @param {string} [suiteId]
 */
export function isInvestigationComplete(repoRoot, storyId, suiteId = "pixel") {
  return loadLabMemoryFixHint(repoRoot, storyId, suiteId) !== null;
}

/**
 * Last filled root-cause block for a story/step from lab-memory (skips pending stubs).
 * @param {string} repoRoot
 * @param {string} storyId
 * @param {string} [suiteId]
 * @returns {{ rootCause: string, recommendedFixArea?: string } | null}
 */
export function loadLabMemoryFixHint(repoRoot, storyId, suiteId = "pixel") {
  const path = vaultStoryPath(repoRoot, storyId);
  if (!existsSync(path)) return null;

  const step = SUITE_STEP[suiteId] ?? suiteId;
  const body = readFileSync(path, "utf8");
  const sections = body.split(/^## Investigation — /m).slice(1);

  /** @type {Array<{ rootCause: string, recommendedFixArea?: string, score: number }>} */
  const candidates = [];

  for (const section of sections) {
    const header = section.split("\n")[0] ?? "";
    if (!header.includes(` / ${step}`)) continue;

    const rootMatch = section.match(/### Root cause\s*\n\n([\s\S]*?)(?=\n### |\n<!-- vault-fingerprint)/);
    if (!rootMatch) continue;
    const root = rootMatch[1].trim();
    if (!root || root.includes("<!-- pending")) continue;

    const fixMatch = section.match(
      /### Recommended fix area\s*\n\n([\s\S]*?)(?=\n### |\n<!-- vault-fingerprint)/
    );
    const fixArea = fixMatch?.[1]?.trim() ?? "";
    if (fixArea.includes("<!-- pending")) continue;

    let score = 0;
    if (fixArea && !/figma-screen-story-map|bake-figma-screen-ui|@lab\/ui.*Screen/i.test(fixArea)) {
      score += 2;
    }
    if (/code-v2|render-html|manifest-to-contract/i.test(fixArea)) score += 2;
    if (/storybook story mapped/i.test(root)) score -= 5;
    if (
      /Infrastructure — Storybook|infra — no adapter|ERR_CONNECTION_REFUSED/i.test(
        root + fixArea
      )
    ) {
      score -= 10;
    }

    candidates.push({
      rootCause: root,
      recommendedFixArea: fixArea || undefined,
      score,
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates.find((c) => c.score > -5) ?? candidates[0];
  if (best.score < -5) return null;
  return { rootCause: best.rootCause, recommendedFixArea: best.recommendedFixArea };
}

/**
 * @param {{ rootCause: string, recommendedFixArea?: string } | null} hint
 * @param {'live' | 'emulator' | 'pixel'} mode
 * @returns {string[]}
 */
export function formatLabMemoryFixHintBlock(hint, mode = "pixel") {
  if (!hint) return [];
  const primary = primaryFixPathForMode(mode);
  const lines = [
    "── Lab memory (prior investigation — finish this, do not re-triage from scratch) ──",
    "Root cause (cached):",
    ...hint.rootCause.split("\n").map((line) => (line.trim() ? `  ${line}` : "")),
    ""
  ];
  if (hint.recommendedFixArea) {
    lines.push(
      "Recommended fix area (cached):",
      ...hint.recommendedFixArea.split("\n").map((line) => (line.trim() ? `  ${line}` : "")),
      ""
    );
  }
  const grepHint =
    mode === "pixel"
      ? `Use Grep on ${primary} and ${EXTRACT_PATH} — do NOT read those files in full.`
      : `Use Grep on ${primary} — do NOT read code-v2.ts or extract.ts in full before triage.`;
  lines.push(`Primary fix path (${mode}): ${primary}`, grepHint, "");
  return lines;
}

/**
 * @param {{ id: string, title: string, summary?: string }[]} patterns
 * @returns {string[]}
 */
export function formatPatternHintBlock(patterns) {
  if (!patterns.length) return [];
  const lines = ["── Linked patterns (apply rule before story-specific hacks) ──"];
  for (const p of patterns) {
    lines.push(`- [[${PATTERN_WIKI_PREFIX}/${p.id}]] — ${p.title}${p.summary ? `: ${p.summary}` : ""}`);
  }
  lines.push("");
  return lines;
}

/**
 * @param {string} repoRoot
 * @param {string} storyId
 * @param {string} suiteId
 * @param {'live' | 'emulator' | 'pixel'} mode
 */
export function loadLabMemoryContext(repoRoot, storyId, suiteId, mode = "pixel") {
  const path = vaultStoryPath(repoRoot, storyId);
  const hint = loadLabMemoryFixHint(repoRoot, storyId, suiteId);
  let patterns = [];
  let pendingOnly = false;
  if (existsSync(path)) {
    const body = readFileSync(path, "utf8");
    patterns = loadLinkedPatternsFromStory(repoRoot, body);
    if (!hint) {
      const hasInvestigation = body.includes("## Investigation —");
      pendingOnly = hasInvestigation;
    }
  }
  return { hint, patterns, pendingOnly, primaryPath: primaryFixPathForMode(mode) };
}

/**
 * @param {ReturnType<typeof loadLabMemoryContext>} ctx
 * @param {'live' | 'emulator' | 'pixel'} mode
 * @returns {string[]}
 */
export function formatLabMemoryContextBlock(ctx, mode = "pixel") {
  /** @type {string[]} */
  const lines = [];
  lines.push(...formatPatternHintBlock(ctx.patterns));
  if (ctx.hint) {
    lines.push(...formatLabMemoryFixHintBlock(ctx.hint, mode));
  } else if (ctx.pendingOnly) {
    lines.push(
      "── Lab memory ──",
      "Investigation stub exists but root cause is still pending — complete triage (compare PNG + artifact JSON) before editing adapter code.",
      `Primary fix path (${mode}): ${ctx.primaryPath}`,
      ""
    );
  }
  return lines;
}

/**
 * @param {object} opts
 * @param {string} opts.repoRoot
 * @param {string} opts.storyId
 * @param {string} opts.suiteId
 * @param {number} [opts.attempt]
 * @param {string} [opts.patternSlug] — without .md
 */
export function appendStoryResolution(opts) {
  const { repoRoot, storyId, suiteId, attempt, patternSlug } = opts;
  const root = resolveRepoRoot(repoRoot);
  const path = vaultStoryPath(root, storyId);
  if (!existsSync(path)) return { ok: false, reason: "no story note" };

  const step = SUITE_STEP[suiteId] ?? suiteId;
  const date = new Date().toISOString();
  const fp = `resolved|${suiteId}|${attempt ?? 0}|${date.slice(0, 10)}`;
  const existing = readFileSync(path, "utf8");
  if (existing.includes(`<!-- vault-fingerprint: ${fp} -->`)) {
    return { ok: true, skipped: true };
  }

  const patternLine = patternSlug
    ? `\nConsider documenting: \`lab-memory/visual/patterns/${patternSlug}.md\` and link \`[[${PATTERN_WIKI_PREFIX}/${patternSlug}]]\` under ## Linked patterns.\n`
    : `\nIf the fix was a reusable rule, add or update a note under \`lab-memory/visual/patterns/\`.\n`;

  const block = `
## Resolved — ${storyId} / ${step}

**Date:** ${date}  
**Attempt:** ${attempt ?? "—"}  
**Suite:** ${suiteId}

Automated harness reports **PASS** for this story/step.
${patternLine}
<!-- vault-fingerprint: ${fp} -->
`;

  appendFileSync(path, block, "utf8");
  maybeCommitVault(root, storyId);
  return { ok: true, skipped: false };
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
