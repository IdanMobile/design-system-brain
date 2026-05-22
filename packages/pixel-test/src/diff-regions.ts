/**
 * Find clustered diff regions in a pixelmatch output and emit cropped
 * storybook / rendered / side-by-side comparison PNGs for each hotspot.
 */

// @ts-expect-error -- no bundled types
import { PNG } from "pngjs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

function formatMatchPercent(diffPercent: number): string {
  const match = 100 - diffPercent;
  if (match >= 99.995) return `${match.toFixed(3)}%`;
  if (match >= 99) return `${match.toFixed(2)}%`;
  return `${match.toFixed(1)}%`;
}

export interface DiffRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Diff pixels inside this rect (approx). */
  pixels: number;
  /** Exact diff % inside this rect (set by countDiffInRegions). */
  percent?: number;
}

export interface DiffRegionFile {
  index: number;
  rect: DiffRect;
  storybook: string;
  rendered: string;
  compare: string;
}

export interface FindRegionsOptions {
  /** Grid cell size when clustering diff pixels. */
  blockSize?: number;
  /** Minimum diff pixels in a block to count as a hotspot. */
  minBlockPixels?: number;
  /** Padding around each crop (px). */
  padding?: number;
  /** Minimum crop width/height (px). */
  minCropSize?: number;
  /** Maximum number of regions to export per story. */
  maxRegions?: number;
}

const DEFAULT_OPTS: Required<FindRegionsOptions> = {
  blockSize: 48,
  minBlockPixels: 12,
  padding: 20,
  minCropSize: 80,
  maxRegions: 8
};

/** True when pixelmatch marked this pixel as different (red channel). */
export function isDiffPixel(data: Buffer, idx: number): boolean {
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  const a = data[idx + 3];
  return a > 0 && r > 180 && g < 80 && b < 80;
}

/**
 * Cluster diff pixels into bounding boxes via a coarse grid, then merge
 * overlapping / adjacent boxes.
 */
export function findDiffRegions(
  diff: PNG,
  opts: FindRegionsOptions = {}
): DiffRect[] {
  const o = { ...DEFAULT_OPTS, ...opts };
  const { width, height, data } = diff;
  const cols = Math.ceil(width / o.blockSize);
  const rows = Math.ceil(height / o.blockSize);
  const hot: boolean[] = new Array(cols * rows).fill(false);
  const counts = new Int32Array(cols * rows);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (!isDiffPixel(data, i)) continue;
      const bx = Math.floor(x / o.blockSize);
      const by = Math.floor(y / o.blockSize);
      const bi = by * cols + bx;
      counts[bi] += 1;
      if (counts[bi] >= o.minBlockPixels) hot[bi] = true;
    }
  }

  // Flood-fill adjacent hot blocks into merged rectangles.
  const visited = new Array(cols * rows).fill(false);
  const rects: DiffRect[] = [];

  const neighbors = (bi: number): number[] => {
    const bx = bi % cols;
    const by = Math.floor(bi / cols);
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = bx + dx;
        const ny = by + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (hot[ni]) out.push(ni);
      }
    }
    return out;
  };

  for (let bi = 0; bi < hot.length; bi += 1) {
    if (!hot[bi] || visited[bi]) continue;
    const stack = [bi];
    let minBx = cols;
    let minBy = rows;
    let maxBx = 0;
    let maxBy = 0;
    let pixelSum = 0;
    visited[bi] = true;

    while (stack.length) {
      const cur = stack.pop()!;
      const bx = cur % cols;
      const by = Math.floor(cur / cols);
      minBx = Math.min(minBx, bx);
      minBy = Math.min(minBy, by);
      maxBx = Math.max(maxBx, bx);
      maxBy = Math.max(maxBy, by);
      pixelSum += counts[cur];
      for (const ni of neighbors(cur)) {
        if (!visited[ni]) {
          visited[ni] = true;
          stack.push(ni);
        }
      }
    }

    const x0 = minBx * o.blockSize;
    const y0 = minBy * o.blockSize;
    const x1 = Math.min(width, (maxBx + 1) * o.blockSize);
    const y1 = Math.min(height, (maxBy + 1) * o.blockSize);
    rects.push({
      x: x0,
      y: y0,
      width: x1 - x0,
      height: y1 - y0,
      pixels: pixelSum
    });
  }

  return rects
    .map((r) => padRect(r, width, height, o.padding, o.minCropSize))
    .sort((a, b) => b.pixels - a.pixels)
    .slice(0, o.maxRegions);
}

