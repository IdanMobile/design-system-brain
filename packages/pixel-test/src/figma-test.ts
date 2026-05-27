/**
 * Pixel-diff harness for the FIGMA RENDERER (not the schema).
 *
 * Same pipeline as `pixel-test.ts` but the rendered side comes from the
 * actual Figma plugin code running against a mock `figma.*` global:
 *
 *   1. Extract a story → UniversalDocumentV2 JSON.
 *   2. Install the figma mock; dynamically import `code-v2.ts`.
 *   3. Call renderDocumentV2(doc) → returns a recorded SceneNode tree.
 *   4. Serialize the recorded tree to HTML/SVG (scene-to-html.ts).
 *   5. Inject the HTML into the Storybook iframe (for fonts/global CSS)
 *      and screenshot the canvas area.
 *   6. Screenshot the live Storybook component.
 *   7. pixelmatch the two PNGs.
 *
 * Any visual mismatch points to a BUG in the Figma renderer — the schema
 * is already known to be lossless from pixel-test.ts.
 *
 * CLI mirrors pixel-test.ts:
 *   pnpm test:figma             — quick smoke
 *   pnpm test:figma:golden      — full golden set
 *   pnpm test:figma:all         — every story in the Storybook index
 */

import { chromium, type Page } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
// @ts-expect-error -- no bundled types for these packages, behavior known
import pixelmatch from "pixelmatch";
// @ts-expect-error -- no bundled types for these packages, behavior known
import { PNG } from "pngjs";
import { extractStoryV2 } from "../../extractor-playwright/src/extract.ts";
import type { UniversalDocumentV2 } from "@lab/contract";
import { figma, installFigmaMock, type MockFrameNode, type MockNode } from "./figma-mock.ts";
import { sceneToBodyMarkup } from "./scene-to-html.ts";
import { DEV_STORIES, QUICK_SMOKE, GOLDEN_SET, isLargeFixtureStory } from "../../contract/src/stories.ts";
import {
  DEFAULT_DIFF_TOLERANCE_PERCENT,
  DEFAULT_REGION_TOLERANCE_PERCENT,
  MOCK_LARGE_FIXTURE_REGION_TOLERANCE_PERCENT,
  MOCK_LARGE_FIXTURE_GLOBAL_TOLERANCE_PERCENT,
  STORYBOOK_ONLY_REGION_TOLERANCE_PERCENT
} from "./test-tolerance.ts";

function regionToleranceForStory(storyId: string, base: number): number {
  if (isLargeFixtureStory(storyId)) {
    return MOCK_LARGE_FIXTURE_REGION_TOLERANCE_PERCENT;
  }
  return base;
}

