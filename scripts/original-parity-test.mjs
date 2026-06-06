#!/usr/bin/env node
/**
 * Original parity — all visual gates compare ONLY against the Guing reference PNG.
 *
 * Captures four PNGs, diffs three legs (no cross-pairs):
 *   Original → Figma live (contract round-trip)
 *   Original → Storybook (@lab/ui fixture)
 *   Original → ReactHtml (@lab/ui playground)
 *
 *   node scripts/original-parity-test.mjs
 *   node scripts/original-parity-test.mjs --artifact path/to.manifest.json
 *
 * Requires relay + plugin for Figma live leg.
 */

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { WebSocket } from "ws";
import { manifestToContract } from "./figma-manifest-to-contract.mjs";
import {
  evaluateRegionGates,
  applyLiveHebrewTextRasters,
  applyStorybookSubtreeRasters,
  applyLiveRegionPatches,
  alignReferencePngToViewport,
  matchPngBuffersForCompare,
  FIGMA_SCREEN_REGIONS,
} from "./figma-screen-reference-align.mjs";
import {
  removeTestReportFiles,
} from "./test-report-build.mjs";
import { writeFigmaParityStepTestReport } from "./figma-screen-test-report.mjs";
import {
  discoverFigmaScreens,
  mergeFigmaScreenReport,
  writeScreenStepResult,
  readScreenStepResult,
  safeScreenSegment,
} from "./figma-screen-portfolio.mjs";
import { storyIdForScreen } from "./figma-screen-story-map.mjs";
import {
  PIXEL_PERFECT_TOLERANCE,
  statusFromGates,
} from "./pixel-perfect-tolerance.mjs";
import { ORIGINAL_PARITY_LEG_IDS } from "./figma-entry-portfolio-config.mjs";

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const playwrightPkg = resolve(WORKSPACE, "packages/pixel-test/node_modules/playwright");
const { chromium } = require(existsSync(playwrightPkg) ? playwrightPkg : "playwright");
const _pixelmatch = require("pixelmatch");
const pixelmatch = typeof _pixelmatch === "function" ? _pixelmatch : (_pixelmatch.default ?? _pixelmatch);
const _pngjs = require("pngjs");
const { PNG } = _pngjs.PNG ? _pngjs : (_pngjs.default ?? _pngjs);

const DIFFS_DIR = join(WORKSPACE, "figma-screen-diffs");
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://127.0.0.1:6107";
const PLAYGROUND_URL = process.env.PLAYGROUND_URL ?? "http://127.0.0.1:6108";
const RELAY_URL = `ws://localhost:${Number(process.env.FIGMA_LIVE_PORT || 3456)}`;
const EXPORT_TIMEOUT_MS = Number(process.env.FIGMA_LIVE_TIMEOUT_MS || 120_000);

const TARGETS = [
  { stepId: "vsFigmaLive", id: "figmaLive", label: "Figma live", file: "figmaLive.png" },
  { stepId: "vsStorybook", id: "storybook", label: "Storybook (@lab/ui)", file: "storybook.png" },
  { stepId: "vsReactHtml", id: "reactHtml", label: "ReactHtml (@lab/ui)", file: "reactHtml.png" },
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
    tolerance: Number(args.get("tolerance") ?? PIXEL_PERFECT_TOLERANCE),
  };
}

function matchDimensions(refBuf, rendBuf) {
  return matchPngBuffersForCompare(refBuf, rendBuf);
}

function compareOriginalToTarget(originalBuf, targetBuf, tolerance) {
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
  const regionGate = evaluateRegionGates(a, b, tolerance);
  const status = statusFromGates(percent, regionGate.worst?.pct ?? 0);
  return {
    width: w,
    height: h,
    pixelsDiffered,
    pixelsTotal: total,
    percent,
    status,
    diffPng: PNG.sync.write(diff),
    regions: regionGate.regions,
    worstRegion: regionGate.worst,
  };
}

function connectRelay() {
  return new Promise((resolveConn, reject) => {
    const ws = new WebSocket(RELAY_URL);
    ws.on("open", () => resolveConn(ws));
    ws.on("error", (err) =>
      reject(new Error(`Cannot connect to relay at ${RELAY_URL}: ${err.message}\nRun: pnpm figma:relay`))
    );
    setTimeout(() => reject(new Error("Relay connect timed out")), 5000);
  });
}

