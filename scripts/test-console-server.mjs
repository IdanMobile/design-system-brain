#!/usr/bin/env node
/**
 * Test console API + static UI + report file server.
 *
 *   node scripts/test-console-server.mjs           # UI (6110) + API + /repo/*
 *   node scripts/test-console-server.mjs --api-only # API only (6111) for Vite dev
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { initAgentBridge } from "./test-console-agent-bridge.mjs";
import {
  fetchPending,
  hasCursorAgent,
  isDispatchableMessage,
  isFixAllEntry,
  openTerminalForAgent,
  openTerminalForJob,
  openTerminalRunFixAll,
  openTerminalRunPortfolioOrchestrator,
  openTerminalWatchJob
} from "./test-console-cursor.mjs";
import { MAX_TRIES_PER_STORY } from "./test-console-fix-all-iterate.mjs";
import { openTerminal, killOrchestratorJobProcesses } from "./test-console-terminal.mjs";
import {
  loadOrchestratorAuto,
  setOrchestratorAuto
} from "./test-console-orchestrator-auto.mjs";
import { loadOrchestratorState } from "./test-console-worker-supervisor.mjs";
import { loadRunSettings, setRunSettings, resolveGoldenRunAll } from "./test-console-run-settings.mjs";
import { loadAgentModelOptions } from "./test-console-agent-models.mjs";
import { SERVICE_TERMINAL } from "./test-console-services.mjs";
import {
  ACTION_META,
  computeRecommendation,
  enrichActions,
  SUITE_HELP
} from "./test-console-actions.mjs";
import {
  TEST_STEPS,
  recommendAction,
  recommendActionForRow,
  canRunStep,
  resolvePipelineStatuses,
  loadPortfolioStoryIds,
  isStorybookOnlyStory
} from "./test-portfolio-config.mjs";
import { assertActionGate, ACTION_STEP } from "./step-gate.mjs";
import { TEST_CONSOLE_SERVER_VERSION } from "./test-console-version.mjs";
import { buildArchitectureConsoleState } from "./architecture-console.mjs";
import {
  approveDeveloperProposal,
  discardDeveloperProposal,
  loadDeveloperProposal
} from "./developer-proposal.mjs";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const REPO = resolve(__dirname, "..");
const UI_ROOT = resolve(REPO, "packages/test-console/dist");
const PORT = Number(process.env.TEST_CONSOLE_PORT ?? (process.argv.includes("--api-only") ? 6111 : 6110));
const API_ONLY = process.argv.includes("--api-only");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const agent = initAgentBridge(REPO);

const SUITES = {
  pixel: { dir: "pixel-diffs", label: "Pixel (schema)", figmaField: null, stepId: "pixel" },
  figma: { dir: "figma-diffs", label: "Figma emulator", figmaField: "renderedPng", stepId: "figma" },
  figmaLive: {
    dir: "figma-live-diffs",
    label: "Figma live",
    figmaField: "figmaPng",
    stepId: "figmaLive"
  },
  delivery: { dir: "delivery-diffs", label: "Delivery (3-way)", figmaField: "figmaPng", stepId: "delivery" },
  logic: { dir: "logic-audit-diffs", label: "Logic audit", figmaField: null, stepId: "logic" }
};

/** Actions that may run alongside other test jobs. */
const PARALLEL_SAFE_ACTIONS = new Set([
  "pixel:golden",
  "figma:golden",
  "delivery:golden",
  "logic:golden",
  "plugin:build"
]);

/** Only one of these at a time. */
const SERIAL_ACTIONS = new Set([
  "figma:live:golden",
  "figma:run-until-pass",
  "tests:parallel",
  "portfolio-orchestrator"
]);

function portfolioStoryIds() {
  return loadPortfolioStoryIds(REPO, readFileSync, existsSync, join);
}

function refreshPortfolioAsync() {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/test-portfolio-merge.mjs"], {
      cwd: REPO,
      stdio: "ignore",
      env: process.env
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`portfolio merge exited ${code ?? 1}`));
    });
  });
}

function readStoryResultFromDisk(suiteId, storyId) {
  const cfg = SUITES[suiteId];
  const path = join(REPO, cfg.dir, "by-story", safeSegment(storyId), "result.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** @type {Map<string, { id: string, action: string, status: string, logs: string[], exitCode: number | null, startedAt: string, endedAt?: string, child?: import('node:child_process').ChildProcess }>} */
const jobs = new Map();
const background = new Map();

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(body));
}

function safeRepoPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.replace(/^\/repo\/?/, ""));
  const resolved = resolve(REPO, decoded);
  if (!resolved.startsWith(REPO + sep) && resolved !== REPO) return null;
  return resolved;
}

async function checkStorybook() {
  try {
    const res = await fetch("http://127.0.0.1:6107/index.json", { signal: AbortSignal.timeout(2000) });
    return { ok: res.ok, url: "http://127.0.0.1:6107" };
  } catch {
    return { ok: false, url: "http://127.0.0.1:6107" };
  }
}

async function checkPlayground() {
  const base = "http://127.0.0.1:6108";
  try {
    const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(2000) });
    return { ok: res.ok, url: base, showcaseUrl: `${base}/?view=showcase` };
  } catch {
    return { ok: false, url: base, showcaseUrl: `${base}/?view=showcase` };
  }
}

function checkRelay() {
  return new Promise((resolveRelay) => {
    const ws = new WebSocket("ws://localhost:3456");
    const timer = setTimeout(() => {
      ws.close();
      resolveRelay({ ok: false, pluginConnected: false, url: "ws://localhost:3456" });
    }, 2000);
    ws.onopen = () => ws.send(JSON.stringify({ type: "health" }));
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data));
        clearTimeout(timer);
        ws.close();
        resolveRelay({
          ok: msg.relay === "ok",
          pluginConnected: Boolean(msg.pluginConnected),
          url: "ws://localhost:3456"
        });
      } catch {
        resolveRelay({ ok: false, pluginConnected: false, url: "ws://localhost:3456" });
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolveRelay({ ok: false, pluginConnected: false, url: "ws://localhost:3456" });
    };
  });
}

function serializeJob(j, { includeLogs = false } = {}) {
  const base = {
    id: j.id,
    action: j.action,
    story: j.story ?? null,
    allStories: Boolean(j.allStories),
    label: j.label,
    status: j.status,
    finalizing: Boolean(j.finalizing),
    exitCode: j.exitCode,
    startedAt: j.startedAt,
    endedAt: j.endedAt
  };
  if (j.storyIds?.length) {
    base.storyIds = j.storyIds;
  }
  if (includeLogs) {
    const text = j.logs.join("");
    base.logs = text;
    base.logLength = text.length;
  }
  return base;
}

