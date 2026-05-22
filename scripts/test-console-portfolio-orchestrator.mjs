#!/usr/bin/env node
/**
 * Portfolio golden-path orchestrator — persistent supervisor.
 * Scans pixel → figma → live → delivery; skips steps already all PASS;
 * runs golden only when needed (untested); fix-all only for fail/warn;
 * waits and retries when infra (relay/plugin/playground) is down.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initAgentBridge } from "./test-console-agent-bridge.mjs";
import { api } from "./test-console-api.mjs";
import { hasCursorAgent } from "./test-console-cursor-cli.mjs";
import {
  runFixAllIterate,
  runFullSuiteGolden,
  MAX_TRIES_PER_STORY,
  SUITES
} from "./test-console-fix-all-iterate.mjs";
import {
  loadRunSettings,
  orchestratorGoldenStoryIds
} from "./test-console-run-settings.mjs";
import { TEST_STEP_ORDER } from "./step-gate.mjs";
import { loadPortfolioStoryIds } from "./test-portfolio-config.mjs";
import {
  AUTO_RETRY_MS,
  AUTO_WATCH_MS,
  fetchOrchestratorAuto,
  sleepWithKillCheck
} from "./test-console-orchestrator-auto.mjs";
import { writeOrchestratorState } from "./test-console-worker-supervisor.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agent = initAgentBridge(ROOT);

export const PORTFOLIO_STEP_ORDER = TEST_STEP_ORDER;

const INFRA_POLL_MS = Number(process.env.PORTFOLIO_ORCHESTRATOR_POLL_MS ?? 15_000);
const MAX_FIX_ROUNDS = 50;

function safeSegment(id) {
  return id.replace(/[<>:"/\\|?*]/g, "-").replace(/-+/g, "-");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function portfolioStoryIds() {
  return loadPortfolioStoryIds(ROOT, readFileSync, existsSync, join);
}

function refreshPortfolio() {
  spawnSync("node", ["scripts/test-portfolio-merge.mjs"], { cwd: ROOT, stdio: "ignore" });
}

/** Per-step completion from on-disk suite reports + portfolio story list. */
export function getStepCompletion(suiteId) {
  const cfg = SUITES[suiteId];
  const storyIds = portfolioStoryIds();
  const failing = [];
  const notTested = [];
  const passed = [];

  if (!cfg) {
    return { complete: true, suiteId, failing, notTested, passed, total: storyIds.length };
  }

  const reportPath = join(ROOT, cfg.dir, "report.json");
  if (!existsSync(reportPath)) {
    return {
      complete: false,
      suiteId,
      failing,
      notTested: [...storyIds],
      passed,
      total: storyIds.length
    };
  }

  const raw = JSON.parse(readFileSync(reportPath, "utf8"));
  const byId = new Map((raw.results ?? []).map((r) => [r.storyId, r]));

  for (const id of storyIds) {
    const row = byId.get(id);
    if (!row || row.status === "not_tested") notTested.push(id);
    else if (row.status === "pass") passed.push(id);
    else failing.push({ storyId: id, status: row.status, percent: row.percent ?? 0 });
  }

  return {
    complete: failing.length === 0 && notTested.length === 0,
    suiteId,
    failing,
    notTested,
    passed,
    total: storyIds.length
  };
}

/** First pipeline step that is not fully PASS for all portfolio stories. */
export function findNextWorkStep() {
  for (const suiteId of PORTFOLIO_STEP_ORDER) {
    const status = getStepCompletion(suiteId);
    if (!status.complete) return status;
  }
  return null;
}

function formatStepStatus(status) {
  const cfg = SUITES[status.suiteId];
  const parts = [];
  if (status.passed.length) parts.push(`${status.passed.length} pass`);
  if (status.failing.length) parts.push(`${status.failing.length} fail/warn`);
  if (status.notTested.length) parts.push(`${status.notTested.length} not tested`);
  return `${cfg?.label ?? status.suiteId} (${status.total} stories): ${parts.join(", ") || "empty"}`;
}

