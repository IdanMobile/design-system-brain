#!/usr/bin/env node
/**
 * Storybook entry — Original parity (golden storybook.png vs 3 legs).
 *
 * Original = pixel-diffs/<story>/storybook.png (frozen Storybook capture).
 * Legs:
 *   Original → Figma live
 *   Original → Storybook (re-capture)
 *   Original → ReactHtml (playground)
 *
 *   node scripts/storybook-parity-test.mjs
 *   node scripts/storybook-parity-test.mjs --story lab-button-primary
 */

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { existsSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadPortfolioStoryIds } from "./test-portfolio-config.mjs";
import {
  PIXEL_PERFECT_TOLERANCE,
  statusFromGates,
} from "./pixel-perfect-tolerance.mjs";
import {
  buildTestReport,
  exportOriginalTargetRegions,
  writeTestReportFile,
  removeTestReportFiles,
} from "./test-report-build.mjs";

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(WORKSPACE, "storybook-parity-diffs");
const PIXEL_DIR = join(WORKSPACE, "pixel-diffs");
const require = createRequire(import.meta.url);
const playwrightPkg = resolve(WORKSPACE, "packages/pixel-test/node_modules/playwright");
const { chromium } = require(existsSync(playwrightPkg) ? playwrightPkg : "playwright");
const _pixelmatch = require("pixelmatch");
const pixelmatch = typeof _pixelmatch === "function" ? _pixelmatch : (_pixelmatch.default ?? _pixelmatch);
const _pngjs = require("pngjs");
const { PNG } = _pngjs.PNG ? _pngjs : (_pngjs.default ?? _pngjs);

const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://127.0.0.1:6107";
const PLAYGROUND_URL = process.env.PLAYGROUND_URL ?? "http://127.0.0.1:6108";

function safeStorySegment(storyId) {
  return String(storyId)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const LEGS = [
  { stepId: "vsFigmaLive", id: "figmaLive", label: "Figma live", file: "figmaLive.png", source: "figma-live" },
  { stepId: "vsStorybook", id: "storybook", label: "Storybook", file: "storybook.png", source: "capture" },
  { stepId: "vsReactHtml", id: "reactHtml", label: "ReactHtml", file: "reactHtml.png", source: "playground" },
];

function parseCli() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v.startsWith("--") && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) {
      args.set(v.slice(2), process.argv[i + 1]);
      i++;
    } else if (v.startsWith("--")) {
      args.set(v.slice(2), "true");
    }
  }
  return {
    story: args.get("story") ?? null,
    tolerance: Number(args.get("tolerance") ?? PIXEL_PERFECT_TOLERANCE),
  };
}

function matchDimensions(refBuf, rendBuf) {
  const ref = PNG.sync.read(refBuf);
  const rend = PNG.sync.read(rendBuf);
  const w = Math.min(ref.width, rend.width);
  const h = Math.min(ref.height, rend.height);
  const crop = (png) => {
    if (png.width === w && png.height === h) return PNG.sync.write(png);
    const out = new PNG({ width: w, height: h });
    PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
    return PNG.sync.write(out);
  };
  return { ref: crop(ref), rend: crop(rend), w, h };
}

function comparePng(originalBuf, targetBuf, tolerance) {
  const { ref, rend, w, h } = matchDimensions(originalBuf, targetBuf);
  const a = PNG.sync.read(ref);
  const b = PNG.sync.read(rend);
  const diff = new PNG({ width: w, height: h });
  const pixelsDiffered = pixelmatch(a.data, b.data, diff.data, w, h, {
    threshold: 0.1,
    includeAA: false,
    alpha: 0.1,
  });
  const total = w * h;
  const percent = total > 0 ? (pixelsDiffered / total) * 100 : 0;
  const status = statusFromGates(percent, 0);
  return {
    width: w,
    height: h,
    pixelsDiffered,
    pixelsTotal: total,
    percent,
    status,
    diffPng: PNG.sync.write(diff),
  };
}

