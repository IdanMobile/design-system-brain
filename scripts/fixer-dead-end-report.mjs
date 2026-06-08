/**
 * Structured dead-end report when fixer/investigator exhaust attempts without green.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadTestReport } from "./test-report-build.mjs";

/**
 * @param {string} repoRoot
 * @param {object} opts
 */
export function writeFixerDeadEndReport(repoRoot, opts) {
  const {
    jobId,
    storyId,
    stepId,
    suiteId,
    suiteLabel,
    entryPoint = "figma",
    reason,
    detail,
    attemptsUsed = 0,
    maxAttempts = 5,
    metricsBefore = null,
    metricsAfter = null,
    attemptOutcomes = [],
    testReportPath = null,
    logFile = null
  } = opts;

  let investigator = null;
  let worstRegion = null;
  if (testReportPath && existsSync(testReportPath)) {
    try {
      const report = loadTestReport(testReportPath);
      investigator = report?.investigator?.agent ?? report?.investigator?.automatic ?? null;
      worstRegion =
        report?.mismatches?.[0]?.evidence?.message ??
        report?.global?.maxRegionPercent != null
          ? `hotspot ${report.global.maxRegionPercent}%`
          : null;
    } catch {
      /* ok */
    }
  }

  const resolutionPath = testReportPath
    ? join(dirname(testReportPath), "investigator-resolution.json")
    : null;
  let resolutionSummary = null;
  if (resolutionPath && existsSync(resolutionPath)) {
    try {
      const r = JSON.parse(readFileSync(resolutionPath, "utf8"));
      resolutionSummary =
        r.recommendedFixArea ?? r.primaryEdit ?? r.resolution ?? r.summary ?? null;
    } catch {
      /* ok */
    }
  }

  const recommendedNextSteps = [];
  if (metricsAfter?.status === "error") {
    recommendedNextSteps.push(
      "Infra error — run pnpm infra:health; ensure Figma plugin bridge connected before re-running Fix story."
    );
  }
  if (attemptsUsed < maxAttempts && reason === "EARLY_STOP") {
    recommendedNextSteps.push(
      `Only ${attemptsUsed}/${maxAttempts} attempts ran before early-stop — re-run Fix story after harness update.`
    );
  }
  if (worstRegion) {
    recommendedNextSteps.push(`Compare hotspot: ${worstRegion} — open region compare PNG in test report.`);
  }
  if (resolutionSummary) {
    recommendedNextSteps.push(`Last investigator: ${String(resolutionSummary).slice(0, 240)}`);
  }
  recommendedNextSteps.push(
    "Manual: open test-report.json → structuredDiagnosis + investigationBrief; edit allowlisted adapter once, then Tier C if shared files changed."
  );

  const payload = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    verdict: "DEAD_END",
    jobId,
    storyId,
    stepId: stepId ?? suiteId,
    suiteId,
    suiteLabel: suiteLabel ?? stepId ?? suiteId,
    entryPoint,
    reason,
    detail: detail ?? null,
    attemptsUsed,
    maxAttempts,
    metricsBefore,
    metricsAfter,
    metricsUnchanged:
      metricsBefore &&
      metricsAfter &&
      Math.abs((metricsAfter.percent ?? 0) - (metricsBefore.percent ?? 0)) <= 0.001 &&
      Math.abs((metricsAfter.maxRegionPercent ?? 0) - (metricsBefore.maxRegionPercent ?? 0)) <= 0.001,
    attemptOutcomes,
    testReportPath,
    investigatorResolutionPath: resolutionPath,
    investigatorSummary: resolutionSummary,
    orchestratorLog: logFile ?? null,
    recommendedNextSteps,
    htmlUrl: testReportPath
      ? testReportPath.replace(/test-report\.json$/, "test-report.html")
      : null
  };

  const deadEndsDir = join(repoRoot, ".test-console", "dead-ends");
  mkdirSync(deadEndsDir, { recursive: true });
  const jobPath = join(deadEndsDir, `${jobId}-${storyId}-${stepId ?? suiteId}.json`);
  writeFileSync(jobPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  if (storyId && (stepId || suiteId)) {
    const stepDir = join(
      repoRoot,
      "figma-screen-diffs",
      "by-screen",
      storyId,
      stepId ?? suiteId
    );
    mkdirSync(stepDir, { recursive: true });
    writeFileSync(
      join(stepDir, "dead-end-report.json"),
      JSON.stringify(payload, null, 2) + "\n",
      "utf8"
    );
  }

  return { path: jobPath, payload };
}

/**
 * @param {string} repoRoot
 * @param {object} payload from writeFixerDeadEndReport
 */
export function formatDeadEndLogBlock(payload) {
  const lines = [
    "",
    "══════════════════════════════════════════════════════════════",
    "  FIXER DEAD END — no green after fix loop",
    "══════════════════════════════════════════════════════════════",
    `  Story:     ${payload.entryPoint}/${payload.storyId}`,
    `  Step:      ${payload.suiteLabel ?? payload.stepId}`,
    `  Reason:    ${payload.reason}${payload.detail ? ` — ${payload.detail}` : ""}`,
    `  Attempts:  ${payload.attemptsUsed}/${payload.maxAttempts}`,
  ];
  if (payload.metricsAfter) {
    const m = payload.metricsAfter;
    lines.push(
      `  Metrics:   ${m.status} ${m.percent?.toFixed?.(2) ?? "?"}%` +
        (m.maxRegionPercent != null ? ` (hotspot ${m.maxRegionPercent.toFixed(2)}%)` : "")
    );
  }
  if (payload.investigatorSummary) {
    lines.push(`  Investigator: ${payload.investigatorSummary.slice(0, 200)}`);
  }
  lines.push(`  Report:    ${payload.path ?? ".test-console/dead-ends/…"}`);
  if (payload.htmlUrl) lines.push(`  Compare:   ${payload.htmlUrl}`);
  lines.push("", "  Next steps:");
  for (const s of payload.recommendedNextSteps ?? []) {
    lines.push(`    · ${s}`);
  }
  lines.push("══════════════════════════════════════════════════════════════", "");
  return lines.join("\n");
}
