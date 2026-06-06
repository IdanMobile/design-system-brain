/**
 * figma-screen-test.mjs
 *
 * Round-trip validation for Figma-extracted screens:
 *   1. Read <name>.json + <name>.png from artifacts/figma-screens/
 *   2. Send the JSON through the live relay → Figma plugin imports it → exports PNG
 *   3. pixelmatch the reference PNG vs the round-trip PNG
 *   4. Write diff report to figma-screen-diffs/<name>/
 *
 * Usage:
 *   node scripts/figma-screen-test.mjs                         (all pairs in artifacts/figma-screens/)
 *   node scripts/figma-screen-test.mjs --artifact path/to.json (single artifact)
 *   node scripts/figma-screen-test.mjs --tolerance 0.5         (% threshold, default 0.5 — figma round-trip)
 *
 * Requires the relay to be running and the Figma plugin connected.
 * Run:  pnpm figma:relay   (in another terminal)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { WebSocket } from "ws";
import { createRequire } from "node:module";
import { manifestToContract } from "./figma-manifest-to-contract.mjs";
import {
  evaluateRegionGates,
  FIGMA_SCREEN_REGION_TOLERANCE_PERCENT,
  applyLiveHebrewTextRasters,
} from "./figma-screen-reference-align.mjs";
import {
  mergeFigmaScreenReport,
  writeScreenStepResult,
  safeScreenSegment,
  discoverFigmaScreens,
  readScreenStepResult
} from "./figma-screen-portfolio.mjs";

const require = createRequire(import.meta.url);
const _pixelmatch = require("pixelmatch");
const pixelmatch = typeof _pixelmatch === "function" ? _pixelmatch : (_pixelmatch.default ?? _pixelmatch);
const _pngjs = require("pngjs");
const { PNG } = _pngjs.PNG ? _pngjs : (_pngjs.default ?? _pngjs);

const PORT = Number(process.env.FIGMA_LIVE_PORT || 3456);
const RELAY_URL = `ws://localhost:${PORT}`;
const TIMEOUT_MS = Number(process.env.FIGMA_LIVE_TIMEOUT_MS || 120_000);
/** Keep in sync with PIXEL_PERFECT_TOLERANCE in packages/pixel-test/src/test-tolerance.ts */
const DEFAULT_TOLERANCE = 0.1;
const WORKSPACE = resolve(dirname(new URL(import.meta.url).pathname), "..");
const SCREENS_DIR = join(WORKSPACE, "artifacts/figma-screens");
const DIFFS_DIR = join(WORKSPACE, "figma-screen-diffs");

// ─────────────────────────── CLI ────────────────────────────

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

// ─────────────────────────── relay client ────────────────────────────

function connectRelay() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(RELAY_URL);
    ws.on("open", () => resolve(ws));
    ws.on("error", (err) => reject(new Error(`Cannot connect to relay at ${RELAY_URL}: ${err.message}\nRun: pnpm figma:relay`)));
    setTimeout(() => reject(new Error("Relay connect timed out")), 5000);
  });
}

function checkPluginConnected(ws) {
  return new Promise((resolve) => {
    ws.send(JSON.stringify({ type: "health" }));
    const handler = (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === "health") {
        ws.off("message", handler);
        resolve(msg.pluginConnected === true);
      }
    };
    ws.on("message", handler);
    setTimeout(() => { ws.off("message", handler); resolve(false); }, 3000);
  });
}

