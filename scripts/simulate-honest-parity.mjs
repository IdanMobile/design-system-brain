#!/usr/bin/env node
/**
 * Offline simulation: compare legacy top-left crop vs honest align+raw diff on existing PNGs.
 *
 *   node scripts/simulate-honest-parity.mjs
 *   node scripts/simulate-honest-parity.mjs --screen screen_2
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  alignParityPair,
  diffAlignedPair,
  FIGMA_SCREEN_REGION_TOLERANCE_PERCENT,
} from "./figma-screen-reference-align.mjs";

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const _pixelmatch = require("pixelmatch");
const pixelmatch = typeof _pixelmatch === "function" ? _pixelmatch : (_pixelmatch.default ?? _pixelmatch);
const _pngjs = require("pngjs");
const { PNG } = _pngjs.PNG ? _pngjs : (_pngjs.default ?? _pngjs);

const TOLERANCE = 0.1;

function parseCli() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v.startsWith("--") && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) {
      args.set(v.slice(2), process.argv[i + 1]);
      i++;
    }
  }
  return { screen: args.get("screen") ?? "screen_2" };
}

/** Legacy bug: Math.min crop — top-left slice of @2x reference vs @1x export. */
function legacyMinCropDiff(refBuf, rendBuf) {
  const ref = PNG.sync.read(refBuf);
  const rend = PNG.sync.read(rendBuf);
  const w = Math.min(ref.width, rend.width);
  const h = Math.min(ref.height, rend.height);
  const crop = (png) => {
    const out = new PNG({ width: w, height: h });
    PNG.bitblt(png, out, 0, 0, w, h, 0, 0);
    return out;
  };
  const a = crop(ref);
  const b = crop(rend);
  const diff = new PNG({ width: w, height: h });
  const pixelsDiffered = pixelmatch(a.data, b.data, diff.data, w, h, {
    threshold: 0.1,
    includeAA: false,
    alpha: 0.1,
  });
  const total = w * h;
  const percent = total > 0 ? (pixelsDiffered / total) * 100 : 0;
  return { percent, w, h, refSize: `${ref.width}x${ref.height}`, rendSize: `${rend.width}x${rend.height}` };
}

/** Legacy four-way: Math.max pad (no downscale). */
function legacyMaxPadDiff(refBuf, rendBuf) {
  const ref = PNG.sync.read(refBuf);
  const rend = PNG.sync.read(rendBuf);
  const w = Math.max(ref.width, rend.width);
  const h = Math.max(ref.height, rend.height);
  const pad = (png) => {
    if (png.width === w && png.height === h) return png;
    const out = new PNG({ width: w, height: h });
    PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
    return out;
  };
  const a = pad(ref);
  const b = pad(rend);
  const diff = new PNG({ width: w, height: h });
  const pixelsDiffered = pixelmatch(a.data, b.data, diff.data, w, h, {
    threshold: 0.1,
    includeAA: false,
    alpha: 0.1,
  });
  const total = w * h;
  const percent = total > 0 ? (pixelsDiffered / total) * 100 : 0;
  return { percent, w, h };
}

function loadFirst(paths) {
  for (const p of paths) {
    if (existsSync(p)) return { path: p, buf: readFileSync(p) };
  }
  return null;
}

function gateLabel(pct) {
  if (pct <= TOLERANCE) return "PASS (≤0.1%)";
  if (pct <= TOLERANCE * 4) return "WARN";
  return "FAIL";
}

