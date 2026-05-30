/**
 * Write TestReport for storybook-track harness results (pixel, figma, delivery).
 */

import { resolve, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import type { StoryResultRecord } from "./report-portfolio.ts";
import { safeStorySegment } from "./report-portfolio.ts";

// @ts-expect-error — .mjs from TS harness
import { buildTestReport, writeTestReportFile } from "../../../scripts/test-report-build.mjs";

export type StorybookSuiteTestId = "pixel" | "figmaMock" | "figmaLive" | "delivery" | "structural";

const SUITE_TEST_ID: Record<string, StorybookSuiteTestId> = {
  "pixel-diffs": "pixel",
  "figma-diffs": "figmaMock",
  "figma-live-diffs": "figmaLive",
  "delivery-diffs": "delivery",
};

function suiteDirName(outDir: string): string {
  return outDir.split("/").pop() ?? outDir;
}

function mapDiffRegionsToMismatches(
  outDir: string,
  storyId: string,
  diffRegions: Array<{ index: number; rect: { x: number; y: number; width: number; height: number; pixels?: number; percent?: number }; compare: string; storybook: string; rendered: string }> | undefined
) {
  if (!diffRegions?.length) return [];
  const seg = safeStorySegment(storyId);
  return diffRegions.map((r) => ({
    id: `region-${String(r.index).padStart(2, "0")}`,
    bbox: {
      x: r.rect.x,
      y: r.rect.y,
      width: r.rect.width,
      height: r.rect.height,
    },
    wrongPixels: r.rect.pixels ?? 0,
    percentInRegion: r.rect.percent ?? 0,
    images: {
      originalCrop: join(outDir, seg, r.storybook),
      targetCrop: join(outDir, seg, r.rendered),
      compareSideBySide: join(outDir, seg, r.compare),
    },
  }));
}

export function writeStorybookSuiteTestReport(options: {
  outDir: string;
  repoRoot: string;
  result: StoryResultRecord;
  testId?: StorybookSuiteTestId;
}): string | null {
  const { outDir, repoRoot, result } = options;
  if (result.status === "pass" || result.status === "skipped") return null;

  const suiteKey = suiteDirName(outDir.replace(repoRoot, "").replace(/^\//, ""));
  const testId = options.testId ?? SUITE_TEST_ID[suiteKey] ?? "pixel";
  const regionMismatches = mapDiffRegionsToMismatches(outDir, result.storyId, result.diffRegions as Parameters<typeof mapDiffRegionsToMismatches>[2]);

  const report = buildTestReport({
    itemId: result.storyId,
    entryPoint: "storybook",
    testId,
    status: result.status as "fail" | "warn" | "error",
    percent: result.percent,
    maxRegionPercent: result.maxRegionPercent ?? null,
    pixelsDiffered: result.pixelsDiffered,
    pixelsTotal: result.pixelsTotal,
    images: {
      original: result.storybookPng ?? null,
      target: result.renderedPng ?? result.figmaPng ?? null,
      diff: result.diffPng ?? null,
    },
    regionMismatches,
    ctx: { storyId: result.storyId, error: result.error },
  });

  const resultDir = join(outDir, "by-story", safeStorySegment(result.storyId));
  return writeTestReportFile(resultDir, report);
}

export function loadTestReportPath(outDir: string, storyId: string): string | null {
  const path = join(outDir, "by-story", safeStorySegment(storyId), "test-report.json");
  return existsSync(path) ? path : null;
}

export function readTestReport(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
