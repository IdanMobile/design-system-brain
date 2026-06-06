/**
 * Live Figma pixel-diff harness — uses real Figma Desktop exportAsync PNGs.
 *
 * Prerequisites (three terminals or background relay + open Figma):
 *   1. pnpm storybook:serve
 *   2. pnpm figma:relay
 *   3. Figma Desktop → Development → Universal JSON Importer Lab (keep UI open)
 *   4. pnpm test:figma:live
 *
 * Compares Storybook screenshots to PNGs exported by the actual plugin renderer
 * in Figma (not the browser mock used by test:figma).
 */

import { chromium, type Page } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
// @ts-expect-error -- no bundled types
import pixelmatch from "pixelmatch";
// @ts-expect-error -- no bundled types
import { PNG } from "pngjs";
import { extractStoryV2 } from "../../extractor-playwright/src/extract.ts";
import { QUICK_SMOKE, GOLDEN_SET } from "../../contract/src/stories.ts";
import { PIXEL_PERFECT_TOLERANCE, statusFromGates } from "./test-tolerance.ts";
import {
  writeDiffRegionArtifacts,
  type DiffRegionFile,
  countDiffInRegions
} from "./diff-regions.ts";
import {
  finalizeHarnessRun,
  getDefaultConcurrency,
  persistStoryProgress,
  runStoriesPool,
  storyResultsForHtmlReport,
  type StoryResultRecord
} from "./report-portfolio.ts";
import { assertStoryStepGate, gateDisabled, gateSkippedResult } from "./step-gate.ts";

const DEFAULT_RELAY_PORT = 3456;
const DEFAULT_RELAY_URL = `ws://localhost:${DEFAULT_RELAY_PORT}`;

/** Live harness export scale — 1× is faster; set FIGMA_LIVE_EXPORT_SCALE=2 for legacy 2×+downscale. */
const LIVE_EXPORT_SCALE = (() => {
  const raw = Number(process.env.FIGMA_LIVE_EXPORT_SCALE ?? "1");
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
})();

/**
 * Live Figma export strips all layer effects before PNG export (see
 * stripEffectsForExport in code-v2). Storybook element screenshots must omit
 * the same paint or diffs cluster on shadows/filters (buttons, filter panels).
 */
const LIVE_STRIP_EFFECTS_CSS = `
[data-figma-component], [data-figma-component] *, [data-figma-component] *::before, [data-figma-component] *::after {
  box-shadow: none !important;
  filter: none !important;
  backdrop-filter: none !important;
  text-shadow: none !important;
}
`;

interface CliOpts {
  baseUrl: string;
  outDir: string;
  tolerance: number;
  regionTolerance: number;
  stories: string[];
  strict: boolean;
  noGate: boolean;
  relayUrl: string;
  pluginWaitMs: number;
  /** Per-export wait (relay + harness); separate from plugin connection wait. */
  exportTimeoutMs: number;
  spawnRelay: boolean;
}

