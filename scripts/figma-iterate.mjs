#!/usr/bin/env node
/**
 * Figma renderer iteration helper.
 *
 * Usage:
 *   node scripts/figma-iterate.mjs              # run golden + print status
 *   node scripts/figma-iterate.mjs --smoke      # 3-story smoke
 *   node scripts/figma-iterate.mjs --status     # read existing report only
 *   node scripts/figma-iterate.mjs --story mui--showcase
 *   node scripts/figma-iterate.mjs --strict     # exit 1 on fail (not warn)
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exitCodeForResults, scopeReportResults } from "./iterate-report-exit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPORT = resolve(ROOT, "figma-diffs/report.json");
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://127.0.0.1:6107";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const storyIdx = args.indexOf("--story");
const story = storyIdx >= 0 ? args[storyIdx + 1] : null;
const statusOnly = flags.has("--status");
const smoke = flags.has("--smoke");
const strict = flags.has("--strict");
const reportPath = args.includes("--report")
  ? resolve(ROOT, args[args.indexOf("--report") + 1])
  : DEFAULT_REPORT;

async function storybookUp() {
  try {
    const res = await fetch(`${STORYBOOK_URL}/index.json`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

function runTests() {
  const filterArgs = ["--filter", "@lab/pixel-test", "run"];
  let script = "test:figma:golden";
  if (smoke) script = "test:figma";
  if (story) {
    filterArgs.push(script, "--", "--stories", story);
  } else {
    filterArgs.push(script);
  }
  console.log(`\n▶ pnpm ${filterArgs.join(" ")}\n`);
  const r = spawnSync("pnpm", filterArgs, { cwd: ROOT, stdio: "inherit", env: process.env });
  return r.status ?? 1;
}

async function loadReport() {
  const raw = await readFile(reportPath, "utf8");
  return JSON.parse(raw);
}

function printStatus(report, options = {}) {
  const scopeStory = options.storyId ?? null;
  const strict = options.strict ?? false;
  const results = scopeReportResults(report.results ?? [], { storyId: scopeStory });
  if (scopeStory && results.length === 1 && results[0].storyId === scopeStory) {
    console.log(`\n(scoped to --story ${scopeStory})\n`);
  }
  const pass = results.filter((r) => r.status === "pass");
  const warn = results.filter((r) => r.status === "warn");
  const fail = results.filter((r) => r.status === "fail");
  const err = results.filter((r) => r.status === "error");
  const notTested = results.filter((r) => r.status === "not_tested");

  console.log("\n── Figma renderer status ──");
  console.log(`Report: ${reportPath}`);
  console.log(`Generated: ${report.generatedAt ?? "unknown"}`);
  console.log(
    `Tolerance: ${report.tolerance ?? "?"}% global · ${report.regionTolerance ?? "?"}% per hotspot`
  );
  console.log(
    `Pass: ${pass.length}  Warn: ${warn.length}  Fail: ${fail.length}  Error: ${err.length}` +
      (notTested.length ? `  Not tested: ${notTested.length}` : "") +
      "\n"
  );

  const order = { error: 0, fail: 1, warn: 2, pass: 3, not_tested: 9 };
  const sorted = [...results]
    .filter((r) => r.status !== "not_tested")
    .sort((a, b) => {
    const s = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    if (s !== 0) return s;
    return b.percent - a.percent;
  });

  for (const r of sorted) {
    const icon =
      r.status === "pass" ? "✓" : r.status === "warn" ? "⚠" : r.status === "error" ? "✗" : "✗";
    const regions = r.diffRegions?.length ?? 0;
    const hotspots = regions ? `  (${regions} hotspots)` : "";
    const region =
      r.maxRegionPercent != null ? ` / ${r.maxRegionPercent.toFixed(2)}% hotspot` : "";
    console.log(
      `  ${icon} ${r.storyId.padEnd(42)} ${r.status.toUpperCase().padEnd(5)} ${r.percent.toFixed(3)}%${region}${hotspots}`
    );
    if (r.error) console.log(`      error: ${r.error}`);
  }

  const next =
    sorted.find((r) => r.status === "fail" || r.status === "error") ??
    sorted.find((r) => r.status === "warn");
  if (next && next.status !== "pass") {
    const safe = next.storyId.replace(/[<>:"/\\|?*]/g, "-").replace(/-+/g, "-");
    console.log("\n── Fix next (worst non-pass) ──");
    console.log(`  Story:  ${next.storyId}`);
    console.log(`  Status: ${next.status} @ ${next.percent.toFixed(3)}%`);
    console.log(`  Report: file://${resolve(ROOT, "figma-diffs/report.html")}#story-${safe}`);
    console.log(`  Crops:  figma-diffs/${safe}/regions/region-01-compare.png`);
    console.log(`  Re-run: pnpm figma:iterate --story ${next.storyId}`);
  }

  console.log(`\n  open figma-diffs/report.html\n`);

  return exitCodeForResults(results, { strict });
}

(async () => {
  if (!statusOnly) {
    const up = await storybookUp();
    if (!up) {
      console.error(`Storybook not reachable at ${STORYBOOK_URL}`);
      console.error("Start it in another terminal:  pnpm storybook:serve");
      process.exit(2);
    }
    const code = runTests();
    if (code !== 0 && !flags.has("--allow-test-errors")) {
      // test:figma exits 0 by default; non-zero = crash
      console.error("Test run failed (harness error).");
      process.exit(code);
    }
  }

  try {
    const report = await loadReport();
    process.exit(printStatus(report, { storyId: story, strict }));
  } catch (e) {
    console.error(`No report at ${reportPath}. Run without --status first.`);
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  }
})();
