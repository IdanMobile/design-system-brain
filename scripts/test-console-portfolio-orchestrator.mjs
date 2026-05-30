#!/usr/bin/env node
/**
 * Unified portfolio orchestrator — walks the portfolio matrix (Structural → parity legs → Logic).
 * Test → fix → rebuild until PHASE_COMPLETE, a safety cap, or a human-action pause.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initAgentBridge } from "./test-console-agent-bridge.mjs";
import { api } from "./test-console-api.mjs";
import { hasCursorAgent } from "./test-console-cursor-cli.mjs";
import { runFixAllIterate, SUITES } from "./test-console-fix-all-iterate.mjs";
import { loadRunSettings } from "./test-console-run-settings.mjs";
import {
  AUTO_RETRY_MS,
  AUTO_WATCH_MS,
  fetchOrchestratorAuto,
  sleepWithKillCheck
} from "./test-console-orchestrator-auto.mjs";
import { writeOrchestratorState } from "./test-console-worker-supervisor.mjs";
import {
  UNIFIED_STEP_ORDER,
  loadUnifiedPortfolio,
  summarizeUnifiedStep,
  findNextUnifiedWork,
  findFlowWorkQueue,
  findNextFlowWork,
  formatUnifiedStepStatus,
  runUnifiedGoldenBatch,
  fixSuiteForCell,
  selectFlowWorkBatch,
  stepNeedsRelay,
  stepNeedsPlayground,
  humanActionPayload,
  effectiveOrchestratorFilters
} from "./unified-orchestrator-work.mjs";
import { UNIFIED_STEPS } from "./build-unified-portfolio.mjs";
import { emitFleetEvent, updateAgentStatus } from "./lab-worker-supervisor.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agent = initAgentBridge(ROOT);

export const PORTFOLIO_STEP_ORDER = UNIFIED_STEP_ORDER;

const INFRA_POLL_MS = Number(process.env.PORTFOLIO_ORCHESTRATOR_POLL_MS ?? 15_000);
const INFRA_MAX_MS = Number(process.env.PORTFOLIO_ORCHESTRATOR_INFRA_MAX_MS ?? 900_000);
const FLOW_FIXER_CONCURRENCY = Math.max(
  1,
  Math.min(20, Number(process.env.PORTFOLIO_FLOW_FIXER_CONCURRENCY ?? 12))
);

function stepLabel(stepId) {
  return UNIFIED_STEPS.find((s) => s.id === stepId)?.label ?? stepId;
}

function refreshPortfolio() {
  spawnSync("node", ["scripts/test-portfolio-merge.mjs"], { cwd: ROOT, stdio: "ignore" });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** @deprecated use unified portfolio — kept for scripts that import getStepCompletion */
export function getStepCompletion(stepId) {
  const portfolio = loadUnifiedPortfolio(ROOT);
  let settings = loadRunSettings();
  const filters = effectiveOrchestratorFilters(settings);
  const s = summarizeUnifiedStep(portfolio, stepId, filters);
  return {
    complete: s.complete,
    suiteId: stepId,
    stepId,
    failing: s.failing.map((f) => ({
      storyId: f.storyId,
      status: f.status,
      percent: f.percent,
      entryPoint: f.entryPoint
    })),
    notTested: s.notTested.map((f) => f.storyId),
    passed: s.passed.map((f) => f.storyId),
    total: s.total
  };
}

export function findNextWorkStep() {
  const portfolio = loadUnifiedPortfolio(ROOT);
  let settings = loadRunSettings();
  const filters = effectiveOrchestratorFilters(settings);
  if (settings.sortBy === "flow_first") {
    const next = findNextFlowWork(portfolio, filters);
    if (!next) return null;
    return {
      suiteId: next.stepId,
      stepId: next.stepId,
      complete: false,
      failing:
        next.kind === "fix"
          ? [{
              storyId: next.storyId,
              status: next.status,
              percent: next.percent,
              entryPoint: next.entryPoint
            }]
          : [],
      notTested: next.kind === "golden" ? [next.storyId] : [],
      passed: [],
      total: 1,
      flowFirst: true,
      storyId: next.storyId,
      entryPoint: next.entryPoint
    };
  }
  const next = findNextUnifiedWork(portfolio, filters, settings.sortBy ?? "step_first");
  if (!next) return null;
  return {
    suiteId: next.stepId,
    stepId: next.stepId,
    complete: next.complete,
    failing: next.failing.map((f) => ({
      storyId: f.storyId,
      status: f.status,
      percent: f.percent,
      entryPoint: f.entryPoint
    })),
    notTested: next.notTested.map((f) => f.storyId),
    passed: next.passed.map((f) => f.storyId),
    total: next.total
  };
}

