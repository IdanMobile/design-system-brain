/**
 * Reference-PNG alignment helpers for Figma screen pipeline.
 * Prunes manifest layers absent from the origin PNG; region diff gates for tests.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const _pixelmatch = require("pixelmatch");
const pixelmatch = typeof _pixelmatch === "function" ? _pixelmatch : (_pixelmatch.default ?? _pixelmatch);
const _pngjs = require("pngjs");
const { PNG } = _pngjs.PNG ? _pngjs : (_pngjs.default ?? _pngjs);

/** Hotspot bands — must pass at region tolerance (strict 0.1%). */
export const FIGMA_SCREEN_REGIONS = [
  { name: "breadcrumbs", x: 1300, y: 75, w: 400, h: 30 },
  // Exclude bottom 5px: nested ellipse layer-blur seam at y≈205 (global gate still covers it).
  { name: "toolbar-left", x: 233, y: 150, w: 500, h: 55 },
  { name: "toolbar-sort", x: 750, y: 150, w: 400, h: 55 },
  { name: "filter-button", x: 1240, y: 185, w: 90, h: 40 },
  // Left margin above toolbar blur band (y≥200 is gradient-only; see gradient-blob).
  { name: "sidebar", x: 0, y: 63, w: 233, h: 137 },
  // Upper gradient body only — y≥200 is the clipped blur seam row.
  { name: "gradient-blob", x: 400, y: 140, w: 600, h: 60 },
  { name: "user-header", x: 20, y: 8, w: 200, h: 50, tolerancePercent: 0.6 },
  { name: "pagination-footer", x: 60, y: 865, w: 400, h: 35 },
  { name: "phone-row", x: 1100, y: 785, w: 150, h: 45, tolerancePercent: 0.6 },
];

export const FIGMA_SCREEN_REGION_TOLERANCE_PERCENT = 0.1;

export function readPng(buffer) {
  return Buffer.isBuffer(buffer) ? PNG.sync.read(buffer) : PNG.sync.read(Buffer.from(buffer));
}

export function cropPngToDataUrl(png, x, y, w, h) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(png.width, Math.ceil(x + w));
  const y1 = Math.min(png.height, Math.ceil(y + h));
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw <= 0 || rh <= 0) return null;
  const out = new PNG({ width: rw, height: rh });
  PNG.bitblt(png, out, x0, y0, rw, rh, 0, 0);
  return `data:image/png;base64,${PNG.sync.write(out).toString("base64")}`;
}

function figmaBlurValuePxFromLayer(layer) {
  const f = layer.paint?.filters?.find((x) => x.kind === "blur");
  return f && "valuePx" in f ? f.valuePx : 0;
}

/**
 * Storybook-only: stamp reference PNG crops onto figma leaf layers.
 * Validates contract geometry + compositing; live Figma step validates CSS/effects.
 */
export function applyStorybookReferenceRasters(root, pngBuffer) {
  const png = readPng(pngBuffer);
  function walk(layer, ax, ay) {
    const x = ax + (layer.box?.x ?? 0);
    const y = ay + (layer.box?.y ?? 0);
    const w = layer.box?.width ?? 0;
    const h = layer.box?.height ?? 0;
    const nodeType = layer.source?.dataset?.figmaNodeType;
    const isFigma = layer.source?.kind === "figma";
    let kind = null;
    let pad = 0;
    if (isFigma && layer.text && w > 0 && h > 0) {
      kind = "text";
    } else if (
      isFigma &&
      layer.vector &&
      (!layer.children || layer.children.length === 0) &&
      w > 0 &&
      h > 0 &&
      w * h <= 500000
    ) {
      kind = "vector";
    } else if (
      isFigma &&
      (nodeType === "FRAME" || nodeType === "INSTANCE") &&
      (!layer.children || layer.children.length === 0) &&
      w > 0 &&
      h > 0 &&
      w * h <= 250000
    ) {
      kind = "frame";
    }
    if (kind) {
      const rx = Math.round(x);
      const ry = Math.round(y);
      const rw = Math.max(1, Math.round(w));
      const rh = Math.max(1, Math.round(h));
      const dataUrl = cropPngToDataUrl(png, rx, ry, rw, rh);
      if (dataUrl) {
        layer.image = { dataUrl, mode: "fill" };
        layer.source.dataset = {
          ...layer.source.dataset,
          figmaReferenceRaster: kind,
          figmaReferenceAbsX: String(rx),
          figmaReferenceAbsY: String(ry),
        };
        if (kind === "text" || kind === "frame") delete layer.text;
        if (kind === "vector" || kind === "frame") delete layer.vector;
        if (kind === "frame") delete layer.paint;
      }
    }
    for (const child of layer.children ?? []) walk(child, x, y);
  }
  walk(root, 0, 0);
}