function formatPortfolioOverview() {
  return PORTFOLIO_STEP_ORDER.map((id) => {
    const s = getStepCompletion(id);
    return s.complete ? `  ✓ ${SUITES[id]?.label ?? id}` : `  ○ ${formatStepStatus(s)}`;
  }).join("\n");
}

async function runOrchestratorGolden(suiteId, stepStatus, appendLog, jobId, killFlagPath) {
  const settings = loadRunSettings();
  const portfolioIds = portfolioStoryIds();
  const storyIds = orchestratorGoldenStoryIds(stepStatus, settings, portfolioIds);
  if (
    settings.applyToOrchestrator &&
    (settings.skipPass || settings.onlyNotTested) &&
    storyIds.length !== portfolioIds.length
  ) {
    await appendLog(
      `[portfolio] Golden subset — ${storyIds.length} of ${portfolioIds.length} stories (run settings)\n`
    );
  }
  await runFullSuiteGolden(suiteId, appendLog, jobId, killFlagPath, { storyIds, settings });
}

async function relayPluginReady() {
  return new Promise((resolveHealth) => {
    const ws = new WebSocket("ws://localhost:3456");
    const timer = setTimeout(() => {
      ws.close();
      resolveHealth({ ok: false, pluginConnected: false });
    }, 2500);
    ws.onopen = () => ws.send(JSON.stringify({ type: "health" }));
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data));
        clearTimeout(timer);
        ws.close();
        resolveHealth({
          ok: msg.relay === "ok",
          pluginConnected: Boolean(msg.pluginConnected)
        });
      } catch {
        resolveHealth({ ok: false, pluginConnected: false });
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolveHealth({ ok: false, pluginConnected: false });
    };
  });
}

async function waitForRelay(appendLog, killFlagPath) {
  while (true) {
    if (existsSync(killFlagPath)) return false;
    const relay = await relayPluginReady();
    if (relay.ok && relay.pluginConnected) {
      await appendLog("[portfolio] Figma relay + plugin connected.\n");
      return true;
    }
    await appendLog(
      "[portfolio] Waiting for Figma live — start relay and open Universal JSON Importer Lab in Desktop…\n"
    );
    await sleep(INFRA_POLL_MS);
  }
}

