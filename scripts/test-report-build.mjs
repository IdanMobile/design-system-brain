/**
 * Build and write TestReport JSON from compare results + region crops.
 */

import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { createRequire } from "node:module";
import {
  resolveFailedTest,
  buildMismatchFixPrompt,
  defaultTolerance
} from "./fixer-routing.mjs";

const require = createRequire(import.meta.url);
const _pngjs = require("pngjs");
const { PNG } = _pngjs.PNG ? _pngjs : (_pngjs.default ?? _pngjs);

function blit(dest, src, dx, dy) {
  for (let y = 0; y < src.height; y += 1) {
    if (dy + y >= dest.height) break;
    const sStart = y * src.width * 4;
    const dStart = ((dy + y) * dest.width + dx) * 4;
    src.data.copy(dest.data, dStart, sStart, sStart + src.width * 4);
  }
}

function cropPng(src, rect) {
  const out = new PNG({ width: rect.width, height: rect.height });
  for (let y = 0; y < rect.height; y += 1) {
    const sy = rect.y + y;
    const sStart = (sy * src.width + rect.x) * 4;
    const dStart = y * rect.width * 4;
    src.data.copy(out.data, dStart, sStart, sStart + rect.width * 4);
  }
  return out;
}

function composeSideBySide(left, right, gutter = 2) {
  const w = left.width + gutter + right.width;
  const h = Math.max(left.height, right.height);
  const out = new PNG({ width: w, height: h });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 255;
    out.data[i + 1] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = 255;
  }
  blit(out, left, 0, 0);
  blit(out, right, left.width + gutter, 0);
  return out;
}

function isDiffPixel(data, idx) {
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  const a = data[idx + 3];
  return a > 0 && r > 180 && g < 80 && b < 80;
}

function countDiffInRect(diffPng, rect) {
  const { width, height, data } = diffPng;
  let pixels = 0;
  const x2 = Math.min(width, rect.x + rect.width);
  const y2 = Math.min(height, rect.y + rect.height);
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const area = (x2 - x0) * (y2 - y0);
  for (let y = y0; y < y2; y += 1) {
    for (let x = x0; x < x2; x += 1) {
      const i = (y * width + x) * 4;
      if (isDiffPixel(data, i)) pixels += 1;
    }
  }
  const percentInRegion = area > 0 ? (pixels / area) * 100 : 0;
  return { wrongPixels: pixels, percentInRegion };
}

/**
 * Export region crop PNGs for original-vs-target compare.
 * @param {string} outDir
 * @param {Buffer} originalBuf
 * @param {Buffer} targetBuf
 * @param {Buffer} diffBuf
 * @param {Array<{ x: number, y: number, w?: number, h?: number, width?: number, height?: number, name?: string }>} regions
 */
export function exportOriginalTargetRegions(outDir, originalBuf, targetBuf, diffBuf, regions) {
  const original = PNG.sync.read(originalBuf);
  const target = PNG.sync.read(targetBuf);
  const diff = PNG.sync.read(diffBuf);
  const regionsDir = join(outDir, "regions");
  mkdirSync(regionsDir, { recursive: true });
  const mismatches = [];

  for (let i = 0; i < regions.length; i += 1) {
    const r = regions[i];
    const rect = {
      x: r.x,
      y: r.y,
      width: r.width ?? r.w ?? 0,
      height: r.height ?? r.h ?? 0
    };
    if (rect.width <= 0 || rect.height <= 0) continue;
    const idx = String(i + 1).padStart(2, "0");
    const origCrop = cropPng(original, rect);
    const tgtCrop = cropPng(target, rect);
    const diffCrop = cropPng(diff, rect);
    const cmp = composeSideBySide(origCrop, tgtCrop);
    const origPath = join(regionsDir, `region-${idx}-original.png`);
    const tgtPath = join(regionsDir, `region-${idx}-target.png`);
    const diffPath = join(regionsDir, `region-${idx}-diff.png`);
    const cmpPath = join(regionsDir, `region-${idx}-compare.png`);
    writeFileSync(origPath, PNG.sync.write(origCrop));
    writeFileSync(tgtPath, PNG.sync.write(tgtCrop));
    writeFileSync(diffPath, PNG.sync.write(diffCrop));
    writeFileSync(cmpPath, PNG.sync.write(cmp));
    const counts = countDiffInRect(diff, rect);
    mismatches.push({
      id: `region-${idx}`,
      bbox: rect,
      wrongPixels: counts.wrongPixels,
      percentInRegion: counts.percentInRegion,
      images: {
        originalCrop: origPath,
        targetCrop: tgtPath,
        diffCrop: diffPath,
        compareSideBySide: cmpPath
      },
      evidence: r.name ? { message: `Hotspot band: ${r.name}` } : undefined
    });
  }
  return mismatches;
}

