/**
 * Shared pixelmatch helper for harness scripts.
 */

// @ts-expect-error -- no bundled types
import pixelmatch from "pixelmatch";
// @ts-expect-error -- no bundled types
import { PNG } from "pngjs";
import { readFileSync, writeFileSync } from "node:fs";

import { statusFromPercent, type ToleranceStatus } from "./test-tolerance.ts";

export type CompareStatus = ToleranceStatus;

export interface CompareResult {
  width: number;
  height: number;
  pixelsDiffered: number;
  pixelsTotal: number;
  percent: number;
  status: CompareStatus;
  diffPngPath: string;
}

export function comparePngFiles(
  pathA: string,
  pathB: string,
  diffOut: string,
  tolerance: number
): CompareResult {
  const rawA = PNG.sync.read(readFileSync(pathA));
  const rawB = PNG.sync.read(readFileSync(pathB));
  const width = Math.min(rawA.width, rawB.width);
  const height = Math.min(rawA.height, rawB.height);
  const cropTo = (src: typeof rawA): typeof rawA => {
    if (src.width === width && src.height === height) return src;
    const out = new PNG({ width, height });
    for (let y = 0; y < height; y += 1) {
      const sStart = y * src.width * 4;
      const dStart = y * width * 4;
      src.data.copy(out.data, dStart, sStart, sStart + width * 4);
    }
    return out;
  };
  const a = cropTo(rawA);
  const b = cropTo(rawB);
  const diff = new PNG({ width, height });
  const pixelsDiffered = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: 0.2,
    includeAA: false,
    alpha: 0.1
  });
  writeFileSync(diffOut, PNG.sync.write(diff));
  const total = width * height;
  const percent = total > 0 ? (pixelsDiffered / total) * 100 : 0;
  const status: CompareStatus = statusFromPercent(percent, tolerance);
  return {
    width,
    height,
    pixelsDiffered,
    pixelsTotal: total,
    percent,
    status,
    diffPngPath: diffOut
  };
}

export function worstStatus(...statuses: CompareStatus[]): CompareStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}
