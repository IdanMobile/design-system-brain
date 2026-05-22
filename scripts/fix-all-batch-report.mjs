/**
 * Deterministic investigation report for batch fix-all (no extra AI call).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

  return {
    generatedAt: new Date().toISOString(),
    suiteId: meta.suiteId,
    suiteLabel: meta.suiteLabel,
    tolerance: globalTol,
    regionTolerance: regionTol,
    storyCount: stories.length,
    families: Object.fromEntries(families),
    hints,
    stories: rows
  };
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

  lines.push(
    "## Agent instructions",
    "",
    "1. Read this report, then open compare PNGs + artifact JSON per story above.",
    "2. Find **shared root cause** across families — implement **one batch of edits** for all stories.",
    "3. Do **not** run golden tests yourself; the harness re-tests every listed story after your session.",
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
