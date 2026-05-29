/**
 * Delivery pixel-diff — Storybook vs @lab/ui (Vite playground) vs Figma render.
 *
 * Proves the developer package matches the lab fixture and Figma output.
 *
 * Prerequisites:
 *   pnpm storybook:build && pnpm storybook:serve   (port 6107)
 *   pnpm playground:build && pnpm playground:serve (port 6108)
 *
 * CLI mirrors figma-test.ts; default outDir is ../../delivery-diffs
 */

import { chromium, type Page } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractStoryV2 } from "../../extractor-playwright/src/extract.ts";
import type { UniversalDocumentV2 } from "@lab/contract";
import {
  QUICK_SMOKE,
  GOLDEN_SET,
  isDevPackageStory,
  isLargeFixtureStory
} from "../../contract/src/stories.ts";
import { figma, installFigmaMock, type MockFrameNode, type MockNode } from "./figma-mock.ts";
import { sceneToBodyMarkup } from "./scene-to-html.ts";
import { comparePngFiles, worstStatus, type CompareStatus } from "./compare-png.ts";
import { DEFAULT_DIFF_TOLERANCE_PERCENT, DELIVERY_DEV_TOLERANCE_PERCENT, MOCK_LARGE_FIXTURE_GLOBAL_TOLERANCE_PERCENT } from "./test-tolerance.ts";
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
  storybookUrl: string;
  playgroundUrl: string;
  outDir: string;
  tolerance: number;
  stories: string[];
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
  const storybookUrl = args.get("storybookUrl") ?? args.get("url") ?? "http://127.0.0.1:6107";
  const playgroundUrl = args.get("playgroundUrl") ?? "http://127.0.0.1:6108";
  const outDir = resolve(process.cwd(), args.get("outDir") ?? "../../delivery-diffs");
  const tolerance = Number(args.get("tolerance") ?? String(DEFAULT_DIFF_TOLERANCE_PERCENT));
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
  return {
    storybookUrl,
    playgroundUrl,
    outDir,
    tolerance,
    stories,
    strict: flags.has("strict"),
    noGate: flags.has("no-gate") || gateDisabled({})
  };
}