function formatPortfolioOverview(portfolio, filters) {
  return UNIFIED_STEP_ORDER.map((id) => {
    const s = summarizeUnifiedStep(portfolio, id, filters);
    return s.complete
      ? `  ✓ ${stepLabel(id)}`
      : `  ○ ${formatUnifiedStepStatus(s, stepLabel(id))}`;
  }).join("\n");
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

async function waitForRelay(appendLog, killFlagPath, jobId) {
  const deadline = Date.now() + INFRA_MAX_MS;
  while (Date.now() < deadline) {
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
  writeOrchestratorState(ROOT, {
    phase: "portfolio",
    jobId,
    ...humanActionPayload("figma_plugin_not_connected")
  });
  await appendLog("[portfolio] HUMAN ACTION — Figma plugin not connected (infra timeout).\n");
  return false;
}

async function waitForPlayground(appendLog, killFlagPath, jobId) {
  const deadline = Date.now() + INFRA_MAX_MS;
  while (Date.now() < deadline) {
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
    await appendLog("[portfolio] Waiting for delivery playground on :6108…\n");
    await sleep(INFRA_POLL_MS);
  }
  writeOrchestratorState(ROOT, {
    phase: "portfolio",
    jobId,
    ...humanActionPayload("infra_down")
  });
  return false;
}

async function ensureStepInfra(stepId, appendLog, killFlagPath, jobId) {
  if (stepNeedsRelay(stepId)) return waitForRelay(appendLog, killFlagPath, jobId);
  if (stepNeedsPlayground(stepId)) return waitForPlayground(appendLog, killFlagPath, jobId);
  return true;
}

function groupFixTargets(stepStatus) {
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const item of stepStatus.failing) {
    const suite = fixSuiteForCell(item.entryPoint ?? "storybook", stepStatus.stepId);
    if (!groups.has(suite)) groups.set(suite, []);
    groups.get(suite).push(item.storyId);
  }
  return groups;
}

function flowWorkWithSuite(work) {
  const suiteId = fixSuiteForCell(work.entryPoint ?? "storybook", work.stepId);
  return {
    ...work,
    suiteId,
    suiteLabel: SUITES[suiteId]?.label ?? suiteId
  };
}

function pauseWithHuman(jobId, code, appendLog) {
  const payload = humanActionPayload(code);
  writeOrchestratorState(ROOT, { phase: "portfolio", jobId, ...payload });
  return appendLog(`[portfolio] HUMAN ACTION — ${payload.humanTitle}: ${payload.humanMessage}\n`);
}

/**
 * @param {string} jobId
 * @param {{ killFlagPath: string, autoMode?: boolean }} options
 */
export async function runPortfolioGolden(jobId, { killFlagPath, autoMode = false }) {
  if (!hasCursorAgent()) {
    throw new Error("Agent CLI not found");
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

  let settings = loadRunSettings();
  const filters = effectiveOrchestratorFilters(settings);
  const maxFixRounds = settings.maxFixRoundsPerStep ?? 10;
  const maxAutoRetries = settings.maxAutoRetriesWhenStuck ?? 3;
  const maxAgentCalls = settings.maxAgentCallsPerLaunch ?? 100;
  let sessionAgentCalls = 0;
  let stepAutoRetries = 0;

  await appendLog(
    `[portfolio] Unified supervisor — strict 0.1% · ${UNIFIED_STEP_ORDER.join(" → ")}\n` +
      `[portfolio] Scope: ${settings.scope ?? "failures_only"} · sort: ${settings.sortBy ?? "step_first"}\n` +
      `[portfolio] Safety — fix rounds/step ≤${maxFixRounds}, auto-retries ≤${maxAutoRetries}, agent calls ≤${maxAgentCalls}\n` +
      (autoMode
        ? `[portfolio] Launch mode — runs until complete, stuck, or human action; rescans when green.\n\n`
        : `[portfolio] One-shot — stops at PHASE_COMPLETE, safety cap, or human action.\n\n`)
  );

  refreshPortfolio();
  let portfolio = loadUnifiedPortfolio(ROOT);
  await appendLog(`[portfolio] Current state (${portfolio.storyCount ?? 0} items):\n${formatPortfolioOverview(portfolio, filters)}\n\n`);

  while (!existsSync(killFlagPath)) {
    const auto = autoMode || (await fetchOrchestratorAuto(api));
    settings = loadRunSettings();
    const loopFilters = effectiveOrchestratorFilters(settings);
    refreshPortfolio();
    portfolio = loadUnifiedPortfolio(ROOT);

    const useFlowFirst = settings.sortBy === "flow_first";
    const next = useFlowFirst
      ? findNextFlowWork(portfolio, loopFilters)
      : findNextUnifiedWork(portfolio, loopFilters, settings.sortBy ?? "step_first");
    if (!next) {
      const blockedOrPending = useFlowFirst
        ? findNextUnifiedWork(portfolio, loopFilters, "step_first")
        : null;
      if (blockedOrPending) {
        await pauseWithHuman(jobId, "step_not_green", appendLog);
        return { exitCode: 1, passed: false, summary: "no runnable flow work" };
      }
      await appendLog("\n[portfolio] All steps PASS — refreshing portfolio + context…\n");
      spawnSync("node", ["scripts/test-portfolio-merge.mjs"], { cwd: ROOT, stdio: "inherit" });
      spawnSync("node", ["scripts/orchestrator-context.mjs"], { cwd: ROOT, stdio: "ignore" });
      writeOrchestratorState(ROOT, {
        phase: "portfolio",
        jobId,
        finished: true,
        verdict: "PHASE_COMPLETE",
        exitReason: "COMPLETE",
        humanMessage: null
      });
      await appendLog("\n[portfolio] PHASE_COMPLETE — unified portfolio strict green.\n");
      if (!auto) {
        return { exitCode: 0, passed: true, summary: "PHASE_COMPLETE" };
      }
      await appendLog(
        `[portfolio] Watching for new work (rescan in ${Math.round(AUTO_WATCH_MS / 1000)}s)…\n`
      );
      const cont = await sleepWithKillCheck(AUTO_WATCH_MS, killFlagPath, existsSync);
      if (!cont) break;
      if (!(await fetchOrchestratorAuto(api))) {
        return { exitCode: 0, passed: true, summary: "auto_off" };
      }
      stepAutoRetries = 0;
      continue;
    }

    if (useFlowFirst) {
      const flowLimit = Math.min(
        Math.max(FLOW_FIXER_CONCURRENCY, settings.parallelWorkers ?? FLOW_FIXER_CONCURRENCY),
        Math.max(1, maxAgentCalls - sessionAgentCalls)
      );
      let flowQueue = selectFlowWorkBatch(ROOT, portfolio, loopFilters, flowLimit).map(flowWorkWithSuite);
      if (!flowQueue.length) {
        const nextMapped = flowWorkWithSuite(next);
        flowQueue = [nextMapped];
      }

      const parallelNote =
        flowQueue.length > 1
          ? ` (${flowQueue.length} parallel safe work items)`
          : "";
      await appendLog(
        `\n[portfolio] ══ Flow batch${parallelNote}: ${flowQueue.map((w) => `${w.storyId} · ${stepLabel(w.stepId)}`).join(", ")} ══\n`
      );

      const first = flowQueue[0];
      const stepId = first.stepId;
      const label = stepLabel(stepId);
      const suiteId = first.suiteId;

      writeOrchestratorState(ROOT, {
        phase: "portfolio",
        suiteId: stepId,
        suiteLabel: label,
        jobId,
        storyId: first.storyId,
        entryPoint: first.entryPoint,
        verdict: "ON_TRACK",
        nextWorkerMode: "continue",
        failingCount: flowQueue.filter((w) => w.kind === "fix").length,
        notTestedCount: flowQueue.filter((w) => w.kind === "golden").length,
        parallelCount: flowQueue.length,
        finished: false,
        humanAction: null,
        humanMessage: null
      });

      for (const work of flowQueue) {
        const infraOk = await ensureStepInfra(work.stepId, appendLog, killFlagPath, jobId);
        if (!infraOk) {
          return { exitCode: 2, passed: false, summary: "human:infra" };
        }
      }

      if (sessionAgentCalls + flowQueue.filter((w) => w.kind === "fix").length > maxAgentCalls) {
        await pauseWithHuman(jobId, "max_rounds_exceeded", appendLog);
        return { exitCode: 2, passed: false, summary: "max_agent_calls" };
      }

      const goldenWorks = flowQueue.filter((w) => w.kind === "golden");
      const fixWorks = flowQueue.filter((w) => w.kind === "fix");
      if (goldenWorks.length) {
        const verifierTask = {
          jobId,
          suiteId: "flow-golden",
          phase: "parallel-golden",
          parallelCount: goldenWorks.length,
          stories: goldenWorks.map((w) => w.storyId),
          steps: [...new Set(goldenWorks.map((w) => w.stepId))]
        };
        updateAgentStatus(ROOT, "verifier", {
          status: "working",
          currentTask: verifierTask
        });
        emitFleetEvent(ROOT, "orchestrator.assign", {
          agentId: "verifier",
          ...verifierTask
        });
      }

      /** @type {Map<string, Array<{ storyId: string, entryPoint: string }>>} */
      const goldenByStep = new Map();
      for (const work of goldenWorks) {
        if (!goldenByStep.has(work.stepId)) goldenByStep.set(work.stepId, []);
        goldenByStep.get(work.stepId).push({
          storyId: work.storyId,
          entryPoint: work.entryPoint ?? "storybook"
        });
      }

      for (const work of goldenWorks) {
        await appendLog(
          `[portfolio] Golden · ${work.storyId} · ${work.suiteLabel} · status ${work.status}\n`
        );
      }

      const goldenTasks = [...goldenByStep.entries()].map(([stepId, items]) =>
        runUnifiedGoldenBatch(ROOT, items, stepId, (t) => appendLog(t))
      );
      const fixTasks = fixWorks.map(async (work) => {
        await appendLog(
          `[portfolio] Fix · ${work.storyId} · ${work.suiteLabel} · status ${work.status}` +
            (work.percent ? ` (${work.percent.toFixed(2)}%)` : "") +
            "\n"
        );
        sessionAgentCalls += 1;
        return runFixAllIterate(jobId, {
          killFlagPath,
          suiteId: work.suiteId,
          storyIds: [work.storyId]
        });
      });

      const results = await Promise.all([...goldenTasks, ...fixTasks]);
      const fixResults = results.slice(goldenTasks.length);

      if (goldenWorks.length) {
        updateAgentStatus(ROOT, "verifier", {
          status: "idle",
          currentTask: null
        });
        emitFleetEvent(ROOT, "agent.complete", {
          agentId: "verifier",
          jobId,
          suiteId: "flow-golden",
          phase: "parallel-golden",
          parallelCount: goldenWorks.length,
          stories: goldenWorks.map((w) => w.storyId)
        });
      }

      if (fixResults.some((result) => result?.blocked)) {
        await pauseWithHuman(jobId, "cursor_usage_blocked", appendLog);
        return { exitCode: 2, passed: false, summary: "blocked:cursor_usage" };
      }

      refreshPortfolio();
      stepAutoRetries = 0;
      continue;
    }

    const stepId = next.stepId;
    const label = stepLabel(stepId);

    await appendLog(`\n[portfolio] ══ Next: ${label} ══\n`);
    await appendLog(`[portfolio] ${formatUnifiedStepStatus(next, label)}\n`);

    writeOrchestratorState(ROOT, {
      phase: "portfolio",
      suiteId: stepId,
      suiteLabel: label,
      jobId,
      verdict: "ON_TRACK",
      nextWorkerMode: "continue",
      failingCount: next.failing.length,
      notTestedCount: next.notTested.length,
      finished: false,
      humanAction: null,
      humanMessage: null
    });

    const infraOk = await ensureStepInfra(stepId, appendLog, killFlagPath, jobId);
    if (!infraOk) {
      return { exitCode: 2, passed: false, summary: "human:infra" };
    }

      let status = summarizeUnifiedStep(loadUnifiedPortfolio(ROOT), stepId, loopFilters);
    if (status.complete) continue;

    if (status.notTested.length > 0) {
      await appendLog(
        `[portfolio] Golden — ${status.notTested.length} item${status.notTested.length === 1 ? "" : "s"} not tested\n`
      );
      await runUnifiedGoldenBatch(
        ROOT,
        status.notTested,
        stepId,
        (t) => appendLog(t)
      );
      refreshPortfolio();
      status = summarizeUnifiedStep(loadUnifiedPortfolio(ROOT), stepId, filters);
      if (status.complete) {
        await appendLog(`[portfolio] ${label} — all PASS after golden\n`);
        stepAutoRetries = 0;
        continue;
      }
    }

    let fixRound = 0;
    let lastFailingKey = "";
    let staleFixRounds = 0;

    while (!summarizeUnifiedStep(loadUnifiedPortfolio(ROOT), stepId, loopFilters).complete) {
      if (existsSync(killFlagPath)) break;

      status = summarizeUnifiedStep(loadUnifiedPortfolio(ROOT), stepId, loopFilters);
      if (status.complete) break;

      if (sessionAgentCalls >= maxAgentCalls) {
        await pauseWithHuman(jobId, "max_rounds_exceeded", appendLog);
        return { exitCode: 2, passed: false, summary: "max_agent_calls" };
      }

      if (!status.failing.length) {
        if (status.notTested.length > 0) {
          await runUnifiedGoldenBatch(ROOT, status.notTested, stepId, (t) => appendLog(t));
          refreshPortfolio();
        }
        break;
      }

      fixRound += 1;
      if (fixRound > maxFixRounds) {
        await pauseWithHuman(jobId, "max_rounds_exceeded", appendLog);
        return { exitCode: 2, passed: false, summary: "max_fix_rounds" };
      }

      const fixGroups = groupFixTargets({ ...status, stepId });
      const failingKey = [...fixGroups.entries()]
        .map(([s, ids]) => `${s}:${ids.sort().join(",")}`)
        .join("|");
      const sameFailures = failingKey === lastFailingKey && fixRound >= 1;
      lastFailingKey = failingKey;

      for (const [fixSuiteId, storyIds] of fixGroups) {
        const suiteLabel = SUITES[fixSuiteId]?.label ?? fixSuiteId;
        await appendLog(
          `[portfolio] Fix round ${fixRound} · ${suiteLabel} · ${storyIds.length} item${storyIds.length === 1 ? "" : "s"}\n`
        );
        sessionAgentCalls += storyIds.length;
        const fixResult = await runFixAllIterate(jobId, {
          killFlagPath,
          suiteId: fixSuiteId,
          storyIds
        });

        if (fixResult.blocked) {
          await pauseWithHuman(jobId, "cursor_usage_blocked", appendLog);
          return { exitCode: 2, passed: false, summary: "blocked:cursor_usage" };
        }
      }

      refreshPortfolio();

      if (sameFailures) {
        staleFixRounds += 1;
        if (staleFixRounds >= 2) {
          await pauseWithHuman(jobId, "stuck_no_progress", appendLog);
          return { exitCode: 2, passed: false, summary: "stuck_no_progress" };
        }
      } else {
        staleFixRounds = 0;
      }

      status = summarizeUnifiedStep(loadUnifiedPortfolio(ROOT), stepId, loopFilters);
      if (status.notTested.length > 0) {
        await runUnifiedGoldenBatch(ROOT, status.notTested, stepId, (t) => appendLog(t));
        refreshPortfolio();
      }
    }

    status = summarizeUnifiedStep(loadUnifiedPortfolio(ROOT), stepId, loopFilters);
    if (!status.complete) {
      const usageFlag = join(ROOT, ".test-console", "cursor-usage-blocked.flag");
      if (existsSync(usageFlag)) {
        await pauseWithHuman(jobId, "cursor_usage_blocked", appendLog);
        return { exitCode: 2, passed: false, summary: "blocked:cursor_usage" };
      }

      if (auto && stepAutoRetries < maxAutoRetries) {
        stepAutoRetries += 1;
        await appendLog(
          `[portfolio] ${label} not green — auto retry ${stepAutoRetries}/${maxAutoRetries} in ${Math.round(AUTO_RETRY_MS / 1000)}s\n`
        );
        const cont = await sleepWithKillCheck(AUTO_RETRY_MS, killFlagPath, existsSync);
        if (!cont) break;
        continue;
      }

      await pauseWithHuman(jobId, "step_not_green", appendLog);
      return { exitCode: 1, passed: false, summary: `${stepId} not green` };
    }

    stepAutoRetries = 0;
    await appendLog(`[portfolio] ${label} done — next step…\n`);
  }

  if (existsSync(killFlagPath)) {
    writeOrchestratorState(ROOT, {
      phase: "portfolio",
      jobId,
      ...humanActionPayload("cancelled")
    });
    return { exitCode: 130, passed: false, summary: "cancelled" };
  }

  return { exitCode: 0, passed: true, summary: "PHASE_COMPLETE" };
}
