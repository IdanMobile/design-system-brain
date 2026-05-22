/**
 * Pixel-diff harness — proves the v2 schema is visually lossless.
 *
 * Pipeline per story:
 *   1. Extract the story via extractor-playwright.
 *   2. Open Storybook iframe; screenshot the [data-figma-component] root.
 *   3. Render the artifact JSON back to HTML via render-html.
 *   4. Screenshot the rendered HTML at the same dimensions.
 *   5. pixelmatch the two PNGs, write storybook.png / rendered.png / diff.png.
 *
 * If diff% is small, the schema is lossless.
 *
 * CLI:
 *   pnpm test:pixel             — quick smoke test (3 stories)
 *   pnpm test:pixel --golden    — full golden set (~8 stories)
 *   pnpm test:pixel --all       — every story in the Storybook index
 *   --url <base>                — Storybook base URL (default http://127.0.0.1:6107)
 *   --stories a,b,c             — explicit story IDs
 *   --tolerance 0.1             — % diff threshold for pass/warn/fail (default 0.1)
 *   --outDir ./pixel-diffs      — where to write screenshots & report
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
import { renderToBodyMarkup } from "./render-html.ts";
import { QUICK_SMOKE, GOLDEN_SET } from "../../contract/src/stories.ts";
import { DEFAULT_DIFF_TOLERANCE_PERCENT } from "./test-tolerance.ts";
import {
  writeDiffRegionArtifacts,
  diffRegionsHtml,
  type DiffRegionFile
} from "./diff-regions.ts";
import {
  finalizeHarnessRun,
  getDefaultConcurrency,
  persistStoryProgress,
  runStoriesPool,
  storyResultsForHtmlReport,
  type StoryResultRecord
} from "./report-portfolio.ts";

interface CliOpts {
  baseUrl: string;
  outDir: string;
  tolerance: number;
  stories: string[];
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
  const outDir = resolve(process.cwd(), args.get("outDir") ?? "../../pixel-diffs");
  const tolerance = Number(args.get("tolerance") ?? String(DEFAULT_DIFF_TOLERANCE_PERCENT));
  let stories: string[] = [];
  const explicit = args.get("stories");
  if (explicit) {
    stories = explicit.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (flags.has("golden")) {
    stories = GOLDEN_SET;
  } else if (flags.has("all")) {
    stories = []; // resolved later from Storybook index
  } else {
    stories = QUICK_SMOKE;
  }
  return { baseUrl, outDir, tolerance, stories };
}

function safeSegment(input: string): string {
  return input
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
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
  // Ceil matches Playwright element screenshot pixel dimensions (subpixel boxes
  // like 168.3px paint as 169px wide, not Math.round → 168).
  return { width: Math.ceil(box.width - 1e-9), height: Math.ceil(box.height - 1e-9) };
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
  await page.screenshot({ path: outPath, omitBackground: false, fullPage: false, clip: { x: 0, y: 0, width, height } });
}

interface DiffResult {
  storyId: string;
  width: number;
  height: number;
  pixelsDiffered: number;
  pixelsTotal: number;
  percent: number;
  status: "pass" | "warn" | "fail" | "error";
  error?: string;
  storybookPng: string;
  renderedPng: string;
  diffPng: string;
  artifactPath: string;
  diffRegions?: DiffRegionFile[];
}

async function diffStory(
  storyId: string,
  opts: CliOpts,
  context: import("playwright").Browser
): Promise<DiffResult> {
  const safe = safeSegment(storyId);
  const baseDir = resolve(opts.outDir, safe);
  await mkdir(baseDir, { recursive: true });
  const storybookPng = resolve(baseDir, "storybook.png");
  const renderedPng = resolve(baseDir, "rendered.png");
  const diffPng = resolve(baseDir, "diff.png");
  const artifactPath = resolve(baseDir, "artifact.v2.json");

  try {
    // 1) Extract to JSON
    await extractStoryV2(storyId, artifactPath, opts.baseUrl);
    const doc = JSON.parse(await readFile(artifactPath, "utf8")) as UniversalDocumentV2;

    // 2) Screenshot Storybook root
    const ctx = await context.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
    const sbPage = await ctx.newPage();
    await sbPage.addInitScript("var __name = (target) => target;");
    await sbPage.goto(`${opts.baseUrl}/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: "networkidle" });
    await sbPage.addStyleTag({
      content: `*,*::before,*::after{animation-play-state:paused !important;transition:none !important;caret-color:transparent !important;}`
    });
    await sbPage.waitForLoadState("networkidle");
    const measured = await pageScreenshotElement(sbPage, "[data-figma-component]", storybookPng);
    await sbPage.close();

    // 3) Render JSON → markup. We navigate to the SAME Storybook iframe URL so
    //    every @font-face and global stylesheet is already loaded; then we
    //    replace the body with our reconstructed markup and screenshot the
    //    same region. This isolates the test to "does the schema capture
    //    everything the renderer needs to reproduce the visual?" — independent
    //    of font loading.
    const rendered = renderToBodyMarkup(doc);
    const htmlPage = await ctx.newPage();
    await htmlPage.goto(`${opts.baseUrl}/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: "networkidle" });
    await htmlPage.evaluate(
      (payload: { markup: string; width: number; height: number; background: string }) => {
        const styleId = "__pixel_test_reset";
        const existing = document.getElementById(styleId);
        if (!existing) {
          const s = document.createElement("style");
          s.id = styleId;
          s.textContent = `
            html, body { margin: 0 !important; padding: 0 !important; }
            #__pixel_test_root { box-sizing: border-box; }
            #__pixel_test_root, #__pixel_test_root *, #__pixel_test_root *::before, #__pixel_test_root *::after {
              animation: none !important; transition: none !important;
            }
            #__pixel_test_root .layer,
            #__pixel_test_root .layer *,
            #__pixel_test_root .layer *::before,
            #__pixel_test_root .layer *::after {
              box-sizing: border-box;
            }
            #__pixel_test_root .layer :is(h1,h2,h3,h4,h5,h6,p) { margin-block: 0; }
          `;
          document.head.appendChild(s);
        }
        document.body.style.margin = "0";
        document.body.style.padding = "0";
        document.body.style.background = payload.background;
        document.body.style.position = "relative";
        document.body.style.width = payload.width + "px";
        document.body.style.height = payload.height + "px";
        document.body.innerHTML = `<div id="__pixel_test_root" style="position:relative;width:${payload.width}px;height:${payload.height}px;background:${payload.background};">${payload.markup}</div>`;
        document.querySelectorAll("#__pixel_test_root input").forEach((el) => {
          const value = el.getAttribute("value");
          if (value != null) (el as HTMLInputElement).value = value;
        });
      },
      { markup: rendered.bodyMarkup, width: rendered.width, height: rendered.height, background: rendered.background }
    );
    // Wait for any web fonts referenced by the page to finish loading.
    await htmlPage.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready);
    await htmlPage.waitForTimeout(400);
    await pageScreenshotViewport(htmlPage, measured.width, measured.height, renderedPng);
    await htmlPage.close();
    await ctx.close();

    // 4) Diff
    const fs = await import("node:fs");
    const rawA = PNG.sync.read(fs.readFileSync(storybookPng));
    const rawB = PNG.sync.read(fs.readFileSync(renderedPng));
    const width = Math.min(rawA.width, rawB.width);
    const height = Math.min(rawA.height, rawB.height);
    // Crop both images to the common rect so pixelmatch sees matching row
    // strides. Without this, a 1-px subpixel rounding difference in the
    // screenshot region makes the diff fail with "Image sizes do not match".
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
      // 0.2 ignores subpixel font/rasterizer noise but still catches any
      // genuine color / structural / layout differences.
      threshold: 0.2,
      includeAA: false,
      alpha: 0.1
    });
    fs.writeFileSync(diffPng, PNG.sync.write(diff));
    const diffRegions =
      pixelsDiffered > 0
        ? await writeDiffRegionArtifacts(baseDir, a, b, diff)
        : [];
    const total = width * height;
    const percent = total > 0 ? (pixelsDiffered / total) * 100 : 0;
    const status: DiffResult["status"] =
      percent <= opts.tolerance ? "pass" : percent <= opts.tolerance * 4 ? "warn" : "fail";
    return {
      storyId,
      width,
      height,
      pixelsDiffered,
      pixelsTotal: total,
      percent,
      status,
      storybookPng,
      renderedPng,
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
      renderedPng,
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

function writeHtmlReport(report: DiffResult[], tolerance: number): string {
  const rows = report
    .map((r) => {
      const color = r.status === "pass" ? "#16a34a" : r.status === "warn" ? "#d97706" : r.status === "error" ? "#7c3aed" : "#dc2626";
      const dir = safeSegment(r.storyId);
      const anchor = `story-${dir}`;
      const regionCount = r.diffRegions?.length ?? 0;
      return `
      <tr>
        <td><code>${r.storyId}</code></td>
        <td style="color:${color};font-weight:600">${r.status.toUpperCase()}</td>
        <td style="text-align:right">${r.percent.toFixed(3)}%</td>
        <td style="text-align:right">${r.pixelsDiffered.toLocaleString()} / ${r.pixelsTotal.toLocaleString()}</td>
        <td>
          <a target="_blank" href="${dir}/storybook.png">storybook</a> ·
          <a target="_blank" href="${dir}/rendered.png">rendered</a> ·
          <a target="_blank" href="${dir}/diff.png">diff heatmap</a>
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
    <h2><code>${r.storyId}</code> <span style="color:${color}">${r.status.toUpperCase()}</span> · ${r.percent.toFixed(3)}%</h2>
    <p class="story-hint">Each card is a cropped <strong>Storybook | Rendered</strong> view at a place pixelmatch found differences (not the red heatmap).</p>
    ${diffRegionsHtml(dir, r.diffRegions!)}
  </section>`;
    })
    .join("");

  const passCount = report.filter((r) => r.status === "pass").length;
  const warnCount = report.filter((r) => r.status === "warn").length;
  const failCount = report.filter((r) => r.status === "fail").length;
  const errorCount = report.filter((r) => r.status === "error").length;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pixel diff report</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 24px; color: #111; max-width: 1200px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; margin-bottom: 32px; }
th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
th { background: #f9fafb; }
.summary { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; font-size: 16px; }
.summary div { padding: 8px 16px; background: #f3f4f6; border-radius: 8px; }
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
<h1>UniversalLayer v1.0 — schema fidelity report</h1>
<p style="font-size:12px;color:#6b7280;margin-top:-8px">PASS ≤ ${tolerance}% diff · WARN ≤ ${(tolerance * 4).toFixed(1)}%</p>
<div class="summary">
  <div>Total: <strong>${report.length}</strong></div>
  <div style="color:#16a34a">Pass: <strong>${passCount}</strong></div>
  <div style="color:#d97706">Warn: <strong>${warnCount}</strong></div>
  <div style="color:#dc2626">Fail: <strong>${failCount}</strong></div>
  <div style="color:#7c3aed">Error: <strong>${errorCount}</strong></div>
</div>
<table>
  <thead>
    <tr><th>Story ID</th><th>Status</th><th>Diff %</th><th>Pixels</th><th>Artifacts</th><th>Note</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
${storySections ? `<h2 id="hotspots">Diff hotspots (Storybook vs Rendered)</h2>${storySections}` : ""}
</body></html>`;
}

(async () => {
  const opts = parseCli();
  if (opts.stories.length === 0) {
    opts.stories = await discoverAllStories(opts.baseUrl);
  }
  const repoRoot = resolve(process.cwd(), "../..");
  await mkdir(opts.outDir, { recursive: true });
  const browser = await chromium.launch();
  const generatedAt = new Date().toISOString();
  const suiteMeta = { generatedAt, baseUrl: opts.baseUrl, tolerance: opts.tolerance };
  const writeSuiteHtml = (results: StoryResultRecord[]) =>
    writeHtmlReport(storyResultsForHtmlReport<DiffResult>(results), opts.tolerance);
  const report = await runStoriesPool(
    opts.stories,
    async (storyId) => {
      process.stdout.write(`▶ ${storyId} ... `);
      return diffStory(storyId, opts, browser);
    },
    getDefaultConcurrency("pixel"),
    async (_id, result) => {
      const tag =
        result.status === "pass"
          ? "✓ PASS"
          : result.status === "warn"
          ? "⚠ WARN"
          : result.status === "error"
          ? "✗ ERROR"
          : "✗ FAIL";
      console.log(`${tag} ${result.percent.toFixed(3)}%${result.error ? ` (${result.error})` : ""}`);
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
    ranResults: report,
    meta: suiteMeta,
    writeHtml: writeSuiteHtml
  });
  console.log(`\nReport: ${resolve(opts.outDir, "report.html")}`);
  const failed = report.filter((r) => r.status === "fail" || r.status === "error").length;
  process.exit(failed > 0 ? 1 : 0);
})();