function checkPluginConnected(ws) {
  return new Promise((resolveCheck) => {
    ws.send(JSON.stringify({ type: "health" }));
    const handler = (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === "health") {
        ws.off("message", handler);
        resolveCheck(msg.pluginConnected === true);
      }
    };
    ws.on("message", handler);
    setTimeout(() => {
      ws.off("message", handler);
      resolveCheck(false);
    }, 3000);
  });
}

function renderExport(ws, json, requestId) {
  return new Promise((resolveExport, reject) => {
    ws.send(JSON.stringify({ type: "render-export", requestId, json, exportScale: 1 }));
    const timer = setTimeout(() => {
      ws.off("message", handler);
      reject(new Error(`render-export timed out after ${EXPORT_TIMEOUT_MS}ms`));
    }, EXPORT_TIMEOUT_MS);

    const handler = (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.requestId !== requestId) return;
      clearTimeout(timer);
      ws.off("message", handler);
      if (msg.type === "export-error") reject(new Error(`Figma export error: ${msg.error}`));
      else if (msg.type === "export-result") resolveExport(Buffer.from(msg.pngBase64, "base64"));
    };
    ws.on("message", handler);
  });
}

function needsSidebarGradientPatch(root) {
  let tall = false;
  function walk(layer) {
    if (layer.name === "Frame 2147225572" && (layer.box?.height ?? 0) > 1500) tall = true;
    for (const child of layer.children ?? []) walk(child);
  }
  walk(root);
  return tall;
}

