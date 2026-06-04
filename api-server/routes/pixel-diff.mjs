/**
 * POST /pixel-diff
 *
 * Renders a component via the Storybook render harness, then runs a
 * pixel-level comparison against the supplied Figma reference PNG.
 *
 * Returns diff status, mismatch percentage, a diff PNG (base64), and
 * per-region hotspot crops showing actual vs reference side-by-side.
 */

import { z } from 'zod';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAndScreenshot } from '../lib/render-harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve pngjs and pixelmatch — they live in visual-gate's isolated node_modules.
const _require = createRequire(
  resolve(__dirname, '../../packages/visual-gate/package.json')
);
const { PNG } = _require('pngjs');
// pixelmatch v6 is pure ESM; createRequire wraps it as { default: fn }
const _pm = _require('pixelmatch');
const pixelmatch = typeof _pm === 'function' ? _pm : _pm.default;

// ─── request schema ───────────────────────────────────────────────────────────

const RequestSchema = z.object({
  componentName: z
    .string()
    .min(1)
    .regex(
      /^[A-Z][A-Za-z0-9]*$/,
      'componentName must be PascalCase'
    ),
  componentSource: z.string().min(1),
  storiesSource: z.string().min(1),
  referencePngBase64: z.string().min(100),
  library: z.enum(['mui', 'shadcn', 'radix', 'daisyui']),
  tokensCss: z.string(),
});

// ─── pixel diff helpers ───────────────────────────────────────────────────────

/**
 * Decode a base64 PNG string and return a pngjs PNG object.
 * @param {string} base64
 * @returns {{ width: number, height: number, data: Buffer }}
 */
function decodePng(base64) {
  return PNG.sync.read(Buffer.from(base64, 'base64'));
}

/**
 * Crop a PNG to (width, height), returning a new PNG.
 * If the source already fits, returns the original unchanged.
 * @param {{ width: number, height: number, data: Buffer }} src
 * @param {number} width
 * @param {number} height
 */
function cropPng(src, width, height) {
  if (src.width === width && src.height === height) return src;
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const sStart = y * src.width * 4;
    const dStart = y * width * 4;
    src.data.copy(out.data, dStart, sStart, sStart + width * 4);
  }
  return out;
}

/**
 * Scale src to (targetW, targetH) using nearest-neighbor interpolation.
 * Used to bring the 1x Playwright screenshot up to the 2x Figma PNG dimensions
 * so the full reference area (including any missing sections) is compared.
 * @param {{ width: number, height: number, data: Buffer }} src
 * @param {number} targetW
 * @param {number} targetH
 */
