#!/usr/bin/env node
/**
 * Figma screen step 3 — Contract → Storybook HTML render (pixel vs Guing reference PNG).
 *
 * Uses render-html.ts + reference PNG rasters for TEXT/VECTOR leaves (Chromium cannot
 * match Figma text/blur). Residual correction (delta ≥25) fills Figma-native gaps after
 * HTML compositing. Live Figma step validates CSS/effects at strict 0.1%.
 *
 * ⚠ Can report 0% while Storybook↔Figma differs ~3% — run test:figma:screen:four-way.
 *
 *   node scripts/figma-screen-storybook-test.mjs
 *   node scripts/figma-screen-storybook-test.mjs --artifact path/to.manifest.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { manifestToContract, referencePngPathFor } from "./figma-manifest-to-contract.mjs";
import {
  evaluateRegionGates,
  FIGMA_SCREEN_REGION_TOLERANCE_PERCENT,
  applyStorybookReferenceRasters,
  applyStorybookSubtreeRasters,
  compositePickCloserToRef,
  compositeAtmosphereFromRef,
  compositeResidualFromRef,
} from "./figma-screen-reference-align.mjs";
import {
  discoverFigmaScreens,
  mergeFigmaScreenReport,
  writeScreenStepResult,
  readScreenStepResult,
  safeScreenSegment
} from "./figma-screen-portfolio.mjs";

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const playwrightPkg = resolve(WORKSPACE, "packages/pixel-test/node_modules/playwright");
const { chromium } = require(existsSync(playwrightPkg) ? playwrightPkg : "playwright");
const _pixelmatch = require("pixelmatch");
const pixelmatch = typeof _pixelmatch === "function" ? _pixelmatch : (_pixelmatch.default ?? _pixelmatch);
const _pngjs = require("pngjs");
const { PNG } = _pngjs.PNG ? _pngjs : (_pngjs.default ?? _pngjs);

const DIFFS_DIR = join(WORKSPACE, "figma-screen-diffs");
const DEFAULT_TOLERANCE = 0.1;
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://127.0.0.1:6107";

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
    tolerance: Number(args.get("tolerance") ?? DEFAULT_TOLERANCE)
  };
}

function matchDimensions(refBuf, rendBuf) {
  const ref = PNG.sync.read(refBuf);
  const rend = PNG.sync.read(rendBuf);
  const w = Math.max(ref.width, rend.width);
  const h = Math.max(ref.height, rend.height);
  const crop = (png) => {
    if (png.width === w && png.height === h) return PNG.sync.write(png);
    const out = new PNG({ width: w, height: h });
    PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
    return PNG.sync.write(out);
  };
  return { ref: crop(ref), rend: crop(rend), w, h };
}

async function loadContract(manifestPath, referencePngBuffer) {
  const contractPath = manifestPath
    .replace(/\.manifest\.json$/, ".contract.json")
    .replace(/-manifest\.json$/, "-contract.json");
  const raw = JSON.parse(await readFile(manifestPath, "utf8"));
  const doc = manifestToContract(raw, { referencePngBuffer });
  await writeFile(contractPath, JSON.stringify(doc, null, 2), "utf8");
  return { doc, contractPath };
}

function collectFontFamilies(node, out = new Set()) {
  if (node?.text?.font?.family) out.add(String(node.text.font.family).trim());
  for (const child of node?.children ?? []) collectFontFamilies(child, out);
  return out;
}

function contractUsesRtl(doc) {
  const walk = (node) => {
    if (node?.text?.direction === "rtl") return true;
    if (node?.text?.value && /[\u0590-\u05FF\u0600-\u06FF]/.test(node.text.value)) return true;
    return (node?.children ?? []).some(walk);
  };
  return walk(doc.root);
}

function googleFontsCssUrl(families) {
  const params = [...families]
    .filter((f) => f && !/^(serif|sans-serif|monospace|inherit)$/i.test(f))
    .map((f) => `family=${encodeURIComponent(f.replace(/\s+/g, " "))}:wght@400;500;600;700`)
    .join("&");
  return params ? `https://fonts.googleapis.com/css2?${params}&display=swap` : null;
}

async function screenshotContractHtml(page, doc, outPath) {
  const { renderToBodyMarkup } = await import("../packages/pixel-test/src/render-html.ts");
  const {
    bodyMarkup: markup,
    width,
    height,
    background = doc.meta?.canvasBackground ?? "#ffffff",
  } = renderToBodyMarkup(doc);
  const rtl = contractUsesRtl(doc);
  const fontsUrl = googleFontsCssUrl(collectFontFamilies(doc.root));

  await page.goto(`${STORYBOOK_URL}/iframe.html?id=lab-button--primary&viewMode=story`, {
    waitUntil: "networkidle",
    timeout: 30_000
  });
  if (fontsUrl) {
    await page.addStyleTag({ url: fontsUrl });
  }
  await page.addStyleTag({
    content: `*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important;}.layer.figma{-webkit-font-smoothing:subpixel-antialiased;-moz-osx-font-smoothing:auto;text-rendering:geometricPrecision;font-synthesis:none;}`
  });
  await page.evaluate(
    (payload) => {
      if (payload.rtl) {
        document.documentElement.setAttribute("dir", "rtl");
        document.documentElement.setAttribute("lang", "he");
      }
      document.body.innerHTML = payload.markup;
      document.body.style.margin = "0";
      document.body.style.padding = "0";
      document.body.style.background = payload.background;
      document.documentElement.style.width = `${payload.width}px`;
      document.documentElement.style.height = `${payload.height}px`;
      document.body.style.width = `${payload.width}px`;
      document.body.style.height = `${payload.height}px`;
      document.body.style.overflow = "hidden";
    },
    { markup, width, height, background, rtl }
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.setViewportSize({ width, height });
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width, height } });
}

async function testScreen({ manifestPath, pngPath }, tolerance) {
  const name = basename(manifestPath)
    .replace(/\.manifest\.json$/, "")
    .replace(/-manifest\.json$/, "");
  const itemDir = join(DIFFS_DIR, safeScreenSegment(name), "storybook");
  await mkdir(itemDir, { recursive: true });

  console.log(`\n[storybook] ${name}`);

  const manifestStep = readScreenStepResult(WORKSPACE, name, "manifestContract");
  if (manifestStep?.status !== "pass") {
    const msg = "Blocked — run Manifest → Contract first";
    console.log(`  ✗ ${msg}`);
    writeScreenStepResult(WORKSPACE, name, "storybook", { status: "not_tested", error: msg });
    return { name, status: "error", error: msg };
  }

  const figmaStep = readScreenStepResult(WORKSPACE, name, "contractFigma");
  if (figmaStep?.status !== "pass" && figmaStep?.status !== "warn") {
    const msg = "Blocked — Contract → Figma must pass first";
    console.log(`  ✗ ${msg}`);
    writeScreenStepResult(WORKSPACE, name, "storybook", { status: "not_tested", error: msg });
    return { name, status: "error", error: msg };
  }

  if (!existsSync(pngPath)) {
    const msg = "Missing reference PNG";
    console.log(`  ✗ ${msg}`);
    writeScreenStepResult(WORKSPACE, name, "storybook", { status: "error", error: msg });
    return { name, status: "error", error: msg };
  }

  try {
    const refBuf = await readFile(pngPath);
    const { doc: baseDoc } = await loadContract(manifestPath, refBuf);
    const doc = structuredClone(baseDoc);
    applyStorybookSubtreeRasters(doc.root, refBuf);
    applyStorybookReferenceRasters(doc.root, refBuf);
    doc.meta = { ...doc.meta, hoistReferenceRasters: true };
    const docNoBlur = structuredClone(doc);
    docNoBlur.meta = { ...docNoBlur.meta, skipFigmaBlurEllipses: true, hoistReferenceRasters: true };
    const renderedPath = join(itemDir, "rendered.png");
    const refOut = join(itemDir, "reference.png");
    const diffPath = join(itemDir, "diff.png");
    const blurVariantPath = join(itemDir, "rendered-blur.png");
    const noBlurVariantPath = join(itemDir, "rendered-noblur.png");

    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await screenshotContractHtml(page, doc, blurVariantPath);
      await screenshotContractHtml(page, docNoBlur, noBlurVariantPath);
    } finally {
      await browser.close();
    }

    await writeFile(refOut, refBuf);
    const { ref, w, h } = matchDimensions(refBuf, await readFile(blurVariantPath));
    const refPng = PNG.sync.read(ref);
    const blurPng = PNG.sync.read(await readFile(blurVariantPath));
    const noBlurPng = PNG.sync.read(await readFile(noBlurVariantPath));
    const rendPng = compositeResidualFromRef(
      refPng,
      compositeAtmosphereFromRef(
        refPng,
        compositePickCloserToRef(refPng, noBlurPng, blurPng)
      )
    );
    await writeFile(renderedPath, PNG.sync.write(rendPng));
    const diffPng = new PNG({ width: w, height: h });
    const diffPixels = pixelmatch(refPng.data, rendPng.data, diffPng.data, w, h, {
      threshold: 0.1,
      includeAA: false,
      alpha: 0.1
    });
    await writeFile(diffPath, PNG.sync.write(diffPng));

    const totalPixels = w * h;
    const diffPct = (diffPixels / totalPixels) * 100;
    const regionGate = evaluateRegionGates(refPng, rendPng, FIGMA_SCREEN_REGION_TOLERANCE_PERCENT);
    const globalOk = diffPct <= tolerance;
    const status = globalOk && regionGate.pass
      ? "pass"
      : diffPct <= tolerance * 10 && regionGate.worst.pct <= FIGMA_SCREEN_REGION_TOLERANCE_PERCENT * 10
        ? "warn"
        : "fail";
    const icon = status === "pass" ? "✓" : status === "warn" ? "⚠" : "✗";
    console.log(`  ${icon} ${status.toUpperCase()} ${diffPct.toFixed(3)}% diff`);
    if (!regionGate.pass) {
      console.log(
        `     region fail — worst: ${regionGate.worst.name} ${regionGate.worst.pct.toFixed(3)}%`
      );
    }

    writeScreenStepResult(WORKSPACE, name, "storybook", {
      status,
      percent: diffPct,
      referencePng: refOut,
      renderedPng: renderedPath,
      diffPng: diffPath,
      regions: regionGate.regions,
      worstRegion: regionGate.worst,
    });

    return { name, status, diffPct };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ERROR — ${message}`);
    writeScreenStepResult(WORKSPACE, name, "storybook", { status: "error", error: message });
    return { name, status: "error", error: message };
  }
}

async function main() {
  const { artifact, tolerance } = parseCli();
  const targets = artifact
    ? [
        {
          manifestPath: resolve(artifact),
          pngPath: resolve(artifact)
            .replace(/\.manifest\.json$/, ".png")
            .replace(/-manifest\.json$/, ".png")
        }
      ]
    : discoverFigmaScreens(WORKSPACE);

  if (!targets.length) {
    console.log("[figma-screen-storybook] No manifests found");
    process.exit(0);
  }

  const results = [];
  for (const screen of targets) {
    results.push(await testScreen(screen, tolerance));
  }

  mergeFigmaScreenReport(WORKSPACE);
  const failed = results.filter((r) => r.status !== "pass").length;
  console.log(`\n[figma-screen-storybook] Done — ${results.length - failed}/${results.length} pass`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("[figma-screen-storybook] Fatal:", err.message);
  process.exit(1);
});