function writeStepResult(storyId, stepId, payload) {
  const dir = join(OUT_DIR, "by-story", safeStorySegment(storyId), stepId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "result.json");
  writeFileSync(
    path,
    JSON.stringify(
      {
        ...payload,
        storyId,
        stepId,
        testedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  return { dir, path };
}

async function screenshotStory(page, storyId, outPath) {
  const url = `${STORYBOOK_URL}/iframe.html?id=${storyId}&viewMode=story`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-figma-component]", { timeout: 15000 });
  const el = page.locator("[data-figma-component]").first();
  await el.screenshot({ path: outPath });
}

async function screenshotPlayground(page, storyId, outPath) {
  const url = `${PLAYGROUND_URL}/?story=${encodeURIComponent(storyId)}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: outPath, fullPage: false });
}

function originalGoldenPath(storyId) {
  const seg = safeStorySegment(storyId);
  const candidates = [
    join(PIXEL_DIR, seg, "storybook.png"),
    join(PIXEL_DIR, "by-story", seg, "result.json"),
  ];
  if (existsSync(candidates[0])) return candidates[0];
  return null;
}

async function testStory(storyId, tolerance) {
  const goldenPath = originalGoldenPath(storyId);
  if (!goldenPath) {
    console.log(`  ⚠ SKIP — no golden storybook.png (run pixel test first)`);
    for (const leg of LEGS) {
      writeStepResult(storyId, leg.stepId, {
        status: "not_tested",
        error: "Missing pixel-diffs golden storybook.png",
      });
    }
    return { storyId, status: "skip" };
  }

  const itemDir = join(OUT_DIR, safeStorySegment(storyId));
  await mkdir(itemDir, { recursive: true });
  const originalPath = join(itemDir, "original.png");
  await copyFile(goldenPath, originalPath);
  const originalBuf = await readFile(originalPath);

  const paths = {
    figmaLive: join(PIXEL_DIR, safeStorySegment(storyId), "figma.png"),
    storybook: join(itemDir, "storybook.png"),
    reactHtml: join(itemDir, "reactHtml.png"),
  };

  if (!existsSync(paths.figmaLive)) {
    const liveAlt = join(WORKSPACE, "figma-live-diffs", safeStorySegment(storyId), "figma.png");
    if (existsSync(liveAlt)) paths.figmaLive = liveAlt;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await screenshotStory(page, storyId, paths.storybook);
    await screenshotPlayground(page, storyId, paths.reactHtml);
  } finally {
    await browser.close();
  }

  const buffers = {};
  for (const leg of LEGS) {
    if (leg.id === "figmaLive" && !existsSync(paths.figmaLive)) {
      writeStepResult(storyId, leg.stepId, {
        status: "not_tested",
        error: "Run figma live test first",
      });
      continue;
    }
    buffers[leg.id] = await readFile(paths[leg.id === "figmaLive" ? "figmaLive" : leg.id]);
    const cmp = comparePng(originalBuf, buffers[leg.id], tolerance);
    const diffFile = join(itemDir, `diff-original-${leg.id}.png`);
    await writeFile(diffFile, cmp.diffPng);

    let testReportPath = null;
    const stepDir = join(OUT_DIR, "by-story", safeStorySegment(storyId), leg.stepId);
    if (cmp.status !== "pass") {
      const report = buildTestReport({
        itemId: storyId,
        entryPoint: "storybook",
        testId: leg.stepId,
        status: cmp.status,
        percent: cmp.percent,
        maxRegionPercent: null,
        pixelsDiffered: cmp.pixelsDiffered,
        pixelsTotal: cmp.pixelsTotal,
        images: {
          original: originalPath,
          target: paths[leg.id === "figmaLive" ? "figmaLive" : leg.id],
          diff: diffFile,
        },
        regionMismatches: [],
        ctx: { storyId },
        tolerance,
      });
      testReportPath = writeTestReportFile(stepDir, report, WORKSPACE);
    } else {
      removeTestReportFiles(stepDir);
    }

    writeStepResult(storyId, leg.stepId, {
      status: cmp.status,
      percent: cmp.percent,
      originalPng: originalPath,
      targetPng: paths[leg.id === "figmaLive" ? "figmaLive" : leg.id],
      diffPng: diffFile,
      testReportPath,
    });
    const icon = cmp.status === "pass" ? "✓" : "✗";
    console.log(`  ${icon} Original → ${leg.label}: ${cmp.percent.toFixed(3)}%`);
  }

  return { storyId, status: "done" };
}

async function main() {
  const { story, tolerance } = parseCli();
  let ids = story ? [story] : await loadPortfolioStoryIds(WORKSPACE);
  ids = ids.filter((id) => !id.startsWith("screen_"));

  console.log(`[storybook-parity] ${ids.length} stories @ ${tolerance}%`);
  for (const id of ids) {
    console.log(`\n[storybook-parity] ${id}`);
    await testStory(id, tolerance);
  }
  console.log("\n[storybook-parity] Done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
