/**
 * Write TestReport for storybook-track harness results (pixel, figma, delivery).
 */

import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import type { StoryResultRecord } from "./report-portfolio.ts";

function safeStorySegment(storyId: string): string {
  return storyId
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// @ts-expect-error — .mjs from TS harness
import { buildTestReport, writeTestReportFile, removeTestReportFiles } from "../../../scripts/test-report-build.mjs";

export type StorybookSuiteTestId =
  | "pixel"
  | "figmaMock"
  | "figmaLive"
  | "delivery"
  | "structural"
  | "logic";

const SUITE_TEST_ID: Record<string, StorybookSuiteTestId> = {
  "pixel-diffs": "pixel",
  "figma-diffs": "figmaMock",
  "figma-live-diffs": "figmaLive",
  "delivery-diffs": "delivery",
  "logic-audit-diffs": "logic",
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

function suiteKeyFromOutDir(outDir: string, repoRoot: string): string {
  const rel = outDir.replace(repoRoot, "").replace(/^\//, "");
  return suiteDirName(rel);
}

function deliveryCompareFields(
  outDir: string,
  storyId: string,
  result: StoryResultRecord
): { percent: number; maxRegionPercent: number | null; images: { original: string | null; target: string | null; diff: string | null } } {
  const seg = safeStorySegment(storyId);
  const artifactDir = join(outDir, seg);
  const legs = [
    {
      key: "storybookVsDev",
      leg: result.storybookVsDev,
      target: result.developerPng ?? join(artifactDir, "developer.png"),
      diff: join(artifactDir, "diff-storybook-dev.png"),
    },
    {
      key: "storybookVsFigma",
      leg: result.storybookVsFigma,
      target: result.figmaPng ?? join(artifactDir, "figma.png"),
      diff: join(artifactDir, "diff-storybook-figma.png"),
    },
    {
      key: "devVsFigma",
      leg: result.devVsFigma,
      target: result.figmaPng ?? join(artifactDir, "figma.png"),
      diff: join(artifactDir, "diff-dev-figma.png"),
    },
  ].filter((entry) => entry.leg);

  const worst =
    legs.sort((a, b) => (b.leg?.percent ?? 0) - (a.leg?.percent ?? 0))[0] ??
    legs.find((entry) => entry.key === "storybookVsFigma");

  const percent = result.percent ?? worst?.leg?.percent ?? result.storybookVsFigma?.percent ?? 0;
  return {
    percent,
    maxRegionPercent: result.maxRegionPercent ?? null,
    images: {
      original: result.storybookPng ?? join(artifactDir, "storybook.png"),
      target: worst?.target ?? result.figmaPng ?? null,
      diff: worst?.leg?.diffPng ?? worst?.diff ?? null,
    },
  };
}

export function removeStorybookSuiteTestReport(outDir: string, storyId: string): void {
  const dir = join(outDir, "by-story", safeStorySegment(storyId));
  removeTestReportFiles(dir);
}

export function writeStorybookSuiteTestReport(options: {
  outDir: string;
  repoRoot: string;
  result: StoryResultRecord;
  testId?: StorybookSuiteTestId;
}): string | null {
  const { outDir, repoRoot, result } = options;
  if (
    result.status === "pass" ||
    result.status === "skipped" ||
    result.status === "not_tested"
  ) {
    return null;
  }

  const suiteKey = suiteKeyFromOutDir(outDir, repoRoot);
  const testId = options.testId ?? SUITE_TEST_ID[suiteKey] ?? "pixel";
  const regionMismatches = mapDiffRegionsToMismatches(
    outDir,
    result.storyId,
    result.diffRegions as Parameters<typeof mapDiffRegionsToMismatches>[2]
  );

  const deliveryFields =
    testId === "delivery" ? deliveryCompareFields(outDir, result.storyId, result) : null;

  const report = buildTestReport({
    itemId: result.storyId,
    entryPoint: "storybook",
    testId,
    status: result.status as "fail" | "warn" | "error",
    percent: deliveryFields?.percent ?? result.percent,
    maxRegionPercent: deliveryFields?.maxRegionPercent ?? result.maxRegionPercent ?? null,
    pixelsDiffered: result.pixelsDiffered,
    pixelsTotal: result.pixelsTotal,
    images: deliveryFields?.images ?? {
      original: result.storybookPng ?? null,
      target: result.renderedPng ?? result.figmaPng ?? null,
      diff: result.diffPng ?? null,
    },
    regionMismatches,
    ctx: { storyId: result.storyId, error: result.error },
  });

  const resultDir = join(outDir, "by-story", safeStorySegment(result.storyId));
  return writeTestReportFile(resultDir, report, repoRoot);
}

/** Write test-report.json on failure; remove stale report on pass/skip. */
export function syncStorybookSuiteTestReport(options: {
  outDir: string;
  repoRoot: string;
  result: StoryResultRecord;
  testId?: StorybookSuiteTestId;
}): string | null {
  if (
    options.result.status === "pass" ||
    options.result.status === "skipped" ||
    options.result.status === "not_tested"
  ) {
    removeStorybookSuiteTestReport(options.outDir, options.result.storyId);
    return null;
  }
  return writeStorybookSuiteTestReport(options);
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
