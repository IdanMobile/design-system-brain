/**
 * Deterministic investigation report for batch fix-all (no extra AI call).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const KNOWN_RENDERER_FILES = [
  { repoPath: "packages/figma-importer-plugin/src/code-v2.ts", label: "code-v2.ts (renderer)" },
  { repoPath: "packages/pixel-test/src/render-html.ts", label: "render-html.ts (pixel schema replay)" },
  { repoPath: "packages/figma-importer-plugin/src/scene-to-html.ts", label: "scene-to-html.ts (mock replay)" },
  { repoPath: "packages/extractor-playwright/src/extract.ts", label: "extract.ts (playwright extractor)" }
];

const SUSPECT_HINT_PATTERNS = [
  {
    failReason: "global_over",
    terms: ["buildLayer", "applyTransform", "applyBorders", "applyCornerRadii", "clampNodeWidthToParent", "createFrameNode", "snap", "snapBoxSize"]
  },
  {
    failReason: "global_and_hotspot",
    terms: ["buildLayer", "applyTransform", "applyBorders", "applyCornerRadii", "clampNodeWidthToParent", "createFrameNode", "snap"]
  },
  {
    failReason: "hotspot_over",
    terms: ["createTextNode", "resolveFont", "preloadFonts", "buildFills", "applyBorders", "applyCornerRadii", "weightToStyle", "liveCompensatedWeight", "buildBorderOutlineSvg", "createImageNode", "createVectorNode"]
  },
  {
    failReason: "status_not_pass",
    terms: ["buildLayer", "isUniversalDocumentV2"]
  }
];

const ALWAYS_INCLUDE_SYMBOLS = ["buildLayer"];

/** Best-effort symbol scan: returns "symbol → first line" map for a JS/TS file. */
function indexSymbols(source) {
  const lines = source.split(/\r?\n/);
  const out = new Map();
  const fnRe = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/;
  const constRe = /^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(?/;
  const classRe = /^\s*(?:export\s+)?class\s+([A-Za-z0-9_$]+)/;
  const methodRe = /^\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fnMatch = fnRe.exec(line) || constRe.exec(line) || classRe.exec(line);
    if (fnMatch) {
      if (!out.has(fnMatch[1])) out.set(fnMatch[1], i);
      continue;
    }
    const m = methodRe.exec(line);
    if (m && !line.includes("if ") && !line.includes("for ") && !line.includes("while ") && !line.includes("switch")) {
      const name = m[1];
      if (name.length > 1 && !out.has(name)) out.set(name, i);
    }
  }
  return { lines, symbols: out };
}

/** @param {{lines: string[], symbols: Map<string, number>}} idx @param {string} sym */
function snippetForSymbol(idx, sym, contextBefore = 1, contextAfter = 40) {
  const start = idx.symbols.get(sym);
  if (start == null) return null;
  const from = Math.max(0, start - contextBefore);
  const to = Math.min(idx.lines.length, start + contextAfter);
  return {
    symbol: sym,
    startLine: from + 1,
    endLine: to,
    code: idx.lines.slice(from, to).join("\n")
  };
}

/**
 * Find suspect symbols across renderer files. Returns at most `maxSnippets`
 * snippets so the report stays compact.
 * @param {string} repoRoot
 * @param {object} payload
 */
function extractSuspectSnippets(repoRoot, payload, maxSnippets = 8) {
  const seenFailReasons = new Set(payload.stories.map((s) => s.failReason));
  const suspectTerms = new Set(ALWAYS_INCLUDE_SYMBOLS);
  for (const hint of SUSPECT_HINT_PATTERNS) {
    if (seenFailReasons.has(hint.failReason)) {
      for (const t of hint.terms) suspectTerms.add(t);
    }
  }
  if (!suspectTerms.size) return [];

  const snippets = [];
  for (const file of KNOWN_RENDERER_FILES) {
    const abs = join(repoRoot, file.repoPath);
    if (!existsSync(abs)) continue;
    let source;
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const idx = indexSymbols(source);
    for (const term of suspectTerms) {
      if (snippets.length >= maxSnippets) break;
      const snippet = snippetForSymbol(idx, term);
      if (snippet) {
        snippets.push({
          file: file.repoPath,
          fileLabel: file.label,
          totalFileLines: idx.lines.length,
          ...snippet
        });
      }
    }
    if (snippets.length >= maxSnippets) break;
  }
  return snippets;
}

