#!/usr/bin/env node
/**
 * Figma screen 4-way comparison — strict parity across all render paths.
 *
 * Captures four PNGs and pairwise-diffs at strict 0.1% (no residual paste, no relaxed gates):
 *   1. original   — Guing reference PNG (artifacts/figma-screens/<screen>.png)
 *   2. figma      — Contract → Figma live export (contractFigma step)
 *   3. storybook  — Storybook delivery story (@lab/ui component iframe)
 *   4. reactHtml  — @lab/ui playground (`Screen1` delivery package on :6108)
 *
 * Why this exists: the figma-screen "Storybook" step composites reference pixels back in
 * (compositeResidualFromRef) so it can show 0% while Storybook↔Figma live differs ~3%.
 *
 *   node scripts/figma-screen-four-way-test.mjs
 *   node scripts/figma-screen-four-way-test.mjs --artifact path/to.manifest.json
 */

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  FIGMA_SCREEN_REGION_TOLERANCE_PERCENT,
  alignParityPair,
  diffAlignedPair,
} from "./figma-screen-reference-align.mjs";
import {
  discoverFigmaScreens,
  mergeFigmaScreenReport,
  writeScreenStepResult,
  readScreenStepResult,
  safeScreenSegment,
} from "./figma-screen-portfolio.mjs";
import { storyIdForScreen } from "./figma-screen-story-map.mjs";

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const playwrightPkg = resolve(WORKSPACE, "packages/pixel-test/node_modules/playwright");
const { chromium } = require(existsSync(playwrightPkg) ? playwrightPkg : "playwright");
const _pngjs = require("pngjs");
const { PNG } = _pngjs.PNG ? _pngjs : (_pngjs.default ?? _pngjs);

const DIFFS_DIR = join(WORKSPACE, "figma-screen-diffs");
const DEFAULT_TOLERANCE = 0.1;
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://127.0.0.1:6107";
const PLAYGROUND_URL = process.env.PLAYGROUND_URL ?? "http://127.0.0.1:6108";

const LEGS = [
  { id: "original", label: "Original PNG", file: "original.png" },
  { id: "figma", label: "Figma rendered", file: "figma.png" },
  { id: "storybook", label: "Storybook (@lab/ui)", file: "storybook.png" },
  { id: "reactHtml", label: "@lab/ui playground", file: "reactHtml.png" },
];

const PAIRS = [
  ["original", "figma"],
  ["original", "storybook"],
  ["original", "reactHtml"],
  ["figma", "storybook"],
  ["figma", "reactHtml"],
  ["storybook", "reactHtml"],
];

function parseCli() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v.startsWith("--") && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) {
      args.set(v.slice(2), process.argv[i + 1]);
      i++;
    }
  }
  return {
    artifact: args.get("artifact") ?? null,
    tolerance: Number(args.get("tolerance") ?? DEFAULT_TOLERANCE),
  };
}

function comparePngBuffers(aBuf, bBuf, tolerance) {
  const aligned = alignParityPair(aBuf, bBuf);
  const diff = diffAlignedPair(aligned.refPng, aligned.rendPng, FIGMA_SCREEN_REGION_TOLERANCE_PERCENT);
  const globalOk = diff.diffPct <= tolerance;
  const status =
    globalOk && diff.regionGate.pass ? "pass" : diff.diffPct <= tolerance * 4 ? "warn" : "fail";
  return {
    width: diff.w,
    height: diff.h,
    pixelsDiffered: diff.diffPixels,
    pixelsTotal: diff.totalPixels,
    percent: diff.diffPct,
    status,
    diffPng: PNG.sync.write(diff.diffPng),
    regions: diff.regionGate.regions,
    worstRegion: diff.regionGate.worst,
    parityMeta: aligned.meta,
  };
}

