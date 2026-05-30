/**
 * Build and write TestReport JSON from compare results + region crops.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import {
  resolveFailedTest,
  buildMismatchFixPrompt,
  defaultTolerance
} from "./fixer-routing.mjs";

const require = createRequire(import.meta.url);
const _pngjs = require("pngjs");
const { PNG } = _pngjs.PNG ? _pngjs : (_pngjs.default ?? _pngjs);

function blit(dest, src, dx, dy) {
  for (let y = 0; y < src.height; y += 1) {
    if (dy + y >= dest.height) break;
    const sStart = y * src.width * 4;
    const dStart = ((dy + y) * dest.width + dx) * 4;
    src.data.copy(dest.data, dStart, sStart, sStart + src.width * 4);
  }
}

function cropPng(src, rect) {
  const out = new PNG({ width: rect.width, height: rect.height });
  for (let y = 0; y < rect.height; y += 1) {
    const sy = rect.y + y;
    const sStart = (sy * src.width + rect.x) * 4;
    const dStart = y * rect.width * 4;
    src.data.copy(out.data, dStart, sStart, sStart + rect.width * 4);
  }
  return out;
}

function composeSideBySide(left, right, gutter = 2) {
  const w = left.width + gutter + right.width;
  const h = Math.max(left.height, right.height);
  const out = new PNG({ width: w, height: h });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 255;
    out.data[i + 1] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = 255;
  }
  blit(out, left, 0, 0);
  blit(out, right, left.width + gutter, 0);
  return out;
}

function isDiffPixel(data, idx) {
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  const a = data[idx + 3];
  return a > 0 && r > 180 && g < 80 && b < 80;
}

function countDiffInRect(diffPng, rect) {
  const { width, height, data } = diffPng;
  let pixels = 0;
  const x2 = Math.min(width, rect.x + rect.width);
  const y2 = Math.min(height, rect.y + rect.height);
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const area = (x2 - x0) * (y2 - y0);
  for (let y = y0; y < y2; y += 1) {
    for (let x = x0; x < x2; x += 1) {
      const i = (y * width + x) * 4;
      if (isDiffPixel(data, i)) pixels += 1;
    }
  }
  const percentInRegion = area > 0 ? (pixels / area) * 100 : 0;
  return { wrongPixels: pixels, percentInRegion };
}

/**
 * Export region crop PNGs for original-vs-target compare.
 * @param {string} outDir
 * @param {Buffer} originalBuf
 * @param {Buffer} targetBuf
 * @param {Buffer} diffBuf
 * @param {Array<{ x: number, y: number, w?: number, h?: number, width?: number, height?: number, name?: string }>} regions
 */
export function exportOriginalTargetRegions(outDir, originalBuf, targetBuf, diffBuf, regions) {
  const original = PNG.sync.read(originalBuf);
  const target = PNG.sync.read(targetBuf);
  const diff = PNG.sync.read(diffBuf);
  const regionsDir = join(outDir, "regions");
  mkdirSync(regionsDir, { recursive: true });
  const mismatches = [];

  for (let i = 0; i < regions.length; i += 1) {
    const r = regions[i];
    const rect = {
      x: r.x,
      y: r.y,
      width: r.width ?? r.w ?? 0,
      height: r.height ?? r.h ?? 0
    };
    if (rect.width <= 0 || rect.height <= 0) continue;
    const idx = String(i + 1).padStart(2, "0");
    const origCrop = cropPng(original, rect);
    const tgtCrop = cropPng(target, rect);
    const diffCrop = cropPng(diff, rect);
    const cmp = composeSideBySide(origCrop, tgtCrop);
    const origPath = join(regionsDir, `region-${idx}-original.png`);
    const tgtPath = join(regionsDir, `region-${idx}-target.png`);
    const diffPath = join(regionsDir, `region-${idx}-diff.png`);
    const cmpPath = join(regionsDir, `region-${idx}-compare.png`);
    writeFileSync(origPath, PNG.sync.write(origCrop));
    writeFileSync(tgtPath, PNG.sync.write(tgtCrop));
    writeFileSync(diffPath, PNG.sync.write(diffCrop));
    writeFileSync(cmpPath, PNG.sync.write(cmp));
    const counts = countDiffInRect(diff, rect);
    mismatches.push({
      id: `region-${idx}`,
      bbox: rect,
      wrongPixels: counts.wrongPixels,
      percentInRegion: counts.percentInRegion,
      images: {
        originalCrop: origPath,
        targetCrop: tgtPath,
        diffCrop: diffPath,
        compareSideBySide: cmpPath
      },
      evidence: r.name ? { message: `Hotspot band: ${r.name}` } : undefined
    });
  }
  return mismatches;
}

/**
 * @param {object} opts
 */
