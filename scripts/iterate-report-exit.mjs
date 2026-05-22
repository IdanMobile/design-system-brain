/**
 * Shared exit-code logic for figma-iterate / figma-live-iterate scripts.
 * When fixing one story, exit must reflect that story only — not the whole portfolio.
 */

/**
 * @param {Array<{ storyId?: string, status?: string }>} results
 * @param {{ storyId?: string | null }} [scope]
 */
export function scopeReportResults(results, scope = {}) {
  const rows = results ?? [];
  if (!scope.storyId) return rows;
  const scoped = rows.filter((r) => r.storyId === scope.storyId);
  return scoped.length ? scoped : rows;
}

/**
 * @param {Array<{ status?: string }>} results
 * @param {{ strict?: boolean }} [options]
 */
export function exitCodeForResults(results, options = {}) {
  const strict = options.strict ?? false;
  const rows = results ?? [];
  const fail = rows.filter((r) => r.status === "fail");
  const err = rows.filter((r) => r.status === "error");
  const warn = rows.filter((r) => r.status === "warn");
  if (err.length || fail.length) return 1;
  if (warn.length && strict) return 1;
  return 0;
}

/**
 * @param {{ results?: Array<{ storyId?: string, status?: string }> }} report
 * @param {{ storyId?: string | null, strict?: boolean }} [options]
 */
export function exitCodeForReport(report, options = {}) {
  const scoped = scopeReportResults(report.results ?? [], { storyId: options.storyId });
  return exitCodeForResults(scoped, { strict: options.strict });
}