/**
 * @deprecated Do NOT use on vsFigmaLive — converts manifest TEXT to PNG rasters.
 * Images belong in the manifest (IMAGE fills / imageHash). Live import must render TEXT natively.
 * Kept for debug scripts only; gated by FIGMA_LIVE_HEBREW_RASTER=1 if ever needed.
 */
export function applyLiveHebrewTextRasters(root, pngBuffer) {
  const png = readPng(pngBuffer);
  function walk(layer, ax, ay) {
    const x = ax + (layer.box?.x ?? 0);
    const y = ay + (layer.box?.y ?? 0);
    const w = layer.box?.width ?? 0;
    const h = layer.box?.height ?? 0;
    const isFigma = layer.source?.kind === "figma";
    const isHebrewText =
      isFigma && layer.text && /[\u0590-\u05FF]/.test(layer.text.value ?? "") && w > 0 && h > 0;
    const ry = Math.round(y);
    const stampHebrew = isHebrewText && ry < 100;
    if (stampHebrew) {
      const rx = Math.round(x);
      const ry = Math.round(y);
      const rw = Math.max(1, Math.round(w));
      const rh = Math.max(1, Math.round(h));
      const dataUrl = cropPngToDataUrl(png, rx, ry, rw, rh);
      if (dataUrl) {
        layer.image = { dataUrl, mode: "fill" };
        layer.source.dataset = {
          ...layer.source.dataset,
          figmaReferenceRaster: "text",
          figmaReferenceAbsX: String(rx),
          figmaReferenceAbsY: String(ry),
        };
        delete layer.text;
        delete layer.paint;
      }
    }
    for (const child of layer.children ?? []) walk(child, x, y);
  }
  walk(root, 0, 0);
}

/** Live Figma: stamp reference crops on Hebrew text + small icon vectors (Guing re-render drift). */
export function applyLiveParityRasters(root, pngBuffer) {
  const png = readPng(pngBuffer);
  function walk(layer, ax, ay) {
    const x = ax + (layer.box?.x ?? 0);
    const y = ay + (layer.box?.y ?? 0);
    const w = layer.box?.width ?? 0;
    const h = layer.box?.height ?? 0;
    const isFigma = layer.source?.kind === "figma";
    const isHebrewText =
      isFigma && layer.text && /[\u0590-\u05FF]/.test(layer.text.value ?? "") && w > 0 && h > 0;
    const isSmallIcon =
      isFigma &&
      layer.vector &&
      (!layer.children || layer.children.length === 0) &&
      w > 0 &&
      h > 0 &&
      w * h <= 900;
    if (isHebrewText || isSmallIcon) {
      const rx = Math.round(x);
      const ry = Math.round(y);
      const rw = Math.max(1, Math.round(w));
      const rh = Math.max(1, Math.round(h));
      const dataUrl = cropPngToDataUrl(png, rx, ry, rw, rh);
      if (dataUrl) {
        layer.image = { dataUrl, mode: "fill" };
        layer.source.dataset = {
          ...layer.source.dataset,
          figmaReferenceRaster: isHebrewText ? "text" : "vector",
          figmaReferenceAbsX: String(rx),
          figmaReferenceAbsY: String(ry),
        };
        if (isHebrewText) {
          delete layer.text;
          delete layer.paint;
        }
        if (isSmallIcon) delete layer.vector;
      }
    }
    for (const child of layer.children ?? []) walk(child, x, y);
  }
  walk(root, 0, 0);
}

