#!/usr/bin/env node
/**
 * Live Figma iteration helper — reads figma-live-diffs, optionally re-runs live golden.
 *
 * Requires Figma Desktop + plugin UI connected (pnpm figma:relay).
 *
 *   node scripts/figma-live-iterate.mjs              # run live golden + status
 *   node scripts/figma-live-iterate.mjs --status     # read report only (after your last live run)
 *   node scripts/figma-live-iterate.mjs --story lab-pricingpanel--pro
 *   node scripts/figma-live-iterate.mjs --strict
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exitCodeForResults, scopeReportResults } from "./iterate-report-exit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPORT = resolve(ROOT, "figma-live-diffs/report.json");
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://127.0.0.1:6107";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const storyIdx = args.indexOf("--story");
const story = storyIdx >= 0 ? args[storyIdx + 1] : null;
const statusOnly = flags.has("--status");
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

async function relayUp() {
  return new Promise((resolveHealth) => {
    const ws = new WebSocket("ws://localhost:3456");
    const timer = setTimeout(() => {
      ws.close();
      resolveHealth(false);
    }, 2000);
    ws.onopen = () => ws.send(JSON.stringify({ type: "health" }));
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        clearTimeout(timer);
        ws.close();
        resolveHealth(msg.relay === "ok");
      } catch {
        resolveHealth(false);
      }
    };
    ws.onerror = () => resolveHealth(false);
  });
}

function runLiveTests() {
  const filterArgs = ["--filter", "@lab/pixel-test", "run", "test:figma:live:golden"];
  if (story) filterArgs.push("--", "--stories", story);
  const env = {
    ...process.env,
    FIGMA_LIVE_TIMEOUT_MS: process.env.FIGMA_LIVE_TIMEOUT_MS ?? "600000",
    FIGMA_LIVE_EXPORT_TIMEOUT_MS: process.env.FIGMA_LIVE_EXPORT_TIMEOUT_MS ?? "600000"
  };
  console.log(`\n▶ pnpm ${filterArgs.join(" ")}\n`);
  const r = spawnSync("pnpm", filterArgs, { cwd: ROOT, stdio: "inherit", env });
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

  console.log("\n── Figma LIVE status ──");
  console.log(`Report: ${reportPath}`);
  console.log(`Generated: ${report.generatedAt ?? "unknown"}`);
  console.log(`Pass: ${pass.length}  Warn: ${warn.length}  Fail: ${fail.length}  Error: ${err.length}\n`);

  const order = { error: 0, fail: 1, warn: 2, pass: 3 };
  const sorted = [...results].sort((a, b) => {
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

  const next = sorted.find((r) => r.status === "fail" || r.status === "error") ?? sorted.find((r) => r.status === "warn");
  if (next && next.status !== "pass") {
    const safe = next.storyId.replace(/[<>:"/\\|?*]/g, "-").replace(/-+/g, "-");
    console.log("\n── Fix next (worst non-pass) ──");
    console.log(`  Story:  ${next.storyId}`);
    console.log(`  Status: ${next.status} @ ${next.percent.toFixed(3)}%`);
    console.log(`  Report: file://${resolve(ROOT, "figma-live-diffs/report.html")}#story-${safe}`);
    console.log(`  Crops:  figma-live-diffs/${safe}/regions/region-01-compare.png`);
    console.log(`  Pair:   figma-live-diffs/${safe}/storybook.png vs figma.png`);
    console.log(`  Mock:   figma-diffs/${safe}/regions/region-01-compare.png (emulator — may look fine)`);
    console.log(`  Fix:    packages/figma-importer-plugin/src/code-v2.ts`);
    console.log(`  Build:  pnpm --filter @lab/figma-importer-plugin build`);
    console.log(`  Re-run: pnpm figma:live-iterate --story ${next.storyId}`);
  }

  console.log("\n  Prerequisites: Figma Desktop + plugin open + pnpm figma:relay");
  console.log(`  open figma-live-diffs/report.html\n`);

  return exitCodeForResults(results, { strict });
}

(async () => {
  if (!statusOnly) {
    const up = await storybookUp();
    if (!up) {
      console.error(`Storybook not reachable at ${STORYBOOK_URL}`);
      console.error("Start: pnpm storybook:serve");
      process.exit(2);
    }
    const relay = await relayUp();
    if (!relay) {
      console.error("Figma live relay not reachable at ws://localhost:3456");
      console.error("Start: pnpm figma:relay");
      console.error("Figma Desktop: open Universal JSON Importer Lab plugin");
      process.exit(2);
    }
    const code = runLiveTests();
    if (code !== 0 && !flags.has("--allow-test-errors")) {
      console.error("Live test harness crashed (non-zero exit from test:figma:live:golden).");
      process.exit(code);
    }
  }

  try {
    const report = await loadReport();
    process.exit(printStatus(report, { storyId: story, strict }));
  } catch (e) {
    console.error(`No report at ${reportPath}.`);
    if (statusOnly) {
      console.error("Run live golden first: pnpm test:figma:live:golden");
    }
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  }
})();