async function waitForPlayground(appendLog, killFlagPath) {
  while (true) {
    if (existsSync(killFlagPath)) return false;
    try {
      const res = await fetch("http://127.0.0.1:6108/", { signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        await appendLog("[portfolio] Playground :6108 is up.\n");
        return true;
      }
    } catch {
      /* retry */
    }
    await appendLog("[portfolio] Waiting for delivery playground on :6108 (pnpm playground:serve)…\n");
    await sleep(INFRA_POLL_MS);
  }
}

async function ensureStepInfra(suiteId, appendLog, killFlagPath) {
  if (suiteId === "figmaLive") return waitForRelay(appendLog, killFlagPath);
  if (suiteId === "delivery") return waitForPlayground(appendLog, killFlagPath);
  return true;
}

/**
 * @param {string} jobId
 * @param {{ killFlagPath: string, autoMode?: boolean }} options
 */
export async function runPortfolioGolden(jobId, { killFlagPath, autoMode = false }) {
  if (!hasCursorAgent()) {
    throw new Error("Cursor CLI not found");
  }

  try {
    await api(`/api/jobs/${jobId}/register-child`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: process.pid, role: "orchestrator" })
    });
  } catch {
    /* ok */
  }

  const appendLog = async (text) => {
    process.stdout.write(text);
    try {
      await api(`/api/jobs/${jobId}/append-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
    } catch {
      /* best-effort */
    }
  };

  await appendLog(
    `[portfolio] Supervisor online — strict 0.1% · ${PORTFOLIO_STEP_ORDER.join(" → ")}\n` +
      `[portfolio] Skips steps already all PASS. Runs golden only for untested stories.\n` +
      `[portfolio] Fix-all only for fail/warn.\n` +
      (autoMode
        ? `[portfolio] AUTO mode ON — stays alive, rescans every ${Math.round(AUTO_WATCH_MS / 1000)}s when green.\n\n`
        : `[portfolio] One-shot run — stops at PHASE_COMPLETE or cancel.\n\n`)
  );

  refreshPortfolio();
  await appendLog(`[portfolio] Current state:\n${formatPortfolioOverview()}\n\n`);

  while (!existsSync(killFlagPath)) {
    const auto = autoMode || (await fetchOrchestratorAuto(api));
    refreshPortfolio();

    const next = findNextWorkStep();
    if (!next) {
      await appendLog("\n[portfolio] All steps PASS — refreshing portfolio + context…\n");
      spawnSync("node", ["scripts/test-portfolio-merge.mjs"], { cwd: ROOT, stdio: "inherit" });
      spawnSync("node", ["scripts/orchestrator-context.mjs"], { cwd: ROOT, stdio: "ignore" });
      await appendLog("\n[portfolio] PHASE_COMPLETE — golden path ALL strict green.\n");
      if (!auto) {
        return { exitCode: 0, passed: true, summary: "PHASE_COMPLETE" };
      }
      await appendLog(
        `[portfolio] AUTO ON — watching for new work (rescan in ${Math.round(AUTO_WATCH_MS / 1000)}s)…\n`
      );
      const cont = await sleepWithKillCheck(AUTO_WATCH_MS, killFlagPath, existsSync);
      if (!cont) break;
      if (!(await fetchOrchestratorAuto(api))) {
        await appendLog("[portfolio] AUTO turned off — supervisor stopping.\n");
        return { exitCode: 0, passed: true, summary: "auto_off" };
      }
      continue;
    }

    const { suiteId } = next;
    const cfg = SUITES[suiteId];

    await appendLog(`\n[portfolio] ══ Next: ${cfg?.label ?? suiteId} ══\n`);
    await appendLog(`[portfolio] ${formatStepStatus(next)}\n`);

    writeOrchestratorState(ROOT, {
      phase: "portfolio",
      suiteId,
      suiteLabel: cfg?.label ?? suiteId,
      jobId,
      verdict: "ON_TRACK",
      nextWorkerMode: "continue",
      failingCount: next.failing.length,
      notTestedCount: next.notTested.length
    });

    const infraOk = await ensureStepInfra(suiteId, appendLog, killFlagPath);
    if (!infraOk) {
      return { exitCode: 130, passed: false, summary: "cancelled" };
    }

    let status = getStepCompletion(suiteId);
    if (status.complete) {
      await appendLog(`[portfolio] ${suiteId} — already all PASS, skipping to next step\n`);
      continue;
    }

    if (status.notTested.length > 0) {
      await appendLog(
        `[portfolio] Golden run — ${status.notTested.length} stor${status.notTested.length === 1 ? "y" : "ies"} not tested yet\n`
      );
      await runOrchestratorGolden(suiteId, status, appendLog, jobId, killFlagPath);
      refreshPortfolio();
      status = getStepCompletion(suiteId);
      if (status.complete) {
        await appendLog(`[portfolio] ${suiteId} — all PASS after golden, advancing\n`);
        continue;
      }
    }

    let fixRound = 0;
    let lastFailingKey = "";
    let staleFixRounds = 0;
    while (!getStepCompletion(suiteId).complete) {
      if (existsSync(killFlagPath)) break;

      status = getStepCompletion(suiteId);
      if (status.complete) break;

      const failingStories = agent.findFailingStories(suiteId, SUITES, safeSegment);
      if (!failingStories.length) {
        if (status.notTested.length > 0) {
          await appendLog(`[portfolio] ${status.notTested.length} still not tested — re-running golden\n`);
          await runOrchestratorGolden(suiteId, status, appendLog, jobId, killFlagPath);
          refreshPortfolio();
        }
        break;
      }

      fixRound += 1;
      if (fixRound > MAX_FIX_ROUNDS) {
        await appendLog(`[portfolio] ${suiteId} — too many fix rounds (${MAX_FIX_ROUNDS}); stopping.\n`);
        break;
      }

      await appendLog(
        `[portfolio] Fix-all round ${fixRound} — ${failingStories.length} stor${failingStories.length === 1 ? "y" : "ies"} fail/warn` +
          (failingStories.length > 1 ? " (batch: investigate → one agent → re-test all)\n" : "\n")
      );

      const storyIds = failingStories.map((s) => s.storyId);
      const failingKey = storyIds.join(",");
      const sameFailures = failingKey === lastFailingKey && fixRound >= 1;
      lastFailingKey = failingKey;

      let forceSerial = process.env.FIX_ALL_SERIAL === "1" || process.env.FIX_ALL_SERIAL === "true";
      let fixResult = await runFixAllIterate(jobId, { killFlagPath, suiteId, storyIds });

      if (fixResult.suggestSerial && !forceSerial && storyIds.length > 1) {
        await appendLog(
          `[portfolio] Batch regressed — retrying fix-all with FIX_ALL_SERIAL=1 (${storyIds.length} stories)\n`
        );
        process.env.FIX_ALL_SERIAL = "1";
        forceSerial = true;
        fixResult = await runFixAllIterate(jobId, { killFlagPath, suiteId, storyIds });
      }

      if (existsSync(killFlagPath)) break;

      status = getStepCompletion(suiteId);
      if (status.complete) {
        await appendLog(`[portfolio] ${suiteId} — all PASS after fix-all round ${fixRound}\n`);
        break;
      }

      if (sameFailures) {
        staleFixRounds += 1;
        await appendLog(
          `[portfolio] ${suiteId} — same ${storyIds.length} failing stor${storyIds.length === 1 ? "y" : "ies"} after fix round ${fixRound} (stale ${staleFixRounds})\n`
        );
        if (staleFixRounds >= 2) {
          await appendLog(
            `[portfolio] Stopping repeat fix loop — no progress on: ${storyIds.join(", ")}\n`
          );
          break;
        }
      } else {
        staleFixRounds = 0;
      }

      if (status.notTested.length > 0) {
        await appendLog(
          `[portfolio] ${status.notTested.length} not tested — golden for untested only\n`
        );
        await runOrchestratorGolden(suiteId, status, appendLog, jobId, killFlagPath);
      }
      refreshPortfolio();

      status = getStepCompletion(suiteId);
      if (status.complete) {
        await appendLog(`[portfolio] ${suiteId} — all PASS after fix-all round ${fixRound}\n`);
        break;
      }

      await appendLog(
        `[portfolio] ${suiteId} — still ${status.failing.length} fail/warn, ${status.notTested.length} not tested\n`
      );
    }

    status = getStepCompletion(suiteId);
    if (!status.complete) {
      const autoNow = autoMode || (await fetchOrchestratorAuto(api));
      await appendLog(
        `\n[portfolio] ${cfg?.label ?? suiteId} not green (${status.failing.length} fail/warn, ${status.notTested.length} not tested)\n`
      );
      if (autoNow) {
        await appendLog(
          `[portfolio] AUTO ON — retrying in ${Math.round(AUTO_RETRY_MS / 1000)}s…\n`
        );
        const cont = await sleepWithKillCheck(AUTO_RETRY_MS, killFlagPath, existsSync);
        if (!cont) break;
        if (!(await fetchOrchestratorAuto(api))) {
          await appendLog("[portfolio] AUTO turned off — supervisor stopping.\n");
          return { exitCode: 1, passed: false, summary: `${suiteId} not green` };
        }
        continue;
      }
      return { exitCode: 1, passed: false, summary: `${suiteId} not green` };
    }

    await appendLog(`[portfolio] ${suiteId} step done — scanning for next work…\n`);
  }

  if (existsSync(killFlagPath)) {
    return { exitCode: 130, passed: false, summary: "cancelled" };
  }

  return { exitCode: 0, passed: true, summary: "PHASE_COMPLETE" };
}
