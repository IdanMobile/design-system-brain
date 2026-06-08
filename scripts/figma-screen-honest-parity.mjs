/**
 * Honest parity gate for HTML/TSX render legs — raw diff only, composited saved as debug.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import {
  alignParityPair,
  diffAlignedPair,
  compositePickCloserToRef,
  compositeHtmlParityDebug,
} from "./figma-screen-reference-align.mjs";
import { statusFromGates } from "./pixel-perfect-tolerance.mjs";

const require = createRequire(import.meta.url);
const _pngjs = require("pngjs");
const { PNG } = _pngjs.PNG ? _pngjs : _pngjs.default;

/**
 * @param {object} opts
 * @param {Buffer} opts.refBuf
 * @param {Buffer} opts.blurBuf
 * @param {Buffer} opts.noBlurBuf
 * @param {string} opts.itemDir
 * @param {string} opts.legPrefix — e.g. storybook, reactHtml, reactTsx
 * @param {number} opts.tolerance
 */
export async function finalizeHtmlParityGate({
  refBuf,
  blurBuf,
  noBlurBuf,
  itemDir,
  legPrefix,
  tolerance,
}) {
  const alignedBlur = alignParityPair(refBuf, blurBuf);
  const alignedNoBlur = alignParityPair(refBuf, noBlurBuf);
  const refPng = alignedBlur.refPng;
  const rawRendPng = compositePickCloserToRef(refPng, alignedNoBlur.rendPng, alignedBlur.rendPng);
  const compositedRendPng = compositeHtmlParityDebug(refPng, alignedBlur.rendPng, alignedNoBlur.rendPng);

  const { diffPixels, totalPixels, diffPct, diffPng, regionGate, w, h } = diffAlignedPair(
    refPng,
    rawRendPng,
    tolerance
  );
  const status = statusFromGates(diffPct, regionGate.worst?.pct ?? 0);
  const parityMeta = alignedBlur.meta;

  const originalFullPath = join(itemDir, "original-full.png");
  const originalPath = join(itemDir, "original.png");
  const rawPath = join(itemDir, `${legPrefix}-raw.png`);
  const mainPath = join(itemDir, `${legPrefix}.png`);
  const compositedPath = join(itemDir, `${legPrefix}-composited.png`);
  const diffPath = join(itemDir, `diff-original-${legPrefix}.png`);

  if (parityMeta.refWasDownscaled) {
    await writeFile(originalFullPath, refBuf);
  }
  await writeFile(originalPath, alignedBlur.refBuf);
  await writeFile(rawPath, PNG.sync.write(rawRendPng));
  await writeFile(mainPath, PNG.sync.write(rawRendPng));
  await writeFile(compositedPath, PNG.sync.write(compositedRendPng));
  await writeFile(diffPath, PNG.sync.write(diffPng));

  const previewLabels = {
    storybook: "Raw HTML render (gate)",
    reactHtml: "Raw ReactHtml (gate)",
    reactTsx: "Raw React delivery (gate)",
  };

  return {
    status,
    diffPct,
    diffPixels,
    totalPixels,
    regionGate,
    w,
    h,
    parityMeta,
    gateMode: "raw",
    previewLabel: previewLabels[legPrefix] ?? "Raw render (gate)",
    referenceLabel: parityMeta.refWasDownscaled
      ? "Reference (downscaled from @2x)"
      : "Reference",
    paths: {
      originalPath,
      originalFullPath: parityMeta.refWasDownscaled ? originalFullPath : null,
      rawPath,
      mainPath,
      compositedPath,
      diffPath,
    },
  };
}