function globalToleranceForStory(storyId: string, base: number): number {
  if (isLargeFixtureStory(storyId)) {
    return MOCK_LARGE_FIXTURE_GLOBAL_TOLERANCE_PERCENT;
  }
  return base;
}
import {
  writeDiffRegionArtifacts,
  diffRegionsHtml,
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

interface CliOpts {
  baseUrl: string;
  outDir: string;
  tolerance: number;
  /** Max diff % inside any hotspot crop (default 0.1). */
  regionTolerance: number;
  stories: string[];
  /** When true, exit non-zero on any FAIL. Defaults to false (only ERROR fails). */
  strict: boolean;
  noGate: boolean;
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
  const baseUrl = args.get("url") ?? "http://127.0.0.1:6107";
  const outDir = resolve(process.cwd(), args.get("outDir") ?? "../../figma-diffs");
  const tolerance = Number(args.get("tolerance") ?? String(DEFAULT_DIFF_TOLERANCE_PERCENT));
  const regionTolerance = Number(
    args.get("regionTolerance") ?? String(DEFAULT_REGION_TOLERANCE_PERCENT)
  );
  const strict = flags.has("strict");
  const noGate = flags.has("no-gate") || gateDisabled({});
  let stories: string[] = [];
  const explicit = args.get("stories");
  if (explicit) {
    stories = explicit.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (flags.has("golden")) {
    stories = GOLDEN_SET;
  } else if (flags.has("all")) {
    stories = [];
  } else {
    stories = QUICK_SMOKE;
  }
  return { baseUrl, outDir, tolerance, regionTolerance, stories, strict, noGate };
}

function safeSegment(input: string): string {
  return input
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Align mock replay with element screenshots (drop shadows + spinner pose). */
const MOCK_PARITY_CSS = `
[data-figma-component] .MuiCircularProgress-root,
#__figma_test_root [data-name="span"] {
  animation: none !important;
  transform: none !important;
}
[data-figma-component] .MuiButton-contained,
#__figma_test_root div[data-name="button"] {
  box-shadow: none !important;
}
[data-figma-component] .lab-login-card input:-webkit-autofill,
#__figma_test_root input[data-name="input"]:-webkit-autofill {
  -webkit-box-shadow: 0 0 0 1000px #f8fbff inset !important;
  -webkit-text-fill-color: #102a43 !important;
  caret-color: #102a43 !important;
}
`;

// Dynamically resolve renderDocumentV2 after installing the mock so that
// the module sees our fake `figma` global at evaluation time.
interface RendererBundle {
  render: (doc: UniversalDocumentV2) => Promise<MockNode>;
  reset: () => void;
}
async function loadRenderer(): Promise<RendererBundle> {
  installFigmaMock();
  const mod = (await import(
    "../../figma-importer-plugin/src/code-v2.ts"
  )) as unknown as {
    renderDocumentV2: (doc: UniversalDocumentV2) => Promise<MockNode>;
    __resetRendererCaches?: () => void;
  };
  return {
    render: mod.renderDocumentV2,
    reset: mod.__resetRendererCaches ?? (() => undefined)
  };
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

async function pageScreenshotViewport(
  page: Page,
  width: number,
  height: number,
  outPath: string
): Promise<void> {
  await page.setViewportSize({
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height))
  });
  await page.screenshot({
    path: outPath,
    omitBackground: false,
    fullPage: false,
    clip: { x: 0, y: 0, width, height }
  });
}

interface DiffResult {
  storyId: string;
  width: number;
  height: number;
  pixelsDiffered: number;
  pixelsTotal: number;
  percent: number;
  /** Worst diff % among hotspot crops (catches localized bugs on large canvases). */
  maxRegionPercent?: number;
  status: "pass" | "warn" | "fail" | "error" | "skipped";
  error?: string;
  storybookPng: string;
  renderedPng: string;
  diffPng: string;
  artifactPath: string;
  sceneJsonPath: string;
  /** Cropped side-by-side views at each diff hotspot. */
  diffRegions?: DiffRegionFile[];
}

/** Serialize the mock scene to a JSON-friendly object for debugging. */
function dumpScene(node: MockNode): any {
  const base: any = {
    id: node.__id,
    kind: (node as any).__kind,
    type: node.type,
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    opacity: node.opacity
  };
  if (node.type === "FRAME") {
    const f = node as MockFrameNode;
    base.fills = f.fills;
    base.strokes = f.strokes;
    base.strokeWeight = f.strokeWeight;
    base.strokeTopWeight = f.strokeTopWeight;
    base.strokeRightWeight = f.strokeRightWeight;
    base.strokeBottomWeight = f.strokeBottomWeight;
    base.strokeLeftWeight = f.strokeLeftWeight;
    base.dashPattern = f.dashPattern;
    base.cornerRadii = [f.topLeftRadius, f.topRightRadius, f.bottomRightRadius, f.bottomLeftRadius];
    base.effects = f.effects;
    base.clipsContent = f.clipsContent;
    if (f.svgSource) base.svgSource = f.svgSource;
    if (f.source) base.source = f.source;
    if ((f as any).rotation) base.rotation = (f as any).rotation;
    if ((f as any).transformOriginCenter) base.transformOriginCenter = true;
    base.children = f.children.map(dumpScene);
  } else if (node.type === "RECTANGLE") {
    base.fills = (node as any).fills;
    base.strokes = (node as any).strokes;
    base.strokeWeight = (node as any).strokeWeight;
    base.strokeTopWeight = (node as any).strokeTopWeight;
    base.strokeRightWeight = (node as any).strokeRightWeight;
    base.strokeBottomWeight = (node as any).strokeBottomWeight;
    base.strokeLeftWeight = (node as any).strokeLeftWeight;
    base.cornerRadii = [
      (node as any).topLeftRadius,
      (node as any).topRightRadius,
      (node as any).bottomRightRadius,
      (node as any).bottomLeftRadius
    ];
    base.effects = (node as any).effects;
  } else if (node.type === "TEXT") {
    base.characters = (node as any).characters;
    base.fontName = (node as any).fontName;
    base.fontSize = (node as any).fontSize;
    base.fills = (node as any).fills;
    base.textAlignHorizontal = (node as any).textAlignHorizontal;
    base.textAutoResize = (node as any).textAutoResize;
    base.lineHeight = (node as any).lineHeight;
    base.letterSpacing = (node as any).letterSpacing;
    base.textCase = (node as any).textCase;
    base.textDecoration = (node as any).textDecoration;
  }
  return base;
}

async function diffStory(
  storyId: string,
  opts: CliOpts,
  browser: import("playwright").Browser,
  renderer: RendererBundle
): Promise<DiffResult> {
  const safe = safeSegment(storyId);
  const baseDir = resolve(opts.outDir, safe);
  await mkdir(baseDir, { recursive: true });
  const storybookPng = resolve(baseDir, "storybook.png");
  const renderedPng = resolve(baseDir, "rendered.png");
  const diffPng = resolve(baseDir, "diff.png");
  const artifactPath = resolve(baseDir, "artifact.v2.json");
  const sceneJsonPath = resolve(baseDir, "scene.json");

  try {
    // 1) Extract to JSON
    await extractStoryV2(storyId, artifactPath, opts.baseUrl);
    const doc = JSON.parse(await readFile(artifactPath, "utf8")) as UniversalDocumentV2;

    // 2) Run the Figma renderer through the mock.
    figma.__reset();
    renderer.reset();
    const canvas = (await renderer.render(doc)) as MockFrameNode;
    // canvas.children[0] is the root layer at (24, 24). For the screenshot
    // we'll wrap it standalone so its top-left is (0, 0).
    const root = canvas.children[0] as MockFrameNode | undefined;
    if (!root) throw new Error("Renderer produced no root child");
    const rootCopy: MockFrameNode = { ...root, x: 0, y: 0 } as MockFrameNode;
    const rendered = sceneToBodyMarkup(rootCopy);
    await writeFile(sceneJsonPath, JSON.stringify(dumpScene(canvas), null, 2));

    // 3) Screenshot live Storybook
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
    const sbPage = await ctx.newPage();
    await sbPage.addInitScript("var __name = (target) => target;");
    await sbPage.goto(`${opts.baseUrl}/iframe.html?id=${storyId}&viewMode=story`, {
      waitUntil: "networkidle"
    });
    await sbPage.addStyleTag({
      content: `*,*::before,*::after{animation-play-state:paused !important;transition:none !important;caret-color:transparent !important;}${MOCK_PARITY_CSS}`
    });
    await sbPage.waitForLoadState("networkidle");
    const measured = await pageScreenshotElement(sbPage, "[data-figma-component]", storybookPng);
    await sbPage.close();

    // 4) Inject scene markup into the same iframe → screenshot.
    const htmlPage = await ctx.newPage();
    await htmlPage.goto(`${opts.baseUrl}/iframe.html?id=${storyId}&viewMode=story`, {
      waitUntil: "networkidle"
    });
    const background = doc.meta?.canvasBackground ?? "#ffffff";
    await htmlPage.evaluate(
      async (payload: {
        markup: string;
        width: number;
        height: number;
        background: string;
        mockParityCss: string;
      }) => {
        const styleId = "__figma_test_reset";
        const existing = document.getElementById(styleId);
        if (!existing) {
          const s = document.createElement("style");
          s.id = styleId;
          s.textContent = `
            html, body { margin: 0 !important; padding: 0 !important; }
            #__figma_test_root { box-sizing: border-box; }
            #__figma_test_root, #__figma_test_root *, #__figma_test_root *::before, #__figma_test_root *::after {
              animation: none !important; transition: none !important;
            }
            #__figma_test_root fieldset.MuiOutlinedInput-notchedOutline {
              border-style: solid !important;
              border-width: 1px !important;
            }
            ${payload.mockParityCss}
          `;
          document.head.appendChild(s);
        }
        document.body.style.margin = "0";
        document.body.style.padding = "0";
        document.body.style.background = payload.background;
        document.body.style.position = "relative";
        document.body.style.width = payload.width + "px";
        document.body.style.height = payload.height + "px";
        document.body.innerHTML = `<div id="__figma_test_root" style="position:relative;width:${payload.width}px;height:${payload.height}px;background:${payload.background};">${payload.markup}</div>`;
        document.querySelectorAll('#__figma_test_root input[data-name="input"]').forEach((inp) => {
          const v = inp.getAttribute("value");
          if (v != null) inp.value = v;
        });
        await document.fonts.ready;
      },
      {
        markup: rendered.html,
        width: rendered.width,
        height: rendered.height,
        background,
        mockParityCss: MOCK_PARITY_CSS
      }
    );
    // Scrape every background-image: url(...) declaration we just injected and
    // wait for each one to fully decode. Background images don't fire load
    // events on their host element, so the screenshot can race and capture
    // an empty box if we only wait on document.fonts.ready.
    await htmlPage.evaluate(async () => {
      const urls = new Set<string>();
      document.querySelectorAll<HTMLElement>("[style*='background-image']").forEach((el) => {
        const bg = el.style.backgroundImage;
        const re = /url\(("|')?(data:[^"')]+|https?:[^"')]+)\1?\)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(bg))) urls.add(m[2]);
      });
      await Promise.all(
        Array.from(urls).map(
          (u) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = u;
            })
        )
      );
    });
    await htmlPage.waitForTimeout(200);
    await pageScreenshotViewport(htmlPage, measured.width, measured.height, renderedPng);
    await htmlPage.close();
    await ctx.close();

    // 5) Diff
    const fs = await import("node:fs");
    const rawA = PNG.sync.read(fs.readFileSync(storybookPng));
    const rawB = PNG.sync.read(fs.readFileSync(renderedPng));
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
      pixelsDiffered > 0
        ? await writeDiffRegionArtifacts(baseDir, a, b, diff)
        : [];
    let maxRegionPercent = 0;
    if (diffRegions.length > 0) {
      const counted = countDiffInRegions(diff, diffRegions.map((f) => f.rect));
      maxRegionPercent = counted.maxPercent;
      diffRegions = diffRegions.map((f, i) => ({ ...f, rect: counted.regions[i]! }));
    }
    const total = width * height;
    const percent = total > 0 ? (pixelsDiffered / total) * 100 : 0;
    const regionTol = regionToleranceForStory(storyId, opts.regionTolerance);
    const globalTol = globalToleranceForStory(storyId, opts.tolerance);
    const globalOk = percent <= globalTol;
    const regionOk = maxRegionPercent <= regionTol;
    const globalWarn = percent <= globalTol * 4;
    const regionWarn = maxRegionPercent <= regionTol * 4;
    const status: DiffResult["status"] =
      globalOk && regionOk ? "pass" : globalWarn && regionWarn ? "warn" : "fail";
    return {
      storyId,
      width,
      height,
      pixelsDiffered,
      pixelsTotal: total,
      percent,
      maxRegionPercent: maxRegionPercent > 0 ? maxRegionPercent : undefined,
      status,
      storybookPng,
      renderedPng,
      diffPng,
      artifactPath,
      sceneJsonPath,
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
      renderedPng,
      diffPng,
      artifactPath,
      sceneJsonPath
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

interface ReportMeta {
  tolerance: number;
  regionTolerance: number;
}

/** Human-readable large counts: 2_000_400 → "2.0 million". */
function formatCountWords(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return m >= 10 ? `${Math.round(m)} million` : `${m.toFixed(1)} million`;
  }
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

/** How similar two images are (inverse of diff %). */
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

function formatPixelsCell(r: DiffResult): string {
  const share = r.pixelsTotal > 0 ? ((r.pixelsDiffered / r.pixelsTotal) * 100).toFixed(2) : "0";
  const size =
    r.width > 0 && r.height > 0 ? `${r.width}×${r.height}px` : "";
  return `<span class="metric-primary">${r.pixelsDiffered.toLocaleString()} pixels differ</span><span class="metric-sub">${share}% of ${formatCountWords(r.pixelsTotal)}${size ? ` · ${size}` : ""}</span>`;
}

function writeHtmlReport(report: DiffResult[], meta: ReportMeta): string {
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
      return `
      <tr>
        <td><code>${r.storyId}</code></td>
        <td style="color:${color};font-weight:600">${r.status.toUpperCase()}</td>
        <td>${formatMatchCell(r)}</td>
        <td>${formatPixelsCell(r)}</td>
        <td>
          <a target="_blank" href="${dir}/storybook.png">storybook</a> ·
          <a target="_blank" href="${dir}/rendered.png">rendered</a> ·
          <a target="_blank" href="${dir}/diff.png">diff heatmap</a> ·
          <a target="_blank" href="${dir}/scene.json">scene</a>
          ${regionCount ? ` · <a href="#${anchor}">${regionCount} hotspot${regionCount === 1 ? "" : "s"}</a>` : ""}
        </td>
        <td>${r.error ? `<small style="color:#dc2626">${r.error}</small>` : ""}</td>
      </tr>`;
    })
    .join("");

  const storySections = report
    .filter((r) => r.diffRegions && r.diffRegions.length > 0)
    .map((r) => {
      const dir = safeSegment(r.storyId);
      const anchor = `story-${dir}`;
      const color =
        r.status === "pass"
          ? "#16a34a"
          : r.status === "warn"
          ? "#d97706"
          : r.status === "error"
          ? "#7c3aed"
          : "#dc2626";
      return `
  <section class="story-section" id="${anchor}">
    <h2><code>${r.storyId}</code> <span style="color:${color}">${r.status.toUpperCase()}</span> · ${formatMatchPercent(r.percent)} match${
      r.maxRegionPercent != null
        ? ` · worst area ${formatMatchPercent(r.maxRegionPercent)}`
        : ""
    }</h2>
    <p class="story-hint">Each card is a cropped <strong>Storybook | Rendered</strong> view at a place pixelmatch found differences (not the red heatmap). The <strong>Region</strong> line shows crop size, top-left position on the canvas, and diff % inside that crop only.</p>
    ${diffRegionsHtml(dir, r.diffRegions!)}
  </section>`;
    })
    .join("");

  const passCount = report.filter((r) => r.status === "pass").length;
  const warnCount = report.filter((r) => r.status === "warn").length;
  const failCount = report.filter((r) => r.status === "fail").length;
  const errorCount = report.filter((r) => r.status === "error").length;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Figma renderer pixel-diff report</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 24px; color: #111; max-width: 1200px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; margin-bottom: 32px; }