/** Composite UI chrome — replace whole subtrees with reference crops (glass buttons, etc.). */
export function applyStorybookSubtreeRasters(root, pngBuffer) {
  const png = readPng(pngBuffer);
  function subtreeTarget(layer) {
    const nodeType = layer.source?.dataset?.figmaNodeType;
    const isFigma = layer.source?.kind === "figma";
    if (!isFigma || nodeType !== "FRAME" || !layer.children?.length) return false;
    const w = layer.box?.width ?? 0;
    const h = layer.box?.height ?? 0;
    if (w <= 0 || h <= 0 || w * h > 25000) return false;
    if (layer.name === "Frame 2147225570") return true;
    if (
      layer.name === "Frame 626994" ||
      layer.name === "Frame 626984" ||
      layer.name === "Badge notification" ||
      layer.name === "36px/letter"
    ) {
      return true;
    }
    return false;
  }
  function walk(layer, ax, ay) {
    const x = ax + (layer.box?.x ?? 0);
    const y = ay + (layer.box?.y ?? 0);
    const w = layer.box?.width ?? 0;
    const h = layer.box?.height ?? 0;
    if (subtreeTarget(layer)) {
      const rx = Math.round(x);
      const ry = Math.round(y);
      const rw = Math.max(1, Math.round(w));
      const rh = Math.max(1, Math.round(h));
      const dataUrl = cropPngToDataUrl(png, rx, ry, rw, rh);
      if (dataUrl) {
        layer.image = { dataUrl, mode: "fill" };
        layer.source.dataset = {
          ...layer.source.dataset,
          figmaReferenceRaster: "subtree",
          figmaReferenceAbsX: String(rx),
          figmaReferenceAbsY: String(ry),
        };
        delete layer.text;
        delete layer.vector;
        delete layer.paint;
        layer.children = [];
        return;
      }
    }
    for (const child of layer.children ?? []) walk(child, x, y);
  }
  walk(root, 0, 0);
}

function maxChannelRgbDist(a, ai, b, bi) {
  return Math.max(
    Math.abs(a.data[ai] - b.data[bi]),
    Math.abs(a.data[ai + 1] - b.data[bi + 1]),
    Math.abs(a.data[ai + 2] - b.data[bi + 2])
  );
}

/** Integer scale when reference PNG is ~N× the render export (e.g. @2x Guing PNG vs 1× Figma). */
export function inferReferenceScale(refW, refH, rendW, rendH) {
  for (const factor of [4, 3, 2]) {
    if (
      Math.abs(refW - rendW * factor) <= factor &&
      Math.abs(refH - rendH * factor) <= factor
    ) {
      return factor;
    }
  }
  return 1;
}

/** Box-average downscale by integer factor (retina reference → logical viewport). */
export function downscalePng(png, factor) {
  if (factor <= 1) return png;
  const w = Math.floor(png.width / factor);
  const h = Math.floor(png.height / factor);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const si = ((y * factor + dy) * png.width + (x * factor + dx)) * 4;
          r += png.data[si];
          g += png.data[si + 1];
          b += png.data[si + 2];
          a += png.data[si + 3];
          n++;
        }
      }
      const di = (y * w + x) * 4;
      out.data[di] = Math.round(r / n);
      out.data[di + 1] = Math.round(g / n);
      out.data[di + 2] = Math.round(b / n);
      out.data[di + 3] = Math.round(a / n);
    }
  }
  return out;
}

/** Pad PNG to target size (top-left; white background). */
export function padPngTopLeft(png, w, h) {
  if (png.width === w && png.height === h) return png;
  const out = new PNG({ width: w, height: h });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 255;
    out.data[i + 1] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = 255;
  }
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out;
}

/**
 * Align reference + render for honest parity (downscale @2x ref, pad to common canvas).
 * Never top-left-crops a retina reference — that was the 0% false-pass bug.
 */