function safeSegment(input: string): string {
  return input
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

interface RendererBundle {
  render: (doc: UniversalDocumentV2) => Promise<MockNode>;
  reset: () => void;
}

async function loadRenderer(): Promise<RendererBundle> {
  installFigmaMock();
  const mod = (await import("../../figma-importer-plugin/src/code-v2.ts")) as unknown as {
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

interface LegResult {
  percent: number;
  status: CompareStatus;
  diffPng: string;
}

interface DeliveryResult {
  storyId: string;
  hasDevPackage: boolean;
  width: number;
  height: number;
  status: CompareStatus | "error" | "skipped";
  error?: string;
  storybookVsFigma?: LegResult;
  storybookVsDev?: LegResult;
  devVsFigma?: LegResult;
  storybookPng: string;
  figmaPng: string;
  developerPng?: string;
}

async function screenshotFigmaRender(
  page: Page,
  storybookUrl: string,
  storyId: string,
  markup: { html: string; width: number; height: number },
  background: string,
  outPath: string,
  size: { width: number; height: number }
): Promise<void> {
  await page.goto(`${storybookUrl}/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: "networkidle"
  });
  await page.evaluate(
    (payload: { markup: string; width: number; height: number; background: string }) => {
      document.body.style.margin = "0";
      document.body.style.padding = "0";
      document.body.style.background = payload.background;
      document.body.innerHTML = `<div id="__figma_test_root" style="position:relative;width:${payload.width}px;height:${payload.height}px;background:${payload.background};">${payload.markup}</div>`;
    },
    { markup: markup.html, width: markup.width, height: markup.height, background }
  );
  await page.evaluate(
    () => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready
  );
  await page.waitForTimeout(200);
  await pageScreenshotViewport(page, size.width, size.height, outPath);
}

async function diffStory(
  storyId: string,
  opts: CliOpts,
  browser: import("playwright").Browser,
  renderer: RendererBundle
): Promise<DeliveryResult> {
  const safe = safeSegment(storyId);
  const baseDir = resolve(opts.outDir, safe);
  await mkdir(baseDir, { recursive: true });
  const storybookPng = resolve(baseDir, "storybook.png");
  const figmaPng = resolve(baseDir, "figma.png");
  const developerPng = resolve(baseDir, "developer.png");
  const artifactPath = resolve(baseDir, "artifact.v2.json");
  const hasDev = isDevPackageStory(storyId);

  try {
    await extractStoryV2(storyId, artifactPath, opts.storybookUrl);
    const doc = JSON.parse(await readFile(artifactPath, "utf8")) as UniversalDocumentV2;

    figma.__reset();
    renderer.reset();
    const canvas = (await renderer.render(doc)) as MockFrameNode;
    const root = canvas.children[0] as MockFrameNode | undefined;
    if (!root) throw new Error("Renderer produced no root child");
    const rendered = sceneToBodyMarkup({ ...root, x: 0, y: 0 } as MockFrameNode);
    const background = doc.meta?.canvasBackground ?? "#ffffff";

    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
    const sbPage = await ctx.newPage();
    await sbPage.addInitScript("var __name = (target) => target;");
    await sbPage.goto(`${opts.storybookUrl}/iframe.html?id=${storyId}&viewMode=story`, {
      waitUntil: "networkidle"
    });
    await sbPage.addStyleTag({
      content: `*,*::before,*::after{animation-play-state:paused !important;transition:none !important;}`
    });
    const measured = await pageScreenshotElement(sbPage, "[data-figma-component]", storybookPng);
    await sbPage.close();

    const figmaPage = await ctx.newPage();
    await figmaPage.addInitScript("var __name = (target) => target;");
    await screenshotFigmaRender(
      figmaPage,
      opts.storybookUrl,
      storyId,
      rendered,
      background,
      figmaPng,
      measured
    );
    await figmaPage.close();

    if (hasDev) {
      const devPage = await ctx.newPage();
      await devPage.addInitScript("var __name = (target) => target;");
      await devPage.goto(`${opts.playgroundUrl}/?story=${encodeURIComponent(storyId)}`, {
        waitUntil: "networkidle"
      });
      await devPage.addStyleTag({
        content: `*,*::before,*::after{animation-play-state:paused !important;transition:none !important;}`
      });
      await devPage.waitForLoadState("networkidle");
      await pageScreenshotElement(devPage, "[data-figma-component]", developerPng);
      await devPage.close();
    }

    await ctx.close();

    const figmaTolerance = isLargeFixtureStory(storyId)
      ? MOCK_LARGE_FIXTURE_GLOBAL_TOLERANCE_PERCENT
      : opts.tolerance;

    const diffSbFigma = comparePngFiles(
      storybookPng,
      figmaPng,
      resolve(baseDir, "diff-storybook-figma.png"),
      figmaTolerance
    );

    let storybookVsFigma: LegResult = {
      percent: diffSbFigma.percent,
      status: diffSbFigma.status,
      diffPng: diffSbFigma.diffPngPath
    };

    let storybookVsDev: LegResult | undefined;
    let devVsFigma: LegResult | undefined;

    if (hasDev) {
      const devTolerance =
        diffSbFigma.status === "pass"
          ? isLargeFixtureStory(storyId)
            ? figmaTolerance
            : Math.max(opts.tolerance, DELIVERY_DEV_TOLERANCE_PERCENT)
          : opts.tolerance;
      const diffSbDev = comparePngFiles(
        storybookPng,
        developerPng,
        resolve(baseDir, "diff-storybook-dev.png"),
        devTolerance
      );
      const diffDevFigma = comparePngFiles(
        developerPng,
        figmaPng,
        resolve(baseDir, "diff-dev-figma.png"),
        devTolerance
      );
      storybookVsDev = {
        percent: diffSbDev.percent,
        status: diffSbDev.status,
        diffPng: diffSbDev.diffPngPath
      };
      devVsFigma = {
        percent: diffDevFigma.percent,
        status: diffDevFigma.status,
        diffPng: diffDevFigma.diffPngPath
      };
    }

    const status = hasDev
      ? worstStatus(
          storybookVsFigma.status,
          storybookVsDev!.status,
          devVsFigma!.status
        )
      : storybookVsFigma.status;

    return {
      storyId,
      hasDevPackage: hasDev,
      width: measured.width,
      height: measured.height,
      status,
      storybookVsFigma,
      storybookVsDev,
      devVsFigma,
      storybookPng,
      figmaPng,
      developerPng: hasDev ? developerPng : undefined
    };
  } catch (error) {
    return {
      storyId,
      hasDevPackage: hasDev,
      width: 0,
      height: 0,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      storybookPng,
      figmaPng,
      developerPng: hasDev ? developerPng : undefined
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
  return `${(100 - diffPercent).toFixed(2)}%`;
}

function legCell(leg?: LegResult): string {
  if (!leg) return '<span class="metric-sub">n/a</span>';
  const color =
    leg.status === "pass" ? "#16a34a" : leg.status === "warn" ? "#d97706" : "#dc2626";
  return `<span class="metric-primary" style="color:${color}">${formatMatchPercent(leg.percent)}</span><span class="metric-sub">${leg.status.toUpperCase()}</span>`;
}

function writeHtmlReport(report: DeliveryResult[], tolerance: number): string {
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
      const devLink = r.developerPng
        ? `<a target="_blank" href="${dir}/developer.png">developer</a> · `
        : "";
      return `<tr>
        <td><code>${r.storyId}</code></td>
        <td style="color:${color};font-weight:600">${String(r.status).toUpperCase()}</td>
        <td>${legCell(r.storybookVsDev)}</td>
        <td>${legCell(r.storybookVsFigma)}</td>
        <td>${legCell(r.devVsFigma)}</td>
        <td>
          <a target="_blank" href="${dir}/storybook.png">storybook</a> ·
          ${devLink}
          <a target="_blank" href="${dir}/figma.png">figma</a>
        </td>
        <td>${r.error ? `<small style="color:#dc2626">${r.error}</small>` : ""}</td>
      </tr>`;
    })
    .join("");

  const passCount = report.filter((r) => r.status === "pass").length;
  const warnCount = report.filter((r) => r.status === "warn").length;
  const failCount = report.filter((r) => r.status === "fail").length;
  const errorCount = report.filter((r) => r.status === "error").length;

  const sections = report
    .filter((r) => r.hasDevPackage && r.developerPng)
    .map((r) => {
      const dir = safeSegment(r.storyId);
      return `
  <section class="story-section">
    <h2><code>${r.storyId}</code></h2>
    <div class="triple">
      <figure><figcaption>Storybook</figcaption><img src="${dir}/storybook.png" alt="storybook" /></figure>
      <figure><figcaption>@lab/ui (Vite)</figcaption><img src="${dir}/developer.png" alt="developer" /></figure>
      <figure><figcaption>Figma render</figcaption><img src="${dir}/figma.png" alt="figma" /></figure>
    </div>
    <p class="story-hint">
      <a href="${dir}/diff-storybook-dev.png">SB vs Dev diff</a> ·
      <a href="${dir}/diff-storybook-figma.png">SB vs Figma diff</a> ·
      <a href="${dir}/diff-dev-figma.png">Dev vs Figma diff</a>
    </p>
  </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Developer delivery — pixel-diff report</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 24px; color: #111; max-width: 1400px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; margin-bottom: 32px; }
th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
th { background: #f9fafb; }
.summary { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.summary div { padding: 8px 16px; background: #f3f4f6; border-radius: 8px; }
.metric-primary { display: block; font-weight: 600; }
.metric-sub { display: block; font-size: 11px; color: #6b7280; margin-top: 2px; }
code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
.story-section { margin: 40px 0; padding-top: 24px; border-top: 2px solid #e5e7eb; }
.story-hint { font-size: 13px; color: #6b7280; }
.triple { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.triple img { max-width: 100%; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
.triple figcaption { font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; }
</style></head><body>
<h1>Developer delivery — pixel-diff report</h1>
<p>Three-way check per story: <strong>Storybook</strong> (extraction source) · <strong>@lab/ui</strong> in the Vite playground · <strong>Figma</strong> via <code>code-v2.ts</code>. PASS when each leg is within ${tolerance}% diff.</p>
<div class="summary">
  <div>Total: <strong>${report.length}</strong></div>
  <div style="color:#16a34a">Pass: <strong>${passCount}</strong></div>
  <div style="color:#d97706">Warn: <strong>${warnCount}</strong></div>
  <div style="color:#dc2626">Fail: <strong>${failCount}</strong></div>
  <div style="color:#7c3aed">Error: <strong>${errorCount}</strong></div>
</div>
<table>
  <thead><tr>
    <th>Story</th><th>Overall</th><th>SB vs @lab/ui</th><th>SB vs Figma</th><th>Dev vs Figma</th><th>PNGs</th><th>Note</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<h2>Visual comparison</h2>${sections}
</body></html>`;
}

(async () => {
  const opts = parseCli();
  const renderer = await loadRenderer();
  if (opts.stories.length === 0) {
    opts.stories = await discoverAllStories(opts.storybookUrl);
  }
  const repoRoot = resolve(process.cwd(), "../..");
  await mkdir(opts.outDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const suiteMeta = { generatedAt, tolerance: opts.tolerance };
  const toPortfolioRow = (r: DeliveryResult | StoryResultRecord): StoryResultRecord => {
    if ("storybookVsFigma" in r && "hasDevPackage" in r) {
      const row = r as DeliveryResult;
      return {
        ...row,
        percent: row.storybookVsFigma?.percent ?? 0,
        status: row.status,
        testedAt: new Date().toISOString()
      };
    }
    const row = r as StoryResultRecord;
    return { ...row, testedAt: row.testedAt ?? new Date().toISOString() };
  };
  const writeSuiteHtml = (results: StoryResultRecord[]) =>
    writeHtmlReport(storyResultsForHtmlReport<DeliveryResult>(results), opts.tolerance);
  const browser = await chromium.launch();
  const report = await runStoriesPool(
    opts.stories,
    async (storyId) => {
      process.stdout.write(`▶ ${storyId} ... `);
      const gate = await assertStoryStepGate({
        repoRoot,
        storyId,
        stepId: "delivery",
        noGate: opts.noGate
      });
      if (!gate.allowed) {
        console.log(`⊘ SKIP (${gate.reason})`);
        return gateSkippedResult(storyId, gate.reason);
      }
      return diffStory(storyId, opts, browser, renderer);
    },
    getDefaultConcurrency("delivery"),
    async (_id, result) => {
      if (result.status === "skipped") {
        console.log(`⊘ SKIP ${result.error ?? ""}`);
        return;
      }
      const devNote = result.storybookVsDev
        ? ` dev ${result.storybookVsDev.percent.toFixed(2)}%`
        : "";
      console.log(
        `${result.status.toUpperCase()} sb↔figma ${result.storybookVsFigma?.percent.toFixed(2) ?? "?"}%${devNote}${result.error ? ` (${result.error})` : ""}`
      );
      await persistStoryProgress({
        outDir: opts.outDir,
        repoRoot,
        result: toPortfolioRow(result),
        meta: suiteMeta,
        writeHtml: writeSuiteHtml
      });
    }
  );
  await browser.close();

  const portfolioRows: StoryResultRecord[] = report
    .filter((r) => r.status !== "skipped")
    .map(toPortfolioRow);

  await finalizeHarnessRun({
    outDir: opts.outDir,
    repoRoot,
    ranResults: portfolioRows,
    meta: suiteMeta,
    writeHtml: writeSuiteHtml
  });

  const failCount = report.filter((r) => r.status === "fail").length;
  const errorCount = report.filter((r) => r.status === "error").length;
  console.log(`\nReport: ${resolve(opts.outDir, "report.html")}`);
  const hardFailures = errorCount + (opts.strict ? failCount : 0);
  process.exit(hardFailures > 0 ? 1 : 0);
})();
