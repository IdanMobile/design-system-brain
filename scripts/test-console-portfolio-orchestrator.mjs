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
import { runFixAllIterate, MAX_TRIES_PER_STORY, SUITES } from "./test-console-fix-all-iterate.mjs";
import { writeFixerDeadEndReport, formatDeadEndLogBlock } from "./fixer-dead-end-report.mjs";
import { resolveStoryTestReportPath } from "./test-report-investigator.mjs";
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
  effectiveOrchestratorFilters,
  isRowPipelineComplete,
  withRowPipelineFilters,
  readRowCell
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
    const suite = fixSuiteForCell(item.entryPoint ?? "storybook", stepStatus.stepId, item.storyId, ROOT);
    if (!groups.has(suite)) groups.set(suite, []);
    groups.get(suite).push(item.storyId);
  }
  return groups;
}

function flowWorkWithSuite(work) {
  const suiteId = fixSuiteForCell(work.entryPoint ?? "storybook", work.stepId, work.storyId, ROOT);
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

function stepIsGreen(status) {
  return status === "pass" || status === "skipped";
}

/**
 * Stop orchestrator when fixer cannot green a step (no infinite retry loop).
 * @param {string} jobId
 * @param {(text: string, opts?: { localOnly?: boolean }) => Promise<void>} appendLog
 * @param {string} stepLabel
 * @param {string} [detail]
 * @param {{ storyId?: string, entryPoint?: string, stepId?: string }} [ctx]
 */
async function stopOrchestratorStuck(jobId, appendLog, stepLabel, detail, ctx = {}) {
  const title = `${stepLabel} FIX STUCK`;
  const message = detail ? `${title} — ${detail}` : title;

  const suiteId = ctx.stepId ?? null;
  const storyId = ctx.storyId ?? null;
  if (storyId && suiteId && !ctx.deadEndPath) {
    const testReportPath = resolveStoryTestReportPath(ROOT, storyId, suiteId);
    const deadEnd = writeFixerDeadEndReport(ROOT, {
      jobId,
      storyId,
      stepId: suiteId,
      suiteId,
      suiteLabel: stepLabel,
      entryPoint: ctx.entryPoint ?? "storybook",
      reason: "FIX_STUCK",
      detail: message,
      attemptsUsed: ctx.attemptsUsed ?? 0,
      maxAttempts: MAX_TRIES_PER_STORY,
      testReportPath,
      logFile: ctx.logFile ?? null
    });
    await appendLog(formatDeadEndLogBlock({ ...deadEnd.payload, path: deadEnd.path }));
  } else if (ctx.deadEndPath) {
    await appendLog(
      `\n[orchestrator] Dead-end report: ${ctx.deadEndPath}\n`
    );
  }

  writeOrchestratorState(ROOT, {
    phase: ctx.stepId ? "row-pipeline" : "portfolio",
    jobId,
    storyId: ctx.storyId ?? null,
    entryPoint: ctx.entryPoint ?? null,
    suiteId: ctx.stepId ?? null,
    suiteLabel: stepLabel,
    finished: true,
    verdict: "FIX_STUCK",
    exitReason: "FIX_STUCK",
    nextWorkerMode: "stopped",
    humanAction: "fix_stuck",
    humanMessage: message,
    humanTitle: title
  });
  await appendLog(`\n[orchestrator] ⛔ ${message}\n`);
  await appendLog("[orchestrator] Stopping — fixer exhausted or step blocked. Resolve and re-run Fix story.\n");
  return {
    exitCode: 1,
    passed: false,
    summary: "FIX_STUCK",
    stuckStep: stepLabel,
    stuckDetail: detail ?? null
  };
}

/**
 * Fix story / row pipeline: test → (pass → next) | (fail → fixer → re-test → pass → next) | stuck → stop.
 */
async function runRowPipelineSteps(
  jobId,
  rowPipeline,
  { appendLog, killFlagPath, filters, sessionAgentCallsRef, maxAgentCalls }
) {
  const storyId = rowPipeline.storyId;
  const entryPoint = rowPipeline.entryPoint ?? "storybook";
  const rowLabel = `${entryPoint}/${storyId}`;

  for (const stepId of UNIFIED_STEP_ORDER) {
    if (existsSync(killFlagPath)) {
      writeOrchestratorState(ROOT, {
        phase: "row-pipeline",
        jobId,
        storyId,
        entryPoint,
        finished: true,
        verdict: "CANCELLED",
        nextWorkerMode: "stopped"
      });
      return { exitCode: 130, passed: false, summary: "cancelled" };
    }

    refreshPortfolio();
    let portfolio = loadUnifiedPortfolio(ROOT);
    const cell = readRowCell(portfolio, storyId, entryPoint, stepId);
    const label = stepLabel(stepId);

    if (stepIsGreen(cell.status)) {
      await appendLog(`[orchestrator] ${label} — PASS (skip to next step)\n`);
      continue;
    }

    if (!cell.canRun) {
      return stopOrchestratorStuck(
        jobId,
        appendLog,
        label,
        "Prerequisite step not green — cannot run this test yet",
        { storyId, entryPoint, stepId }
      );
    }

    await appendLog(`\n[orchestrator] ══ ${rowLabel} · ${label} ══\n`);

    writeOrchestratorState(ROOT, {
      phase: "row-pipeline",
      suiteId: stepId,
      suiteLabel: label,
      jobId,
      storyId,
      entryPoint,
      verdict: "ON_TRACK",
      nextWorkerMode: "continue",
      finished: false,
      humanAction: null,
      humanMessage: null
    });

    const infraOk = await ensureStepInfra(stepId, appendLog, killFlagPath, jobId);
    if (!infraOk) {
      return { exitCode: 2, passed: false, summary: "human:infra" };
    }

    await appendLog(`[orchestrator] TEST · ${label}\n`);
    await runUnifiedGoldenBatch(
      ROOT,
      [{ storyId, entryPoint }],
      stepId,
      (t) => appendLog(t)
    );
    refreshPortfolio();
    portfolio = loadUnifiedPortfolio(ROOT);
    let afterTest = readRowCell(portfolio, storyId, entryPoint, stepId);

    if (stepIsGreen(afterTest.status)) {
      await appendLog(`[orchestrator] ${label} — PASS → next step\n`);
      continue;
    }

    if (afterTest.status === "error") {
      return stopOrchestratorStuck(
        jobId,
        appendLog,
        label,
        afterTest.error ??
          "Test errored (config/infra) — not fixable by the code fixer; fix setup then re-run",
        { storyId, entryPoint, stepId }
      );
    }

    if (sessionAgentCallsRef.value >= maxAgentCalls) {
      await pauseWithHuman(jobId, "max_rounds_exceeded", appendLog);
      return { exitCode: 2, passed: false, summary: "max_agent_calls" };
    }

    await appendLog(
      `[orchestrator] FAIL · ${label} (${afterTest.status}${afterTest.percent ? ` ${afterTest.percent.toFixed(2)}%` : ""}) — running fixer (≤${MAX_TRIES_PER_STORY} attempts)\n`
    );
    sessionAgentCallsRef.value += 1;

    const suiteId = fixSuiteForCell(entryPoint, stepId, storyId, ROOT);
    const fixResult = await runFixAllIterate(jobId, {
      killFlagPath,
      suiteId,
      storyIds: [storyId],
      skipEndRetest: true,
      failFastOnLock: true
    });

    if (fixResult.blocked) {
      await pauseWithHuman(jobId, "cursor_usage_blocked", appendLog);
      return { exitCode: 2, passed: false, summary: "blocked:cursor_usage" };
    }

    if (fixResult.stuck || !fixResult.passed) {
      return stopOrchestratorStuck(
        jobId,
        appendLog,
        label,
        fixResult.stuckReason ?? fixResult.summary ?? "Fixer did not green this step",
        {
          storyId,
          entryPoint,
          stepId,
          attemptsUsed: fixResult.attemptsUsed,
          deadEndPath: fixResult.deadEndPath
        }
      );
    }

    await appendLog(`[orchestrator] RE-TEST · ${label}\n`);
    await runUnifiedGoldenBatch(
      ROOT,
      [{ storyId, entryPoint }],
      stepId,
      (t) => appendLog(t)
    );
    refreshPortfolio();
    portfolio = loadUnifiedPortfolio(ROOT);
    afterTest = readRowCell(portfolio, storyId, entryPoint, stepId);

    if (!stepIsGreen(afterTest.status)) {
      return stopOrchestratorStuck(
        jobId,
        appendLog,
        label,
        `Still ${afterTest.status} after fixer — ${fixResult.summary ?? "not green"}`,
        { storyId, entryPoint, stepId }
      );
    }

    await appendLog(`[orchestrator] ${label} — PASS after fix → next step\n`);
  }

  await appendLog(`\n[fix-story] ROW_COMPLETE — ${rowLabel} strict green.\n`);
  spawnSync("node", ["scripts/test-portfolio-merge.mjs"], { cwd: ROOT, stdio: "inherit" });
  writeOrchestratorState(ROOT, {
    phase: "row-pipeline",
    jobId,
    storyId,
    entryPoint,
    finished: true,
    verdict: "PHASE_COMPLETE",
    exitReason: "ROW_COMPLETE",
    humanMessage: null
  });
  return { exitCode: 0, passed: true, summary: "ROW_COMPLETE" };
}

/**
 * @param {string} jobId
 * @param {{ killFlagPath: string, autoMode?: boolean }} options
 */
export async function runPortfolioGolden(jobId, { killFlagPath, autoMode = false, rowPipeline = null }) {
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

  const appendLog = async (text, opts = {}) => {
    process.stdout.write(text);
    if (opts.localOnly) return;
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
  const filters = withRowPipelineFilters(
    effectiveOrchestratorFilters(settings),
    rowPipeline
  );
  const maxFixRounds = settings.maxFixRoundsPerStep ?? 10;
  const maxAutoRetries = settings.maxAutoRetriesWhenStuck ?? 3;
  const maxAgentCalls = settings.maxAgentCallsPerLaunch ?? 100;
  let sessionAgentCalls = 0;
  let stepAutoRetries = 0;
  const rowLabel = rowPipeline
    ? `${rowPipeline.entryPoint ?? "storybook"}/${rowPipeline.storyId}`
    : null;

  await appendLog(
    rowPipeline
      ? `[orchestrator] ═══ Fix story supervisor (this tab) ═══\n` +
          `[orchestrator] Row: ${rowLabel}\n` +
          `[orchestrator] Job: ${jobId}\n` +
          `[orchestrator] Pipeline: ${UNIFIED_STEP_ORDER.join(" → ")}\n` +
          `[orchestrator] Role: test each step → launch fixer agents → re-test until row green\n` +
          (settings.headlessAgents
            ? `[orchestrator] Agents run headless — lines tagged [agent:…] appear below as they work\n\n`
            : `[orchestrator] Fixer agents open in separate Terminal.app tabs\n\n`) +
          `[orchestrator] ${rowLabel} — strict 0.1% · test → fix loop per step until pass.\n\n`
      : `[run-all] Portfolio supervisor — strict 0.1% · one row at a time\n` +
          `[run-all] Each row: structural → Figma live → Storybook → ReactHtml → logic (test → fix until pass).\n` +
          `[run-all] Safety — fix rounds/step ≤${maxFixRounds}, auto-retries ≤${maxAutoRetries}, agent calls ≤${maxAgentCalls}\n\n`
  );

  refreshPortfolio();
  let portfolio = loadUnifiedPortfolio(ROOT);
  await appendLog(`[portfolio] Current state (${portfolio.storyCount ?? 0} items):\n${formatPortfolioOverview(portfolio, filters)}\n\n`);

  if (rowPipeline) {
    const sessionAgentCallsRef = { value: sessionAgentCalls };
    return runRowPipelineSteps(jobId, rowPipeline, {
      appendLog,
      killFlagPath,
      filters,
      sessionAgentCallsRef,
      maxAgentCalls
    });
  }

  /** Run-all mode: current row cursor (fix-story uses fixed rowPipeline instead). */
  let runAllRowCursor = null;

  while (!existsSync(killFlagPath)) {
    settings = loadRunSettings();
    refreshPortfolio();
    portfolio = loadUnifiedPortfolio(ROOT);

    if (!rowPipeline) {
      if (
        !runAllRowCursor ||
        isRowPipelineComplete(portfolio, runAllRowCursor.storyId, runAllRowCursor.entryPoint)
      ) {
        if (runAllRowCursor) {
          await appendLog(
            `\n[run-all] Row complete — ${runAllRowCursor.entryPoint}/${runAllRowCursor.storyId}\n`
          );
          spawnSync("node", ["scripts/test-portfolio-merge.mjs"], { cwd: ROOT, stdio: "inherit" });
        }
        const nextRow = (portfolio.rows ?? []).find(
          (r) => !isRowPipelineComplete(portfolio, r.storyId, r.entryPoint ?? "storybook")
        );
        if (!nextRow) {
          await appendLog("\n[run-all] All rows PASS — refreshing portfolio + context…\n");
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
          await appendLog("\n[run-all] PHASE_COMPLETE — unified portfolio strict green.\n");
          return { exitCode: 0, passed: true, summary: "PHASE_COMPLETE" };
        }
        runAllRowCursor = {
          storyId: nextRow.storyId,
          entryPoint: nextRow.entryPoint ?? "storybook"
        };
        await appendLog(
          `\n[run-all] Starting row ${runAllRowCursor.entryPoint}/${runAllRowCursor.storyId}\n`
        );
      }
    }

    const activeRow = runAllRowCursor;
    const loopFilters = withRowPipelineFilters(
      effectiveOrchestratorFilters(settings),
      activeRow
    );

    const next = findNextFlowWork(portfolio, loopFilters);
    if (!next) {
      const blockedLabel = activeRow
        ? `${activeRow.entryPoint}/${activeRow.storyId}`
        : "portfolio";
      await pauseWithHuman(jobId, "step_not_green", appendLog);
      return {
        exitCode: 1,
        passed: false,
        summary: `row_blocked:${blockedLabel}`
      };
    }

    const work = flowWorkWithSuite(next);
    const stepId = work.stepId;
    const label = stepLabel(stepId);

    await appendLog(
      `\n[portfolio] ══ ${activeRow ? `${activeRow.entryPoint}/${activeRow.storyId}` : "row"} · ${label} ══\n`
    );

    writeOrchestratorState(ROOT, {
      phase: "portfolio",
      suiteId: stepId,
      suiteLabel: label,
      jobId,
      storyId: work.storyId,
      entryPoint: work.entryPoint,
      verdict: "ON_TRACK",
      nextWorkerMode: "continue",
      failingCount: work.kind === "fix" ? 1 : 0,
      notTestedCount: work.kind === "golden" ? 1 : 0,
      parallelCount: 1,
      finished: false,
      humanAction: null,
      humanMessage: null
    });

    const infraOk = await ensureStepInfra(stepId, appendLog, killFlagPath, jobId);
    if (!infraOk) {
      return { exitCode: 2, passed: false, summary: "human:infra" };
    }

    if (sessionAgentCalls >= maxAgentCalls) {
      await pauseWithHuman(jobId, "max_rounds_exceeded", appendLog);
      return { exitCode: 2, passed: false, summary: "max_agent_calls" };
    }

    if (work.kind === "golden") {
      await appendLog(
        `[portfolio] Golden · ${work.storyId} · ${work.suiteLabel} · status ${work.status}\n`
      );
      await runUnifiedGoldenBatch(
        ROOT,
        [{ storyId: work.storyId, entryPoint: work.entryPoint ?? "storybook" }],
        stepId,
        (t) => appendLog(t)
      );
    } else {
      await appendLog(
        `[portfolio] Fix · ${work.storyId} · ${work.suiteLabel} · status ${work.status}` +
          (work.percent ? ` (${work.percent.toFixed(2)}%)` : "") +
          "\n"
      );
      sessionAgentCalls += 1;
      const fixResult = await runFixAllIterate(jobId, {
        killFlagPath,
        suiteId: work.suiteId,
        storyIds: [work.storyId],
        failFastOnLock: true
      });
      if (fixResult.blocked) {
        await pauseWithHuman(jobId, "cursor_usage_blocked", appendLog);
        return { exitCode: 2, passed: false, summary: "blocked:cursor_usage" };
      }
      if (fixResult.stuck || !fixResult.passed) {
        return stopOrchestratorStuck(
          jobId,
          appendLog,
          label,
          fixResult.stuckReason ?? fixResult.summary ?? "Fixer did not green this step",
          { storyId: work.storyId, entryPoint: work.entryPoint, stepId }
        );
      }
    }

    refreshPortfolio();
    stepAutoRetries = 0;
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