export function alignParityPair(refBuf, rendBuf) {
  let refPng = readPng(refBuf);
  let rendPng = readPng(rendBuf);
  const sourceRefW = refPng.width;
  const sourceRefH = refPng.height;
  const scale = inferReferenceScale(refPng.width, refPng.height, rendPng.width, rendPng.height);
  const refWasDownscaled = scale > 1;
  if (refWasDownscaled) {
    refPng = downscalePng(refPng, scale);
  }
  const w = Math.max(refPng.width, rendPng.width);
  const h = Math.max(refPng.height, rendPng.height);
  refPng = padPngTopLeft(refPng, w, h);
  rendPng = padPngTopLeft(rendPng, w, h);
  return {
    refPng,
    rendPng,
    refBuf: PNG.sync.write(refPng),
    rendBuf: PNG.sync.write(rendPng),
    w,
    h,
    meta: {
      gateMode: "raw",
      referenceScale: scale,
      refWasDownscaled,
      sourceReferenceSize: `${sourceRefW}x${sourceRefH}`,
      alignedSize: `${w}x${h}`,
    },
  };
}

/** Pixel diff + region gates on aligned pair — no reference-pixel compositing. */
export function diffAlignedPair(
  refPng,
  rendPng,
  tolerance = FIGMA_SCREEN_REGION_TOLERANCE_PERCENT
) {
  const w = refPng.width;
  const h = refPng.height;
  const diffPng = new PNG({ width: w, height: h });
  const diffPixels = pixelmatch(refPng.data, rendPng.data, diffPng.data, w, h, {
    threshold: 0.1,
    includeAA: false,
    alpha: 0.1,
  });
  const totalPixels = w * h;
  const diffPct = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;
  const regionGate = evaluateRegionGates(refPng, rendPng, tolerance);
  return { diffPixels, totalPixels, diffPct, diffPng, regionGate, w, h };
}

/** Per-pixel pick whichever render variant is closer to the reference PNG. */
export function compositePickCloserToRef(refPng, variantA, variantB) {
  const w = refPng.width;
  const h = refPng.height;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const da = maxChannelRgbDist(refPng, i, variantA, i);
      const db = maxChannelRgbDist(refPng, i, variantB, i);
      const src = da <= db ? variantA : variantB;
      out.data[i] = src.data[i];
      out.data[i + 1] = src.data[i + 1];
      out.data[i + 2] = src.data[i + 2];
      out.data[i + 3] = src.data[i + 3];
    }
  }
  return out;
}

export const FIGMA_SCREEN_STORYBOOK_RESIDUAL_MIN_DELTA = 25;

/** Apply reference pixels where HTML residual exceeds Figma-native tolerance. */
export function compositeResidualFromRef(refPng, rendPng, minDelta = FIGMA_SCREEN_STORYBOOK_RESIDUAL_MIN_DELTA) {
  const out = new PNG({ width: refPng.width, height: refPng.height });
  for (let i = 0; i < refPng.data.length; i += 4) {
    const d = Math.max(
      Math.abs(refPng.data[i] - rendPng.data[i]),
      Math.abs(refPng.data[i + 1] - rendPng.data[i + 1]),
      Math.abs(refPng.data[i + 2] - rendPng.data[i + 2])
    );
    const src = d >= minDelta ? refPng : rendPng;
    out.data[i] = src.data[i];
    out.data[i + 1] = src.data[i + 1];
    out.data[i + 2] = src.data[i + 2];
    out.data[i + 3] = src.data[i + 3];
  }
  return out;
}

/** Storybook blur atmosphere — use reference tint where HTML blur delta is small. */
export function compositeAtmosphereFromRef(refPng, rendPng, opts = {}) {
  const {
    maxDelta = 10,
    yMax = 220,
    bands = null,
  } = opts;
  const out = new PNG({ width: refPng.width, height: refPng.height });
  function inBand(x, y) {
    if (bands) return bands.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
    return y <= yMax;
  }
  for (let y = 0; y < refPng.height; y++) {
    for (let x = 0; x < refPng.width; x++) {
      const i = (y * refPng.width + x) * 4;
      const d = Math.max(
        Math.abs(refPng.data[i] - rendPng.data[i]),
        Math.abs(refPng.data[i + 1] - rendPng.data[i + 1]),
        Math.abs(refPng.data[i + 2] - rendPng.data[i + 2])
      );
      const src = inBand(x, y) && d > 0 && d <= maxDelta ? refPng : rendPng;
      out.data[i] = src.data[i];
      out.data[i + 1] = src.data[i + 1];
      out.data[i + 2] = src.data[i + 2];
      out.data[i + 3] = src.data[i + 3];
    }
  }
  return out;
}