function main() {
  const { screen } = parseCli();
  const seg = screen;

  const ref = loadFirst([
    join(WORKSPACE, "artifacts/figma-screens", `${seg}.png`),
    join(WORKSPACE, "figma-screen-diffs", seg, "fourWay", "original.png"),
    join(WORKSPACE, "figma-screen-diffs", seg, "originalParity", "original.png"),
  ]);
  const figma = loadFirst([
    join(WORKSPACE, "figma-screen-diffs", seg, "fourWay", "figma.png"),
    join(WORKSPACE, "figma-screen-diffs", seg, "originalParity", "figmaLive-raw.png"),
    join(WORKSPACE, "figma-screen-diffs", seg, "originalParity", "figmaLive.png"),
  ]);
  const composited = loadFirst([
    join(WORKSPACE, "figma-screen-diffs", seg, "originalParity", "figmaLive-composited.png"),
  ]);

  if (!ref || !figma) {
    console.error(`Missing PNGs for ${screen}. Need reference + figma export.`);
    console.error(`  ref: ${ref?.path ?? "NOT FOUND"}`);
    console.error(`  figma: ${figma?.path ?? "NOT FOUND"}`);
    process.exit(1);
  }

  console.log(`\nHonest parity simulation — ${screen}`);
  console.log(`  reference: ${ref.path}`);
  console.log(`  figma:     ${figma.path}`);
  if (composited) console.log(`  composited (debug): ${composited.path}`);

  const legacyMin = legacyMinCropDiff(ref.buf, figma.buf);
  const legacyMax = legacyMaxPadDiff(ref.buf, figma.buf);
  const aligned = alignParityPair(ref.buf, figma.buf);
  const honest = diffAlignedPair(aligned.refPng, aligned.rendPng, FIGMA_SCREEN_REGION_TOLERANCE_PERCENT);

  console.log("\n── Alignment meta ──");
  console.log(`  source ref:  ${aligned.meta.sourceReferenceSize}`);
  console.log(`  figma export: ${legacyMin.rendSize}`);
  console.log(`  downscale:   ${aligned.meta.refWasDownscaled ? `${aligned.meta.referenceScale}× → ${aligned.meta.alignedSize}` : "none"}`);

  console.log("\n── Diff methods (original ↔ figma) ──");
  console.log(
    `  legacy min-crop (false-pass bug): ${legacyMin.percent.toFixed(3)}% @ ${legacyMin.w}x${legacyMin.h} — ${gateLabel(legacyMin.percent)}`
  );
  console.log(
    `  legacy max-pad (4-way old):       ${legacyMax.percent.toFixed(3)}% @ ${legacyMax.w}x${legacyMax.h} — ${gateLabel(legacyMax.percent)}`
  );
  console.log(
    `  honest raw gate (new):            ${honest.diffPct.toFixed(3)}% @ ${honest.w}x${honest.h} — ${gateLabel(honest.diffPct)}`
  );
  if (honest.regionGate.worst) {
    console.log(
      `    worst region: ${honest.regionGate.worst.name} ${honest.regionGate.worst.pct.toFixed(3)}%`
    );
  }

  if (composited) {
    const compAligned = alignParityPair(ref.buf, composited.buf);
    const compDiff = diffAlignedPair(compAligned.refPng, compAligned.rendPng, FIGMA_SCREEN_REGION_TOLERANCE_PERCENT);
    console.log(
      `\n  composited debug vs ref:          ${compDiff.diffPct.toFixed(3)}% — ${gateLabel(compDiff.diffPct)} (not used for gate)`
    );
  }

  const storedLive = loadFirst([
    join(WORKSPACE, "figma-screen-diffs", seg, "originalParity", "figmaLive.png"),
    join(WORKSPACE, "figma-screen-diffs", seg, "originalParity", "figmaLive-raw.png"),
  ]);
  const storedOriginal = loadFirst([
    join(WORKSPACE, "figma-screen-diffs", seg, "originalParity", "original.png"),
  ]);

  if (storedLive && storedOriginal) {
    const storedAligned = alignParityPair(storedOriginal.buf, storedLive.buf);
    const storedDiff = diffAlignedPair(storedAligned.refPng, storedAligned.rendPng, FIGMA_SCREEN_REGION_TOLERANCE_PERCENT);
    console.log("\n── Stored originalParity gate artifacts ──");
    console.log(`  figmaLive.png (was gate target): honest re-diff ${storedDiff.diffPct.toFixed(3)}% — ${gateLabel(storedDiff.diffPct)}`);
  }

  const stored = loadFirst([
    join(WORKSPACE, "figma-screen-diffs", "by-screen", seg, "vsFigmaLive", "result.json"),
  ]);
  if (stored) {
    const rec = JSON.parse(readFileSync(stored.path, "utf8"));
    console.log(`\n── Stored vsFigmaLive result.json ──`);
    console.log(`  percent: ${rec.percent?.toFixed?.(3) ?? rec.percent}% status: ${rec.status} gateMode: ${rec.gateMode ?? "legacy"}`);
  }

  console.log("\n── Verdict ──");
  if (legacyMin.percent <= TOLERANCE && honest.diffPct > TOLERANCE) {
    console.log("  ✓ Simulation confirms false PASS: min-crop hid real breakage.");
  } else if (honest.diffPct <= TOLERANCE) {
    console.log("  ✓ Honest gate passes — parity is real.");
  } else {
    console.log("  ✓ Honest gate fails — matches visible breakage.");
  }
  console.log("");
}

main();
