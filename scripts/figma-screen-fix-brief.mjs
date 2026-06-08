/**
 * Compact fix brief for Figma-entry steps when test-report.json is missing.
 * Keeps fixer prompts focused — no story-map, no full skill chain re-read.
 */

import { readFileSync, existsSync } from "node:fs";
import { readScreenStepResult } from "./figma-screen-portfolio.mjs";
import { resolveFailedTest, FIXER_ALLOWLIST } from "./fixer-routing.mjs";
import { figmaEntryRerunCommand } from "./figma-entry-fix.mjs";

/** @param {string} repoRoot @param {string} screenId @param {string} stepId */
export function buildFigmaScreenFixBrief(repoRoot, screenId, stepId) {
  const rec = readScreenStepResult(repoRoot, screenId, stepId);
  if (!rec) return [];

  const routing = resolveFailedTest(stepId, {
    itemId: screenId,
    storyId: screenId,
    manifestPath: rec.manifestPath,
  });
  const allow = routing?.allowlist ?? FIXER_ALLOWLIST[routing?.primaryFixer ?? ""]?.allow ?? [];

  const lines = [
    "── Fix brief (contract-first — read this, then edit ONE allowlisted file) ──",
    `Step: ${stepId} · ${rec.status ?? "fail"} · global ${(rec.percent ?? 0).toFixed(3)}%` +
      (rec.worstRegion?.pct != null ? ` · worst ${rec.worstRegion.name} ${rec.worstRegion.pct.toFixed(3)}%` : ""),
    `Primary fixer: ${routing?.primaryFixer ?? "—"}`,
    `Allowlist ONLY: ${allow.slice(0, 4).join(", ") || "see fixer-routing.mjs"}`,
    "",
    "FORBIDDEN for Figma-entry screens:",
    "  · scripts/figma-screen-story-map.mjs, @lab/ui Screen* components, bake-figma-screen-ui",
    "  · .restore-backup*/ paths, other .sandboxes/* worktrees, reading code-v2.ts in full",
    "  · pnpm install inside sandbox (corrupts main node_modules symlinks)",
    "  · Reading any path under .sandboxes/ or .restore-backup/",
    "",
    "MANDATORY fixer behavior:",
    "  1. Open compare PNG — diagnose visually in ≤2 minutes.",
    "  2. Grep contract JSON for hotspot layer ids (fig-*) — do NOT read entire code-v2.ts.",
    "  3. Land ONE targeted edit in allowlisted file within 5 minutes.",
    "  4. Harness rebuilds plugin + re-tests — do NOT run golden yourself.",
    "",
    "Artifacts (open compare PNG first):",
  ];
  if (rec.diffPng) lines.push(`  Compare: ${rec.diffPng}`);
  if (rec.originalPng) lines.push(`  Original: ${rec.originalPng}`);
  if (rec.targetPng) lines.push(`  Target: ${rec.targetPng}`);
  if (rec.contractPath) lines.push(`  Contract: ${rec.contractPath}`);

  const hot = (rec.regions ?? [])
    .filter((r) => (r.pct ?? 0) > (rec.tolerance ?? 0.1))
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
    .slice(0, 3);
  if (hot.length) {
    lines.push("", "Hotspots (viewport-relative — small screens use only regions inside canvas):");
    for (const r of hot) {
      lines.push(`  · ${r.name}: ${(r.pct ?? 0).toFixed(3)}% @ (${r.x},${r.y}) ${r.w ?? r.width}×${r.h ?? r.height}`);
    }
  }

  lines.push("", `Verify (harness runs this — do NOT run full parity): ${figmaEntryRerunCommand(stepId, screenId)}`);
  return lines;
}

/**
 * Strip stale lab-memory hints that contradict contract-first routing.
 * @param {{ rootCause: string, recommendedFixArea?: string } | null} hint
 * @param {string} stepId
 */
export function sanitizeLabMemoryHint(hint, stepId) {
  if (!hint) return null;
  const fix = hint.recommendedFixArea ?? "";
  const stalePatterns = [
    /figma-screen-story-map/i,
    /ScreenNotification/i,
    /bake-figma-screen-ui/i,
    /@lab\/ui.*Screen/i,
  ];
  if (["vsFigmaLive", "vsStorybook", "vsReactHtml", "vsReactTsx"].includes(stepId)) {
    if (stalePatterns.some((p) => p.test(fix))) {
      return {
        rootCause: hint.rootCause,
        recommendedFixArea: undefined,
      };
    }
  }
  return hint;
}