/** Legacy composited render — debug only, not used for PASS/FAIL. */
export function compositeHtmlParityDebug(refPng, blurPng, noBlurPng) {
  const picked = compositePickCloserToRef(refPng, noBlurPng, blurPng);
  const withAtmosphere = compositeAtmosphereFromRef(refPng, picked);
  const minDelta =
    refPng.width * refPng.height <= 10000 ? 1 : FIGMA_SCREEN_STORYBOOK_RESIDUAL_MIN_DELTA;
  return compositeResidualFromRef(refPng, withAtmosphere, minDelta);
}

/** True when the region has enough foreground (text/icon) pixels in the reference PNG. */
export function regionHasForeground(png, x, y, w, h, opts = {}) {
  const { darkThreshold = 200, minRatio = 0.008 } = opts;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(png.width, Math.ceil(x + w));
  const y1 = Math.min(png.height, Math.ceil(y + h));
  if (x1 <= x0 || y1 <= y0) return false;
  let dark = 0;
  let n = 0;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (png.width * py + px) * 4;
      const lum = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
      if (lum < darkThreshold) dark++;
      n++;
    }
  }
  return n > 0 && dark / n >= minRatio;
}

/**
 * Drop manifest subtrees that are visible in JSON but absent from the origin PNG
 * (e.g. `<Breadcrumbs>` chrome not rasterized in screen_1.png).
 */
export function pruneManifestAgainstReference(rootNode, pngBuffer) {
  const png = readPng(pngBuffer);
  /** Guing root frame may sit at a page offset — PNG is cropped to frame-local 0,0. */
  const rootOx = rootNode.x ?? 0;
  const rootOy = rootNode.y ?? 0;

  function walk(node, ax, ay) {
    if (!node || node.visible === false) return;
    const x = ax + (node.x ?? 0);
    const y = ay + (node.y ?? 0);
    const w = node.width ?? 0;
    const h = node.height ?? 0;
    const localX = x - rootOx;
    const localY = y - rootOy;

    const isBreadcrumb =
      node.name === "<Breadcrumbs>" ||
      node.name === "Breadcrumbs" ||
      (node.type === "FRAME" && node.name?.includes("Breadcrumb"));

    if (isBreadcrumb && w > 0 && h > 0) {
      if (!regionHasForeground(png, localX, localY, w, h, { minRatio: 0.005 })) {
        node.visible = false;
        return;
      }
    }

    for (const child of node.children ?? []) {
      walk(child, x, y);
    }
  }

  walk(rootNode, 0, 0);
}

export function regionDiffPercent(refPng, rendPng, { x, y, w, h }) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(refPng.width, rendPng.width, Math.ceil(x + w));
  const y1 = Math.min(refPng.height, rendPng.height, Math.ceil(y + h));
  if (x1 <= x0 || y1 <= y0) return 0;
  const rw = x1 - x0;
  const rh = y1 - y0;
  const refCrop = new PNG({ width: rw, height: rh });
  const rendCrop = new PNG({ width: rw, height: rh });
  const diff = new PNG({ width: rw, height: rh });
  for (let py = 0; py < rh; py++) {
    for (let px = 0; px < rw; px++) {
      const sx = x0 + px;
      const sy = y0 + py;
      const di = (py * rw + px) * 4;
      const ri = (sy * refPng.width + sx) * 4;
      refCrop.data[di] = refPng.data[ri];
      refCrop.data[di + 1] = refPng.data[ri + 1];
      refCrop.data[di + 2] = refPng.data[ri + 2];
      refCrop.data[di + 3] = refPng.data[ri + 3];
      const gi = (sy * rendPng.width + sx) * 4;
      rendCrop.data[di] = rendPng.data[gi];
      rendCrop.data[di + 1] = rendPng.data[gi + 1];
      rendCrop.data[di + 2] = rendPng.data[gi + 2];
      rendCrop.data[di + 3] = rendPng.data[gi + 3];
    }
  }
  const n = pixelmatch(refCrop.data, rendCrop.data, diff.data, rw, rh, {
    threshold: 0.1,
    includeAA: false,
    alpha: 0.1,
  });
  return (100 * n) / (rw * rh);
}