/**
 * @param {object} opts
 */
export function buildTestReport(opts) {
  const {
    itemId,
    entryPoint = "figma",
    testId,
    status,
    percent,
    maxRegionPercent = null,
    pixelsDiffered,
    pixelsTotal,
    images = {},
    regionMismatches = [],
    ctx = {},
    tolerance = defaultTolerance()
  } = opts;

  const failedTest = resolveFailedTest(testId, {
    itemId,
    storyId: itemId,
    manifestPath: ctx.manifestPath,
    entryPoint,
    ...ctx
  });

  if (!failedTest) {
    throw new Error(`Unknown testId for TestReport: ${testId}`);
  }

  const mismatches = regionMismatches.map((m) => ({
    ...m,
    suspectedFixer: m.suspectedFixer ?? failedTest.primaryFixer,
    fixPrompt: buildMismatchFixPrompt(
      { ...m, suspectedFixer: m.suspectedFixer ?? failedTest.primaryFixer },
      failedTest,
      { itemId, entryPoint }
    )
  }));

  if (mismatches.length === 0 && status !== "pass" && status !== "skipped") {
    const fallback = {
      id: "global",
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      wrongPixels: pixelsDiffered ?? 0,
      percentInRegion: percent ?? 0,
      images: {
        compareSideBySide: images.diff ?? null,
        originalCrop: images.original ?? null,
        targetCrop: images.target ?? null
      },
      evidence: ctx.error ? { message: String(ctx.error) } : { message: "Global diff — inspect full compare PNG" },
      suspectedFixer: failedTest.primaryFixer
    };
    mismatches.push({
      ...fallback,
      fixPrompt: buildMismatchFixPrompt(fallback, failedTest, { itemId, entryPoint })
    });
  }

  return {
    schemaVersion: "1.0",
    itemId,
    entryPoint,
    failedTest,
    tolerance,
    global: {
      percent: percent ?? 0,
      maxRegionPercent,
      status,
      pixelsDiffered,
      pixelsTotal
    },
    images,
    mismatches,
    testedAt: new Date().toISOString()
  };
}

/**
 * @param {string} repoRoot
 * @param {string | null | undefined} absPath
 */
export function toTestReportRepoUrl(repoRoot, absPath) {
  if (!absPath || typeof absPath !== "string") return null;
  const norm = absPath.replace(/\\/g, "/");
  const root = repoRoot.replace(/\\/g, "/");
  if (norm.startsWith(root)) {
    return `/repo/${norm.slice(root.length).replace(/^\//, "")}`;
  }
  return null;
}

/** @param {string} jsonPath */
export function testReportHtmlPath(jsonPath) {
  if (!jsonPath) return null;
  return jsonPath.replace(/test-report\.json$/i, "test-report.html");
}

/**
 * @param {string} repoRoot
 * @param {string | null | undefined} testReportJsonPath
 */
