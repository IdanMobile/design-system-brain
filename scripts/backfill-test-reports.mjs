#!/usr/bin/env node
/**
 * Regenerate test-report.json (+ HTML) from existing result.json files.
 * Use after wiring sync without re-running full suites.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const STORYBOOK_SUITE_DIRS = [
  "pixel-diffs",
  "figma-diffs",
  "figma-live-diffs",
  "delivery-diffs",
  "logic-audit-diffs",
];

const FIGMA_SCREEN_STEPS = [
  "manifestContract",
  "vsFigmaLive",
  "vsStorybook",
  "vsReactHtml",
  "logic",
  "contractFigma",
  "storybook",
  "fourWay",
];

const { syncStorybookSuiteTestReport } = await import(
  "../packages/pixel-test/src/test-report-write.ts"
);
const { syncFigmaScreenStepTestReport } = await import("./figma-screen-test-report.mjs");
const { loadTestReport, writeTestReportHtml } = await import("./test-report-build.mjs");

function segSafe(id) {
  return id
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function walkStorybookResults(repoRoot) {
  const rows = [];
  for (const suiteDir of STORYBOOK_SUITE_DIRS) {
    const byStory = join(repoRoot, suiteDir, "by-story");
    if (!existsSync(byStory)) continue;
    for (const seg of readdirSync(byStory)) {
      const resultPath = join(byStory, seg, "result.json");
      if (!existsSync(resultPath) || !statSync(resultPath).isFile()) continue;
      try {
        const result = JSON.parse(readFileSync(resultPath, "utf8"));
        rows.push({ kind: "storybook", suiteDir, outDir: join(repoRoot, suiteDir), result });
      } catch {
        /* skip corrupt */
      }
    }
  }
  return rows;
}

function walkFigmaScreenResults(repoRoot) {
  const rows = [];
  const byScreen = join(repoRoot, "figma-screen-diffs", "by-screen");
  if (!existsSync(byScreen)) return rows;
  for (const screenSeg of readdirSync(byScreen)) {
    const screenDir = join(byScreen, screenSeg);
    if (!statSync(screenDir).isDirectory()) continue;
    for (const stepId of readdirSync(screenDir)) {
      if (!FIGMA_SCREEN_STEPS.includes(stepId)) continue;
      const resultPath = join(screenDir, stepId, "result.json");
      if (!existsSync(resultPath) || !statSync(resultPath).isFile()) continue;
      try {
        const result = JSON.parse(readFileSync(resultPath, "utf8"));
        const screenId = result.screenId ?? result.storyId ?? screenSeg;
        rows.push({ kind: "figma", screenId, stepId, result });
      } catch {
        /* skip */
      }
    }
  }
  return rows;
}

export function backfillTestReports(repoRoot = ROOT) {
  let written = 0;
  let removed = 0;
  let skipped = 0;
  let htmlOnly = 0;

  for (const { outDir, result } of walkStorybookResults(repoRoot)) {
    if (!result?.storyId) {
      skipped += 1;
      continue;
    }
    const before = join(outDir, "by-story", segSafe(result.storyId), "test-report.json");
    const had = existsSync(before);
    const path = syncStorybookSuiteTestReport({ outDir, repoRoot, result });
    if (path) written += 1;
    else if (had) removed += 1;
    else skipped += 1;
  }

  for (const { screenId, stepId, result } of walkFigmaScreenResults(repoRoot)) {
    const before = join(
      repoRoot,
      "figma-screen-diffs",
      "by-screen",
      segSafe(screenId),
      stepId,
      "test-report.json"
    );
    const had = existsSync(before);
    const path = syncFigmaScreenStepTestReport(repoRoot, screenId, stepId, result);
    if (path) written += 1;
    else if (had) removed += 1;
    else skipped += 1;
  }

  for (const suiteDir of STORYBOOK_SUITE_DIRS) {
    const byStory = join(repoRoot, suiteDir, "by-story");
    if (!existsSync(byStory)) continue;
    for (const seg of readdirSync(byStory)) {
      const jsonPath = join(byStory, seg, "test-report.json");
      if (!existsSync(jsonPath)) continue;
      const report = loadTestReport(jsonPath);
      if (report) {
        writeTestReportHtml(report, jsonPath, repoRoot);
        htmlOnly += 1;
      }
    }
  }

  const byScreen = join(repoRoot, "figma-screen-diffs", "by-screen");
  if (existsSync(byScreen)) {
    for (const screenSeg of readdirSync(byScreen)) {
      const screenDir = join(byScreen, screenSeg);
      if (!statSync(screenDir).isDirectory()) continue;
      for (const stepId of readdirSync(screenDir)) {
        const jsonPath = join(screenDir, stepId, "test-report.json");
        if (!existsSync(jsonPath)) continue;
        const report = loadTestReport(jsonPath);
        if (report) {
          writeTestReportHtml(report, jsonPath, repoRoot);
          htmlOnly += 1;
        }
      }
    }
  }

  return { written, removed, skipped, htmlOnly };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stats = backfillTestReports();
  console.log(
    `Backfill complete: ${stats.written} written, ${stats.removed} removed, ${stats.skipped} unchanged/skipped, ${stats.htmlOnly} HTML refreshed.`
  );
}