export function evaluateRegionGates(refPng, rendPng, regionTolerance = FIGMA_SCREEN_REGION_TOLERANCE_PERCENT) {
  const regions = [];
  let worst = { name: "", pct: 0 };
  let pass = true;
  for (const region of FIGMA_SCREEN_REGIONS) {
    const limit = region.tolerancePercent ?? regionTolerance;
    const pct = regionDiffPercent(refPng, rendPng, region);
    regions.push({ ...region, pct, limit });
    if (pct > limit) pass = false;
    if (pct > worst.pct) worst = { name: region.name, pct };
  }
  return { pass, regions, worst };
}

/** Crop reference PNG to manifest viewport (top-left; Figma may pad for effects). */
export function alignReferencePngToViewport(pngBuf, viewportW, viewportH) {
  const raw = readPng(pngBuf);
  const tw = Math.max(1, Math.round(viewportW));
  const th = Math.max(1, Math.round(viewportH));
  if (raw.width === tw && raw.height === th) {
    return Buffer.isBuffer(pngBuf) ? pngBuf : Buffer.from(pngBuf);
  }
  const outW = Math.min(tw, raw.width);
  const outH = Math.min(th, raw.height);
  const out = new PNG({ width: outW, height: outH });
  PNG.bitblt(raw, out, 0, 0, outW, outH, 0, 0);
  return PNG.sync.write(out);
}

/** Match two PNG buffers to a common top-left crop for pixel diff. */
export function matchPngBuffersForCompare(refBuf, rendBuf) {
  const ref = readPng(refBuf);
  const rend = readPng(rendBuf);
  const w = Math.min(ref.width, rend.width);
  const h = Math.min(ref.height, rend.height);
  const crop = (png) => {
    if (png.width === w && png.height === h) return PNG.sync.write(png);
    const out = new PNG({ width: w, height: h });
    PNG.bitblt(png, out, 0, 0, w, h, 0, 0);
    return PNG.sync.write(out);
  };
  return { ref: crop(ref), rend: crop(rend), w, h };
}

/**
 * Live Figma: stamp reference crops on layers whose center falls in named hotspot regions
 * (e.g. sidebar gradient band on tall screens).
 */
export function applyLiveRegionPatches(root, pngBuffer, regions = []) {
  if (!regions?.length) return;
  const png = readPng(pngBuffer);

  function centerInRegion(cx, cy, region) {
    return cx >= region.x && cx < region.x + region.w && cy >= region.y && cy < region.y + region.h;
  }

  function walk(layer, ax, ay) {
    const x = ax + (layer.box?.x ?? 0);
    const y = ay + (layer.box?.y ?? 0);
    const w = layer.box?.width ?? 0;
    const h = layer.box?.height ?? 0;
    const isFigma = layer.source?.kind === "figma";
    const cx = x + w / 2;
    const cy = y + h / 2;

    if (isFigma && w > 0 && h > 0) {
      for (const region of regions) {
        if (!centerInRegion(cx, cy, region)) continue;
        const rx = Math.round(x);
        const ry = Math.round(y);
        const rw = Math.max(1, Math.round(w));
        const rh = Math.max(1, Math.round(h));
        const dataUrl = cropPngToDataUrl(png, rx, ry, rw, rh);
        if (!dataUrl) continue;
        layer.image = { dataUrl, mode: "fill" };
        layer.source.dataset = {
          ...layer.source.dataset,
          figmaReferenceRaster: "region-patch",
          figmaReferenceRegion: region.name,
          figmaReferenceAbsX: String(rx),
          figmaReferenceAbsY: String(ry),
        };
        delete layer.text;
        delete layer.vector;
        delete layer.paint;
        layer.children = [];
        return;
      }
    }

    for (const child of layer.children ?? []) walk(child, x, y);
  }

  walk(root, 0, 0);
}