function scalePng(src, targetW, targetH) {
  if (src.width === targetW && src.height === targetH) return src;
  const out = new PNG({ width: targetW, height: targetH });
  const xRatio = src.width / targetW;
  const yRatio = src.height / targetH;
  for (let y = 0; y < targetH; y++) {
    const srcY = Math.min(Math.floor(y * yRatio), src.height - 1);
    for (let x = 0; x < targetW; x++) {
      const srcX = Math.min(Math.floor(x * xRatio), src.width - 1);
      const si = (srcY * src.width + srcX) * 4;
      const di = (y * targetW + x) * 4;
      out.data[di]     = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

/**
 * Run pixelmatch on two decoded PNGs and return diff status + buffer.
 * @param {string} actualBase64
 * @param {string} referenceBase64
 * @param {number} [tolerance=5.0]  pass threshold in percent
 */
export async function pixelDiff(actualBase64, referenceBase64, tolerance = 5.0) {
  const rawActual = decodePng(actualBase64);
  const rawRef = decodePng(referenceBase64);

  // Scale the actual screenshot to match the reference dimensions.
  // Figma exports at 2x; Playwright captures at 1x → we scale actual up to ref size.
  // This ensures component size mismatch (e.g. missing icon/buttons section) is penalized.
  const actual = scalePng(rawActual, rawRef.width, rawRef.height);
  const ref = rawRef;
  const width = rawRef.width;
  const height = rawRef.height;

  const diff = new PNG({ width, height });
  const pixelsDiffered = pixelmatch(
    actual.data,
    ref.data,
    diff.data,
    width,
    height,
    { threshold: 0.2, includeAA: false, alpha: 0.1 }
  );

  const total = width * height;
  const percent = total > 0 ? (pixelsDiffered / total) * 100 : 0;
  const status =
    percent <= tolerance
      ? 'pass'
      : percent <= tolerance * 4
      ? 'warn'
      : 'fail';

  return { status, percent, diffPng: diff, actual, ref, width, height };
}

// ─── region detection helpers ─────────────────────────────────────────────────

/** True when pixelmatch marked this pixel as a diff (bright red). */
function isDiffPixel(data, idx) {
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  const a = data[idx + 3];
  return a > 0 && r > 180 && g < 80 && b < 80;
}

/**
 * Pad a bounding rect with `padding` pixels, clamped to image bounds, and
 * expanded to at least `minSize` in each dimension.
 */
function padRect(r, imgW, imgH, padding, minSize) {
  let x = Math.max(0, r.x - padding);
  let y = Math.max(0, r.y - padding);
  let x2 = Math.min(imgW, r.x + r.width + padding);
  let y2 = Math.min(imgH, r.y + r.height + padding);
  let w = x2 - x;
  let h = y2 - y;
  if (w < minSize) {
    const extra = minSize - w;
    x = Math.max(0, x - Math.floor(extra / 2));
    x2 = Math.min(imgW, x + minSize);
    w = x2 - x;
  }
  if (h < minSize) {
    const extra = minSize - h;
    y = Math.max(0, y - Math.floor(extra / 2));
    y2 = Math.min(imgH, y + minSize);
    h = y2 - y;
  }
  return { x, y, width: w, height: h, pixels: r.pixels };
}

/**
 * Extract a rectangular region from a PNG into a new PNG.
 */
function extractRegion(src, rect) {
  const out = new PNG({ width: rect.width, height: rect.height });
  for (let y = 0; y < rect.height; y++) {
    const sy = rect.y + y;
    const sStart = (sy * src.width + rect.x) * 4;
    const dStart = y * rect.width * 4;
    src.data.copy(out.data, dStart, sStart, sStart + rect.width * 4);
  }
  return out;
}

/**
 * Compose a side-by-side PNG: actual on the left, reference on the right,
 * separated by a 2-px white gutter.
 */
function composeSideBySide(left, right) {
  const gutter = 2;
  const w = left.width + gutter + right.width;
  const h = Math.max(left.height, right.height);
  const out = new PNG({ width: w, height: h });
  // White background
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 255;
    out.data[i + 1] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = 255;
  }
  // Blit left
  for (let y = 0; y < left.height; y++) {
    const sStart = y * left.width * 4;
    const dStart = y * w * 4;
    left.data.copy(out.data, dStart, sStart, sStart + left.width * 4);
  }
  // Blit right
  const rightOffsetX = left.width + gutter;
  for (let y = 0; y < right.height; y++) {
    const sStart = y * right.width * 4;
    const dStart = (y * w + rightOffsetX) * 4;
    right.data.copy(out.data, dStart, sStart, sStart + right.width * 4);
  }
  return out;
}

/**
 * Grid-based hotspot detection. Divides the diff image into blockSize×blockSize
 * cells, counts diff pixels per cell, clusters adjacent hot cells via flood
 * fill, and returns the top `maxRegions` bounding boxes as enriched region
 * objects (with side-by-side crop base64).
 *
 * @param {{ width, height, data }} diffPng
 * @param {{ width, height, data }} actualPng
 * @param {{ width, height, data }} referencePng
 * @param {number} [maxRegions=5]
 */
export function findDiffRegions(diffPng, actualPng, referencePng, maxRegions = 5) {
  const BLOCK_SIZE = 48;
  const MIN_BLOCK_PIXELS = 12;
  const PADDING = 20;
  const MIN_CROP_SIZE = 80;

  const { width, height, data } = diffPng;
  const cols = Math.ceil(width / BLOCK_SIZE);
  const rows = Math.ceil(height / BLOCK_SIZE);
  const counts = new Int32Array(cols * rows);
  const hot = new Array(cols * rows).fill(false);

  // Count diff pixels per grid block.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!isDiffPixel(data, i)) continue;
      const bx = Math.floor(x / BLOCK_SIZE);
      const by = Math.floor(y / BLOCK_SIZE);
      const bi = by * cols + bx;
      counts[bi]++;
      if (counts[bi] >= MIN_BLOCK_PIXELS) hot[bi] = true;
    }
  }

  // Flood-fill adjacent hot blocks into merged bounding rectangles.
  const visited = new Array(cols * rows).fill(false);
  const rects = [];

  for (let bi = 0; bi < hot.length; bi++) {
    if (!hot[bi] || visited[bi]) continue;
    const stack = [bi];
    visited[bi] = true;
    let minBx = cols, minBy = rows, maxBx = 0, maxBy = 0, pixelSum = 0;

    while (stack.length) {
      const cur = stack.pop();
      const bx = cur % cols;
      const by = Math.floor(cur / cols);
      minBx = Math.min(minBx, bx);
      minBy = Math.min(minBy, by);
      maxBx = Math.max(maxBx, bx);
      maxBy = Math.max(maxBy, by);
      pixelSum += counts[cur];

      // Check 8-connected neighbours.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = bx + dx;
          const ny = by + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const ni = ny * cols + nx;
          if (hot[ni] && !visited[ni]) {
            visited[ni] = true;
            stack.push(ni);
          }
        }
      }
    }

    rects.push({
      x: minBx * BLOCK_SIZE,
      y: minBy * BLOCK_SIZE,
      width: Math.min(width, (maxBx + 1) * BLOCK_SIZE) - minBx * BLOCK_SIZE,
      height: Math.min(height, (maxBy + 1) * BLOCK_SIZE) - minBy * BLOCK_SIZE,
      pixels: pixelSum,
    });
  }

  // Sort by hottest (most diff pixels), keep top N, pad each rect.
  const topRects = rects
    .sort((a, b) => b.pixels - a.pixels)
    .slice(0, maxRegions)
    .map((r) => padRect(r, width, height, PADDING, MIN_CROP_SIZE));

  // Build output regions with exact percent and side-by-side crop.
  return topRects.map((rect) => {
    // Count exact diff pixels within this rect.
    let diffPixels = 0;
    const x2 = Math.min(width, rect.x + rect.width);
    const y2 = Math.min(height, rect.y + rect.height);
    for (let y = rect.y; y < y2; y++) {
      for (let x = rect.x; x < x2; x++) {
        const i = (y * width + x) * 4;
        if (isDiffPixel(data, i)) diffPixels++;
      }
    }
    const area = rect.width * rect.height;
    const percent = area > 0 ? (diffPixels / area) * 100 : 0;

    // Build side-by-side crop: actual (left) vs reference (right).
    const actualCrop = extractRegion(actualPng, rect);
    const refCrop = extractRegion(referencePng, rect);
    const sideBySide = composeSideBySide(actualCrop, refCrop);
    const cropBase64 = PNG.sync.write(sideBySide).toString('base64');

    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      percent,
      cropBase64,
    };
  });
}

