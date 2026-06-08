/**
 * Sync test-report.json (+ HTML) for figma-screen-diffs/by-screen/<id>/<stepId>/.
 */

import { join } from "node:path";
import {
  buildTestReport,
  writeTestReportFile,
  removeTestReportFiles,
  exportOriginalTargetRegions,
} from "./test-report-build.mjs";
import { safeScreenSegment } from "./figma-screen-portfolio.mjs";
import { defaultTolerance } from "./fixer-routing.mjs";

/** @type {Record<string, string>} */
const STEP_TEST_ID = {
  manifestContract: "manifestContract",
  vsFigmaLive: "vsFigmaLive",
  vsStorybook: "vsStorybook",
  vsReactHtml: "vsReactHtml",
  logic: "logic",
  contractFigma: "vsFigmaLive",
  storybook: "vsStorybook",
  fourWay: "vsReactHtml",
};

/**
 * @param {string} repoRoot
 * @param {string} screenId
 * @param {string} stepId
 */
export function figmaScreenStepResultDir(repoRoot, screenId, stepId) {
  return join(
    repoRoot,
    "figma-screen-diffs",
    "by-screen",
    safeScreenSegment(screenId),
    stepId
  );
}

/**
 * @param {string} repoRoot
 * @param {string} outDir — figma-screen-diffs root or step dir parent
 * @param {string} screenId
 * @param {Array<{ index?: number, rect?: object, x?: number, y?: number, width?: number, height?: number, w?: number, h?: number, name?: string, pct?: number, storybook?: string, rendered?: string, compare?: string }>} regions
 */
function mapRegionsToMismatches(stepDir, regions) {
  if (!regions?.length) return [];
  return regions.map((r, i) => {
    const idx = String(r.index ?? i + 1).padStart(2, "0");
    const rect = r.rect ?? {
      x: r.x ?? 0,
      y: r.y ?? 0,
      width: r.width ?? r.w ?? 0,
      height: r.height ?? r.h ?? 0,
    };
    return {
      id: `region-${idx}`,
      bbox: rect,
      wrongPixels: rect.pixels ?? r.pixels ?? 0,
      percentInRegion: rect.percent ?? r.percent ?? r.pct ?? 0,
      images: {
        originalCrop: r.storybook ? join(stepDir, "regions", `region-${idx}-original.png`) : null,
        targetCrop: r.rendered ? join(stepDir, "regions", `region-${idx}-target.png`) : null,
        compareSideBySide: r.compare ? join(stepDir, "regions", r.compare.replace(/^regions\//, "regions/")) : null,
      },
      evidence: r.name ? { message: `Hotspot: ${r.name}` } : undefined,
    };
  });
}

/**
 * Write or remove test-report for a figma screen step result.
 * @param {string} repoRoot
 * @param {string} screenId
 * @param {string} stepId
 * @param {object} result
 * @returns {string | null} test-report.json path
 */
export function syncFigmaScreenStepTestReport(repoRoot, screenId, stepId, result) {
  const stepDir = figmaScreenStepResultDir(repoRoot, screenId, stepId);
  const status = result?.status ?? "not_tested";
  if (status === "pass" || status === "skipped" || status === "not_tested") {
    removeTestReportFiles(stepDir);
    return null;
  }

  const testId = STEP_TEST_ID[stepId] ?? stepId;
  const tolerance = result.tolerance ?? defaultTolerance();
  let regionMismatches = mapRegionsToMismatches(stepDir, result.regions ?? result.diffRegions);

  if (
    regionMismatches.length === 0 &&
    result.originalPng &&
    result.targetPng &&
    result.diffPng &&
    typeof result.originalBuf !== "undefined"
  ) {
    /* caller may pass buffers via exportOriginalTargetRegions separately */
  }

  const report = buildTestReport({
    itemId: screenId,
    entryPoint: "figma",
    testId,
    status,
    percent: result.percent ?? 0,
    maxRegionPercent: result.maxRegionPercent ?? result.worstRegion?.pct ?? null,
    pixelsDiffered: result.pixelsDiffered,
    pixelsTotal: result.pixelsTotal,
    images: {
      original: result.originalPng ?? null,
      target: result.targetPng ?? result.targetPng ?? null,
      diff: result.diffPng ?? null,
      reportHtml: result.reportHtml ?? null,
    },
    regionMismatches,
    ctx: {
      manifestPath: result.manifestPath,
      contractPath: result.contractPath,
      error: result.error,
      repoRoot,
    },
    tolerance,
  });

  return writeTestReportFile(stepDir, report, repoRoot);
}

/**
 * Build region crops + test report for original-parity leg failure.
 * @param {object} opts
 */
export function writeFigmaParityStepTestReport(opts) {
  const {
    repoRoot,
    screenId,
    stepId,
    status,
    percent,
    maxRegionPercent,
    pixelsDiffered,
    pixelsTotal,
    originalBuf,
    targetBuf,
    diffPng,
    hotRegions,
    images,
    manifestPath,
    contractPath,
    tolerance = defaultTolerance(),
  } = opts;

  const stepDir = figmaScreenStepResultDir(repoRoot, screenId, stepId);
  if (status === "pass") {
    removeTestReportFiles(stepDir);
    return null;
  }

  const regionMismatches =
    hotRegions?.length && originalBuf && targetBuf && diffPng
      ? exportOriginalTargetRegions(stepDir, originalBuf, targetBuf, diffPng, hotRegions)
      : [];

  const report = buildTestReport({
    itemId: screenId,
    entryPoint: "figma",
    testId: STEP_TEST_ID[stepId] ?? stepId,
    status,
    percent,
    maxRegionPercent,
    pixelsDiffered,
    pixelsTotal,
    images,
    regionMismatches,
    ctx: { manifestPath, contractPath, repoRoot },
    tolerance,
  });

  return writeTestReportFile(stepDir, report, repoRoot);
}
