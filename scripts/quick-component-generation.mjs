#!/usr/bin/env node
/**
 * Quick component generation — Guing publish → lab pipeline → Anthropic → React package.
 * Isolated from normal row-pipeline (no fixers, 5% proceed gate, 0.1% report truth).
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { ingestFigmaScreen } from "./figma-screen-ingest.mjs";
import {
  UNIFIED_STEP_ORDER,
  runUnifiedGoldenBatch,
  stepNeedsRelay,
  stepNeedsPlayground
} from "./unified-orchestrator-work.mjs";
import { UNIFIED_STEPS } from "./build-unified-portfolio.mjs";
import {
  quickStepProceeds,
  anyStrictFailure,
  QUICK_COMPONENT_GATE_TOLERANCE
} from "./quick-component-gate.mjs";
import { packQuickComponentTsx, STORY_TSX_TARBALL } from "./quick-component-pack.mjs";
import {
  runQuickComponentAnthropic,
  readTextIfExists,
  readBase64IfExists
} from "./quick-component-anthropic.mjs";
import { FIGMA_SCREENS_DIR, safeScreenSegment, readScreenStepResult } from "./figma-screen-portfolio.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://127.0.0.1:6107";

const INFRA_POLL_MS = 15_000;
const INFRA_MAX_MS = Number(process.env.QUICK_COMPONENT_INFRA_MAX_MS ?? 120_000);

function stepLabel(stepId) {
  return UNIFIED_STEPS.find((s) => s.id === stepId)?.label ?? stepId;
}

function refreshPortfolio() {
  spawnSync("node", ["scripts/test-portfolio-merge.mjs"], { cwd: ROOT, stdio: "ignore" });
}

function parseSkipSteps() {
  const raw = process.env.QUICK_COMPONENT_SKIP_STEPS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

async function relayPluginReady() {
  return new Promise((resolveHealth) => {
    const ws = new WebSocket("ws://localhost:3456");
    const timer = setTimeout(() => {
      ws.close();
      resolveHealth({ ok: false, pluginConnected: false });
    }, 2500);
    ws.on("open", () => ws.send(JSON.stringify({ type: "health" })));
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(String(data));
        clearTimeout(timer);
        ws.close();
        resolveHealth({
          ok: msg.relay === "ok",
          pluginConnected: Boolean(msg.pluginConnected)
        });
      } catch {
        resolveHealth({ ok: false, pluginConnected: false });
      }
    });
    ws.on("error", () => {
      clearTimeout(timer);
      resolveHealth({ ok: false, pluginConnected: false });
    });
  });
}

async function waitForRelay(appendLog, killFlagPath) {
  const deadline = Date.now() + INFRA_MAX_MS;
  while (Date.now() < deadline) {
    if (killFlagPath && existsSync(killFlagPath)) return false;
    const relay = await relayPluginReady();
    if (relay.ok && relay.pluginConnected) {
      await appendLog("[quick] Figma relay + plugin connected.\n");
      return true;
    }
    await appendLog("[quick] Waiting for Figma relay + plugin…\n");
    await sleep(INFRA_POLL_MS);
  }
  await appendLog("[quick] Figma plugin not connected — skipping live step blocked.\n");
  return false;
}

async function waitForPlayground(appendLog, killFlagPath) {
  const deadline = Date.now() + INFRA_MAX_MS;
  while (Date.now() < deadline) {
    if (killFlagPath && existsSync(killFlagPath)) return false;
    try {
      const res = await fetch("http://127.0.0.1:6108/", { signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        await appendLog("[quick] Playground :6108 is up.\n");
        return true;
      }
    } catch {
      /* retry */
    }
    await appendLog("[quick] Waiting for playground :6108…\n");
    await sleep(INFRA_POLL_MS);
  }
  return false;
}