function renderExport(ws, json, requestId) {
  return new Promise((resolve, reject) => {
    ws.send(JSON.stringify({ type: "render-export", requestId, json, exportScale: 1 }));
    const timer = setTimeout(() => {
      ws.off("message", handler);
      reject(new Error(`render-export timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    const handler = (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.requestId !== requestId) return;
      clearTimeout(timer);
      ws.off("message", handler);
      if (msg.type === "export-error") {
        reject(new Error(`Figma export error: ${msg.error}`));
      } else if (msg.type === "export-result") {
        resolve(Buffer.from(msg.pngBase64, "base64"));
      }
    };
    ws.on("message", handler);
  });
}

// ─────────────────────────── image utils ────────────────────────────

function normalizeDimensions(pngBuf, targetW, targetH) {
  const raw = PNG.sync.read(pngBuf);
  const tw = Math.max(1, Math.round(targetW));
  const th = Math.max(1, Math.round(targetH));
  if (raw.width === tw && raw.height === th) return pngBuf;
  // Crop to target from top-left (Figma may add padding for effects)
  const outW = Math.min(tw, raw.width);
  const outH = Math.min(th, raw.height);
  const out = new PNG({ width: outW, height: outH });
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const si = (y * raw.width + x) * 4;
      const di = (y * outW + x) * 4;
      out.data[di] = raw.data[si];
      out.data[di + 1] = raw.data[si + 1];
      out.data[di + 2] = raw.data[si + 2];
      out.data[di + 3] = raw.data[si + 3];
    }
  }
  return PNG.sync.write(out);
}

function matchDimensions(refBuf, rendBuf) {
  const ref = PNG.sync.read(refBuf);
  const rend = PNG.sync.read(rendBuf);
  const w = Math.min(ref.width, rend.width);
  const h = Math.min(ref.height, rend.height);
  function crop(raw) {
    if (raw.width === w && raw.height === h) return PNG.sync.write(raw);
    const out = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * raw.width + x) * 4;
        const di = (y * w + x) * 4;
        out.data[di] = raw.data[si];
        out.data[di + 1] = raw.data[si + 1];
        out.data[di + 2] = raw.data[si + 2];
        out.data[di + 3] = raw.data[si + 3];
      }
    }
    return PNG.sync.write(out);
  }
  return { ref: crop(ref), rend: crop(rend), w, h };
}

// ─────────────────────────── single test ────────────────────────────

async function testArtifact(manifestPath, refPngPath, ws, tolerance, outDir) {
  const isManifest = manifestPath.endsWith(".manifest.json") || manifestPath.endsWith("-manifest.json");
  const name = basename(manifestPath)
    .replace(/\.manifest\.json$/, "")
    .replace(/-manifest\.json$/, "")
    .replace(/-contract\.json$/, "")
    .replace(/\.contract\.json$/, "");
  const itemDir = join(outDir, name);
  await mkdir(itemDir, { recursive: true });

  console.log(`\n[test] ${name}`);

  const manifestStep = readScreenStepResult(WORKSPACE, name, "manifestContract");
  if (manifestStep?.status !== "pass") {
    console.log("  ✗ Blocked — run Manifest → Contract first (pnpm test:figma:screen:manifest)");
    return { name, status: "error", reason: "manifest-contract-not-pass" };
  }

  if (!existsSync(refPngPath)) {
    console.log(`  ⚠ SKIP — no reference PNG at ${refPngPath}`);
    return { name, status: "skip", reason: "no-reference-png" };
  }
  const refBuf = await readFile(refPngPath);

  // Load manifest, convert to contract via adapter (PNG-guided pruning)
  const raw = JSON.parse(await readFile(manifestPath, "utf8"));
  let doc;
  if (isManifest) {
    console.log("  · Running manifest → contract adapter…");
    doc = manifestToContract(raw, { referencePngBuffer: refBuf });
    applyLiveHebrewTextRasters(doc.root, refBuf);
    const contractPath = manifestPath
      .replace(/\.manifest\.json$/, ".contract.json")
      .replace(/-manifest\.json$/, "-contract.json");
    await writeFile(contractPath, JSON.stringify(doc, null, 2), "utf8");
  } else {
    doc = raw;
  }
  const { width, height } = doc.meta.viewport;
  const json = JSON.stringify(doc);

  // Send contract to Figma via relay
  console.log(`  → Sending contract to Figma (${width}×${height})…`);
  const requestId = `figma-screen-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let rendBuf;
  try {
    rendBuf = await renderExport(ws, json, requestId);
  } catch (err) {
    console.log(`  ✗ ERROR — ${err.message}`);
    return { name, status: "error", reason: err.message };
  }

  // Normalize dimensions
  const { ref, rend, w, h } = matchDimensions(refBuf, rendBuf);
  const refPng = PNG.sync.read(ref);
  const rendPng = PNG.sync.read(rend);
  const diffPng = new PNG({ width: w, height: h });

  const diffPixels = pixelmatch(
    refPng.data, rendPng.data, diffPng.data, w, h,
    { threshold: 0.1, includeAA: false, alpha: 0.1 }
  );
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
  console.log(`  ${icon} ${status.toUpperCase()} ${diffPct.toFixed(3)}% diff (${diffPixels}/${totalPixels} px)`);
  if (!regionGate.pass) {
    console.log(
      `     region fail — worst: ${regionGate.worst.name} ${regionGate.worst.pct.toFixed(3)}% (limit ${FIGMA_SCREEN_REGION_TOLERANCE_PERCENT}%)`
    );
  }
  for (const r of regionGate.regions.filter((r) => r.pct > FIGMA_SCREEN_REGION_TOLERANCE_PERCENT)) {
    console.log(`     · ${r.name}: ${r.pct.toFixed(3)}%`);
  }
  // Write artifacts
  await writeFile(join(itemDir, "reference.png"), refBuf);
  await writeFile(join(itemDir, "rendered.png"), rendBuf);
  await writeFile(join(itemDir, "diff.png"), PNG.sync.write(diffPng));

  console.log(`     reference: ${join(itemDir, "reference.png")}`);
  console.log(`     rendered:  ${join(itemDir, "rendered.png")}`);
  console.log(`     diff:      ${join(itemDir, "diff.png")}`);

  writeScreenStepResult(WORKSPACE, name, "contractFigma", {
    screenId: name,
    status,
    percent: diffPct,
    pixelsDiffered: diffPixels,
    pixelsTotal: totalPixels,
    width: w,
    height: h,
    referencePng: join(itemDir, "reference.png"),
    renderedPng: join(itemDir, "rendered.png"),
    figmaPng: join(itemDir, "rendered.png"),
    diffPng: join(itemDir, "diff.png"),
    manifestPath,
    regions: regionGate.regions,
    worstRegion: regionGate.worst,
  });

  return { name, status, diffPct, diffPixels, totalPixels, width: w, height: h, manifestPath };
}

// ─────────────────────────── report ────────────────────────────

async function writeReport(results, outDir, tolerance) {
  const rows = results.map((r) => {
    if (r.status === "skip") return `<tr><td>${r.name}</td><td>—</td><td>SKIP</td><td>${r.reason}</td></tr>`;
    if (r.status === "error") return `<tr><td>${r.name}</td><td>—</td><td style="color:red">ERROR</td><td>${r.reason}</td></tr>`;
    const color = r.status === "pass" ? "green" : r.status === "warn" ? "orange" : "red";
    return `<tr>
      <td>${r.name}</td>
      <td>${r.diffPct.toFixed(3)}%</td>
      <td style="color:${color}">${r.status.toUpperCase()}</td>
      <td>
        <a href="${r.name}/reference.png">ref</a> |
        <a href="${r.name}/rendered.png">rendered</a> |
        <a href="${r.name}/diff.png">diff</a>
      </td>
    </tr>`;
  }).join("\n");

  const pass = results.filter((r) => r.status === "pass").length;
  const total = results.length;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Figma Screen Round-trip Report</title>
<style>body{font-family:system-ui;padding:24px}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style>
</head><body>
<h1>Figma Screen Round-trip Report</h1>
<p>Tolerance: ${tolerance}% | Pass: ${pass}/${total}</p>
<table><tr><th>Screen</th><th>Diff %</th><th>Status</th><th>Files</th></tr>
${rows}
</table></body></html>`;

  const reportPath = join(outDir, "report.html");
  await writeFile(reportPath, html, "utf8");

  const jsonResults = results.map((r) => {
    if (r.status === "skip" || r.status === "error") {
      return {
        screenId: r.name,
        storyId: r.name,
        status: r.status === "skip" ? "not_tested" : "error",
        percent: 0,
        error: r.reason
      };
    }
    return {
      screenId: r.name,
      storyId: r.name,
      status: r.status,
      percent: r.diffPct,
      pixelsDiffered: r.diffPixels,
      pixelsTotal: r.totalPixels,
      width: r.width,
      height: r.height,
      diffPng: join(outDir, safeScreenSegment(r.name), "diff.png"),
      renderedPng: join(outDir, safeScreenSegment(r.name), "rendered.png"),
      referencePng: join(outDir, safeScreenSegment(r.name), "reference.png"),
      figmaPng: join(outDir, safeScreenSegment(r.name), "rendered.png"),
      manifestPath: r.manifestPath
    };
  });

  await writeFile(
    join(outDir, "report.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        tolerance,
        suite: "figmaScreen",
        results: jsonResults
      },
      null,
      2
    )
  );

  console.log(`\n[report] ${reportPath}`);
  return reportPath;
}

// ─────────────────────────── main ────────────────────────────

async function main() {
  const { artifact, tolerance } = parseCli();
  await mkdir(DIFFS_DIR, { recursive: true });

  // Collect (manifest, png) pairs
  let pairs = [];
  if (artifact) {
    const manifestPath = resolve(artifact);
    const base = manifestPath
      .replace(/\.manifest\.json$/, "")
      .replace(/-manifest\.json$/, "")
      .replace(/-contract\.json$/, "")
      .replace(/\.contract\.json$/, "");
    const pngPath = base + ".png";
    pairs.push({ manifestPath, pngPath });
  } else {
    if (!existsSync(SCREENS_DIR)) {
      console.error(`No screens directory at ${SCREENS_DIR}.`);
      process.exit(1);
    }
    const files = readdirSync(SCREENS_DIR).filter(
      (f) => f.endsWith(".manifest.json") || f.endsWith("-manifest.json")
    );
    if (!files.length) {
      console.error(`No *.manifest.json files in ${SCREENS_DIR}. Drop guing manifest + PNG pairs there.`);
      process.exit(1);
    }
    pairs = files.map((f) => {
      const base = join(SCREENS_DIR, f)
        .replace(/\.manifest\.json$/, "")
        .replace(/-manifest\.json$/, "");
      return {
        manifestPath: join(SCREENS_DIR, f),
        pngPath: base + ".png",
      };
    });
  }

  // Connect to relay
  console.log(`[figma-screen-test] Connecting to relay at ${RELAY_URL}…`);
  let ws;
  try {
    ws = await connectRelay();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  console.log("[figma-screen-test] Connected to relay.");

  const pluginOk = await checkPluginConnected(ws);
  if (!pluginOk) {
    console.error(
      "[figma-screen-test] Figma plugin not connected to relay.\n" +
      "  Open Figma Desktop → Plugins → Development → Universal JSON Importer Lab"
    );
    ws.close();
    process.exit(1);
  }
  console.log("[figma-screen-test] Figma plugin connected.");

  // Run tests
  const results = [];
  for (const { manifestPath, pngPath } of pairs) {
    const result = await testArtifact(manifestPath, pngPath, ws, tolerance, DIFFS_DIR);
    results.push(result);
  }

  ws.close();

  // Summary
  console.log("\n─────────────────────────────────────────");
  const pass = results.filter((r) => r.status === "pass").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const warn = results.filter((r) => r.status === "warn").length;
  const skip = results.filter((r) => r.status === "skip" || r.status === "error").length;
  console.log(`Results: ${pass} pass | ${warn} warn | ${fail} fail | ${skip} skip/error`);

  await writeReport(results, DIFFS_DIR, tolerance);
  mergeFigmaScreenReport(WORKSPACE);

  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[figma-screen-test] Fatal:", err.message);
  process.exit(1);
});
