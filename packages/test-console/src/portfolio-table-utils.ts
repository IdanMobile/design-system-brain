import type { PortfolioRow, PortfolioState } from "./types";

export const UNIFIED_STEP_ORDER = [
  "structural",
  "vsFigmaLive",
  "vsStorybook",
  "vsReactHtml",
  "vsReactTsx",
  "logic"
] as const;

export const UNIFIED_COMPARE = new Set([
  "vsFigmaLive",
  "vsStorybook",
  "vsReactHtml",
  "vsReactTsx"
]);

export function statusClass(s: string): string {
  if (s === "pass") return "pass";
  if (s === "warn") return "warn";
  if (s === "not_tested") return "not_tested";
  return "fail";
}

export function stepHasCompare(stepId: string): boolean {
  return UNIFIED_COMPARE.has(stepId);
}

export function pctColumnLabel(stepId: string, row?: PortfolioRow): string {
  if (stepId === "structural") {
    return row?.entryPoint === "figma" ? "Layers" : "Extract";
  }
  if (stepId === "logic") return "Gaps";
  return "Diff %";
}

export function stepColSpan(stepId: string): number {
  if (stepId === "structural" || stepId === "logic") return 2;
  if (UNIFIED_COMPARE.has(stepId)) return 3;
  return 2;
}

export function unifiedStepReportUrl(stepId: string): string {
  return `/repo/test-portfolio/unified-steps/${stepId}/report.html`;
}

export function unifiedStepSummaryStats(
  portfolio: PortfolioState | null,
  stepId: string,
  mode: "test" | "quick" = "test"
) {
  if (!portfolio?.rows.length) return null;
  const counts = { pass: 0, warn: 0, fail: 0, error: 0, not_tested: 0, skipped: 0 };
  for (const row of portfolio.rows) {
    const s = row.cells[stepId]?.status ?? "not_tested";
    if (s === "pass") counts.pass++;
    else if (s === "warn") counts.warn++;
    else if (s === "fail") counts.fail++;
    else if (s === "error") counts.error++;
    else if (s === "skipped") counts.skipped++;
    else counts.not_tested++;
  }
  const stepDef = portfolio.steps.find((s) => s.id === stepId);
  return {
    total: portfolio.rows.length,
    counts,
    generatedAt: portfolio.generatedAt,
    htmlUrl: mode === "test" ? (stepDef?.htmlUrl ?? unifiedStepReportUrl(stepId)) : null
  };
}

export function cellStatusTitle(row: PortfolioRow, stepId: string): string | undefined {
  const c = row.cells[stepId];
  if (!c) return undefined;
  const parts: string[] = [];
  if (c.gateMode === "quick") {
    parts.push(
      c.quickProceeded
        ? `Quick proceed gate: pass (≤ ${row.quickGatePct ?? 5}%)`
        : `Quick proceed gate: blocked (strict report ${c.percent?.toFixed(2) ?? "?"}%)`
    );
  }
  if (c.blockedReason) parts.push(c.blockedReason);
  if (c.maxRegionPercent != null && c.status !== "pass") {
    parts.push(
      `Global ${c.percent?.toFixed(2) ?? "?"}% · worst hotspot ${c.maxRegionPercent.toFixed(2)}%`
    );
  } else if (c.testedAt) {
    parts.push(`Last run: ${new Date(c.testedAt).toLocaleString()}`);
  } else if (c.action) {
    parts.push(c.action);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

export function portfolioRowKey(row: PortfolioRow, mode: "test" | "quick"): string {
  if (mode === "quick" && row.jobId) return row.jobId;
  return `${row.entryPoint ?? "storybook"}:${row.storyId}`;
}

export function itemInspectTitle(row: PortfolioRow, mode: "test" | "quick"): string {
  if (mode === "quick") {
    const parts = [row.componentName ?? row.storyId, row.storyId];
    if (row.jobId) parts.push(`job ${row.jobId}`);
    if (row.jobStatus) parts.push(row.jobStatus);
    return parts.filter(Boolean).join(" · ");
  }
  return `${row.storyId} — open inspection`;
}