async function screenshotStorybookStory(page, storyId, outPath) {
  await page.goto(`${STORYBOOK_URL}/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  await page.addStyleTag({
    content: `*,*::before,*::after{animation-play-state:paused!important;transition:none!important;}`,
  });
  await page.waitForSelector("[data-figma-component]", { state: "attached" });
  const el = await page.$("[data-figma-component]");
  if (!el) throw new Error(`Story ${storyId}: [data-figma-component] not found`);
  const box = await el.boundingBox();
  if (!box) throw new Error(`Story ${storyId}: no bounding box`);
  await page.setViewportSize({
    width: Math.max(1, Math.round(box.width)),
    height: Math.max(1, Math.round(box.height)),
  });
  await page.evaluate(() => {
    document.documentElement.style.margin = "0";
    document.body.style.margin = "0";
  });
  await el.screenshot({ path: outPath, omitBackground: false, scale: "css" });
}

async function screenshotPlaygroundStory(page, storyId, outPath) {
  await page.goto(`${PLAYGROUND_URL}/?story=${encodeURIComponent(storyId)}`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  await page.addStyleTag({
    content: `*,*::before,*::after{animation-play-state:paused!important;transition:none!important;}`,
  });
  await page.waitForSelector("[data-figma-component]", { state: "attached" });
  const el = await page.$("[data-figma-component]");
  if (!el) throw new Error(`Playground ${storyId}: [data-figma-component] not found`);
  await el.screenshot({ path: outPath, omitBackground: false });
}

function writeHtmlReport(outDir, screenId, storyId, legs, pairs, tolerance) {
  const rel = (name) => name;
  const legCards = legs
    .map(
      (l) => `<figure><figcaption><strong>${l.label}</strong><br><code>${l.file}</code></figcaption><img src="${rel(l.file)}" alt="${l.label}"></figure>`
    )
    .join("\n");
  const pairRows = pairs
    .map((p) => {
      const icon = p.status === "pass" ? "✓" : p.status === "warn" ? "⚠" : "✗";
      const worst =
        p.worstRegion?.pct > 0
          ? ` · worst hotspot ${p.worstRegion.name} ${p.worstRegion.pct.toFixed(3)}%`
          : "";
      return `<tr class="${p.status}"><td>${icon} ${p.a} ↔ ${p.b}</td><td>${p.percent.toFixed(3)}%</td><td>${p.status}</td><td><a href="${rel(p.diffFile)}">diff</a>${worst}</td></tr>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>4-way — ${screenId}</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;background:#0f172a;color:#e2e8f0}
h1{margin:0 0 8px} p{color:#94a3b8}
.grid{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:16px;margin:24px 0}
figure{margin:0;background:#1e293b;border-radius:8px;padding:12px}
figure img{width:100%;height:auto;border-radius:4px;background:#fff}
table{border-collapse:collapse;width:100%;margin-top:16px}
th,td{border:1px solid #334155;padding:8px 12px;text-align:left}
tr.pass td:nth-child(3){color:#4ade80} tr.warn td:nth-child(3){color:#fbbf24} tr.fail td:nth-child(3){color:#f87171}
.note{background:#422006;border:1px solid #92400e;border-radius:8px;padding:12px;margin:16px 0;color:#fde68a}
</style></head><body>
<h1>4-way comparison — ${screenId}</h1>
<p>Storybook story: <code>${storyId ?? "—"}</code> · strict gate ≤ ${tolerance}% global + hotspot</p>
<div class="note">Delivery <strong>Screen1</strong> uses the Contract → Figma live PNG. The figma-screen Storybook step still uses residual compositing for contract HTML debugging.</div>
<div class="grid">${legCards}</div>
<h2>Pairwise diffs (strict ${tolerance}%)</h2>
<table><thead><tr><th>Pair</th><th>Global %</th><th>Status</th><th>Artifacts</th></tr></thead><tbody>${pairRows}</tbody></table>
</body></html>`;
  return writeFile(join(outDir, "report.html"), html, "utf8");
}

async function testScreen({ manifestPath, pngPath, screenId }, tolerance) {
  const name = basename(manifestPath)
    .replace(/\.manifest\.json$/, "")
    .replace(/-manifest\.json$/, "");
  const itemDir = join(DIFFS_DIR, safeScreenSegment(name), "fourWay");
  await mkdir(itemDir, { recursive: true });

  const storyId = storyIdForScreen(name);
  console.log(`\n[four-way] ${name}${storyId ? ` (story ${storyId})` : ""}`);

  const figmaStep = readScreenStepResult(WORKSPACE, name, "contractFigma");
  if (figmaStep?.status !== "pass" && figmaStep?.status !== "warn") {
    const msg = "Blocked — run Contract → Figma first";
    console.log(`  ✗ ${msg}`);
    writeScreenStepResult(WORKSPACE, name, "fourWay", { status: "not_tested", error: msg });
    return { name, status: "error", error: msg };
  }

  if (!existsSync(pngPath)) {
    const msg = "Missing reference PNG";
    writeScreenStepResult(WORKSPACE, name, "fourWay", { status: "error", error: msg });
    return { name, status: "error", error: msg };
  }

  if (!storyId) {
    const msg = `No Storybook story mapped — add to scripts/figma-screen-story-map.mjs`;
    console.log(`  ✗ ${msg}`);
    writeScreenStepResult(WORKSPACE, name, "fourWay", { status: "error", error: msg });
    return { name, status: "error", error: msg };
  }

  try {
    const refBuf = await readFile(pngPath);
    const figmaLegacyPath = join(DIFFS_DIR, safeScreenSegment(name), "rendered.png");
    const figmaBuf = existsSync(figmaLegacyPath)
      ? await readFile(figmaLegacyPath)
      : null;
    if (!figmaBuf) throw new Error("Missing contractFigma rendered.png");

    const paths = Object.fromEntries(LEGS.map((l) => [l.id, join(itemDir, l.file)]));

    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await copyFile(pngPath, paths.original);
      await writeFile(paths.figma, figmaBuf);
      await screenshotStorybookStory(page, storyId, paths.storybook);
      await screenshotPlaygroundStory(page, storyId, paths.reactHtml);
    } finally {
      await browser.close();
    }

    const legBuffers = {};
    for (const leg of LEGS) {
      legBuffers[leg.id] = await readFile(paths[leg.id]);
    }

    const pairResults = [];
    let worstPair = { percent: 0, a: "", b: "" };
    for (const [a, b] of PAIRS) {
      const cmp = comparePngBuffers(legBuffers[a], legBuffers[b], tolerance);
      const diffFile = `diff-${a}-${b}.png`;
      await writeFile(join(itemDir, diffFile), cmp.diffPng);
      const row = {
        a,
        b,
        aLabel: LEGS.find((l) => l.id === a)?.label ?? a,
        bLabel: LEGS.find((l) => l.id === b)?.label ?? b,
        ...cmp,
        diffFile,
      };
      pairResults.push(row);
      if (cmp.percent > worstPair.percent) worstPair = { percent: cmp.percent, a, b };
      const icon = cmp.status === "pass" ? "✓" : cmp.status === "warn" ? "⚠" : "✗";
      console.log(`  ${icon} ${a} ↔ ${b}: ${cmp.percent.toFixed(3)}%`);
    }

    const keyPair = pairResults.find((p) => p.a === "figma" && p.b === "storybook") ?? worstPair;
    const status = pairResults.some((p) => p.status === "fail")
      ? "fail"
      : pairResults.some((p) => p.status === "warn")
        ? "warn"
        : "pass";
    const icon = status === "pass" ? "✓" : status === "warn" ? "⚠" : "✗";
    console.log(
      `  ${icon} ${status.toUpperCase()} — worst pair ${worstPair.a}↔${worstPair.b} ${worstPair.percent.toFixed(3)}% (figma↔storybook ${keyPair.percent?.toFixed(3) ?? "?"}%)`
    );

    await writeHtmlReport(itemDir, name, storyId, LEGS, pairResults, tolerance);

    writeScreenStepResult(WORKSPACE, name, "fourWay", {
      status,
      percent: keyPair.percent,
      worstPairPercent: worstPair.percent,
      storyId,
      tolerance,
      pairs: pairResults.map((p) => ({
        a: p.a,
        b: p.b,
        percent: p.percent,
        status: p.status,
        diffFile: join(itemDir, p.diffFile),
        worstRegion: p.worstRegion,
      })),
      legs: Object.fromEntries(LEGS.map((l) => [l.id, join(itemDir, l.file)])),
      reportHtml: join(itemDir, "report.html"),
    });

    return { name, status, percent: keyPair.percent, storyId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ERROR — ${msg}`);
    writeScreenStepResult(WORKSPACE, name, "fourWay", { status: "error", error: msg });
    return { name, status: "error", error: msg };
  }
}

async function main() {
  const { artifact, tolerance } = parseCli();
  let screens = discoverFigmaScreens(WORKSPACE);
  if (artifact) {
    const manifestPath = resolve(artifact);
    const pngPath = manifestPath
      .replace(/\.manifest\.json$/, ".png")
      .replace(/-manifest\.json$/, ".png");
    screens = [{ screenId: basename(manifestPath).replace(/\.manifest\.json$/, ""), manifestPath, pngPath }];
  }
  if (screens.length === 0) {
    console.log("[four-way] No manifests in artifacts/figma-screens/");
    process.exit(0);
  }

  const results = [];
  for (const screen of screens) {
    results.push(await testScreen(screen, tolerance));
  }
  mergeFigmaScreenReport(WORKSPACE);
  const failed = results.filter((r) => r.status === "fail" || r.status === "error").length;
  console.log(`\n[four-way] Done — ${results.length - failed}/${results.length} pass`);
  console.log(`Report dirs: ${DIFFS_DIR}/<screen>/fourWay/report.html`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[four-way] Fatal:", err.message);
  process.exit(1);
});