/** @param {string} storyId */
export function componentFamily(storyId) {
  const dash = storyId.indexOf("--");
  if (dash === -1) return storyId;
  return storyId.slice(0, dash + 2);
}

/**
 * @param {object[]} stories — from agent bridge storyFromReportRow
 * @param {{ suiteId: string, suiteLabel: string, tolerance?: number, regionTolerance?: number }} meta
 */
export function buildBatchInvestigationPayload(stories, meta) {
  const globalTol = meta.tolerance ?? 0.1;
  const regionTol = meta.regionTolerance ?? 0.1;

  const families = new Map();
  for (const s of stories) {
    const fam = componentFamily(s.storyId);
    if (!families.has(fam)) families.set(fam, []);
    families.get(fam).push(s.storyId);
  }

  const rows = stories.map((s, index) => {
    const globalPct = s.percent ?? 0;
    const hotspot = s.maxRegionPercent ?? null;
    const globalOk = globalPct <= globalTol;
    const regionOk = hotspot == null || hotspot <= regionTol;
    let failReason = "unknown";
    if (!globalOk && !regionOk) failReason = "global_and_hotspot";
    else if (!globalOk) failReason = "global_over";
    else if (!regionOk) failReason = "hotspot_over";
    else if (s.status !== "pass") failReason = "status_not_pass";

    const worst = s.paths?.worstRegionCompare ?? s.paths?.comparePng;
    return {
      index: index + 1,
      storyId: s.storyId,
      status: s.status,
      globalPercent: globalPct,
      maxRegionPercent: hotspot,
      globalOk,
      regionOk,
      failReason,
      comparePng: s.paths?.comparePng,
      worstRegionCompare: worst,
      storybookPng: s.paths?.storybookPng,
      renderedPng: s.paths?.figmaPng,
      artifactPath: s.paths?.artifactPath,
      sceneJsonPath: s.paths?.sceneJsonPath,
      error: s.error ?? null
    };
  });

  const hints = [];
  for (const [fam, ids] of families) {
    if (ids.length >= 2) {
      hints.push(
        `${ids.length} stories in family \`${fam}*\` — prefer ONE shared fix (renderer/extract), not ${ids.length} separate edits.`
      );
    }
  }
  const hotspotOnly = rows.filter((r) => r.failReason === "hotspot_over");
  if (hotspotOnly.length >= 2) {
    hints.push(
      `${hotspotOnly.length} stories fail hotspot only (global OK) — check region compare PNGs; may be tolerance or localized raster, not N unrelated bugs.`
    );
  }
  if (rows.every((r) => r.storyId.startsWith("lab-"))) {
    hints.push("All `@lab` stories — likely shared code-v2.ts or scene-to-html.ts path.");
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    suiteId: meta.suiteId,
    suiteLabel: meta.suiteLabel,
    tolerance: globalTol,
    regionTolerance: regionTol,
    storyCount: stories.length,
    families: Object.fromEntries(families),
    hints,
    stories: rows,
    suspectSnippets: []
  };
  if (meta.repoRoot) {
    try {
      payload.suspectSnippets = extractSuspectSnippets(meta.repoRoot, payload);
    } catch {
      /* best-effort */
    }
  }
  return payload;
}

/**
 * @param {object} payload
 * @returns {string}
 */