// ─── route handler ────────────────────────────────────────────────────────────

export async function pixelDiffHandler(req, res) {
  // 1. Validate request body.
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid request',
      details: parsed.error.flatten(),
    });
  }

  const {
    componentName,
    componentSource,
    storiesSource,
    referencePngBase64,
    library,
    tokensCss,
  } = parsed.data;

  // 2. Render via the Storybook harness and capture a screenshot.
  let screenshotBase64;
  try {
    screenshotBase64 = await renderAndScreenshot(componentName, {
      componentSource,
      storiesSource,
      tokensCss,
    });
  } catch (err) {
    console.error('[pixel-diff] renderAndScreenshot error:', err.message);
    return res.status(500).json({
      status: 'error',
      error: 'Render failed',
      message: err.message,
    });
  }

  // 3. Run pixel diff.
  let diffResult;
  try {
    diffResult = await pixelDiff(screenshotBase64, referencePngBase64);
  } catch (err) {
    console.error('[pixel-diff] pixelDiff error:', err.message);
    return res.status(500).json({
      status: 'error',
      error: 'Pixel diff failed',
      message: err.message,
    });
  }

  const { status, percent, diffPng, actual, ref } = diffResult;
  const diffImageBase64 = PNG.sync.write(diffPng).toString('base64');

  // 4. Find diff regions if there are any mismatched pixels.
  let regions = [];
  if (percent > 0) {
    try {
      regions = findDiffRegions(diffPng, actual, ref);
    } catch (err) {
      console.warn('[pixel-diff] findDiffRegions error (non-fatal):', err.message);
    }
  }

  // 5. Return result.
  return res.status(200).json({
    status,
    percent,
    diffImageBase64,
    regions,
  });
}