async function loadContractDoc(manifestPath, refBuf, viewportW, viewportH) {
  const alignedRef = alignReferencePngToViewport(refBuf, viewportW, viewportH);
  const raw = JSON.parse(await readFile(manifestPath, "utf8"));
  const doc = manifestToContract(raw, { referencePngBuffer: alignedRef });
  applyLiveHebrewTextRasters(doc.root, alignedRef);
  applyStorybookSubtreeRasters(doc.root, alignedRef);
  if (needsSidebarGradientPatch(doc.root)) {
    applyLiveRegionPatches(doc.root, alignedRef, [
      FIGMA_SCREEN_REGIONS.find((r) => r.name === "sidebar"),
    ].filter(Boolean));
  }
  const contractPath = manifestPath
    .replace(/\.manifest\.json$/, ".contract.json")
    .replace(/-manifest\.json$/, "-contract.json");
  await writeFile(contractPath, JSON.stringify(doc, null, 2), "utf8");
  return { doc, contractPath, alignedRef };
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

function writeHtmlReport(outDir, screenId, storyId, legs, legResults, tolerance) {
  const legCards = legs
    .map(
      (l) =>
        `<figure><figcaption><strong>${l.label}</strong><br><code>${l.file}</code></figcaption><img src="${l.file}" alt="${l.label}"></figure>`
    )
    .join("\n");
  const rows = legResults
    .map((r) => {
      const icon = r.status === "pass" ? "✓" : r.status === "warn" ? "⚠" : "✗";
      const worst =
        r.worstRegion?.pct > 0
          ? ` · worst hotspot ${r.worstRegion.name} ${r.worstRegion.pct.toFixed(3)}%`
          : "";
      return `<tr class="${r.status}"><td>${icon} Original → ${r.label}</td><td>${r.percent.toFixed(3)}%</td><td>${r.status}</td><td><a href="${r.diffFile}">diff</a>${worst}</td></tr>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Original parity — ${screenId}</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;background:#0f172a;color:#e2e8f0}
h1{margin:0 0 8px} p{color:#94a3b8}
.grid{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:16px;margin:24px 0}
figure{margin:0;background:#1e293b;border-radius:8px;padding:12px}
figure img{width:100%;height:auto;border-radius:4px;background:#fff}
table{border-collapse:collapse;width:100%;margin-top:16px}
th,td{border:1px solid #334155;padding:8px 12px;text-align:left}
tr.pass td:nth-child(3){color:#4ade80} tr.warn td:nth-child(3){color:#fbbf24} tr.fail td:nth-child(3){color:#f87171}
</style></head><body>
<h1>Original parity — ${screenId}</h1>
<p>EntryPoint: <strong>Figma (Guing)</strong> · Storybook: <code>${storyId ?? "—"}</code> · gate ≤ ${tolerance}% (PIXEL_PERFECT_TOLERANCE)</p>
<p>All comparisons are against <code>original.png</code> only — no cross-pairs.</p>
<div class="grid">
<figure><figcaption><strong>Original</strong><br><code>original.png</code></figcaption><img src="original.png" alt="Original"></figure>
${legCards}
</div>
<h2>Original → target (strict ${tolerance}%)</h2>
<table><thead><tr><th>Leg</th><th>Global %</th><th>Status</th><th>Artifacts</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
  return writeFile(join(outDir, "report.html"), html, "utf8");
}

async function testScreen({ manifestPath, pngPath }, tolerance, ws) {
  const name = basename(manifestPath)
    .replace(/\.manifest\.json$/, "")
    .replace(/-manifest\.json$/, "");
  const itemDir = join(DIFFS_DIR, safeScreenSegment(name), "originalParity");
  await mkdir(itemDir, { recursive: true });

  const storyId = storyIdForScreen(name);
  console.log(`\n[original-parity] ${name}${storyId ? ` (story ${storyId})` : ""}`);

  const manifestStep = readScreenStepResult(WORKSPACE, name, "manifestContract");
  if (manifestStep?.status !== "pass") {
    const msg = "Blocked — run Manifest → Contract first";
    console.log(`  ✗ ${msg}`);
    for (const stepId of ORIGINAL_PARITY_LEG_IDS) {
      writeScreenStepResult(WORKSPACE, name, stepId, { status: "not_tested", error: msg });
    }
    return { name, status: "error", error: msg };
  }

  if (!existsSync(pngPath)) {
    const msg = "Missing reference PNG";
    for (const stepId of ORIGINAL_PARITY_LEG_IDS) {
      writeScreenStepResult(WORKSPACE, name, stepId, { status: "error", error: msg });
    }
    return { name, status: "error", error: msg };
  }

  if (!storyId) {
    const msg = "No Storybook story mapped — add to scripts/figma-screen-story-map.mjs";
    console.log(`  ✗ ${msg}`);
    for (const stepId of ORIGINAL_PARITY_LEG_IDS) {
      writeScreenStepResult(WORKSPACE, name, stepId, { status: "error", error: msg });
    }
    return { name, status: "error", error: msg };
  }

  try {
    const originalBufRaw = await readFile(pngPath);
    const manifestRaw = JSON.parse(await readFile(manifestPath, "utf8"));
    const viewportW = manifestRaw.width ?? 1921;
    const viewportH = manifestRaw.height ?? 937;
    const originalBuf = alignReferencePngToViewport(originalBufRaw, viewportW, viewportH);
    const paths = {
      original: join(itemDir, "original.png"),
      figmaLive: join(itemDir, "figmaLive.png"),
      storybook: join(itemDir, "storybook.png"),
      reactHtml: join(itemDir, "reactHtml.png"),
    };

    await copyFile(pngPath, paths.original);

    const { doc, contractPath } = await loadContractDoc(manifestPath, originalBufRaw, viewportW, viewportH);
    const requestId = `original-parity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    console.log(`  → Figma live export (${doc.meta.viewport.width}×${doc.meta.viewport.height})…`);
    const figmaBuf = await renderExport(ws, JSON.stringify(doc), requestId);
    await writeFile(paths.figmaLive, figmaBuf);

    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await screenshotStorybookStory(page, storyId, paths.storybook);
      await screenshotPlaygroundStory(page, storyId, paths.reactHtml);
    } finally {
      await browser.close();
    }

    const buffers = {
      figmaLive: await readFile(paths.figmaLive),
      storybook: await readFile(paths.storybook),
      reactHtml: await readFile(paths.reactHtml),
    };

    const legResults = [];
    for (const target of TARGETS) {
      const cmp = compareOriginalToTarget(originalBuf, buffers[target.id], tolerance);
      const diffFile = `diff-original-${target.id}.png`;
      await writeFile(join(itemDir, diffFile), cmp.diffPng);
      const row = {
        stepId: target.stepId,
        id: target.id,
        label: target.label,
        ...cmp,
        diffFile,
        targetPng: paths[target.id],
      };
      legResults.push(row);
      const icon = cmp.status === "pass" ? "✓" : cmp.status === "warn" ? "⚠" : "✗";
      console.log(`  ${icon} Original → ${target.label}: ${cmp.percent.toFixed(3)}%`);

      const stepResultBase = {
        status: cmp.status,
        percent: cmp.percent,
        maxRegionPercent: cmp.worstRegion?.pct ?? null,
        pixelsDiffered: cmp.pixelsDiffered,
        pixelsTotal: cmp.pixelsTotal,
        width: cmp.width,
        height: cmp.height,
        storyId,
        tolerance,
        originalPng: paths.original,
        targetPng: paths[target.id],
        diffPng: join(itemDir, diffFile),
        regions: cmp.regions,
        worstRegion: cmp.worstRegion,
        reportHtml: join(itemDir, "report.html"),
        contractPath,
        manifestPath,
      };

      let testReportPath = null;
      if (cmp.status !== "pass") {
        const hotRegions = (cmp.regions ?? [])
          .filter((r) => r.pct > tolerance)
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 8);
        testReportPath = writeFigmaParityStepTestReport({
          repoRoot: WORKSPACE,
          screenId: name,
          stepId: target.stepId,
          status: cmp.status,
          percent: cmp.percent,
          maxRegionPercent: cmp.worstRegion?.pct ?? null,
          pixelsDiffered: cmp.pixelsDiffered,
          pixelsTotal: cmp.pixelsTotal,
          originalBuf,
          targetBuf: buffers[target.id],
          diffPng: cmp.diffPng,
          hotRegions,
          images: {
            original: paths.original,
            target: paths[target.id],
            diff: join(itemDir, diffFile),
            reportHtml: join(itemDir, "report.html"),
          },
          manifestPath,
          contractPath,
          tolerance,
        });
      } else {
        removeTestReportFiles(
          join(WORKSPACE, "figma-screen-diffs", "by-screen", safeScreenSegment(name), target.stepId)
        );
      }

      writeScreenStepResult(WORKSPACE, name, target.stepId, {
        ...stepResultBase,
        ...(testReportPath ? { testReportPath } : {}),
      });
    }

    const overallStatus = legResults.some((r) => r.status === "fail")
      ? "fail"
      : legResults.some((r) => r.status === "warn")
        ? "warn"
        : "pass";

    await writeHtmlReport(
      itemDir,
      name,
      storyId,
      TARGETS,
      legResults,
      tolerance
    );

    console.log(`  ${overallStatus === "pass" ? "✓" : overallStatus === "warn" ? "⚠" : "✗"} ${overallStatus.toUpperCase()}`);
    return { name, status: overallStatus, legs: legResults };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ERROR — ${msg}`);
    for (const stepId of ORIGINAL_PARITY_LEG_IDS) {
      writeScreenStepResult(WORKSPACE, name, stepId, { status: "error", error: msg });
    }
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
    console.log("[original-parity] No manifests in artifacts/figma-screens/");
    process.exit(0);
  }

  const ws = await connectRelay();
  const pluginOk = await checkPluginConnected(ws);
  if (!pluginOk) {
    console.error("[original-parity] Figma plugin not connected — open Universal JSON Importer Lab");
    ws.close();
    process.exit(1);
  }

  const results = [];
  try {
    for (const screen of screens) {
      results.push(await testScreen(screen, tolerance, ws));
    }
  } finally {
    ws.close();
  }

  mergeFigmaScreenReport(WORKSPACE);
  const failed = results.filter((r) => r.status === "fail" || r.status === "error").length;
  console.log(`\n[original-parity] Done — ${results.length - failed}/${results.length} pass`);
  console.log(`Report: ${DIFFS_DIR}/<screen>/originalParity/report.html`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[original-parity] Fatal:", err.message);
  process.exit(1);
});