export function formatBatchInvestigationMarkdown(payload) {
  const lines = [
    `# Fix-all investigation report`,
    "",
    `**Suite:** ${payload.suiteLabel} (\`${payload.suiteId}\`)`,
    `**Stories:** ${payload.storyCount} fail/warn`,
    `**Pass bar:** global ≤ ${payload.tolerance}% AND worst hotspot ≤ ${payload.regionTolerance}%`,
    "",
    "## Component families",
    ""
  ];

  for (const [fam, ids] of Object.entries(payload.families)) {
    lines.push(`- \`${fam}*\` — ${ids.length}: ${ids.join(", ")}`);
  }

  if (payload.hints.length) {
    lines.push("", "## Fix strategy hints", "");
    for (const h of payload.hints) lines.push(`- ${h}`);
  }

  lines.push("", "## Stories (read compare + artifact for each before editing)", "");

  for (const s of payload.stories) {
    lines.push(
      ...[
        `### ${s.index}. \`${s.storyId}\` — ${s.status}`,
        "",
        `- Global diff: **${s.globalPercent.toFixed(2)}%** ${s.globalOk ? "(OK)" : "(over bar)"}`,
        s.maxRegionPercent != null
          ? `- Worst hotspot: **${s.maxRegionPercent.toFixed(2)}%** ${s.regionOk ? "(OK)" : "(over bar)"}`
          : "- Worst hotspot: —",
        `- Fail reason: \`${s.failReason}\``,
        s.error ? `- Error: ${s.error}` : null,
        `- Compare: ${s.comparePng}`,
        s.worstRegionCompare && s.worstRegionCompare !== s.comparePng
          ? `- Hotspot compare: ${s.worstRegionCompare}`
          : null,
        `- Storybook: ${s.storybookPng}`,
        `- Rendered: ${s.renderedPng}`,
        `- Artifact: ${s.artifactPath}`,
        `- Scene JSON: ${s.sceneJsonPath}`,
        ""
      ].filter(Boolean)
    );
  }

  if (payload.suspectSnippets?.length) {
    lines.push(
      "## Suspect renderer snippets (pre-extracted — do NOT Read the full files)",
      "",
      "These are the most likely sites to edit for the failure patterns above. " +
        "Use Grep on the file if you need a different symbol — never `Read` `code-v2.ts`, `scene-to-html.ts`, or `extract.ts` in full.",
      ""
    );
    for (const snip of payload.suspectSnippets) {
      lines.push(
        `### \`${snip.symbol}\` — \`${snip.file}\` (lines ${snip.startLine}–${snip.endLine} of ${snip.totalFileLines})`,
        "",
        "```ts",
        snip.code,
        "```",
        ""
      );
    }
  }

  lines.push(
    "## Agent instructions",
    "",
    "1. Read this report, then open compare PNGs + artifact JSON per story above.",
    "2. Find **shared root cause** across families — implement **one batch of edits** for all stories.",
    "3. The snippets above are pre-extracted — edit those areas directly, do NOT Read `code-v2.ts` in full.",
    "4. Do **not** run golden tests yourself; the harness re-tests every listed story after your session.",
    ""
  );

  return lines.join("\n");
}

/**
 * @param {string} repoRoot
 * @param {string} jobId
 * @param {number} batchAttempt
 * @param {object} payload
 */
export function writeBatchInvestigationReport(repoRoot, jobId, batchAttempt, payload) {
  const dir = join(repoRoot, ".test-console");
  mkdirSync(dir, { recursive: true });
  const base = join(dir, `fix-all-batch-${jobId}-try-${batchAttempt}`);
  const jsonPath = `${base}.json`;
  const mdPath = `${base}.md`;
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  writeFileSync(mdPath, formatBatchInvestigationMarkdown(payload));
  return { jsonPath, mdPath };
}

/** @param {string} jsonPath @returns {object | null} */
export function readBatchReportTolerance(jsonPath) {
  if (!existsSync(jsonPath)) return null;
  try {
    return JSON.parse(readFileSync(jsonPath, "utf8"));
  } catch {
    return null;
  }
}