export function testReportViewUrls(repoRoot, testReportJsonPath) {
  if (!testReportJsonPath) {
    return { testReportUrl: null, testReportJsonUrl: null };
  }
  const testReportJsonUrl = toTestReportRepoUrl(repoRoot, testReportJsonPath);
  const htmlAbs = testReportHtmlPath(testReportJsonPath);
  const testReportHtmlUrl =
    htmlAbs && existsSync(htmlAbs) ? toTestReportRepoUrl(repoRoot, htmlAbs) : null;
  return {
    testReportUrl: testReportHtmlUrl ?? testReportJsonUrl,
    testReportJsonUrl
  };
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Rich HTML viewer for fixers — written beside test-report.json.
 * @param {object} report
 * @param {string} jsonPath
 * @param {string} [repoRoot]
 */
export function writeTestReportHtml(report, jsonPath, repoRoot) {
  const htmlPath = testReportHtmlPath(jsonPath);
  if (!htmlPath) return null;
  const root = repoRoot ?? dirname(dirname(dirname(jsonPath)));
  const img = (p) => toTestReportRepoUrl(root, p);
  const ft = report.failedTest ?? {};
  const g = report.global ?? {};
  const status = g.status ?? "fail";
  const statusColor =
    status === "pass" ? "#4ade80" : status === "warn" ? "#fbbf24" : "#f87171";

  const fullFrames = [
    ["Reference", report.images?.original],
    ["Target", report.images?.target],
    ["Diff", report.images?.diff]
  ]
    .filter(([, p]) => p)
    .map(
      ([label, p]) =>
        `<figure><figcaption>${escHtml(label)}</figcaption><a href="${escHtml(img(p))}"><img src="${escHtml(img(p))}" alt="${escHtml(label)}"></a></figure>`
    )
    .join("\n");

  const mismatchBlocks = (report.mismatches ?? [])
    .map((m) => {
      const cmp = m.images?.compareSideBySide ?? m.images?.diffCrop;
      const cmpImg = cmp
        ? `<a href="${escHtml(img(cmp))}"><img class="region" src="${escHtml(img(cmp))}" alt="${escHtml(m.id)}"></a>`
        : "";
      return `<section class="mismatch">
<h3>${escHtml(m.id)} · ${m.wrongPixels ?? 0} wrong px · ${(m.percentInRegion ?? 0).toFixed(3)}% in region</h3>
<p class="meta">bbox (${m.bbox?.x ?? 0}, ${m.bbox?.y ?? 0}) ${m.bbox?.width ?? 0}×${m.bbox?.height ?? 0} · fixer: <code>${escHtml(m.suspectedFixer ?? ft.primaryFixer)}</code></p>
${cmpImg}
<pre class="prompt">${escHtml(m.fixPrompt ?? "")}</pre>
</section>`;
    })
    .join("\n");

  const allowlist = (ft.allowlist ?? []).map((p) => `<li><code>${escHtml(p)}</code></li>`).join("");
  const forbidden = (ft.forbidden ?? []).map((p) => `<li><code>${escHtml(p)}</code></li>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test report — ${escHtml(report.itemId)} · ${escHtml(ft.testId ?? "")}</title>
<style>
:root{color-scheme:dark}
body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:24px;background:#0f172a;color:#e2e8f0;line-height:1.45}
h1{margin:0 0 4px;font-size:1.35rem}
.sub{color:#94a3b8;margin:0 0 20px;font-size:.95rem}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.85rem;font-weight:600;background:#1e293b;color:${statusColor}}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:16px 0 24px}
figure{margin:0;background:#1e293b;border-radius:8px;padding:10px}
figure img{width:100%;height:auto;border-radius:4px;background:#fff;display:block}
figcaption{font-size:.8rem;color:#94a3b8;margin-bottom:6px}
.mismatch{background:#1e293b;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #334155}
.mismatch h3{margin:0 0 8px;font-size:1rem}
.meta{color:#94a3b8;font-size:.85rem;margin:0 0 10px}
img.region{max-width:100%;height:auto;border-radius:4px;background:#fff;display:block;margin:8px 0}
pre.prompt{white-space:pre-wrap;word-break:break-word;background:#0b1220;border:1px solid #334155;border-radius:6px;padding:12px;font-size:.78rem;color:#cbd5e1;margin:0}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:720px){.cols{grid-template-columns:1fr}}
ul{margin:0;padding-left:1.2rem}
code{font-size:.85em}
a{color:#93c5fd}
</style></head><body>
<h1>${escHtml(report.itemId)}</h1>
<p class="sub">EntryPoint: <strong>${escHtml(report.entryPoint)}</strong> · failed test: <strong>${escHtml(ft.label ?? ft.testId)}</strong> · tolerance ≤ ${report.tolerance ?? 0.1}% · tested ${escHtml(report.testedAt ?? "")}</p>
<p><span class="badge">${escHtml(status.toUpperCase())}</span> global ${(g.percent ?? 0).toFixed(3)}% · ${g.pixelsDiffered ?? "—"} / ${g.pixelsTotal ?? "—"} px · primary fixer <code>${escHtml(ft.primaryFixer)}</code></p>
<p><code>${escHtml(ft.verifyCommand ?? "")}</code> · regression: ${escHtml(ft.regressionScope ?? "—")}</p>
<h2>Full compare</h2>
<div class="grid">${fullFrames || "<p>No full-frame images.</p>"}</div>
<h2>Mismatches (${(report.mismatches ?? []).length})</h2>
${mismatchBlocks || "<p>No region crops — inspect full diff above.</p>"}
<h2>Fixer guardrails</h2>
<div class="cols">
<div><h3>Allowlist</h3><ul>${allowlist || "<li>—</li>"}</ul></div>
<div><h3>Forbidden</h3><ul>${forbidden || "<li>—</li>"}</ul></div>
</div>
<p class="sub"><a href="${escHtml(basename(jsonPath))}">test-report.json</a> · schema ${escHtml(report.schemaVersion ?? "1.0")}</p>
</body></html>`;

  mkdirSync(dirname(htmlPath), { recursive: true });
  writeFileSync(htmlPath, html);
  return htmlPath;
}

/** Remove test-report.json and test-report.html from a step/result directory. */
export function removeTestReportFiles(resultDir) {
  for (const name of ["test-report.json", "test-report.html"]) {
    const p = join(resultDir, name);
    if (existsSync(p)) unlinkSync(p);
  }
}

/**
 * Write test-report.json (+ HTML viewer) alongside result.json
 * @param {string} resultDir — directory containing result.json
 * @param {object} report
 * @param {string} [repoRoot]
 */
export function writeTestReportFile(resultDir, report, repoRoot) {
  mkdirSync(resultDir, { recursive: true });
  const path = join(resultDir, "test-report.json");
  report.testReportPath = path;
  writeFileSync(path, JSON.stringify(report, null, 2));
  writeTestReportHtml(report, path, repoRoot ?? dirname(dirname(dirname(resultDir))));
  return path;
}

/**
 * Resolve test-report path for figma screen step
 */
export function figmaScreenTestReportPath(repoRoot, screenId, stepId) {
  const seg = String(screenId)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return join(repoRoot, "figma-screen-diffs", "by-screen", seg, stepId, "test-report.json");
}

/**
 * Resolve test-report path for storybook suite
 */
export function storybookTestReportPath(repoRoot, suiteDir, storyId) {
  return join(repoRoot, suiteDir, storyId, "test-report.json");
}

/**
 * Load test report if present
 * @param {string} path
 */
export function loadTestReport(path) {
  try {
    const { readFileSync, existsSync } = require("node:fs");
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Build agent prompt lines from TestReport (fixers consume — do not rebuild triage)
 * @param {object} report
 * @param {string} [extra]
 */
export function fixPromptFromTestReport(report, extra = "") {
  if (!report?.mismatches?.length) {
    return [
      `Failed test: ${report?.failedTest?.testId ?? "unknown"}`,
      report?.failedTest?.verifyCommand ?? "",
      extra
    ]
      .filter(Boolean)
      .join("\n");
  }
  const primary = report.mismatches[0];
  const lines = [
    report.failedTest?.testId === "vsFigmaLive" || report.failedTest?.testId === "figmaLive"
      ? "make fixes after live test"
      : "run until pass",
    "",
    `Item: ${report.itemId} · entry: ${report.entryPoint}`,
    `Failed test: ${report.failedTest.label} (${report.failedTest.testId})`,
    `Primary fixer: ${report.failedTest.primaryFixer}`,
    `Global: ${report.global.percent.toFixed(3)}% · status ${report.global.status}` +
      (report.global.maxRegionPercent != null
        ? ` · worst region ${report.global.maxRegionPercent.toFixed(3)}%`
        : ""),
    "",
    "── Test report (authoritative) ──",
    `Report: ${report.testReportPath ?? "(see test-report.json)"}`,
    ...(report.images.original ? [`Original: ${report.images.original}`] : []),
    ...(report.images.target ? [`Target: ${report.images.target}`] : []),
    ...(report.images.diff ? [`Diff: ${report.images.diff}`] : []),
    "",
    `Mismatches: ${report.mismatches.length} (fix worst first)`,
    "",
    primary.fixPrompt,
    "",
    `Verify: ${report.failedTest.verifyCommand}`,
    "Sandbox: edits in worktree only; regression → auto discard.",
    extra
  ];
  return lines.filter(Boolean).join("\n");
}