/** Scale export wait with artifact size — large stories (e.g. mui--showcase) need more than 120s. */
function exportTimeoutMs(jsonByteLength: number, explicit?: number): number {
  if (explicit != null && explicit > 0) return explicit;
  const fromEnv = Number(process.env.FIGMA_LIVE_EXPORT_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  // ~2s per KB of JSON payload, floor 3min, cap 10min
  return Math.min(600_000, Math.max(180_000, Math.ceil(jsonByteLength / 1024) * 2000));
}

function parseCli(): CliOpts {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 2; i < process.argv.length; i += 1) {
    const v = process.argv[i];
    if (v.startsWith("--") && (i + 1 >= process.argv.length || process.argv[i + 1].startsWith("--"))) {
      flags.add(v.slice(2));
    } else if (v.startsWith("--")) {
      args.set(v.slice(2), process.argv[i + 1]);
      i += 1;
    }
  }
  const port = Number(args.get("relayPort") ?? String(DEFAULT_RELAY_PORT));
  const relayHost = args.get("relayHost") ?? "localhost";
  return {
    baseUrl: args.get("url") ?? "http://127.0.0.1:6107",
    outDir: resolve(process.cwd(), args.get("outDir") ?? "../../figma-live-diffs"),
    tolerance: Number(args.get("tolerance") ?? String(PIXEL_PERFECT_TOLERANCE)),
    regionTolerance: Number(
      args.get("regionTolerance") ?? String(PIXEL_PERFECT_TOLERANCE)
    ),
    strict: flags.has("strict"),
    noGate: flags.has("no-gate") || gateDisabled({}),
    stories: [],
    relayUrl: args.get("relayUrl") ?? `ws://${relayHost}:${port}`,
    pluginWaitMs: Number(args.get("pluginWaitMs") ?? "120000"),
    exportTimeoutMs: Number(args.get("exportTimeoutMs") ?? "0"),
    spawnRelay: !flags.has("no-spawn-relay")
  };
}

function applyStoryFlags(opts: CliOpts): void {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 2; i < process.argv.length; i += 1) {
    const v = process.argv[i];
    if (v.startsWith("--") && (i + 1 >= process.argv.length || process.argv[i + 1].startsWith("--"))) {
      flags.add(v.slice(2));
    } else if (v.startsWith("--")) {
      args.set(v.slice(2), process.argv[i + 1]);
      i += 1;
    }
  }
  const explicit = args.get("stories");
  if (explicit) {
    opts.stories = explicit.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (flags.has("golden")) {
    opts.stories = GOLDEN_SET;
  } else if (flags.has("all")) {
    opts.stories = [];
  } else {
    opts.stories = QUICK_SMOKE;
  }
}

function safeSegment(input: string): string {
  return input
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function relayHealth(relayUrl: string): Promise<{ ok: boolean; pluginConnected: boolean }> {
  return new Promise((resolveHealth) => {
    const ws = new WebSocket(relayUrl);
    const fail = () => resolveHealth({ ok: false, pluginConnected: false });
    const timer = setTimeout(() => {
      ws.close();
      fail();
    }, 3000);
    ws.onopen = () => ws.send(JSON.stringify({ type: "health" }));
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        clearTimeout(timer);
        ws.close();
        resolveHealth({
          ok: msg.relay === "ok",
          pluginConnected: Boolean(msg.pluginConnected)
        });
      } catch {
        fail();
      }
    };
    ws.onerror = fail;
    ws.onclose = () => {
      clearTimeout(timer);
    };
  });
}

async function ensureRelay(relayUrl: string, spawnRelay: boolean): Promise<void> {
  let health = await relayHealth(relayUrl);
  if (health.ok) return;

  if (!spawnRelay) {
    throw new Error(
      `Figma live relay not reachable at ${relayUrl}. Start it with: pnpm figma:relay`
    );
  }

  const relayScript = resolve(process.cwd(), "../../scripts/figma-live-relay.mjs");
  const relayTimeout = String(
    process.env.FIGMA_LIVE_TIMEOUT_MS ??
      process.env.FIGMA_LIVE_EXPORT_TIMEOUT_MS ??
      "600000"
  );
  const child = spawn(process.execPath, [relayScript], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, FIGMA_LIVE_TIMEOUT_MS: relayTimeout }
  });
  child.unref();

  for (let i = 0; i < 40; i += 1) {
    await sleep(150);
    health = await relayHealth(relayUrl);
    if (health.ok) {
      console.log(`[figma-live] Relay started at ${relayUrl}`);
      return;
    }
  }
  throw new Error(`Could not start figma live relay at ${relayUrl}`);
}