/** Running jobs always included — recent completed capped so poll/stream never lose active work. */
function jobsForState() {
  reconcileStaleJobs();
  const all = [...jobs.values()];
  const running = all.filter((j) => j.status === "running" || j.finalizing);
  const recent = all.slice(-8);
  const byId = new Map();
  for (const j of [...running, ...recent]) {
    byId.set(j.id, j);
  }
  return [...byId.values()]
    .sort((a, b) => String(b.startedAt ?? "").localeCompare(String(a.startedAt ?? "")))
    .map(serializeJob);
}

function fixAllRemainingCount(report) {
  if (!report?.exists) return null;
  return (
    (report.counts?.fail ?? 0) + (report.counts?.error ?? 0) + (report.counts?.warn ?? 0)
  );
}

/** True if pid exists (EPERM still means the process is alive). */
function isProcessAlive(pid) {
  if (pid == null || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && typeof e === "object" && "code" in e && e.code === "EPERM";
  }
}

function markFixAllEnded(job, { killed, note }) {
  job.status = killed ? "killed" : "failed";
  job.exitCode = killed ? 130 : (job.exitCode ?? 1);
  job.endedAt = job.endedAt ?? new Date().toISOString();
  if (note) job.logs.push(note);
}

/** Child exited but handler not run yet (e.g. portfolio refresh). */
function reconcileStaleJobs() {
  for (const job of jobs.values()) {
    if (job.status !== "running") continue;
    if (job.finalizing) continue;

    const childDone = job.child != null && job.child.exitCode !== null;
    if (childDone) {
      job.exitCode = job.child.exitCode ?? job.exitCode ?? 1;
      if (job.killed) {
        job.status = "killed";
      } else {
        job.status = job.exitCode === 0 ? "passed" : "failed";
      }
      job.endedAt = job.endedAt ?? new Date().toISOString();
      continue;
    }

    if (!String(job.action ?? "").startsWith("fix-all:") && job.action !== "portfolio-orchestrator") {
      continue;
    }

    const orch = job.fixAllOrchestratorPid;
    if (orch != null && !isProcessAlive(orch)) {
      const wasPortfolio = job.action === "portfolio-orchestrator";
      markFixAllEnded(job, {
        killed: true,
        note: wasPortfolio
          ? "[test-console] Portfolio supervisor ended (terminal closed or crashed)\n"
          : "[test-console] Fix-all process ended (terminal closed or crashed)\n"
      });
      if (wasPortfolio && loadOrchestratorAuto().enabled) {
        setTimeout(() => ensureAutoOrchestratorRunning(true), 3000);
      }
    }
  }
}

function summarizeReport(suiteId) {
  const cfg = SUITES[suiteId];
  const reportPath = join(REPO, cfg.dir, "report.json");
  if (!existsSync(reportPath)) {
    return { suiteId, label: cfg.label, dir: cfg.dir, exists: false };
  }
  try {
    const raw = JSON.parse(readFileSync(reportPath, "utf8"));
    const results = raw.results ?? [];
    const counts = { pass: 0, warn: 0, fail: 0, error: 0, not_tested: 0 };
    for (const r of results) {
      let status = r.status ?? "error";
      if (suiteId === "logic" && status === "gap") status = "warn";
      counts[status] = (counts[status] ?? 0) + 1;
    }
    const portfolioIds = portfolioStoryIds();
    const totalStories = portfolioIds.length || results.length;
    // Older reports may only cover a subset (e.g. delivery golden = 12 stories).
    const missingFromReport = Math.max(0, totalStories - results.length);
    counts.not_tested += missingFromReport;
    const st = statSync(reportPath);
    return {
      suiteId,
      label: cfg.label,
      dir: cfg.dir,
      exists: true,
      generatedAt: raw.generatedAt ?? null,
      tolerance: raw.tolerance,
      regionTolerance: raw.regionTolerance,
      total: totalStories,
      tested: results.filter((r) => r.status !== "not_tested").length,
      counts,
      htmlUrl: `/repo/${cfg.dir}/report.html`,
      reportUrl: `/repo/${cfg.dir}/report.json`
    };
  } catch (e) {
    return { suiteId, label: cfg.label, dir: cfg.dir, exists: false, error: String(e) };
  }
}