th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
th { background: #f9fafb; }
thead .col-desc th { font-weight: 400; font-size: 11px; color: #6b7280; line-height: 1.45; vertical-align: top; border-bottom: 2px solid #e5e7eb; padding-top: 0; }
.legend { font-size: 13px; color: #374151; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; line-height: 1.5; }
.legend dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; }
.legend dt { font-weight: 600; margin: 0; white-space: nowrap; }
.legend dd { margin: 0; color: #6b7280; }
.summary { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; font-size: 16px; }
.summary div { padding: 8px 16px; background: #f3f4f6; border-radius: 8px; }
.summary-hint { font-size: 12px; color: #6b7280; margin: 0 0 20px; }
.metric-primary { display: block; font-weight: 600; }
.metric-sub { display: block; font-size: 11px; color: #6b7280; font-weight: 400; margin-top: 2px; line-height: 1.35; }
code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
.story-section { margin: 40px 0; padding-top: 24px; border-top: 2px solid #e5e7eb; }
.story-section h2 { font-size: 18px; margin: 0 0 8px; }
.story-hint { color: #6b7280; font-size: 13px; margin: 0 0 16px; }
.regions { display: flex; flex-direction: column; gap: 20px; }
.region-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #fafafa; }
.region-meta { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
.region-labels { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
.region-labels span:last-child { text-align: right; padding-right: 2px; }
.region-card img { display: block; max-width: 100%; height: auto; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; }
.region-links { font-size: 12px; margin-top: 8px; }
.region-links a { color: #2563eb; }
</style></head><body>
<h1>Figma renderer — pixel-diff report</h1>
<p>Each story is rendered through the actual <code>code-v2.ts</code> plugin against a mock Figma API.
The recorded scene tree is then serialized to HTML/SVG and screenshotted. Mismatches here mean a bug in the renderer.</p>
<div class="summary">
  <div>Total: <strong>${report.length}</strong></div>
  <div style="color:#16a34a">Pass: <strong>${passCount}</strong></div>
  <div style="color:#d97706">Warn: <strong>${warnCount}</strong></div>
  <div style="color:#dc2626">Fail: <strong>${failCount}</strong></div>
  <div style="color:#7c3aed">Error: <strong>${errorCount}</strong></div>
</div>
<p class="summary-hint">Counts of stories by outcome. <strong>Pass</strong> = within tolerance; <strong>Warn</strong> = slightly over; <strong>Fail</strong> = too much diff; <strong>Error</strong> = test could not run.</p>
<div class="legend">
  <dl>
    <dt>Image match</dt>
    <dd>How similar Storybook and the Figma render look overall. <strong>99.85% match</strong> means 0.15% of pixels differ. The second line is the worst cropped area.</dd>
    <dt>Changed pixels</dt>
    <dd>Count of pixels that differ, with what fraction of the screenshot that is. Example: <em>3,018 pixels differ · 0.15% of 2.0 million · 1200×1667px</em>.</dd>
    <dt>Status thresholds</dt>
    <dd><strong>PASS</strong> — ≥ ${(100 - meta.tolerance).toFixed(1)}% match overall and worst area ≥ ${(100 - meta.regionTolerance).toFixed(1)}%. <strong>WARN</strong> — slightly below pass. <strong>FAIL</strong> — too far off.</dd>
  </dl>
</div>
<table>
  <thead>
    <tr>
      <th>Story ID</th>
      <th>Status</th>
      <th>Image match</th>
      <th>Changed pixels</th>
      <th>Artifacts</th>
      <th>Note</th>
    </tr>
    <tr class="col-desc">
      <th>Storybook story name</th>
      <th>PASS · WARN · FAIL · ERROR</th>
      <th>Overall similarity; second line = worst cropped area</th>
      <th>How many pixels differ and what % of the screenshot that is</th>
      <th>PNG exports, diff heatmap, scene JSON, hotspot links</th>
      <th>Error message when status is ERROR</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
${storySections ? `<h2 id="hotspots">Diff hotspots (Storybook vs Rendered)</h2>${storySections}` : ""}
</body></html>`;
}

(async () => {
  const opts = parseCli();
  const renderer = await loadRenderer();
  if (opts.stories.length === 0) {
    opts.stories = await discoverAllStories(opts.baseUrl);
  }
  const repoRoot = resolve(process.cwd(), "../..");
  await mkdir(opts.outDir, { recursive: true });
  const browser = await chromium.launch();
  const concurrency = getDefaultConcurrency("figma");
  const generatedAt = new Date().toISOString();
  const suiteMeta = {
    generatedAt,
    baseUrl: opts.baseUrl,
    tolerance: opts.tolerance,
    regionTolerance: opts.regionTolerance
  };
  const writeSuiteHtml = (results: StoryResultRecord[]) =>
    writeHtmlReport(storyResultsForHtmlReport<DiffResult>(results), {
      tolerance: opts.tolerance,
      regionTolerance: opts.regionTolerance
    });

  const logResult = (result: StoryResultRecord) => {
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
    const regionNote =
      result.maxRegionPercent != null ? ` hotspot ${result.maxRegionPercent.toFixed(2)}%` : "";
    console.log(
      `${tag} ${result.percent.toFixed(3)}%${regionNote}${result.error ? ` (${result.error})` : ""}`
    );
  };

  const report = await runStoriesPool(
    opts.stories,
    async (storyId) => {
      process.stdout.write(`▶ ${storyId} ... `);
      const gate = await assertStoryStepGate({
        repoRoot,
        storyId,
        stepId: "figma",
        noGate: opts.noGate
      });
      if (!gate.allowed) {
        console.log(`⊘ SKIP (${gate.reason})`);
        return gateSkippedResult(storyId, gate.reason);
      }
      return diffStory(storyId, opts, browser, renderer);
    },
    concurrency,
    async (_id, result) => {
      logResult(result);
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

  const merged = await finalizeHarnessRun({
    outDir: opts.outDir,
    repoRoot,
    ranResults: report.filter((r) => r.status !== "skipped"),
    meta: suiteMeta,
    writeHtml: writeSuiteHtml
  });

  const passCount = merged.filter((r) => r.status === "pass").length;
  const warnCount = merged.filter((r) => r.status === "warn").length;
  const failCount = merged.filter((r) => r.status === "fail").length;
  const errorCount = merged.filter((r) => r.status === "error").length;
  const notTestedCount = merged.filter((r) => r.status === "not_tested").length;
  console.log(
    `\nSummary: ${passCount} pass, ${warnCount} warn, ${failCount} fail, ${errorCount} error` +
      (notTestedCount ? `, ${notTestedCount} not tested` : "")
  );
  console.log(`Report: ${resolve(opts.outDir, "report.html")}`);
  console.log(`Per-story PNGs: ${resolve(opts.outDir)}`);

  // Exit 0 in normal mode even when stories diff — the report is the
  // deliverable, FAILs are visible in it, and tooling that wraps this
  // command (pnpm) shouldn't bury that output behind a noisy
  // ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL. Use --strict for CI.
  const hardFailures = errorCount + (opts.strict ? failCount : 0);
  process.exit(hardFailures > 0 ? 1 : 0);
})();