function padRect(r: DiffRect, imgW: number, imgH: number, pad: number, minSize: number): DiffRect {
  let x = Math.max(0, r.x - pad);
  let y = Math.max(0, r.y - pad);
  let x2 = Math.min(imgW, r.x + r.width + pad);
  let y2 = Math.min(imgH, r.y + r.height + pad);
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

/** Count pixelmatch diff pixels inside each region rect (exact, not block-estimated). */
export function countDiffInRegions(diff: PNG, regions: DiffRect[]): {
  regions: DiffRect[];
  maxPercent: number;
} {
  if (regions.length === 0) return { regions: [], maxPercent: 0 };
  const { width, height, data } = diff;
  let maxPercent = 0;
  const out = regions.map((r) => {
    let pixels = 0;
    const x2 = Math.min(width, r.x + r.width);
    const y2 = Math.min(height, r.y + r.height);
    const x0 = Math.max(0, r.x);
    const y0 = Math.max(0, r.y);
    const area = (x2 - x0) * (y2 - y0);
    for (let y = y0; y < y2; y += 1) {
      for (let x = x0; x < x2; x += 1) {
        const i = (y * width + x) * 4;
        if (isDiffPixel(data, i)) pixels += 1;
      }
    }
    const percent = area > 0 ? (pixels / area) * 100 : 0;
    maxPercent = Math.max(maxPercent, percent);
    return { ...r, pixels, percent };
  });
  return { regions: out, maxPercent };
}

export function cropPng(src: PNG, rect: DiffRect): PNG {
  const out = new PNG({ width: rect.width, height: rect.height });
  for (let y = 0; y < rect.height; y += 1) {
    const sy = rect.y + y;
    const sStart = (sy * src.width + rect.x) * 4;
    const dStart = y * rect.width * 4;
    src.data.copy(out.data, dStart, sStart, sStart + rect.width * 4);
  }
  return out;
}

/** Storybook | rendered side-by-side with a 2px gutter. */
export function composeSideBySide(left: PNG, right: PNG, gutter = 2): PNG {
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
  blit(out, left, 0, 0);
  blit(out, right, left.width + gutter, 0);
  return out;
}

function blit(dest: PNG, src: PNG, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y += 1) {
    if (dy + y >= dest.height) break;
    const sStart = y * src.width * 4;
    const dStart = ((dy + y) * dest.width + dx) * 4;
    src.data.copy(dest.data, dStart, sStart, sStart + src.width * 4);
  }
}

/**
 * Write per-region crop PNGs under `outDir/regions/region-NN-*.png`.
 * Returns metadata for the HTML report.
 */
export async function writeDiffRegionArtifacts(
  outDir: string,
  storybook: PNG,
  rendered: PNG,
  diff: PNG,
  opts: FindRegionsOptions = {}
): Promise<DiffRegionFile[]> {
  const regions = findDiffRegions(diff, opts);
  if (regions.length === 0) return [];

  const regionsDir = join(outDir, "regions");
  await import("node:fs/promises").then((fs) => fs.mkdir(regionsDir, { recursive: true }));

  const files: DiffRegionFile[] = [];
  for (let i = 0; i < regions.length; i += 1) {
    const rect = regions[i];
    const idx = String(i + 1).padStart(2, "0");
    const sb = cropPng(storybook, rect);
    const rd = cropPng(rendered, rect);
    const cmp = composeSideBySide(sb, rd);
    const storybookPath = join(regionsDir, `region-${idx}-storybook.png`);
    const renderedPath = join(regionsDir, `region-${idx}-rendered.png`);
    const comparePath = join(regionsDir, `region-${idx}-compare.png`);
    await writeFile(storybookPath, PNG.sync.write(sb));
    await writeFile(renderedPath, PNG.sync.write(rd));
    await writeFile(comparePath, PNG.sync.write(cmp));
    files.push({
      index: i + 1,
      rect,
      storybook: `regions/region-${idx}-storybook.png`,
      rendered: `regions/region-${idx}-rendered.png`,
      compare: `regions/region-${idx}-compare.png`
    });
  }
  return files;
}

/** HTML block for one story's diff regions (embedded in report). */
export function diffRegionsHtml(storyDir: string, regions: DiffRegionFile[]): string {
  if (regions.length === 0) return "";
  const cards = regions
    .map(
      (r) => `
    <div class="region-card">
      <div class="region-meta">
        Region ${r.index} · crop ${r.rect.width}×${r.rect.height}px at (${r.rect.x}, ${r.rect.y})
        · ${r.rect.percent != null ? `${formatMatchPercent(r.rect.percent)} match in this area` : `~${r.rect.pixels.toLocaleString()} diff px`}
      </div>
      <div class="region-labels"><span>Storybook</span><span>Rendered</span></div>
      <a href="${storyDir}/${r.compare}" target="_blank" title="Open full size">
        <img src="${storyDir}/${r.compare}" alt="Region ${r.index} compare" loading="lazy" />
      </a>
      <div class="region-links">
        <a href="${storyDir}/${r.storybook}" target="_blank">storybook crop</a> ·
        <a href="${storyDir}/${r.rendered}" target="_blank">rendered crop</a>
      </div>
    </div>`
    )
    .join("");
  return `<div class="regions">${cards}</div>`;
}