async function waitForPlugin(relayUrl: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const health = await relayHealth(relayUrl);
    if (health.ok && health.pluginConnected) {
      console.log("[figma-live] Figma plugin connected to relay");
      return;
    }
    process.stdout.write(".");
    await sleep(500);
  }
  console.log("");
  throw new Error(
    `Figma plugin did not connect within ${timeoutMs}ms.\n` +
      `  1. Open Figma Desktop\n` +
      `  2. Plugins → Development → Universal JSON Importer Lab\n` +
      `  3. Ensure the plugin panel shows "Live test bridge: connected"\n` +
      `  4. Rebuild plugin if needed: pnpm --filter @lab/figma-importer-plugin build`
  );
}

interface ExportResult {
  png: Buffer;
  width: number;
  height: number;
}

/**
 * Figma `exportAsync` pads PNG bounds for drop-shadow / blur effects outside the
 * content frame. The relay reports the frame width/height; top-left crop oversized
 * exports so live diffs align with Storybook element screenshots.
 */
function downscalePngBox(pngBuf: Buffer, outW: number, outH: number, factor: number): Buffer {
  const raw = PNG.sync.read(pngBuf);
  const out = new PNG({ width: outW, height: outH });
  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        for (let dx = 0; dx < factor; dx += 1) {
          const sx = x * factor + dx;
          const sy = y * factor + dy;
          const srcIdx = (sy * raw.width + sx) * 4;
          r += raw.data[srcIdx]!;
          g += raw.data[srcIdx + 1]!;
          b += raw.data[srcIdx + 2]!;
          a += raw.data[srcIdx + 3]!;
          n += 1;
        }
      }
      const dstIdx = (y * outW + x) * 4;
      out.data[dstIdx] = Math.round(r / n);
      out.data[dstIdx + 1] = Math.round(g / n);
      out.data[dstIdx + 2] = Math.round(b / n);
      out.data[dstIdx + 3] = Math.round(a / n);
    }
  }
  return PNG.sync.write(out);
}

function normalizeFigmaExportToFrame(
  pngBuf: Buffer,
  frameW: number,
  frameH: number
): Buffer {
  const fw = Math.max(1, Math.round(frameW));
  const fh = Math.max(1, Math.round(frameH));
  const raw = PNG.sync.read(pngBuf);
  if (raw.width === fw * 2 && raw.height === fh * 2) {
    return downscalePngBox(pngBuf, fw, fh, 2);
  }
  if (raw.width === fw && raw.height === fh) return pngBuf;
  if (raw.width < fw || raw.height < fh) return pngBuf;
  const ox = Math.floor((raw.width - fw) / 2);
  const oy = Math.floor((raw.height - fh) / 2);
  const out = new PNG({ width: fw, height: fh });
  for (let y = 0; y < fh; y += 1) {
    for (let x = 0; x < fw; x += 1) {
      const srcIdx = ((oy + y) * raw.width + (ox + x)) * 4;
      const dstIdx = (y * fw + x) * 4;
      out.data[dstIdx] = raw.data[srcIdx]!;
      out.data[dstIdx + 1] = raw.data[srcIdx + 1]!;
      out.data[dstIdx + 2] = raw.data[srcIdx + 2]!;
      out.data[dstIdx + 3] = raw.data[srcIdx + 3]!;
    }
  }
  return PNG.sync.write(out);
}

function parseCssRgb(color: string): { r: number; g: number; b: number } | null {
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

/** Sample a background pixel from the Storybook screenshot (browser AA ≠ meta canvasBackground). */
function sampleStorybookBackground(pngBuf: Buffer): string | null {
  const raw = PNG.sync.read(pngBuf);
  const w = raw.width;
  const h = raw.height;
  const candidates: [number, number][] = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1]
  ];
  for (const [x, y] of candidates) {
    const i = (y * w + x) * 4;
    const r = raw.data[i]!;
    const g = raw.data[i + 1]!;
    const b = raw.data[i + 2]!;
    if (r < 40 && g > 80 && b > 150) continue;
    return `rgb(${r}, ${g}, ${b})`;
  }
  return null;
}