function toPublicPath(abs) {
  if (!abs || typeof abs !== "string") return null;
  const rel = abs.startsWith(REPO) ? abs.slice(REPO.length).replace(/^\//, "") : null;
  return rel ? `/repo/${rel.split(sep).join("/")}` : null;
}

function normalizeStoryResult(r, suiteId) {
  const cfg = SUITES[suiteId];
  const figmaPath = cfg.figmaField ? r[cfg.figmaField] : null;
  const storyDir = join(REPO, cfg.dir, safeSegment(r.storyId));
  if (suiteId === "logic") {
    return {
      storyId: r.storyId,
      status: r.status === "gap" ? "warn" : r.status,
      percent: r.percent ?? r.staticShellCount ?? 0,
      maxRegionPercent: r.maxRegionPercent ?? r.dsBuiltinCount,
      error: r.error,
      compareUrl: toPublicPath(join(REPO, cfg.dir, "report.html"))
    };
  }
  if (suiteId === "delivery") {
    const sbFigma = r.storybookVsFigma ?? {};
    return {
      storyId: r.storyId,
      status: r.status ?? sbFigma.status,
      percent: sbFigma.percent ?? 0,
      maxRegionPercent: undefined,
      error: r.error,
      storybookUrl: toPublicPath(r.storybookPng),
      figmaUrl: toPublicPath(r.figmaPng),
      diffUrl: toPublicPath(sbFigma.diffPng),
      compareUrl: null
    };
  }
  return {
    storyId: r.storyId,
    status: r.status,
    percent: r.percent,
    maxRegionPercent: r.maxRegionPercent,
    error: r.error,
    storybookUrl: toPublicPath(r.storybookPng),
    figmaUrl: toPublicPath(figmaPath ?? r.figmaPng),
    diffUrl: toPublicPath(r.diffPng),
    compareUrl: r.diffRegions?.[0]?.compare
      ? toPublicPath(join(storyDir, r.diffRegions[0].compare))
      : null
  };
}

function safeSegment(id) {
  return id.replace(/[<>:"/\\|?*]/g, "-").replace(/-+/g, "-");
}

const ACTIONS = Object.fromEntries(
  Object.entries({
    "relay:start": {
      command: ["node", "scripts/figma-live-relay.mjs"],
      background: true
    },
    "storybook:serve": {
      command: ["node", "scripts/serve-storybook.mjs"],
      background: true
    },
    "playground:serve": {
      command: ["node", "scripts/serve-playground.mjs"],
      background: true
    },
    "plugin:build": {
      command: ["pnpm", "--filter", "@lab/figma-importer-plugin", "build"]
    },
    "pixel:golden": { command: ["pnpm", "test:pixel:golden"] },
    "figma:golden": { command: ["pnpm", "figma:iterate"] },
    "figma:live:golden": {
      command: ["pnpm", "figma:live-iterate"],
      needsRelay: true
    },
    "figma:run-until-pass": {
      command: ["node", "scripts/test-console-run-until-pass.mjs"],
      sweep: true
    },
    "delivery:golden": { command: ["pnpm", "test:delivery:golden"] },
    "logic:golden": { command: ["pnpm", "test:logic:audit:all"] },
    "tests:parallel": {
      command: ["node", "scripts/test-console-parallel.mjs"],
      parallel: true
    }
  }).map(([id, def]) => [
    id,
    {
      ...ACTION_META[id],
      ...def,
      label: ACTION_META[id]?.label ?? id,
      description: ACTION_META[id]?.description ?? ""
    }
  ])
);

function resolveSpawn(actionId, story, allStories = false) {
  const def = ACTIONS[actionId];
  if (!def) throw new Error(`Unknown action: ${actionId}`);
  const runSettings = loadRunSettings();

  if (allStories && !story) {
    const ids = portfolioStoryIds();
    if (!ids.length) {
      throw new Error("No portfolio stories — ensure artifacts/stories.index.json exists");
    }
    const goldenRun = resolveGoldenRunAll(REPO, actionId, ids, runSettings);
    if (goldenRun) {
      return {
        bin: goldenRun.bin,
        args: goldenRun.args,
        env: goldenRun.env,
        labelSuffix: goldenRun.labelSuffix,
        filteredCount: goldenRun.filteredCount,
        storyCount: goldenRun.storyCount,
        empty: goldenRun.empty
      };
    }
  }

  if (story && actionId === "figma:golden") {
    return { bin: "node", args: ["scripts/figma-iterate.mjs", "--story", story] };
  }
  if (story && actionId === "figma:live:golden") {
    return { bin: "node", args: ["scripts/figma-live-iterate.mjs", "--story", story] };
  }
  if (story && actionId === "pixel:golden") {
    return {
      bin: "pnpm",
      args: ["--filter", "@lab/pixel-test", "test:golden", "--", "--stories", story]
    };
  }
  if (story && actionId === "delivery:golden") {
    return {
      bin: "pnpm",
      args: ["--filter", "@lab/pixel-test", "test:delivery:golden", "--", "--stories", story]
    };
  }
  if (story && actionId === "logic:golden") {
    return {
      bin: "pnpm",
      args: ["--filter", "@lab/pixel-test", "test:logic:audit", "--", "--stories", story]
    };
  }
  const [bin, ...args] = def.command;
  return { bin, args };
}

function runAction(actionId, story, allStories = false) {
  const def = ACTIONS[actionId];
  if (!def) throw new Error(`Unknown action: ${actionId}`);
  const id = randomUUID();
  const portfolioIds = allStories && !story ? portfolioStoryIds() : null;
  const spawnSpec = resolveSpawn(actionId, story, allStories);
  const { bin, args } = spawnSpec;
  const labelCount = spawnSpec.filteredCount ?? portfolioIds?.length;
  const job = {
    id,
    action: actionId,
    story: story ?? null,
    allStories: Boolean(allStories && !story),
    label:
      portfolioIds && labelCount != null
        ? `${def.label}${spawnSpec.labelSuffix ?? ` (${labelCount} stories)`}`
        : def.label,
    status: "running",
    logs: [],
    exitCode: null,
    startedAt: new Date().toISOString()
  };
  jobs.set(id, job);

  if (spawnSpec.empty) {
    job.logs.push("[golden] Nothing to run — all stories pass or filtered by run settings\n");
    job.status = "passed";
    job.exitCode = 0;
    job.endedAt = new Date().toISOString();
    return id;
  }

  const child = spawn(bin, args, {
    cwd: REPO,
    env: { ...process.env, FORCE_COLOR: "0", ...(spawnSpec.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  job.child = child;

  const append = (chunk) => {
    const text = String(chunk);
    job.logs.push(text);
    if (job.logs.length > 500) job.logs = job.logs.slice(-500);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  if (def.background) {
    background.set(actionId, child);
    job.status = "background";
    job.logs.push(`[background] ${def.label} started (pid ${child.pid})\n`);
    job.cursorQueued = agent.enqueueActionStarted(actionId, job);
    return id;
  }

  child.on("close", (code) => {
    job.exitCode = code ?? 1;
    const finalStatus = job.killed ? "killed" : code === 0 ? "passed" : "failed";
    if (job.killed && job.exitCode === 0) job.exitCode = 130;
    job.endedAt = new Date().toISOString();
    job.finalizing = true;
    job.status = finalStatus;
    job.logs.push("[test-console] Saving suite reports and portfolio…\n");
    void (async () => {
      try {
        if (
          [
            "pixel:golden",
            "figma:golden",
            "figma:live:golden",
            "delivery:golden",
            "tests:parallel",
            "figma:run-until-pass"
          ].includes(actionId)
        ) {
          try {
            await refreshPortfolioAsync();
          } catch (e) {
            job.logs.push(
              `[portfolio] refresh failed: ${e instanceof Error ? e.message : String(e)}\n`
            );
          }
        }
        job.cursorQueued =
          agent.enqueueJobFinished(actionId, job, SUITES, summarizeReport, safeSegment) ?? null;
        const suiteDirByAction = {
          "pixel:golden": "pixel",
          "figma:golden": "figma",
          "figma:live:golden": "figmaLive",
          "delivery:golden": "delivery",
          "logic:golden": "logic"
        };
        const suiteDir = SUITES[suiteDirByAction[actionId]]?.dir;
        if (suiteDir) {
          job.logs.push(`[test-console] Reports: ${suiteDir}/report.html\n`);
        }
        job.logs.push("[test-console] Done — test console will refresh counts.\n");
      } finally {
        job.finalizing = false;
      }
    })();
  });

  return id;
}

const SUITE_GOLDEN_ACTION = {
  pixel: "pixel:golden",
  figma: "figma:golden",
  figmaLive: "figma:live:golden",
  delivery: "delivery:golden",
  logic: "logic:golden"
};

/** Stop portfolio/suite golden runs so Fix all is the only active terminal workflow. */
function cancelConflictingSuiteRuns(suiteId) {
  const goldenAction = SUITE_GOLDEN_ACTION[suiteId];
  if (!goldenAction) return [];
  const stopped = [];
  for (const job of jobs.values()) {
    if (job.action !== goldenAction || (job.status !== "running" && !job.finalizing)) continue;
    job.killed = true;
    job.finalizing = false;
    job.status = "killed";
    job.exitCode = 130;
    job.endedAt = new Date().toISOString();
    if (job.child && job.child.exitCode === null) {
      job.child.kill("SIGTERM");
    }
    job.logs.push("[test-console] Stopped — Fix all started (close any after-job tab)\n");
    stopped.push(job.id);
  }
  return stopped;
}

function runFixAllAction(suiteId) {
  return runFixOneOrAllAction(suiteId, null, { openTerminal: true });
}

/**
 * Fix→test loop for one story (same harness as Fix all).
 * @param {string} suiteId
 * @param {string} storyId
 * @param {{ openTerminal?: boolean }} [options]
 */
function runFixOneAction(suiteId, storyId, { openTerminal = true } = {}) {
  if (!storyId) throw new Error("storyId required for single-story fix");
  return runFixOneOrAllAction(suiteId, storyId, { openTerminal });
}

function runFixOneOrAllAction(suiteId, singleStoryId, { openTerminal = true } = {}) {
  reconcileStaleJobs();
  agent.clearPending();
  const portfolioRunning = [...jobs.values()].some(
    (j) => (j.status === "running" || j.finalizing) && j.action === "portfolio-orchestrator"
  );
  if (portfolioRunning) {
    throw new Error("Portfolio orchestrator is running — wait or cancel it first");
  }
  const targetSuite = suiteId ?? "figmaLive";
  const stoppedRuns = cancelConflictingSuiteRuns(targetSuite);
  const fixAllAction = `fix-all:${targetSuite}`;
  const already = [...jobs.values()].some(
    (j) => (j.status === "running" || j.finalizing) && j.action === fixAllAction
  );
  if (already) {
    throw new Error(`Fix all already running for ${SUITES[targetSuite]?.label ?? targetSuite}`);
  }

  let storyIds;
  let entry = null;
  if (singleStoryId) {
    const storyMeta = agent.getStoryFromReport(
      targetSuite,
      singleStoryId,
      SUITES,
      safeSegment
    );
    if (!storyMeta) {
      throw new Error(`No report row for ${singleStoryId} in ${targetSuite}`);
    }
    if (storyMeta.status === "pass") {
      throw new Error(`${singleStoryId} is already PASS in ${SUITES[targetSuite]?.label ?? targetSuite}`);
    }
    storyIds = [singleStoryId];
  } else {
    entry = agent.requestFixAll(targetSuite, SUITES, summarizeReport, safeSegment);
    if (!isFixAllEntry(entry)) {
      throw new Error(
        entry?.type === "user_request"
          ? (entry.cursorPrompt?.split("\n")[0] ?? "No failing or warn stories in this suite")
          : "No failing or warn stories in this suite"
      );
    }
    storyIds = entry.storyIds ?? [];
  }

  if (!hasCursorAgent()) {
    throw new Error(
      "Cursor CLI not found. Install: curl https://cursor.com/install -fsS | bash (then: agent --version)"
    );
  }

  const id = randomUUID();
  const cfg = SUITES[targetSuite];
  const job = {
    id,
    action: fixAllAction,
    story: singleStoryId ?? null,
    label: singleStoryId
      ? `Fix · ${cfg?.label ?? targetSuite} · ${singleStoryId}`
      : `Fix all · ${cfg?.label ?? targetSuite} (${storyIds.length} stories)`,
    status: "running",
    storyIds,
    singleStory: Boolean(singleStoryId),
    logs: [
      ...(stoppedRuns.length
        ? [`[fix-all] Stopped ${stoppedRuns.length} suite test run(s) — use this tab only\n`]
        : []),
      singleStoryId
        ? `[fix-all] Single-story fix→test loop — ${singleStoryId} (≤${MAX_TRIES_PER_STORY} tries)\n`
        : `[fix-all] Queued ${storyIds.length} stor${storyIds.length === 1 ? "y" : "ies"} for Cursor agent…\n`
    ],
    exitCode: null,
    startedAt: new Date().toISOString(),
    agentMessageId: entry?.id ?? null
  };
  jobs.set(id, job);

  for (let i = 0; i < storyIds.length; i++) {
    job.logs.push(`  ${i + 1}. ${storyIds[i]}\n`);
  }

  if (entry?.cursorPrompt) {
    const promptDir = join(REPO, ".test-console");
    if (!existsSync(promptDir)) mkdirSync(promptDir, { recursive: true });
    writeFileSync(join(promptDir, `fix-all-${id}.prompt.txt`), entry.cursorPrompt, "utf8");
  }

  job.logs.push(
    storyIds.length > 1
      ? `[fix-all] Launching BATCH fix loop in Terminal (investigate → one agent → re-test all, ≤${MAX_TRIES_PER_STORY} serial fallback via FIX_ALL_SERIAL=1)…\n`
      : `[fix-all] Launching iterate loop in Terminal (≤${MAX_TRIES_PER_STORY} fix→test tries per story)…\n`
  );

  if (openTerminal) {
    openTerminalRunFixAll(id);
  }
  return { jobId: id, entry };
}

function cancelAllSuiteRuns() {
  const stopped = [];
  for (const suiteId of Object.keys(SUITES)) {
    stopped.push(...cancelConflictingSuiteRuns(suiteId));
  }
  return stopped;
}

function runPortfolioOrchestratorAction({ autoMode = false } = {}) {
  reconcileStaleJobs();
  agent.clearPending();

  if (autoMode) {
    setOrchestratorAuto(true);
  }

  const existingJob = getRunningPortfolioOrchestratorJob();
  if (existingJob) {
    if (autoMode) {
      return { jobId: existingJob.id, entry: null, alreadyRunning: true };
    }
    throw new Error("Portfolio orchestrator is already running");
  }

  if (orchestratorEnsureLock && autoMode) {
    const lockedExisting = getRunningPortfolioOrchestratorJobId();
    if (lockedExisting) {
      return { jobId: lockedExisting, entry: null, alreadyRunning: true };
    }
  }

  const alreadyFixAll = [...jobs.values()].some(
    (j) => (j.status === "running" || j.finalizing) && String(j.action ?? "").startsWith("fix-all:")
  );
  if (alreadyFixAll) {
    throw new Error("Fix all is already running — wait or cancel it first");
  }

  const stoppedRuns = cancelAllSuiteRuns();
  const storyIds = portfolioStoryIds();
  if (!storyIds.length) {
    throw new Error("No portfolio stories — run pnpm test:portfolio:refresh after Storybook index exists");
  }

  if (!hasCursorAgent()) {
    throw new Error(
      "Cursor CLI not found. Install: curl https://cursor.com/install -fsS | bash (then: agent --version)"
    );
  }

  const autoEnabled = autoMode || loadOrchestratorAuto().enabled;
  const entry = agent.requestPortfolioOrchestrator(storyIds.length);
  const id = randomUUID();
  const job = {
    id,
    action: "portfolio-orchestrator",
    story: null,
    label: autoEnabled
      ? `Orchestrator · AUTO (${storyIds.length} stories)`
      : `Orchestrator · golden path ALL (${storyIds.length} stories)`,
    status: "running",
    storyIds,
    autoMode: autoEnabled,
    logs: [
      ...(stoppedRuns.length
        ? [`[portfolio] Stopped ${stoppedRuns.length} suite test run(s)\n`]
        : []),
      autoEnabled
        ? `[portfolio] AUTO mode — supervisor stays alive and rescans for work\n`
        : `[portfolio] Golden path ALL — pixel → figma → live → delivery (${storyIds.length} stories)\n`,
      `[portfolio] Launching orchestrator in Terminal (≤${MAX_TRIES_PER_STORY} fix→test tries per story per step)…\n`
    ],
    exitCode: null,
    startedAt: new Date().toISOString(),
    agentMessageId: entry.id
  };
  jobs.set(id, job);

  const promptDir = join(REPO, ".test-console");
  if (!existsSync(promptDir)) mkdirSync(promptDir, { recursive: true });
  writeFileSync(join(promptDir, `portfolio-orchestrator-${id}.prompt.txt`), entry.cursorPrompt, "utf8");

  openTerminalRunPortfolioOrchestrator(id);
  return { jobId: id, entry };
}

function getRunningPortfolioOrchestratorJob() {
  return (
    [...jobs.values()].find(
      (j) => (j.status === "running" || j.finalizing) && j.action === "portfolio-orchestrator"
    ) ?? null
  );
}

function getRunningPortfolioOrchestratorJobId() {
  return getRunningPortfolioOrchestratorJob()?.id ?? null;
}

function portfolioOrchestratorRunning() {
  reconcileStaleJobs();
  return getRunningPortfolioOrchestratorJobId() != null;
}

let lastAutoEnsureAt = 0;
let orchestratorEnsureLock = false;

/** Restart supervisor Terminal when AUTO is on but nothing is running (server restart, closed tab, crash). */
function ensureAutoOrchestratorRunning(force = false) {
  if (!loadOrchestratorAuto().enabled) return null;

  reconcileStaleJobs();
  const existing = getRunningPortfolioOrchestratorJobId();
  if (existing) return existing;

  if (orchestratorEnsureLock) return null;

  const now = Date.now();
  if (!force && now - lastAutoEnsureAt < 20_000) return null;

  orchestratorEnsureLock = true;
  try {
    reconcileStaleJobs();
    const again = getRunningPortfolioOrchestratorJobId();
    if (again) return again;

    lastAutoEnsureAt = now;
    const { jobId } = runPortfolioOrchestratorAction({ autoMode: true });
    console.log(`[test-console] AUTO watchdog — started orchestrator ${jobId}`);
    return jobId;
  } catch (e) {
    const afterRace = getRunningPortfolioOrchestratorJobId();
    if (afterRace) return afterRace;
    console.warn(
      `[test-console] AUTO watchdog — could not start orchestrator: ${e instanceof Error ? e.message : e}`
    );
    return null;
  } finally {
    orchestratorEnsureLock = false;
  }
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return true;
  }

  if (url.pathname === "/api/state" && req.method === "GET") {
    const [storybook, playground, relay] = await Promise.all([
      checkStorybook(),
      checkPlayground(),
      checkRelay()
    ]);
    const inbox = agent.loadInbox().filter((m) => !m.read);
    const reports = Object.keys(SUITES).map(summarizeReport);
    const recommendation = computeRecommendation({
      storybook,
      playground,
      relay,
      pluginBuilt: existsSync(join(REPO, "packages/figma-importer-plugin/dist/code.js")),
      reports
    });
    json(res, 200, {
      serverVersion: TEST_CONSOLE_SERVER_VERSION,
      storybook,
      playground,
      relay,
      pluginBuilt: existsSync(join(REPO, "packages/figma-importer-plugin/dist/code.js")),
      uiBuilt: existsSync(join(UI_ROOT, "index.html")),
      agentUnread: inbox.length,
      agentLatest: agent.getPendingForChat() ?? inbox[inbox.length - 1] ?? null,
      pendingForCursor: agent.getPendingForChat(),
      recommendation,
      suiteHelp: SUITE_HELP,
      reports,
      jobs: jobsForState(),
      orchestratorAuto: loadOrchestratorAuto().enabled,
      orchestratorRunning: portfolioOrchestratorRunning(),
      workerSupervisor: loadOrchestratorState(REPO),
      runSettings: loadRunSettings(),
      agentModelOptions: loadAgentModelOptions()
    });
    return true;
  }

  if (url.pathname === "/api/actions" && req.method === "GET") {
    json(
      res,
      200,
      enrichActions(
        Object.entries(ACTIONS).map(([id, a]) => ({
          id,
          label: a.label,
          description: a.description,
          detail: a.detail,
          when: a.when,
          whenHint: a.whenHint,
          output: a.output,
          phase: a.phase,
          order: a.order,
          background: Boolean(a.background),
          needsRelay: Boolean(a.needsRelay),
          sweep: Boolean(a.sweep)
        }))
      )
    );
    return true;
  }

  if (url.pathname === "/api/portfolio" && req.method === "GET") {
    const portfolioPath = join(REPO, "test-portfolio", "portfolio.json");
    const storyIds = portfolioStoryIds();
    const stepIds = TEST_STEPS.map((s) => s.id);
    const rows = storyIds.map((storyId) => {
      const storybookOnly = isStorybookOnlyStory(storyId);
      const rawStatuses = {};
      for (const step of TEST_STEPS) {
        const suiteId = step.id === "figmaLive" ? "figmaLive" : step.id;
        const rec = readStoryResultFromDisk(suiteId, storyId);
        rawStatuses[step.id] = rec?.status ?? "not_tested";
      }
      const effectiveStatuses = resolvePipelineStatuses(rawStatuses, { storybookOnly });
      const statusByStep = {};
      for (const step of TEST_STEPS) {
        statusByStep[step.id] = { status: effectiveStatuses[step.id] };
      }
      const cells = {};
      for (const step of TEST_STEPS) {
        const suiteId = step.id === "figmaLive" ? "figmaLive" : step.id;
        const rec = readStoryResultFromDisk(suiteId, storyId);
        const status = effectiveStatuses[step.id];
        const gate = canRunStep(step.id, statusByStep, { storybookOnly });
        cells[step.id] = {
          status,
          percent: status !== "not_tested" && status !== "skipped" ? rec?.percent : undefined,
          maxRegionPercent:
            status !== "not_tested" && status !== "skipped" ? rec?.maxRegionPercent : undefined,
          testedAt: status !== "not_tested" && status !== "skipped" ? rec?.testedAt ?? null : null,
          canRun: gate.ok,
          blockedBy: gate.ok ? null : gate.blockedBy,
          blockedReason: gate.ok ? null : gate.reason,
          action: recommendActionForRow(step.id, status, statusByStep, {
            percent: rec?.percent,
            storybookOnly,
            error: rec?.error
          }),
          compareUrl:
            status !== "not_tested" && status !== "skipped" && rec?.diffRegions?.[0]?.compare
              ? `/repo/${SUITES[suiteId].dir}/${safeSegment(storyId)}/${rec.diffRegions[0].compare}`
              : null
        };
      }
      return { storyId, storybookOnly, cells };
    });
    json(res, 200, {
      generatedAt: existsSync(portfolioPath)
        ? JSON.parse(readFileSync(portfolioPath, "utf8")).generatedAt
        : null,
      storyCount: storyIds.length,
      steps: TEST_STEPS,
      stepIds,
      rows,
      htmlUrl: "/repo/test-portfolio/report.html"
    });
    return true;
  }

  if (url.pathname === "/api/developer-console" && req.method === "GET") {
    json(res, 200, buildArchitectureConsoleState(REPO));
    return true;
  }

  if (url.pathname === "/api/developer-console/audit" && req.method === "POST") {
    try {
      if (!hasCursorAgent()) {
        json(res, 503, {
          error: "Cursor CLI not found — install from cursor.com/docs/cli/overview"
        });
        return true;
      }
      openTerminal("node scripts/architect-audit-dispatch.mjs", REPO, {
        keepOpen: true,
        tabTitle: "Architect audit"
      });
      json(res, 200, { ok: true, terminalDispatched: true });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (url.pathname === "/api/developer-console/implement" && req.method === "POST") {
    try {
      if (!hasCursorAgent()) {
        json(res, 503, {
          error: "Cursor CLI not found — install from cursor.com/docs/cli/overview"
        });
        return true;
      }
      const existing = loadDeveloperProposal(REPO);
      if (existing?.status === "pending_approval") {
        json(res, 409, {
          error: "Proposal pending approval — Approve & apply or Discard first"
        });
        return true;
      }
      if (existing?.status === "running") {
        json(res, 409, { error: "Implement job already running" });
        return true;
      }
      openTerminal("node scripts/developer-implement-dispatch.mjs", REPO, {
        keepOpen: true,
        tabTitle: "Developer implement"
      });
      json(res, 200, { ok: true, terminalDispatched: true });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (url.pathname === "/api/developer-console/proposal/approve" && req.method === "POST") {
    try {
      const result = approveDeveloperProposal(REPO);
      if (!result.ok) {
        json(res, 400, result);
        return true;
      }
      json(res, 200, result);
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (url.pathname === "/api/developer-console/proposal/discard" && req.method === "POST") {
    try {
      const result = discardDeveloperProposal(REPO);
      if (!result.ok) {
        json(res, 400, result);
        return true;
      }
      json(res, 200, result);
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (url.pathname === "/api/developer-console/trigger" && req.method === "POST") {
    json(res, 410, {
      error: "Story fix triggers belong on Tests Console — Developer Agent page is architecture-only"
    });
    return true;
  }

  if (url.pathname.startsWith("/api/reports/") && req.method === "GET") {
    const suiteId = url.pathname.split("/").pop();
    const cfg = SUITES[suiteId];
    if (!cfg) {
      json(res, 404, { error: "Unknown suite" });
      return true;
    }
    const storyIds = portfolioStoryIds();
    const results = storyIds.map((storyId) => {
      const rec =
        readStoryResultFromDisk(suiteId, storyId) ??
        (() => {
          const reportPath = join(REPO, cfg.dir, "report.json");
          if (!existsSync(reportPath)) return null;
          const raw = JSON.parse(readFileSync(reportPath, "utf8"));
          return (raw.results ?? []).find((r) => r.storyId === storyId) ?? null;
        })();
      const storybookOnly = isStorybookOnlyStory(storyId);
      const status = rec?.status ?? "not_tested";
      const base =
        !rec || status === "not_tested"
          ? {
              storyId,
              status: "not_tested",
              percent: 0,
              storybookUrl: null,
              figmaUrl: null,
              diffUrl: null,
              compareUrl: null
            }
          : normalizeStoryResult(rec, suiteId);
      return {
        ...base,
        storyId,
        action: recommendAction(cfg.stepId, base.status ?? status, {
          percent: rec?.percent,
          storybookOnly,
          error: rec?.error
        })
      };
    });
    json(res, 200, { summary: summarizeReport(suiteId), results });
    return true;
  }

  if (url.pathname === "/api/terminal/service" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return true;
    }
    const def = SERVICE_TERMINAL[parsed.service];
    if (!def) {
      json(res, 400, { error: `Unknown service: ${parsed.service}` });
      return true;
    }
    openTerminal(def.command, REPO, { keepOpen: def.keepOpen });
    json(res, 200, { ok: true, command: def.command, cwd: REPO });
    return true;
  }

  if (url.pathname === "/api/run" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return true;
    }
    const actionId = parsed.action;
    const runningJobs = [...jobs.values()].filter(
      (j) => j.status === "running" || j.finalizing
    );
    const serialRunning = runningJobs.some((j) => SERIAL_ACTIONS.has(j.action));
    const liveRunning = runningJobs.some((j) => j.action === "figma:live:golden");
    if (SERIAL_ACTIONS.has(actionId) && runningJobs.length > 0) {
      json(res, 409, { error: "Another job is running — wait or use parallel-safe suites" });
      return true;
    }
    if (actionId === "figma:live:golden" && liveRunning) {
      json(res, 409, { error: "Figma live already running" });
      return true;
    }
    if (!PARALLEL_SAFE_ACTIONS.has(actionId) && serialRunning) {
      json(res, 409, { error: "A serial job is running (live / run-until-pass)" });
      return true;
    }
    if (!PARALLEL_SAFE_ACTIONS.has(actionId) && runningJobs.length > 0) {
      json(res, 409, { error: "A job is already running" });
      return true;
    }
    if (parsed.story && ACTION_STEP[parsed.action]) {
      const gate = assertActionGate(
        REPO,
        parsed.story,
        parsed.action,
        readFileSync,
        existsSync,
        join
      );
      if (!gate.ok) {
        json(res, 409, {
          error: gate.reason,
          blockedBy: gate.blockedBy,
          code: "step_gate"
        });
        return true;
      }
    }
    try {
      const def = ACTIONS[parsed.action];
      const pendingBefore = (await fetchPending().catch(() => null))?.id ?? null;
      const jobId = runAction(parsed.action, parsed.story, Boolean(parsed.allStories));
      const terminalDispatched = !def?.background;
      if (terminalDispatched) {
        const started = jobs.get(jobId);
        if (started?.allStories && !parsed.story) {
          openTerminalWatchJob(jobId);
        } else {
          openTerminalForJob(jobId, pendingBefore ?? undefined);
        }
      }
      json(res, 200, { jobId, terminalDispatched });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (url.pathname === "/api/orchestrator/auto" && req.method === "GET") {
    json(res, 200, loadOrchestratorAuto());
    return true;
  }

  if (url.pathname === "/api/run-settings" && req.method === "GET") {
    json(res, 200, loadRunSettings());
    return true;
  }

  if (url.pathname === "/api/agent-models" && req.method === "GET") {
    const refresh = url.searchParams.get("refresh") === "1";
    json(res, 200, { options: loadAgentModelOptions({ refresh }) });
    return true;
  }

  if (url.pathname === "/api/run-settings" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return true;
    }
    json(res, 200, setRunSettings(parsed));
    return true;
  }

  if (url.pathname === "/api/orchestrator/auto" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return true;
    }
    const payload = setOrchestratorAuto(Boolean(parsed.enabled));
    let started = null;
    if (payload.enabled) {
      const beforeId = getRunningPortfolioOrchestratorJobId();
      const jobId = ensureAutoOrchestratorRunning(true);
      if (jobId && jobId !== beforeId) started = jobId;
    }
    json(res, 200, {
      ...payload,
      started,
      runningJobId: getRunningPortfolioOrchestratorJobId()
    });
    return true;
  }

  if (url.pathname === "/api/orchestrator/ensure" && req.method === "POST") {
    const beforeId = getRunningPortfolioOrchestratorJobId();
    const jobId = beforeId ?? ensureAutoOrchestratorRunning(true);
    json(res, 200, {
      enabled: loadOrchestratorAuto().enabled,
      running: portfolioOrchestratorRunning(),
      started: beforeId ? null : jobId,
      runningJobId: getRunningPortfolioOrchestratorJobId()
    });
    return true;
  }

  if (url.pathname === "/api/agent/context" && req.method === "GET") {
    json(
      res,
      200,
      agent.buildAgentContext(SUITES, summarizeReport, safeSegment)
    );
    return true;
  }

  if (url.pathname === "/api/agent/inbox" && req.method === "GET") {
    const all = agent.loadInbox();
    json(res, 200, {
      unread: all.filter((m) => !m.read),
      all: all.slice(-20)
    });
    return true;
  }

  if (url.pathname === "/api/agent/ack" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return true;
    }
    const forChat = Boolean(parsed.forChat);
    const remaining = agent.ackMessages(parsed.ids ?? [], forChat);
    json(res, 200, { unread: remaining });
    return true;
  }

  if (url.pathname === "/api/agent/request-fix" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return true;
    }
    try {
      if (parsed.fixAll) {
        const { jobId, entry } = runFixAllAction(parsed.suiteId);
        json(res, 200, {
          jobId,
          message: entry,
          terminalDispatched: true,
          label: jobs.get(jobId)?.label
        });
      } else if (parsed.portfolioOrchestrator) {
        const { jobId, entry } = runPortfolioOrchestratorAction({
          autoMode: Boolean(parsed.autoMode)
        });
        json(res, 200, {
          jobId,
          message: entry,
          terminalDispatched: true,
          label: jobs.get(jobId)?.label,
          autoMode: Boolean(jobs.get(jobId)?.autoMode)
        });
      } else if (parsed.storyId) {
        const portfolioRunning = [...jobs.values()].some(
          (j) => (j.status === "running" || j.finalizing) && j.action === "portfolio-orchestrator"
        );
        if (portfolioRunning) {
          throw new Error("Portfolio orchestrator is running — wait or cancel it first");
        }
        const deferTerminal = Boolean(parsed.deferTerminal);
        const { jobId, entry } = runFixOneAction(parsed.suiteId ?? "figma", parsed.storyId, {
          openTerminal: !deferTerminal
        });
        json(res, 200, {
          jobId,
          message: entry,
          terminalDispatched: !deferTerminal,
          label: jobs.get(jobId)?.label,
          fixOneLoop: true
        });
      } else {
        const portfolioRunning = [...jobs.values()].some(
          (j) => (j.status === "running" || j.finalizing) && j.action === "portfolio-orchestrator"
        );
        if (portfolioRunning) {
          throw new Error("Portfolio orchestrator is running — wait or cancel it first");
        }
        const entry = agent.requestFix(
          parsed.suiteId,
          parsed.storyId,
          SUITES,
          summarizeReport,
          safeSegment
        );
        if (entry?.cursorPrompt) {
          openTerminalForAgent();
        }
        json(res, 200, {
          message: entry,
          terminalDispatched: Boolean(entry?.cursorPrompt)
        });
      }
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (url.pathname === "/api/agent/dispatch" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return true;
    }
    const pending = agent.getPendingForChat();
    if (parsed.jobId) {
      const pendingBefore = parsed.pendingBeforeId ?? pending?.id ?? undefined;
      openTerminalForJob(parsed.jobId, pendingBefore);
      json(res, 200, { terminalDispatched: true, jobId: parsed.jobId });
      return true;
    }
    if (pending && isDispatchableMessage(pending)) {
      openTerminalForAgent();
      json(res, 200, { terminalDispatched: true });
      return true;
    }
    json(res, 404, { error: "No dispatchable fix prompt" });
    return true;
  }

  if (url.pathname === "/api/agent/clear-pending" && req.method === "POST") {
    agent.clearPending();
    json(res, 200, { cleared: true });
    return true;
  }

  if (url.pathname === "/api/agent/pending" && req.method === "GET") {
    const pending = agent.getPendingForChat();
    json(res, 200, { message: pending });
    return true;
  }

  if (url.pathname === "/api/agent/wait" && req.method === "GET") {
    const timeout = Math.min(
      120_000,
      Math.max(1000, Number(url.searchParams.get("timeout") ?? 60_000))
    );
    const msg = await agent.waitForMessage(timeout);
    json(res, 200, { message: msg });
    return true;
  }

  const appendLogMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/append-log$/);
  if (appendLogMatch && req.method === "POST") {
    const job = jobs.get(appendLogMatch[1]);
    if (!job) {
      json(res, 404, { error: "Job not found" });
      return true;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return true;
    }
    if (parsed.text) {
      job.logs.push(String(parsed.text));
      if (job.logs.length > 500) job.logs = job.logs.slice(-500);
    }
    json(res, 200, { ok: true });
    return true;
  }

  const finishJobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/finish$/);
  if (finishJobMatch && req.method === "POST") {
    reconcileStaleJobs();
    const job = jobs.get(finishJobMatch[1]);
    if (!job) {
      json(res, 404, { error: "Job not found" });
      return true;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return true;
    }
    job.status = parsed.status ?? (parsed.exitCode === 0 ? "passed" : "failed");
    job.exitCode = parsed.exitCode ?? 1;
    job.endedAt = new Date().toISOString();
    const finishNote =
      job.action === "portfolio-orchestrator"
        ? `[portfolio] Supervisor exited (${job.status}, exit ${job.exitCode})\n`
        : `[fix-all] Cursor agent ${job.status} (exit ${job.exitCode}) — re-run suite golden to refresh reports\n`;
    job.logs.push(finishNote);
    if (job.agentMessageId) {
      agent.ackMessages([job.agentMessageId], false);
    }
    const autoOn = loadOrchestratorAuto().enabled;
    if (
      job.action === "portfolio-orchestrator" &&
      autoOn &&
      job.status !== "killed" &&
      parsed.exitCode !== 0
    ) {
      job.logs.push("[portfolio] AUTO ON — restarting supervisor in 3s…\n");
      setTimeout(() => {
        if (loadOrchestratorAuto().enabled) {
          ensureAutoOrchestratorRunning(true);
        }
      }, 3000);
    }
    json(res, 200, serializeJob(job));
    return true;
  }

  const registerChildMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/register-child$/);
  if (registerChildMatch && req.method === "POST") {
    const job = jobs.get(registerChildMatch[1]);
    if (!job) {
      json(res, 404, { error: "Job not found" });
      return true;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return true;
    }
    const pid = parsed.pid ?? null;
    if (String(job.action ?? "").startsWith("fix-all:") || job.action === "portfolio-orchestrator") {
      if (parsed.role === "orchestrator") {
        job.fixAllOrchestratorPid = pid;
      } else {
        if (!Array.isArray(job.fixAllActivePids)) job.fixAllActivePids = [];
        if (pid != null && !job.fixAllActivePids.includes(pid)) {
          job.fixAllActivePids.push(pid);
        }
        job.fixAllActivePid = pid;
      }
    } else {
      job.fixAllPid = pid;
    }
    json(res, 200, { ok: true });
    return true;
  }

  const killMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/kill$/);
  if (killMatch && req.method === "POST") {
    reconcileStaleJobs();
    const job = jobs.get(killMatch[1]);
    if (!job) {
      json(res, 404, { error: "Job not found" });
      return true;
    }
    if (job.status !== "running" && !job.finalizing) {
      json(res, 409, { error: `Job is not running (${job.status})` });
      return true;
    }
    job.killed = true;
    job.finalizing = false;
    if (job.child && job.child.exitCode === null) {
      job.child.kill("SIGTERM");
      job.logs.push("[test-console] Cancelled by user\n");
    } else if (String(job.action).startsWith("fix-all:") || job.action === "portfolio-orchestrator") {
      const killFlag = join(
        REPO,
        ".test-console",
        job.action === "portfolio-orchestrator"
          ? `portfolio-orchestrator-${job.id}.kill`
          : `fix-all-${job.id}.kill`
      );
      try {
        if (!existsSync(join(REPO, ".test-console"))) {
          mkdirSync(join(REPO, ".test-console"), { recursive: true });
        }
        writeFileSync(killFlag, "");
      } catch {
        /* ok */
      }
      const killedPids = killOrchestratorJobProcesses(job, { signal: "SIGTERM" });
      if (killedPids.length) {
        job.logs.push(
          `[test-console] Stopping ${killedPids.length} process(es)…\n`
        );
      }
      setTimeout(() => {
        killOrchestratorJobProcesses(job, { signal: "SIGKILL" });
      }, 1200);
      markFixAllEnded(job, { killed: true, note: "[test-console] Cancelled by user\n" });
    } else {
      job.status = "killed";
      job.exitCode = 130;
      job.endedAt = job.endedAt ?? new Date().toISOString();
    }
    json(res, 200, serializeJob(job));
    return true;
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (jobMatch && req.method === "GET") {
    reconcileStaleJobs();
    const job = jobs.get(jobMatch[1]);
    if (!job) {
      json(res, 404, { error: "Job not found" });
      return true;
    }
    json(res, 200, serializeJob(job, { includeLogs: job.status === "running" }));
    return true;
  }

  const streamMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/stream$/);
  if (streamMatch && req.method === "GET") {
    const job = jobs.get(streamMatch[1]);
    if (!job) {
      json(res, 404, { error: "Job not found" });
      return true;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    let cursor = 0;
    const send = () => {
      reconcileStaleJobs();
      while (cursor < job.logs.length) {
        res.write(`data: ${JSON.stringify({ type: "log", text: job.logs[cursor] })}\n\n`);
        cursor += 1;
      }
      if (job.status !== "running" && !job.finalizing) {
        res.write(
          `data: ${JSON.stringify({
            type: "done",
            status: job.status,
            exitCode: job.exitCode,
            action: job.action,
            story: job.story ?? null,
            cursorQueued: job.cursorQueued ?? null
          })}\n\n`
        );
        res.end();
        clearInterval(timer);
      }
    };
    send();
    const timer = setInterval(send, 400);
    req.on("close", () => clearInterval(timer));
    return true;
  }

  return false;
}

function serveStatic(root, pathname, res) {
  let path = pathname;
  if (path.endsWith("/")) path += "index.html";
  const resolved = resolve(root, "." + path);
  if (!resolved.startsWith(root + sep) && resolved !== root) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    res.writeHead(404).end("Not found");
    return;
  }
  const mime = MIME[extname(resolved).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime, "Access-Control-Allow-Origin": "*" });
  createReadStream(resolved).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, url);
      if (handled) return;
      json(res, 404, { error: "Not found" });
      return;
    }
    if (url.pathname.startsWith("/repo/")) {
      const file = safeRepoPath(url.pathname);
      if (!file || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404).end("Not found");
        return;
      }
      const mime = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime, "Access-Control-Allow-Origin": "*" });
      createReadStream(file).pipe(res);
      return;
    }
    if (!API_ONLY) {
      if (!existsSync(join(UI_ROOT, "index.html"))) {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("UI not built. Run: pnpm test:console:build");
        return;
      }
      serveStatic(UI_ROOT, url.pathname === "/" ? "/index.html" : url.pathname, res);
      return;
    }
    res.writeHead(404).end("Not found");
  } catch (err) {
    res.writeHead(500).end(err instanceof Error ? err.message : "Error");
  }
});

async function reportAlreadyRunning() {
  const url = `http://127.0.0.1:${PORT}/api/state`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      console.log(`[test-console] Already running at http://127.0.0.1:${PORT}`);
      return true;
    }
  } catch {
    /* not our server */
  }
  return false;
}

server.on("error", async (err) => {
  if (err && "code" in err && err.code === "EADDRINUSE") {
    if (await reportAlreadyRunning()) {
      process.exit(0);
    }
    console.error(`[test-console] Port ${PORT} is in use but /api/state did not respond.`);
    console.error(`[test-console] Free the port: lsof -ti :${PORT} | xargs kill`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[test-console] http://127.0.0.1:${PORT}${API_ONLY ? " (API only)" : ""}`);
  if (!API_ONLY && !existsSync(join(UI_ROOT, "index.html"))) {
    console.log("[test-console] Build UI: pnpm test:console:build");
  }
  setInterval(() => ensureAutoOrchestratorRunning(false), 15_000);
});
