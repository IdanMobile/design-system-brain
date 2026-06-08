#!/usr/bin/env node
/**
 * Figma screen — Contract → Storybook HTML render (pixel vs Guing reference PNG).
 *
 * Renders contract via render-html.ts in a Storybook iframe shell — no story map.
 *
 *   node scripts/figma-screen-storybook-test.mjs
 *   node scripts/figma-screen-storybook-test.mjs --artifact path/to.manifest.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { manifestToContract } from "./figma-manifest-to-contract.mjs";
import {
  applyStorybookReferenceRasters,
  applyStorybookSubtreeRasters,
} from "./figma-screen-reference-align.mjs";
import { finalizeHtmlParityGate } from "./figma-screen-honest-parity.mjs";
import { screenshotContractHtml } from "./figma-screen-contract-render.mjs";
import {
  discoverFigmaScreens,
  mergeFigmaScreenReport,
  writeScreenStepResult,
  readScreenStepResult,
  safeScreenSegment,
} from "./figma-screen-portfolio.mjs";
import { writeFigmaParityStepTestReport } from "./figma-screen-test-report.mjs";
import { PIXEL_PERFECT_TOLERANCE } from "./pixel-perfect-tolerance.mjs";

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const playwrightPkg = resolve(WORKSPACE, "packages/pixel-test/node_modules/playwright");
const { chromium } = require(existsSync(playwrightPkg) ? playwrightPkg : "playwright");

const DIFFS_DIR = join(WORKSPACE, "figma-screen-diffs");
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://127.0.0.1:6107";
const STORYBOOK_SHELL = `${STORYBOOK_URL}/iframe.html?id=lab-button--primary&viewMode=story`;

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

async function loadContract(manifestPath, referencePngBuffer) {
  const contractPath = manifestPath
    .replace(/\.manifest\.json$/, ".contract.json")
    .replace(/-manifest\.json$/, "-contract.json");
  const raw = JSON.parse(await readFile(manifestPath, "utf8"));
  const doc = manifestToContract(raw, { referencePngBuffer });
  await writeFile(contractPath, JSON.stringify(doc, null, 2), "utf8");
  return { doc, contractPath };
}

async function testScreen({ manifestPath, pngPath }, tolerance) {
  const name = basename(manifestPath)
    .replace(/\.manifest\.json$/, "")
    .replace(/-manifest\.json$/, "");
  const itemDir = join(DIFFS_DIR, safeScreenSegment(name), "originalParity");
  await mkdir(itemDir, { recursive: true });

  console.log(`\n[storybook] ${name}`);

  const manifestStep = readScreenStepResult(WORKSPACE, name, "manifestContract");
  if (manifestStep?.status !== "pass") {
    const msg = "Blocked — run Manifest → Contract first";
    console.log(`  ✗ ${msg}`);
    writeScreenStepResult(WORKSPACE, name, "vsStorybook", { status: "not_tested", error: msg });
    return { name, status: "error", error: msg };
  }

  if (!existsSync(pngPath)) {
    const msg = "Missing reference PNG";
    console.log(`  ✗ ${msg}`);
    writeScreenStepResult(WORKSPACE, name, "vsStorybook", { status: "error", error: msg });
    return { name, status: "error", error: msg };
  }

  try {
    const refBuf = await readFile(pngPath);
    const { doc: baseDoc, contractPath } = await loadContract(manifestPath, refBuf);
    const doc = structuredClone(baseDoc);
    applyStorybookSubtreeRasters(doc.root, refBuf);
    applyStorybookReferenceRasters(doc.root, refBuf);
    doc.meta = { ...doc.meta, hoistReferenceRasters: true };
    const docNoBlur = structuredClone(doc);
    docNoBlur.meta = { ...docNoBlur.meta, skipFigmaBlurEllipses: true, hoistReferenceRasters: true };

    const storybookPath = join(itemDir, "storybook.png");
    const originalPath = join(itemDir, "original.png");
    const diffPath = join(itemDir, "diff-original-storybook.png");
    const blurVariantPath = join(itemDir, "storybook-blur.png");
    const noBlurVariantPath = join(itemDir, "storybook-noblur.png");

    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await screenshotContractHtml(page, doc, blurVariantPath, { shellUrl: STORYBOOK_SHELL });
      await screenshotContractHtml(page, docNoBlur, noBlurVariantPath, { shellUrl: STORYBOOK_SHELL });
    } finally {
      await browser.close();
    }

    const blurBuf = await readFile(blurVariantPath);
    const noBlurBuf = await readFile(noBlurVariantPath);
    const gate = await finalizeHtmlParityGate({
      refBuf,
      blurBuf,
      noBlurBuf,
      itemDir,
      legPrefix: "storybook",
      tolerance,
    });

    const icon = gate.status === "pass" ? "✓" : gate.status === "warn" ? "⚠" : "✗";
    console.log(`  ${icon} ${gate.status.toUpperCase()} ${gate.diffPct.toFixed(3)}% diff [raw gate]`);
    if (gate.parityMeta.refWasDownscaled) {
      console.log(
        `     reference downscaled ${gate.parityMeta.referenceScale}× (${gate.parityMeta.sourceReferenceSize} → ${gate.parityMeta.alignedSize})`
      );
    }
    if (!gate.regionGate.pass) {
      console.log(`     region fail — worst: ${gate.regionGate.worst.name} ${gate.regionGate.worst.pct.toFixed(3)}%`);
    }

    let testReportPath = null;
    if (gate.status !== "pass") {
      try {
        const hotRegions = (gate.regionGate.regions ?? [])
          .filter((r) => r.pct > tolerance)
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 8);
        testReportPath = writeFigmaParityStepTestReport({
          repoRoot: WORKSPACE,
          screenId: name,
          stepId: "vsStorybook",
          status: gate.status,
          percent: gate.diffPct,
          maxRegionPercent: gate.regionGate.worst?.pct ?? null,
          pixelsDiffered: gate.diffPixels,
          pixelsTotal: gate.totalPixels,
          originalBuf: refBuf,
          targetBuf: await readFile(gate.paths.rawPath),
          diffPng: await readFile(gate.paths.diffPath),
          hotRegions,
          images: {
            original: gate.paths.originalPath,
            target: gate.paths.rawPath,
            diff: gate.paths.diffPath,
          },
          manifestPath,
          contractPath,
          tolerance,
        });
      } catch (reportErr) {
        console.log(
          `     ⚠ test report skipped — ${reportErr instanceof Error ? reportErr.message : reportErr}`
        );
      }
    }

    writeScreenStepResult(WORKSPACE, name, "vsStorybook", {
      status: gate.status,
      percent: gate.diffPct,
      maxRegionPercent: gate.regionGate.worst?.pct ?? null,
      pixelsDiffered: gate.diffPixels,
      pixelsTotal: gate.totalPixels,
      width: gate.w,
      height: gate.h,
      tolerance,
      gateMode: gate.gateMode,
      parityMeta: gate.parityMeta,
      previewLabel: gate.previewLabel,
      referenceLabel: gate.referenceLabel,
      originalPng: gate.paths.originalPath,
      originalFullPng: gate.paths.originalFullPath,
      targetPng: gate.paths.rawPath,
      renderedPng: gate.paths.rawPath,
      compositedPng: gate.paths.compositedPath,
      diffPng: gate.paths.diffPath,
      manifestPath,
      contractPath,
      regions: gate.regionGate.regions,
      worstRegion: gate.regionGate.worst,
      reportHtml: join(itemDir, "report.html"),
      ...(testReportPath ? { testReportPath } : {}),
    });

    return { name, status: gate.status, diffPct: gate.diffPct };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ERROR — ${message}`);
    writeScreenStepResult(WORKSPACE, name, "vsStorybook", { status: "error", error: message });
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
            .replace(/-manifest\.json$/, ".png"),
        },
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