/** Storybook element screenshots composite rounded corners on canvasBackground; flatten Figma alpha likewise. */
function flattenPngOnBackground(pngBuf: Buffer, cssColor: string): Buffer {
  const bg = parseCssRgb(cssColor);
  if (!bg) return pngBuf;
  const raw = PNG.sync.read(pngBuf);
  for (let i = 0; i < raw.data.length; i += 4) {
    const a = raw.data[i + 3]! / 255;
    raw.data[i] = Math.round(raw.data[i]! * a + bg.r * (1 - a));
    raw.data[i + 1] = Math.round(raw.data[i + 1]! * a + bg.g * (1 - a));
    raw.data[i + 2] = Math.round(raw.data[i + 2]! * a + bg.b * (1 - a));
    raw.data[i + 3] = 255;
  }
  return PNG.sync.write(raw);
}

function exportViaRelay(
  relayUrl: string,
  json: string,
  timeoutMs: number,
  exportScale = LIVE_EXPORT_SCALE
): Promise<ExportResult> {
  return new Promise((resolveExport, rejectExport) => {
    const ws = new WebSocket(relayUrl);
    const requestId = randomUUID();
    const timer = setTimeout(() => {
      ws.close();
      rejectExport(new Error(`Export timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "render-export", requestId, json, exportScale }));
    };

    ws.onmessage = (event) => {
      let msg: {
        type: string;
        requestId?: string;
        pngBase64?: string;
        width?: number;
        height?: number;
        error?: string;
      };
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.requestId !== requestId) return;
      clearTimeout(timer);
      ws.close();
      if (msg.type === "export-error") {
        rejectExport(new Error(msg.error ?? "Figma export failed"));
        return;
      }
      if (msg.type !== "export-result" || !msg.pngBase64) {
        rejectExport(new Error("Invalid export-result from relay"));
        return;
      }
      resolveExport({
        png: Buffer.from(msg.pngBase64, "base64"),
        width: msg.width ?? 0,
        height: msg.height ?? 0
      });
    };

    ws.onerror = () => {
      clearTimeout(timer);
      rejectExport(new Error("WebSocket error talking to figma live relay"));
    };
  });
}

async function pageScreenshotElement(
  page: Page,
  selector: string,
  outPath: string
): Promise<{ width: number; height: number }> {
  await page.waitForSelector(selector, { state: "attached" });
  const el = await page.$(selector);
  if (!el) throw new Error(`Selector ${selector} not found`);
  const box = await el.boundingBox();
  if (!box) throw new Error("Could not get bounding box");
  await el.screenshot({ path: outPath, omitBackground: false });
  return { width: Math.round(box.width), height: Math.round(box.height) };
}

interface DiffResult {
  storyId: string;
  width: number;
  height: number;
  pixelsDiffered: number;
  pixelsTotal: number;
  percent: number;
  maxRegionPercent?: number;
  globalTolerance?: number;
  regionTolerance?: number;
  failReason?: string;
  status: "pass" | "warn" | "fail" | "error" | "skipped";
  error?: string;
  storybookPng: string;
  figmaPng: string;
  diffPng: string;
  artifactPath: string;
  diffRegions?: DiffRegionFile[];
}

function liveFailReason(
  globalOk: boolean,
  regionOk: boolean,
  status: DiffResult["status"]
): string | undefined {
  if (status === "pass" || status === "skipped") return undefined;
  if (status === "error") return "error";
  if (!globalOk && !regionOk) return "global+hotspot";
  if (!globalOk) return "global";
  if (!regionOk) return "hotspot";
  return "warn";
}

async function diffStory(
  storyId: string,
  opts: CliOpts,
  browser: import("playwright").Browser,
  relayUrl: string
): Promise<DiffResult> {
  const safe = safeSegment(storyId);
  const baseDir = resolve(opts.outDir, safe);
  await mkdir(baseDir, { recursive: true });
  const storybookPng = resolve(baseDir, "storybook.png");
  const figmaPng = resolve(baseDir, "figma.png");
  const diffPng = resolve(baseDir, "diff.png");
  const artifactPath = resolve(baseDir, "artifact.v2.json");

  try {
    await extractStoryV2(storyId, artifactPath, opts.baseUrl);
    const json = await readFile(artifactPath, "utf8");
    const docMeta = JSON.parse(json) as { meta?: { canvasBackground?: string } };

    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
    const sbPage = await ctx.newPage();
    await sbPage.addInitScript("var __name = (target) => target;");
    await sbPage.goto(`${opts.baseUrl}/iframe.html?id=${storyId}&viewMode=story`, {
      waitUntil: "domcontentloaded"
    });
    await sbPage.waitForSelector("[data-figma-component]", { state: "attached" });
    await sbPage.evaluate(
      () => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready
    );
    // Wait for any <img> elements inside the component to finish loading before
    // screenshotting (external images like picsum.photos may not have loaded yet
    // when domcontentloaded fires; extractor uses networkidle so its dataUrl is
    // always captured — this aligns the screenshot with the extractor's state).
    await sbPage.evaluate(() => {
      const imgs = [
        ...document.querySelectorAll<HTMLImageElement>("[data-figma-component] img")
      ];
      return Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((res) => {
                img.addEventListener("load", () => res(), { once: true });
                img.addEventListener("error", () => res(), { once: true });
              })
        )
      );
    });
    await sbPage.addStyleTag({
      content: `*,*::before,*::after{animation-play-state:paused !important;transition:none !important;caret-color:transparent !important;}${LIVE_STRIP_EFFECTS_CSS}`
    });
    await pageScreenshotElement(sbPage, "[data-figma-component]", storybookPng);
    await sbPage.close();
    await ctx.close();

    const storybookBytes = await readFile(storybookPng);
    const flattenBg =
      sampleStorybookBackground(storybookBytes) ?? docMeta.meta?.canvasBackground ?? null;

    const exportMs = exportTimeoutMs(
      Buffer.byteLength(json, "utf8"),
      opts.exportTimeoutMs > 0 ? opts.exportTimeoutMs : undefined
    );
    if (json.length > 200_000) {
      process.stdout.write(
        `\n  export timeout ${Math.round(exportMs / 1000)}s (${Math.round(json.length / 1024)}KB artifact) … `
      );
    }
    const exported = await exportViaRelay(relayUrl, json, exportMs);
    let figmaBytes =
      exported.width > 0 && exported.height > 0
        ? normalizeFigmaExportToFrame(exported.png, exported.width, exported.height)
        : exported.png;
    if (flattenBg) {
      figmaBytes = flattenPngOnBackground(figmaBytes, flattenBg);
    }
    await writeFile(figmaPng, figmaBytes);

    const fs = await import("node:fs");
    const rawA = PNG.sync.read(fs.readFileSync(storybookPng));
    const rawB = PNG.sync.read(fs.readFileSync(figmaPng));
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
    fs.writeFileSync(diffPng, PNG.sync.write(diff));
    let diffRegions =
      pixelsDiffered > 0 ? await writeDiffRegionArtifacts(baseDir, a, b, diff) : [];
    let maxRegionPercent = 0;
    if (diffRegions.length > 0) {
      const counted = countDiffInRegions(diff, diffRegions.map((f) => f.rect));
      maxRegionPercent = counted.maxPercent;
      diffRegions = diffRegions.map((f, i) => ({ ...f, rect: counted.regions[i]! }));
    }
    const total = width * height;
    const percent = total > 0 ? (pixelsDiffered / total) * 100 : 0;
    const globalTolerance = opts.tolerance;
    const regionTolerance = opts.regionTolerance;
    const globalOk = percent <= globalTolerance;
    const regionOk = maxRegionPercent <= regionTolerance;
    const status: DiffResult["status"] = statusFromGates(
      percent,
      maxRegionPercent,
      opts.tolerance
    );
    const failReason = liveFailReason(globalOk, regionOk, status);
    return {
      storyId,
      width,
      height,
      pixelsDiffered,
      pixelsTotal: total,
      percent,
      maxRegionPercent: maxRegionPercent > 0 ? maxRegionPercent : undefined,
      globalTolerance,
      regionTolerance,
      failReason,
      status,
      storybookPng,
      figmaPng,
      diffPng,
      artifactPath,
      diffRegions
    };
  } catch (error) {
    return {
      storyId,
      width: 0,
      height: 0,
      pixelsDiffered: 0,
      pixelsTotal: 0,
      percent: 100,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      storybookPng,
      figmaPng,
      diffPng,
      artifactPath
    };
  }
}

async function discoverAllStories(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}/index.json`);
  if (!res.ok) throw new Error(`Cannot fetch ${baseUrl}/index.json`);
  const json = (await res.json()) as { entries: Record<string, { id: string; type: string }> };
  return Object.values(json.entries)
    .filter((e) => e.type === "story")
    .map((e) => e.id)
    .sort();
}

function formatMatchPercent(diffPercent: number): string {
  const match = 100 - diffPercent;
  if (match >= 99.995) return `${match.toFixed(3)}%`;
  if (match >= 99) return `${match.toFixed(2)}%`;
  return `${match.toFixed(1)}%`;
}

function formatMatchCell(r: DiffResult): string {
  const overall = formatMatchPercent(r.percent);
  const sub =
    r.maxRegionPercent != null
      ? `<span class="metric-sub">worst area: ${formatMatchPercent(r.maxRegionPercent)} match</span>`
      : "";
  return `<span class="metric-primary">${overall} match</span>${sub}`;
}

function writeHtmlReport(report: DiffResult[], meta: { tolerance: number; regionTolerance: number }): string {
  const rows = report
    .map((r) => {
      const color =
        r.status === "pass"
          ? "#16a34a"
          : r.status === "warn"
          ? "#d97706"
          : r.status === "error"
          ? "#7c3aed"
          : "#dc2626";
      const dir = safeSegment(r.storyId);
      const anchor = `story-${dir}`;
      const regionCount = r.diffRegions?.length ?? 0;
      const limits =
        r.globalTolerance != null && r.regionTolerance != null
          ? `<span class="metric-sub">≤${r.globalTolerance}% global · ≤${r.regionTolerance}% hotspot</span>`
          : "";
      const reason =
        r.failReason && r.status !== "pass"
          ? `<span class="metric-sub" style="color:${color}">${r.failReason}</span>`
          : "";
      return `
      <tr id="${anchor}">
        <td><code>${r.storyId}</code></td>
        <td style="color:${color};font-weight:600">${r.status.toUpperCase()}</td>
        <td>${formatMatchCell(r)}${limits}${reason}</td>
        <td>
          <a target="_blank" href="${dir}/storybook.png">storybook</a> ·
          <a target="_blank" href="${dir}/figma.png">figma live</a> ·
          <a target="_blank" href="${dir}/diff.png">diff</a>
          ${regionCount ? ` · <a href="#${anchor}">${regionCount} hotspots</a>` : ""}
        </td>
        <td>${r.error ? `<small style="color:#dc2626">${r.error}</small>` : ""}</td>
      </tr>`;
    })
    .join("");

  const passCount = report.filter((r) => r.status === "pass").length;
  const warnCount = report.filter((r) => r.status === "warn").length;
  const failCount = report.filter((r) => r.status === "fail").length;
  const errorCount = report.filter((r) => r.status === "error").length;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Figma LIVE pixel-diff report</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 24px; max-width: 1100px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
th { background: #f9fafb; }
.summary { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.summary div { padding: 8px 16px; background: #f3f4f6; border-radius: 8px; }
.metric-primary { display: block; font-weight: 600; }
.metric-sub { display: block; font-size: 11px; color: #6b7280; }
code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
</style></head><body>
<h1>Figma LIVE — pixel-diff report</h1>
<p>Storybook vs <strong>real Figma Desktop</strong> PNG exports (<code>exportAsync</code> through the development plugin). Unlike <code>test:figma</code>, this does not use the browser mock.</p>
<div class="summary">
  <div>Total: <strong>${report.length}</strong></div>
  <div style="color:#16a34a">Pass: <strong>${passCount}</strong></div>
  <div style="color:#d97706">Warn: <strong>${warnCount}</strong></div>
  <div style="color:#dc2626">Fail: <strong>${failCount}</strong></div>
  <div style="color:#7c3aed">Error: <strong>${errorCount}</strong></div>
</div>
<table>
  <thead><tr><th>Story</th><th>Status</th><th>Match</th><th>Artifacts</th><th>Note</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p style="font-size:12px;color:#6b7280">Gate: ≤${meta.tolerance}% global · ≤${meta.regionTolerance}% hotspot (PIXEL_PERFECT_TOLERANCE). Export scale: ${LIVE_EXPORT_SCALE}× (FIGMA_LIVE_EXPORT_SCALE).</p>
</body></html>`;
}

(async () => {
  const opts = parseCli();
  applyStoryFlags(opts);

  await ensureRelay(opts.relayUrl, opts.spawnRelay);
  console.log("[figma-live] Waiting for Figma plugin");
  await waitForPlugin(opts.relayUrl, opts.pluginWaitMs);

  if (opts.stories.length === 0) {
    opts.stories = await discoverAllStories(opts.baseUrl);
  }
  const repoRoot = resolve(process.cwd(), "../..");
  await mkdir(opts.outDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const suiteMeta = {
    generatedAt,
    baseUrl: opts.baseUrl,
    tolerance: opts.tolerance,
    regionTolerance: opts.regionTolerance
  };
  const writeSuiteHtml = (results: StoryResultRecord[]) =>
    writeHtmlReport(storyResultsForHtmlReport<DiffResult>(results), opts);

  const browser = await chromium.launch();
  const report = await runStoriesPool(
    opts.stories,
    async (storyId) => {
      process.stdout.write(`▶ ${storyId} ... `);
      const gate = await assertStoryStepGate({
        repoRoot,
        storyId,
        stepId: "figmaLive",
        noGate: opts.noGate
      });
      if (!gate.allowed) {
        console.log(`⊘ SKIP (${gate.reason})`);
        return gateSkippedResult(storyId, gate.reason);
      }
      return diffStory(storyId, opts, browser, opts.relayUrl);
    },
    getDefaultConcurrency("figmaLive"),
    async (_id, result) => {
      const tag =
        result.status === "pass"
          ? "✓ PASS"
          : result.status === "warn"
          ? "⚠ WARN"
          : result.status === "skipped"
          ? "⊘ SKIP"
          : result.status === "error"
          ? "✗ ERROR"
          : "✗ FAIL";
      console.log(
        `${tag} ${result.percent.toFixed(3)}%${result.error ? ` (${result.error})` : ""}`
      );
      if (result.status === "skipped") return;
      await persistStoryProgress({
        outDir: opts.outDir,
        repoRoot,
        result,
        meta: suiteMeta,
        writeHtml: writeSuiteHtml
      });
    }
  );
  await browser.close();

  await finalizeHarnessRun({
    outDir: opts.outDir,
    repoRoot,
    ranResults: report.filter((r) => r.status !== "skipped"),
    meta: suiteMeta,
    writeHtml: writeSuiteHtml
  });

  const errorCount = report.filter((r) => r.status === "error").length;
  const failCount = report.filter((r) => r.status === "fail").length;
  console.log(`\nReport: ${resolve(opts.outDir, "report.html")}`);
  const hardFailures = errorCount + (opts.strict ? failCount : 0);
  process.exit(hardFailures > 0 ? 1 : 0);
})();