export function buildTestReport(opts) {
  const {
    itemId,
    entryPoint = "figma",
    testId,
    status,
    percent,
    maxRegionPercent = null,
    pixelsDiffered,
    pixelsTotal,
    images = {},
    regionMismatches = [],
    ctx = {},
    tolerance = defaultTolerance()
  } = opts;

  const failedTest = resolveFailedTest(testId, {
    itemId,
    storyId: itemId,
    manifestPath: ctx.manifestPath,
    entryPoint,
    ...ctx
  });

  if (!failedTest) {
    throw new Error(`Unknown testId for TestReport: ${testId}`);
  }

  const mismatches = regionMismatches.map((m) => ({
    ...m,
    suspectedFixer: m.suspectedFixer ?? failedTest.primaryFixer,
    fixPrompt: buildMismatchFixPrompt(
      { ...m, suspectedFixer: m.suspectedFixer ?? failedTest.primaryFixer },
      failedTest,
      { itemId, entryPoint }
    )
  }));

  if (mismatches.length === 0 && status !== "pass" && status !== "skipped") {
    const fallback = {
      id: "global",
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      wrongPixels: pixelsDiffered ?? 0,
      percentInRegion: percent ?? 0,
      images: {
        compareSideBySide: images.diff ?? null,
        originalCrop: images.original ?? null,
        targetCrop: images.target ?? null
      },
      evidence: ctx.error ? { message: String(ctx.error) } : { message: "Global diff — inspect full compare PNG" },
      suspectedFixer: failedTest.primaryFixer
    };
    mismatches.push({
      ...fallback,
      fixPrompt: buildMismatchFixPrompt(fallback, failedTest, { itemId, entryPoint })
    });
  }

  return {
    schemaVersion: "1.0",
    itemId,
    entryPoint,
    failedTest,
    tolerance,
    global: {
      percent: percent ?? 0,
      maxRegionPercent,
      status,
      pixelsDiffered,
      pixelsTotal
    },
    images,
    mismatches,
    testedAt: new Date().toISOString()
  };
}

/**
 * Write test-report.json alongside result.json
 * @param {string} resultDir — directory containing result.json
 * @param {object} report
 */
export function writeTestReportFile(resultDir, report) {
  mkdirSync(resultDir, { recursive: true });
  const path = join(resultDir, "test-report.json");
  report.testReportPath = path;
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}

/**
 * Resolve test-report path for figma screen step
 */
export function figmaScreenTestReportPath(repoRoot, screenId, stepId) {
  const seg = String(screenId)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return join(repoRoot, "figma-screen-diffs", "by-screen", seg, stepId, "test-report.json");
}

/**
 * Resolve test-report path for storybook suite
 */
export function storybookTestReportPath(repoRoot, suiteDir, storyId) {
  return join(repoRoot, suiteDir, storyId, "test-report.json");
}

/**
 * Load test report if present
 * @param {string} path
 */
export function loadTestReport(path) {
  try {
    const { readFileSync, existsSync } = require("node:fs");
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Build agent prompt lines from TestReport (fixers consume — do not rebuild triage)
 * @param {object} report
 * @param {string} [extra]
 */
export function fixPromptFromTestReport(report, extra = "") {
  if (!report?.mismatches?.length) {
    return [
      `Failed test: ${report?.failedTest?.testId ?? "unknown"}`,
      report?.failedTest?.verifyCommand ?? "",
      extra
    ]
      .filter(Boolean)
      .join("\n");
  }
  const primary = report.mismatches[0];
  const lines = [
    report.failedTest?.testId === "vsFigmaLive" || report.failedTest?.testId === "figmaLive"
      ? "make fixes after live test"
      : "run until pass",
    "",
    `Item: ${report.itemId} · entry: ${report.entryPoint}`,
    `Failed test: ${report.failedTest.label} (${report.failedTest.testId})`,
    `Primary fixer: ${report.failedTest.primaryFixer}`,
    `Global: ${report.global.percent.toFixed(3)}% · status ${report.global.status}` +
      (report.global.maxRegionPercent != null
        ? ` · worst region ${report.global.maxRegionPercent.toFixed(3)}%`
        : ""),
    "",
    "── Test report (authoritative) ──",
    `Report: ${report.testReportPath ?? "(see test-report.json)"}`,
    ...(report.images.original ? [`Original: ${report.images.original}`] : []),
    ...(report.images.target ? [`Target: ${report.images.target}`] : []),
    ...(report.images.diff ? [`Diff: ${report.images.diff}`] : []),
    "",
    `Mismatches: ${report.mismatches.length} (fix worst first)`,
    "",
    primary.fixPrompt,
    "",
    `Verify: ${report.failedTest.verifyCommand}`,
    "Sandbox: edits in worktree only; regression → auto discard.",
    extra
  ];
  return lines.filter(Boolean).join("\n");
}