async function storybookOk() {
  try {
    const res = await fetch(`${STORYBOOK_URL}/index.json`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

function spawnStorybookServe() {
  const child = spawn("pnpm", ["storybook:serve"], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    env: process.env
  });
  child.unref();
}

async function waitForStorybook(appendLog, killFlagPath) {
  if (await storybookOk()) {
    await appendLog(`[quick] Storybook ${STORYBOOK_URL} is up.\n`);
    return true;
  }

  await appendLog(`[quick] Storybook down — starting pnpm storybook:serve…\n`);
  spawnStorybookServe();

  const deadline = Date.now() + INFRA_MAX_MS;
  while (Date.now() < deadline) {
    if (killFlagPath && existsSync(killFlagPath)) return false;
    if (await storybookOk()) {
      await appendLog(`[quick] Storybook ${STORYBOOK_URL} is up.\n`);
      return true;
    }
    await appendLog(`[quick] Waiting for Storybook ${STORYBOOK_URL}…\n`);
    await sleep(INFRA_POLL_MS);
  }

  await appendLog(`[quick] Storybook not ready — skipping Storybook-dependent steps will proceed if infra-only.\n`);
  return false;
}

async function ensureStepInfra(stepId, appendLog, killFlagPath) {
  if (stepNeedsRelay(stepId)) return waitForRelay(appendLog, killFlagPath);
  if (stepId === "vsStorybook") return waitForStorybook(appendLog, killFlagPath);
  if (stepNeedsPlayground(stepId)) return waitForPlayground(appendLog, killFlagPath);
  return true;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const UNIFIED_TO_DISK_STEP = {
  structural: "manifestContract",
  vsFigmaLive: "vsFigmaLive",
  vsStorybook: "vsStorybook",
  vsReactHtml: "vsReactHtml",
  vsReactTsx: "vsReactTsx",
  logic: "logic"
};

/** Read step outcome from figma-screen diffs (truth at 0.1%); avoids portfolio merge lag. */
function readQuickStepCell(repoRoot, screenId, stepId) {
  const diskId = UNIFIED_TO_DISK_STEP[stepId] ?? stepId;
  const rec = readScreenStepResult(repoRoot, screenId, diskId);
  return {
    status: rec?.status ?? "not_tested",
    percent: rec?.percent,
    error: rec?.error ?? null
  };
}

/**
 * Collect test artifacts for Anthropic bundle.
 * @param {string} screenId
 */
function collectStepReports(screenId) {
  const seg = safeScreenSegment(screenId);
  const stepMap = {
    structural: "manifestContract",
    vsFigmaLive: "vsFigmaLive",
    vsStorybook: "vsStorybook",
    vsReactHtml: "vsReactHtml",
    vsReactTsx: "vsReactTsx",
    logic: "logic"
  };

  /** @type {Array<{ stepId: string, status: string, percent?: number, reportJson?: string, comparePngBase64?: string }>} */
  const reports = [];

  for (const [unifiedId, diskId] of Object.entries(stepMap)) {
    const base = join(ROOT, "figma-screen-diffs", "by-screen", seg, diskId);
    const resultPath = join(base, "result.json");
    const reportPath = join(base, "test-report.json");
    let status = "not_tested";
    let percent;
    if (existsSync(resultPath)) {
      try {
        const r = JSON.parse(readFileSync(resultPath, "utf8"));
        status = r.status ?? status;
        percent = r.percent;
      } catch {
        /* ok */
      }
    }
    const compareCandidates = [
      join(base, "compare.png"),
      join(base, "regions", "region-01-compare.png"),
      join(ROOT, "figma-screen-diffs", seg, "originalParity", "diff-original-reactTsx.png")
    ];
    let comparePngBase64 = null;
    for (const p of compareCandidates) {
      comparePngBase64 = readBase64IfExists(p);
      if (comparePngBase64) break;
    }
    reports.push({
      stepId: unifiedId,
      status,
      percent,
      reportJson: readTextIfExists(reportPath),
      comparePngBase64
    });
  }
  return reports;
}

/**
 * @param {object} payload
 * @param {string} [payload.screenId]
 * @param {object} payload.manifest
 * @param {string} [payload.pngBase64]
 * @param {string} payload.componentName
 * @param {string} [payload.library]
 * @param {(text: string) => void | Promise<void>} appendLog
 * @param {string} [killFlagPath]
 */
export async function runQuickComponentGeneration(payload, { appendLog, killFlagPath } = {}) {
  const log = appendLog ?? ((t) => process.stdout.write(t));
  const skipSteps = parseSkipSteps();

  await log("[quick] Ingest manifest + reference PNG…\n");
  const ingested = ingestFigmaScreen(ROOT, {
    screenId: payload.screenId,
    manifest: payload.manifest,
    pngBase64: payload.pngBase64
  });
  const screenId = ingested.screenId;
  const componentName = payload.componentName || pascalFromScreen(screenId);
  const entryPoint = "figma";
  const rowLabel = `${entryPoint}/${screenId}`;

  await log(`[quick] Screen ${screenId} · component ${componentName}\n`);

  /** @type {Record<string, { status: string, percent?: number }>} */
  const stepCells = {};

  for (const stepId of UNIFIED_STEP_ORDER) {
    if (killFlagPath && existsSync(killFlagPath)) {
      return { ok: false, summary: "cancelled", screenId, componentName };
    }

    if (skipSteps.has(stepId)) {
      await log(`[quick] SKIP step ${stepLabel(stepId)} (QUICK_COMPONENT_SKIP_STEPS)\n`);
      continue;
    }

    const label = stepLabel(stepId);
    await log(`\n[quick] ══ ${rowLabel} · ${label} ══\n`);

    const needsInfra =
      stepNeedsRelay(stepId) || stepId === "vsStorybook" || stepNeedsPlayground(stepId);
    if (needsInfra) {
      const infraOk = await ensureStepInfra(stepId, log, killFlagPath);
      if (!infraOk && (stepId === "vsFigmaLive" || stepId === "vsStorybook")) {
        await log(`[quick] ${label} — infra unavailable; continuing quick pipeline\n`);
        stepCells[stepId] = { status: "error", error: "infra unavailable" };
        continue;
      }
      if (!infraOk) {
        await log(`[quick] ${label} — infra timeout\n`);
        stepCells[stepId] = { status: "error" };
        continue;
      }
    }

    await log(`[quick] TEST · ${label}\n`);
    await runUnifiedGoldenBatch(ROOT, [{ storyId: screenId, entryPoint }], stepId, log);
    refreshPortfolio();

    const cell = readQuickStepCell(ROOT, screenId, stepId);
    stepCells[stepId] = { status: cell.status, percent: cell.percent, error: cell.error };

    const strictLabel =
      cell.status === "pass"
        ? "PASS (strict 0.1%)"
        : `${cell.status}${cell.percent != null ? ` ${cell.percent.toFixed(3)}%` : ""} (strict 0.1%)`;

    if (quickStepProceeds(cell)) {
      await log(`[quick] ${label} — proceed (${strictLabel}, quick gate ≤${QUICK_COMPONENT_GATE_TOLERANCE}%)\n`);
    } else {
      await log(`[quick] ${label} — blocked (${strictLabel})\n`);
      return {
        ok: false,
        summary: "step_blocked",
        screenId,
        componentName,
        stuckStep: stepId,
        stepCells
      };
    }
  }

  await log("\n[quick] Packing React TSX delivery package…\n");
  const packed = await packQuickComponentTsx(ROOT, screenId, componentName);

  const manifestPath = join(ROOT, FIGMA_SCREENS_DIR, `${screenId}.manifest.json`);
  const contractPath = manifestPath.replace(/\.manifest\.json$/, ".contract.json");
  const pngPath = join(ROOT, FIGMA_SCREENS_DIR, `${screenId}.png`);

  const stepReports = collectStepReports(screenId);
  const mode = anyStrictFailure(stepCells, UNIFIED_STEP_ORDER) ? "fix" : "confirm";

  await log(`[quick] Anthropic ${mode} pass…\n`);
  const anthropic = await runQuickComponentAnthropic(
    {
      mode,
      componentName,
      screenId,
      packageFiles: packed.files,
      manifestJson: readTextIfExists(manifestPath),
      contractJson: readTextIfExists(contractPath),
      originalPngBase64: readBase64IfExists(pngPath),
      stepReports
    },
    ROOT
  );

  const tarballBase64 = readFileSync(packed.tarballPath).toString("base64");

  await log(`[quick] COMPLETE — ${anthropic.files.length} files returned (${mode})\n`);
  refreshPortfolio();

  return {
    ok: true,
    summary: "QUICK_COMPLETE",
    screenId,
    componentName,
    entryPoint,
    mode,
    quickGatePct: QUICK_COMPONENT_GATE_TOLERANCE,
    stepCells,
    generatedPackage: {
      tarballName: STORY_TSX_TARBALL,
      tarballBase64,
      tarballPath: packed.tarballPath,
      files: anthropic.files
    },
    anthropic: {
      model: anthropic.model,
      mode: anthropic.mode,
      mock: anthropic.mock ?? false
    }
  };
}

function pascalFromScreen(screenId) {
  return String(screenId)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

/**
 * CLI: node scripts/quick-component-generation.mjs --job=<payload.json>
 *   or --simulate (uses screen_1 fixture)
 */
async function main() {
  const args = process.argv.slice(2);
  const simulate = args.includes("--simulate");
  const jobPath = args.find((a) => a.startsWith("--job="))?.slice(6);

  /** @type {object} */
  let payload;
  if (simulate) {
    const manifestPath = join(ROOT, "artifacts/figma-screens/screen_1.manifest.json");
    if (!existsSync(manifestPath)) {
      console.error("[quick] simulate requires artifacts/figma-screens/screen_1.manifest.json");
      process.exit(1);
    }
    process.env.QUICK_COMPONENT_MOCK_ANTHROPIC = "1";
    process.env.QUICK_COMPONENT_SKIP_STEPS = process.env.QUICK_COMPONENT_SKIP_STEPS ?? "vsFigmaLive";
    payload = {
      screenId: "screen_1",
      componentName: "Screen1",
      manifest: JSON.parse(readFileSync(manifestPath, "utf8")),
      pngBase64: readBase64IfExists(join(ROOT, "artifacts/figma-screens/screen_1.png"))
    };
  } else if (jobPath) {
    payload = JSON.parse(readFileSync(resolve(jobPath), "utf8"));
  } else {
    console.error("Usage: node scripts/quick-component-generation.mjs --simulate | --job=path.json");
    process.exit(1);
  }

  const result = await runQuickComponentGeneration(payload, {
    appendLog: (t) => process.stdout.write(t)
  });

  console.log(JSON.stringify({ ok: result.ok, summary: result.summary, screenId: result.screenId }, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[quick] Fatal:", err.message);
    process.exit(1);
  });
}
