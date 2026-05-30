#!/usr/bin/env node
/**
 * Fix-all orchestrator: per story, up to N attempts of agent fix → rebuild (if needed) → test → check PASS.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initAgentBridge } from "./test-console-agent-bridge.mjs";
import { api } from "./test-console-api.mjs";
import { hasCursorAgent } from "./test-console-cursor-cli.mjs";
import {
  runManagedAgent,
  normalizeAgentResult,
  runManagedCommand,
  goldenCommandForSuite,
  loadRunSettings
} from "./test-console-managed-run.mjs";
import { loadPortfolioStoryIds } from "./test-portfolio-config.mjs";
import {
  TEST_STEP_ORDER,
  isStepPassing,
  loadStoryStepCellsFromDisk
} from "./step-gate.mjs";
import {
  runTierA,
  runTierB,
  runTierC,
  loadStoryFamilyRegistry,
  touchedStoryComponentPackage,
  touchedSharedAdapter
} from "./regression-tiers.mjs";
import {
  diffWorkspaceSnapshots,
  evaluateAttempt,
  adapterFilesForMode,
  investigatorGateAllowsFixer,
  loadPriorWorkerRuns,
  snapshotWorkspace,
  writeOrchestratorState,
  writeStructuredJobResult,
  writeWorkerRun
} from "./test-console-worker-supervisor.mjs";
import {
  emitFleetEvent,
  ensureFleetAgents,
  fixerAgentIdForSuite,
  updateAgentStatus
} from "./lab-worker-supervisor.mjs";
import {
  buildBatchInvestigationPayload,
  writeBatchInvestigationReport
} from "./fix-all-batch-report.mjs";
import {
  captureSuiteMetrics,
  evaluatePromotion,
  gitRestorePaths,
  sandboxWorktreeEnabled,
  writeBaselineSnapshot
} from "./sandbox-promote.mjs";
import {
  createSandboxWorktree,
  promoteSandboxFiles,
  teardownSandbox
} from "./sandbox-worktree.mjs";
import {
  appendStoryResolution,
  isInvestigationComplete,
  loadLabMemoryFixHint,
  recordStoryFailureInVault
} from "./lab-memory-vault.mjs";
import {
  FIGMA_ENTRY_STEP_ORDER,
  figmaEntryGoldenSpawn,
  figmaEntryNeedsPluginBuild,
  isFigmaEntryFixSuite,
  readFigmaEntryStoryStatus
} from "./figma-entry-fix.mjs";
import { FIGMA_ENTRY_STEPS } from "./figma-entry-portfolio-config.mjs";
import { reviewSandboxPromotion } from "./merge-captain.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CURSOR_USAGE_FLAG = join(ROOT, ".test-console", "cursor-usage-blocked.flag");

function markCursorUsageBlocked() {
  mkdirSync(join(ROOT, ".test-console"), { recursive: true });
  writeFileSync(CURSOR_USAGE_FLAG, `${new Date().toISOString()}\n`, "utf8");
}

export const MAX_TRIES_PER_STORY = Math.min(
  20,
  Math.max(1, Number(process.env.TEST_CONSOLE_FIX_ALL_MAX_TRIES ?? 5))
);

export const MAX_BATCH_TRIES = Math.min(
  5,
  Math.max(1, Number(process.env.TEST_CONSOLE_FIX_ALL_BATCH_MAX_TRIES ?? 3))
);

/**
 * Cap stories shown to the agent per batch attempt. The agent paralyzes when
 * asked to investigate 14 stories at once. Worst-first sort + chunk ⇒ small
 * focused fix sessions. Set to 0 (or a big number) to disable.
 */
export const BATCH_CHUNK_SIZE = Math.max(
  1,
  Number(process.env.FIX_ALL_BATCH_CHUNK_SIZE ?? 4)
);

function fixAllSerialMode(storyIds) {
  const serialEnv = process.env.FIX_ALL_SERIAL;
  if (serialEnv === "1" || serialEnv === "true") return true;
  if (serialEnv === "0" || serialEnv === "false") return false;
  const batchEnv = process.env.FIX_ALL_BATCH;
  if (batchEnv === "1" || batchEnv === "true") return false;
  // Default: serial mode for all suites/queue sizes. Batch mode paralyzes the
  // agent on multi-story prompts (see watchdog logs). Set FIX_ALL_BATCH=1 to
  // opt back into the multi-story-per-session batch loop.
  return true;
}

/**
 * Passed into the next agent prompt when attempt > 1.
 * @typedef {{ status: string, percent: number, maxRegionPercent?: number | null, error?: string | null }} FixAllMetrics
 * @typedef {{
 *   attempt: number,
 *   beforeAttempt: FixAllMetrics,
 *   afterTest: FixAllMetrics,
 *   agentExitCode: number,
 *   pluginBuildFailed: boolean,
 *   pluginBuildTail?: string,
 *   testTail?: string,
 *   testExitCode?: number
 * }} FixAllAttemptOutcome
 */

export const SUITES = {
  pixel: { dir: "pixel-diffs", label: "Pixel (schema)", mode: "pixel", needsPluginBuild: false },
  figma: { dir: "figma-diffs", label: "Figma emulator", mode: "emulator", needsPluginBuild: true },
  figmaLive: { dir: "figma-live-diffs", label: "Figma live", mode: "live", needsPluginBuild: true },
  delivery: { dir: "delivery-diffs", label: "Delivery (3-way)", mode: "emulator", needsPluginBuild: true },
  ...Object.fromEntries(
    FIGMA_ENTRY_STEPS.map((step) => [
      step.id,
      {
        dir: "figma-screen-diffs",
        label: step.label,
        mode: step.id === "contractFigma" ? "live" : "figmaEntry",
        needsPluginBuild: figmaEntryNeedsPluginBuild(step.id),
        pipeline: "figmaEntry"
      }
    ])
  )
};

const agent = initAgentBridge(ROOT);

function runMergeCaptainReview({ jobId, storyId = null, suiteId, mode, filesChanged, promotion, verification, attempt = null }) {
  const currentTask = {
    jobId,
    storyId,
    suiteId,
    attempt,
    phase: "review",
    filesChanged: filesChanged.slice(0, 12)
  };
  updateAgentStatus(ROOT, "merge-captain", {
    status: "working",
    currentTask
  });
  emitFleetEvent(ROOT, "orchestrator.assign", {
    agentId: "merge-captain",
    ...currentTask
  });

  const review = reviewSandboxPromotion({
    suiteId,
    mode,
    filesChanged,
    promotion,
    verification
  });

  updateAgentStatus(ROOT, "merge-captain", {
    status: review.decision === "approve" ? "idle" : "failed",
    currentTask: null
  });
  emitFleetEvent(ROOT, "agent.complete", {
    agentId: "merge-captain",
    ...currentTask,
    decision: review.decision,
    requiresHuman: review.requiresHuman,
    sharedAdapter: review.sharedAdapter,
    reasons: review.reasons
  });

  return review;
}

function safeSegment(id) {
  return id.replace(/[<>:"/\\|?*]/g, "-").replace(/-+/g, "-");
}

function readStoryStatus(suiteId, storyId) {
  if (isFigmaEntryFixSuite(suiteId)) {
    return readFigmaEntryStoryStatus(ROOT, storyId, suiteId);
  }
  const story = agent.getStoryFromReport(suiteId, storyId, SUITES, safeSegment);
  if (!story) return null;
  return {
    status: story.status,
    percent: story.percent,
    maxRegionPercent: story.maxRegionPercent ?? null,
    error: story.error ?? null
  };
}

function readStoryResultMeta(suiteId, storyId) {
  if (isFigmaEntryFixSuite(suiteId)) {
    const st = readFigmaEntryStoryStatus(ROOT, storyId, suiteId);
    if (!st) return null;
    const path = join(
      ROOT,
      "figma-screen-diffs",
      "by-screen",
      safeSegment(storyId),
      suiteId,
      "result.json"
    );
    let testedAtMs = NaN;
    if (existsSync(path)) {
      try {
        const parsed = JSON.parse(readFileSync(path, "utf8"));
        const testedAtRaw = parsed?.testedAt ?? null;
        testedAtMs = testedAtRaw ? Date.parse(testedAtRaw) : NaN;
      } catch {
        /* ok */
      }
    }
    return {
      status: st.status,
      testedAtMs: Number.isFinite(testedAtMs) ? testedAtMs : null,
      error: st.error ?? null
    };
  }
  const cfg = SUITES[suiteId];
  if (!cfg) return null;
  const path = join(ROOT, cfg.dir, "by-story", safeSegment(storyId), "result.json");
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const testedAtRaw = parsed?.testedAt ?? parsed?.generatedAt ?? null;
    const testedAtMs = testedAtRaw ? Date.parse(testedAtRaw) : NaN;
    return {
      status: typeof parsed?.status === "string" ? parsed.status : null,
      testedAtMs: Number.isFinite(testedAtMs) ? testedAtMs : null,
      error: typeof parsed?.error === "string" ? parsed.error : null
    };
  } catch {
    return null;
  }
}

/**
 * Before attempt 1 on a story, the report row often reflects a STALE result
 * from a prior cancelled run (very common cause: an extractor `error` like
 * "No [data-figma-component] root found" left behind by a failed batch).
 * Handing those stale metrics to the agent makes it chase a renderer phantom
 * instead of the real (small) pixel diff. Re-test once so the prompt + agent
 * see the truth.
 *
 * Only refreshes when the prior result is OLDER than the current orchestrator
 * job AND its status is `error`/missing — never refreshes a known PASS/FAIL/WARN
 * (those metrics, even if minutes old, are still legitimate).
 *
 * @returns {Promise<boolean>} true when a refresh ran, false when skipped
 */
async function refreshStaleStoryResult({
  suiteId,
  storyId,
  jobStartedAtMs,
  appendLog,
  jobId,
  killFlagPath,
  prefix
}) {
  const meta = readStoryResultMeta(suiteId, storyId);
  const status = meta?.status ?? "missing";
  const stale = !meta?.testedAtMs || meta.testedAtMs < jobStartedAtMs;
  const looksBroken = status === "error" || status === "missing" || !meta;
  if (!stale || !looksBroken) return false;
  const ageNote = meta?.testedAtMs
    ? `${Math.round((jobStartedAtMs - meta.testedAtMs) / 1000)}s before job start`
    : "no result.json";
  await appendLog(
    `${prefix} — pre-attempt-1 metrics look stale (${status}, ${ageNote}); refreshing with one live test before invoking agent…\n`
  );
  try {
    const refresh = await runFullSuiteGolden(suiteId, appendLog, jobId, killFlagPath, {
      storyIds: [storyId]
    });
    await appendLog(`${prefix} — pre-attempt refresh finished exit ${refresh?.status ?? 1}\n`);
  } catch (err) {
    await appendLog(`${prefix} — pre-attempt refresh threw: ${String(err?.message ?? err)}\n`);
  }
  return true;
}

/** @returns {FixAllMetrics} */
function metricsFromStory(story) {
  return {
    status: story.status,
    percent: story.percent ?? 0,
    maxRegionPercent: story.maxRegionPercent ?? null,
    error: story.error ?? null
  };
}

function runPluginBuild() {
  return spawnSync("pnpm", ["--filter", "@lab/figma-importer-plugin", "build"], {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: "pipe",
    encoding: "utf8"
  });
}

function runStoryTest(suiteId, storyId) {
  const opts = { cwd: ROOT, env: process.env, stdio: "pipe", encoding: "utf8" };
  if (isFigmaEntryFixSuite(suiteId)) {
    const spec = figmaEntryGoldenSpawn(suiteId, storyId, ROOT);
    if (!spec) return { status: 1, stdout: "", stderr: `Unknown figma entry step ${suiteId}` };
    return spawnSync(spec.bin, spec.args, opts);
  }
  switch (suiteId) {
    case "pixel":
      return spawnSync(
        "pnpm",
        ["--filter", "@lab/pixel-test", "run", "test:golden", "--", "--stories", storyId],
        opts
      );
    case "figma":
      return spawnSync(
        "node",
        ["scripts/figma-iterate.mjs", "--story", storyId, "--allow-test-errors"],
        opts
      );
    case "figmaLive":
      return spawnSync("node", ["scripts/figma-live-iterate.mjs", "--story", storyId, "--strict"], opts);
    case "delivery":
      return spawnSync(
        "pnpm",
        ["--filter", "@lab/pixel-test", "run", "test:delivery:golden", "--", "--stories", storyId],
        opts
      );
    default:
      return { status: 1, stdout: "", stderr: `Unknown suite ${suiteId}` };
  }
}

/** Re-run prior pipeline steps when fixing step N (sequential gate). */
async function ensurePriorStepsPass(suiteId, storyId, appendLog, parentJobId, killFlagPath) {
  const idx = TEST_STEP_ORDER.indexOf(suiteId);
  if (idx <= 0) return true;
  let cells = loadStoryStepCellsFromDisk(ROOT, storyId, readFileSync, existsSync, join);
  for (let i = 0; i < idx; i += 1) {
    const priorId = TEST_STEP_ORDER[i];
    const priorStatus = cells[priorId]?.status ?? "not_tested";
    if (isStepPassing(priorStatus)) continue;
    await appendLog(`[fix-all] ${storyId} — re-run ${priorId} (required before ${suiteId})…\n`);
    const exitCode =
      parentJobId && appendLog
        ? await runStoryTestManaged(priorId, storyId, parentJobId, appendLog, killFlagPath)
        : runStoryTest(priorId, storyId).status ?? 1;
    await appendLog(`[fix-all] ${storyId} — ${priorId} finished exit ${exitCode}\n`);
    cells = loadStoryStepCellsFromDisk(ROOT, storyId, readFileSync, existsSync, join);
    const after = cells[priorId]?.status ?? "not_tested";
    if (!isStepPassing(after)) {
      await appendLog(
        `[fix-all] ${storyId} — ${priorId} still ${after}; cannot proceed to ${suiteId}\n`
      );
      return false;
    }
  }
  return true;
}

export function runFullSuiteGolden(suiteId, appendLog, parentJobId, killFlagPath, options = {}) {
  const settings = options.settings ?? loadRunSettings();
  const storyIds = options.storyIds ?? null;
  const spec = goldenCommandForSuite(suiteId, { storyIds, settings });
  if (!spec) return Promise.resolve({ status: 1, stdout: "", stderr: `Unknown suite ${suiteId}` });

  if (spec.empty) {
    const msg = "[golden] Nothing to run — all stories pass or filtered by run settings\n";
    if (appendLog) return appendLog(msg).then(() => ({ status: 0, stdout: "", stderr: "" }));
    return Promise.resolve({ status: 0, stdout: msg, stderr: "" });
  }

  if (parentJobId && appendLog) {
    const settingsNote = settings.processPool
      ? "process pool"
      : `in-process ×${settings.parallelWorkers}`;
    const countNote = storyIds?.length ? `${storyIds.length} stories` : "full suite";
    return appendLog(`[golden] ${suiteId} — ${countNote} (${settingsNote})\n`).then(() =>
      runManagedCommand({
        parentJobId,
        tag: spec.tag,
        bin: spec.bin,
        args: spec.args,
        appendLog,
        killFlagPath,
        env: spec.env
      }).then((code) => ({ status: code, stdout: "", stderr: "" }))
    );
  }
  const opts = {
    cwd: ROOT,
    env: { ...process.env, ...(spec.env ?? {}) },
    stdio: "pipe",
    encoding: "utf8"
  };
  if (spec.bin === "node") {
    return Promise.resolve(spawnSync("node", spec.args, opts));
  }
  return Promise.resolve(spawnSync(spec.bin, spec.args, opts));
}

async function runStoryTestManaged(suiteId, storyId, parentJobId, appendLog, killFlagPath) {
  if (isFigmaEntryFixSuite(suiteId)) {
    const spec = figmaEntryGoldenSpawn(suiteId, storyId, ROOT);
    if (!spec) return 1;
    return runManagedCommand({
      parentJobId,
      tag: spec.tag,
      bin: spec.bin,
      args: spec.args,
      appendLog,
      killFlagPath
    });
  }
  switch (suiteId) {
    case "pixel":
      return runManagedCommand({
        parentJobId,
        tag: `test:${storyId}`,
        bin: "pnpm",
        args: ["--filter", "@lab/pixel-test", "run", "test:golden", "--", "--stories", storyId],
        appendLog,
        killFlagPath,
      });
    case "figma":
      return runManagedCommand({
        parentJobId,
        tag: `test:${storyId}`,
        bin: "node",
        args: ["scripts/figma-iterate.mjs", "--story", storyId, "--allow-test-errors"],
        appendLog,
        killFlagPath,
      });
    case "figmaLive":
      return runManagedCommand({
        parentJobId,
        tag: `test:${storyId}`,
        bin: "node",
        args: ["scripts/figma-live-iterate.mjs", "--story", storyId, "--strict"],
        appendLog,
        killFlagPath,
      });
    case "delivery":
      return runManagedCommand({
        parentJobId,
        tag: `test:${storyId}`,
        bin: "pnpm",
        args: [
          "--filter",
          "@lab/pixel-test",
          "run",
          "test:delivery:golden",
          "--",
          "--stories",
          storyId
        ],
        appendLog,
        killFlagPath,
      });
    default:
      return 1;
  }
}

async function runPluginBuildManaged(parentJobId, appendLog, killFlagPath) {
  return runManagedCommand({
    parentJobId,
    tag: "plugin:build",
    bin: "pnpm",
    args: ["--filter", "@lab/figma-importer-plugin", "build"],
    appendLog,
    killFlagPath,
  });
}

function makeStoryStepRunner(parentJobId, appendLog, killFlagPath) {
  return async (stepId, storyId) =>
    runStoryTestManaged(stepId, storyId, parentJobId, appendLog, killFlagPath);
}

function makeTierCCommandRunner(parentJobId, appendLog, killFlagPath) {
  return async (spec) =>
    runManagedCommand({
      parentJobId,
      tag: spec.tag,
      bin: spec.bin,
      args: spec.args,
      appendLog,
      killFlagPath
    });
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

/**
 * Batch fix-all: investigate all failures → one agent session → re-test all.
 * @param {string} jobId
 * @param {{ killFlagPath: string, suiteId: string, storyIds: string[], cfg: object, appendLog: Function }} ctx
 */
async function runFixAllBatch(jobId, { killFlagPath, suiteId, storyIds, cfg, appendLog }) {
  let remaining = [...storyIds];
  let batchTierCRequired = false;
  /** @type {object | null} */
  let lastBatchOutcome = null;
  let storiesPassed = 0;
  let batchRegressionStreak = 0;
  let watchdogStreak = 0;
  let suggestSerial = false;
  const useWorktree = sandboxWorktreeEnabled();

  await appendLog(
    `[fix-all] BATCH mode — ${remaining.length} stories · up to ${MAX_BATCH_TRIES} investigate→fix→retest rounds\n` +
      `[fix-all] Investigation report written before each agent session.\n` +
      `[fix-all] Sandbox gate ON — metrics regress → auto git restore.\n` +
      (useWorktree ? `[fix-all] Sandbox worktree ON (default) — agent edits isolated; set FIX_ALL_SANDBOX=main to disable.\n` : "") +
      `[fix-all] Legacy batch mode — serial is now the default; set FIX_ALL_BATCH=1 to opt back into batch.\n`
  );

  for (let batchAttempt = 1; batchAttempt <= MAX_BATCH_TRIES; batchAttempt++) {
    if (existsSync(killFlagPath)) break;

    remaining = remaining.filter((id) => {
      const st = readStoryStatus(suiteId, id);
      return st?.status !== "pass";
    });

    if (!remaining.length) {
      storiesPassed = storyIds.length;
      break;
    }

    const allStoriesForBatch = remaining
      .map((id) => agent.getStoryFromReport(suiteId, id, SUITES, safeSegment))
      .filter(Boolean);

    if (!allStoriesForBatch.length) {
      await appendLog("[fix-all] batch — no report rows for remaining stories\n");
      break;
    }

    const sortedStories = [...allStoriesForBatch].sort((a, b) => {
      const aHot = Math.max(a.percent ?? 0, a.maxRegionPercent ?? 0);
      const bHot = Math.max(b.percent ?? 0, b.maxRegionPercent ?? 0);
      return bHot - aHot;
    });
    const chunkSize = Math.min(BATCH_CHUNK_SIZE, sortedStories.length);
    const stories = sortedStories.slice(0, chunkSize);
    if (chunkSize < sortedStories.length) {
      await appendLog(
        `[fix-all] batch ${batchAttempt} — focusing on top ${chunkSize}/${sortedStories.length} worst stories ` +
          `(${stories.map((s) => s.storyId).join(", ")}); harness re-tests ALL ${sortedStories.length} after the fix.\n`
      );
    }

    const reportPath = join(ROOT, cfg.dir, "report.json");
    let tolerance = 0.1;
    let regionTolerance = 0.1;
    if (existsSync(reportPath)) {
      try {
        const raw = JSON.parse(readFileSync(reportPath, "utf8"));
        tolerance = raw.tolerance ?? tolerance;
        regionTolerance = raw.regionTolerance ?? regionTolerance;
      } catch {
        /* ok */
      }
    }

    const payload = buildBatchInvestigationPayload(stories, {
      suiteId,
      suiteLabel: cfg.label,
      tolerance,
      regionTolerance,
      repoRoot: ROOT
    });
    const reportPaths = writeBatchInvestigationReport(ROOT, jobId, batchAttempt, payload);

    await appendLog(
      `\n[fix-all] ══ Batch ${batchAttempt}/${MAX_BATCH_TRIES} — ${stories.length} stories ══\n` +
        `[fix-all] Investigation: ${reportPaths.mdPath}\n`
    );

    writeOrchestratorState(ROOT, {
      phase: "fix-all-batch",
      suiteId,
      suiteLabel: cfg.label,
      jobId,
      attempt: batchAttempt,
      maxAttempts: MAX_BATCH_TRIES,
      storyTotal: storyIds.length,
      storyIds: remaining,
      verdict: "ON_TRACK",
      nextWorkerMode: "continue"
    });

    const prompt = agent.buildFixAllBatchPrompt(
      stories,
      reportPaths,
      cfg.mode,
      suiteId,
      batchAttempt,
      MAX_BATCH_TRIES,
      lastBatchOutcome
    );

    const baseline = captureSuiteMetrics(ROOT, suiteId, remaining, readStoryStatus);
    writeBaselineSnapshot(ROOT, `${jobId}-batch-${batchAttempt}`, baseline);

    /** @type {{ path: string, branch: string, jobId: string } | null} */
    let sandbox = null;
    let activeRoot = ROOT;
    if (useWorktree) {
      const created = createSandboxWorktree(ROOT, `${jobId}-try${batchAttempt}`);
      if (created.ok) {
        sandbox = created;
        activeRoot = created.path;
        await appendLog(`[sandbox] worktree ${activeRoot} (branch ${created.branch})\n`);
      } else {
        await appendLog(`[sandbox] worktree failed (${created.error}); using main repo\n`);
      }
    }

    const gitBefore = snapshotWorkspace(activeRoot);
    const batchAgent = normalizeAgentResult(
      await runManagedAgent({
        parentJobId: jobId,
        tag: `batch:try${batchAttempt}`,
        prompt,
        appendLog,
        killFlagPath,
        workspaceRoot: activeRoot !== ROOT ? activeRoot : undefined
      })
    );
    if (batchAgent.usageBlocked) {
      if (sandbox) teardownSandbox(sandbox, ROOT);
      markCursorUsageBlocked();
      await appendLog(
        "[fix-all] BLOCKED — Cursor CLI out of usage. No renderer edits were applied. " +
          "In the test console, switch the fix agent model to Auto (or restore org limits), then retry. Turn off portfolio AUTO until fixed.\n"
      );
      return {
        exitCode: 2,
        passed: false,
        summary: "blocked: cursor_usage",
        blocked: true,
        blockedReason: "cursor_usage_limit"
      };
    }
    const agentCode = batchAgent.exitCode;
    if (existsSync(killFlagPath)) {
      if (sandbox) teardownSandbox(sandbox, ROOT);
      break;
    }

    let filesChanged = diffWorkspaceSnapshots(gitBefore, snapshotWorkspace(activeRoot));

    const codeFilesChanged = filesChanged.filter(
      (p) => !p.startsWith(".test-console/") && !p.startsWith("figma-live-diffs/") && !p.startsWith("test-portfolio/")
    );
    if (batchAgent.watchdogTripped && codeFilesChanged.length === 0) {
      watchdogStreak += 1;
      await appendLog(
        `[fix-all] batch ${batchAttempt} — watchdog kill #${watchdogStreak}: ${batchAgent.watchdogReason ?? "no progress"}\n`
      );
      if (watchdogStreak >= 2) {
        suggestSerial = true;
        await appendLog(
          `[fix-all] batch — ${watchdogStreak} consecutive watchdog kills with 0 code edits. ` +
            `Batch mode is paralyzing the agent on this suite. Auto-falling back to serial mode (one story at a time).\n`
        );
        if (sandbox) teardownSandbox(sandbox, ROOT);
        break;
      }
    } else if (codeFilesChanged.length > 0) {
      watchdogStreak = 0;
    }
    if (sandbox && filesChanged.length) {
      const promoted = promoteSandboxFiles(ROOT, sandbox.path, filesChanged);
      await appendLog(`[sandbox] promoted ${promoted.length} file(s) to main for test\n`);
      filesChanged = promoted;
      teardownSandbox(sandbox, ROOT);
      sandbox = null;
    } else if (sandbox) {
      teardownSandbox(sandbox, ROOT);
      sandbox = null;
    }
    if (filesChanged.length) {
      await appendLog(
        `[fix-all] batch ${batchAttempt} — files changed: ${filesChanged.slice(0, 10).join(", ")}${filesChanged.length > 10 ? "…" : ""}\n`
      );
      if (touchedSharedAdapter(filesChanged)) batchTierCRequired = true;
    }

    if (cfg.needsPluginBuild) {
      await appendLog(`[fix-all] batch ${batchAttempt} — plugin build…\n`);
      const buildCode = await runPluginBuildManaged(jobId, appendLog, killFlagPath);
      if (buildCode !== 0) {
        await appendLog(`[fix-all] batch ${batchAttempt} — plugin build failed (exit ${buildCode})\n`);
      }
    }

    await appendLog(
      `[fix-all] batch ${batchAttempt} — re-testing ${remaining.length} stories (one golden run)…\n`
    );
    const eligibleForRetest = [];
    for (const storyId of remaining) {
      if (existsSync(killFlagPath)) break;
      const priorsOk = await ensurePriorStepsPass(
        suiteId,
        storyId,
        appendLog,
        jobId,
        killFlagPath
      );
      if (!priorsOk) {
        await appendLog(`[fix-all] batch — ${storyId} blocked by prior step gate\n`);
        continue;
      }
      eligibleForRetest.push(storyId);
    }
    if (eligibleForRetest.length && !existsSync(killFlagPath)) {
      const golden = await runFullSuiteGolden(suiteId, appendLog, jobId, killFlagPath, {
        storyIds: eligibleForRetest
      });
      await appendLog(
        `[fix-all] batch ${batchAttempt} — golden finished exit ${golden.status ?? 1}\n`
      );
    }

    spawnSync("node", ["scripts/test-portfolio-merge.mjs"], { cwd: ROOT, stdio: "ignore" });

    const afterMetrics = captureSuiteMetrics(ROOT, suiteId, remaining, readStoryStatus);
    const promotion = evaluatePromotion(baseline, afterMetrics);
    const mergeReview =
      filesChanged.length && !promotion.discard
        ? runMergeCaptainReview({
            jobId,
            suiteId,
            attempt: batchAttempt,
            mode: cfg.mode,
            filesChanged,
            promotion,
            verification: {
              tierAOk: true,
              tierBOk: true,
              tierCOk: !touchedSharedAdapter(filesChanged)
            }
          })
        : null;

    if (filesChanged.length && promotion.discard) {
      batchRegressionStreak += 1;
      const restored = gitRestorePaths(ROOT, filesChanged);
      await appendLog(
        `[sandbox] DISCARD batch ${batchAttempt} — ${promotion.worse.length} stor${promotion.worse.length === 1 ? "y" : "ies"} regressed` +
          (promotion.worse.length
            ? `: ${promotion.worse.map((w) => w.storyId).slice(0, 5).join(", ")}${promotion.worse.length > 5 ? "…" : ""}`
            : "") +
          `\n[sandbox] git restore ${restored.restored.length} file(s)` +
          (restored.ok ? "" : ` (warn: ${restored.stderr})`) +
          "\n"
      );
      if (cfg.needsPluginBuild && restored.restored.length) {
        await appendLog(`[sandbox] rebuilding plugin after restore…\n`);
        await runPluginBuildManaged(jobId, appendLog, killFlagPath);
      }
      if (batchRegressionStreak >= 2) {
        suggestSerial = true;
        await appendLog(
          `[fix-all] batch — ${batchRegressionStreak} consecutive regressions; stopping batch. Auto-falling back to serial mode.\n`
        );
        break;
      }
    } else if (filesChanged.length && mergeReview?.decision !== "approve") {
      const restored = gitRestorePaths(ROOT, filesChanged);
      if (mergeReview?.sharedAdapter) suggestSerial = true;
      await appendLog(
        `[merge-captain] HOLD batch ${batchAttempt} — ${mergeReview?.reasons.join(" ") ?? "review did not approve"}\n` +
          `[sandbox] git restore ${restored.restored.length} file(s)` +
          (restored.ok ? "" : ` (warn: ${restored.stderr})`) +
          "\n"
      );
      if (cfg.needsPluginBuild && restored.restored.length) {
        await appendLog(`[sandbox] rebuilding plugin after merge-captain hold…\n`);
        await runPluginBuildManaged(jobId, appendLog, killFlagPath);
      }
      if (!existsSync(killFlagPath)) {
        await appendLog(`[merge-captain] refreshing batch metrics after restore…\n`);
        await runFullSuiteGolden(suiteId, appendLog, jobId, killFlagPath, { storyIds: remaining });
      }
    } else if (filesChanged.length && promotion.promote) {
      batchRegressionStreak = 0;
      await appendLog(
        `[merge-captain] APPROVE batch ${batchAttempt} — ${mergeReview?.reasons.join(" ") ?? "promotion criteria satisfied"}\n` +
          `[sandbox] PROMOTE batch ${batchAttempt} — ${promotion.passAfter}/${remaining.length} pass in batch` +
          (promotion.improved.length ? ` · improved: ${promotion.improved.map((x) => x.storyId).slice(0, 5).join(", ")}` : "") +
          "\n"
      );
    } else if (filesChanged.length) {
      await appendLog(`[merge-captain] HOLD batch ${batchAttempt} — no net improvement; edits restored or awaiting serial retry\n`);
    }

    const stillFailing = remaining.filter((id) => {
      const st = readStoryStatus(suiteId, id);
      return st?.status !== "pass";
    });
    storiesPassed = storyIds.length - stillFailing.length;

    await appendLog(
      `[fix-all] batch ${batchAttempt} result: ${storiesPassed}/${storyIds.length} pass` +
        (stillFailing.length ? ` · still failing: ${stillFailing.join(", ")}` : "") +
        "\n"
    );

    lastBatchOutcome = {
      passedCount: storiesPassed,
      totalCount: storyIds.length,
      stillFailing,
      filesChanged,
      agentExitCode: agentCode ?? 0,
      watchdogTripped: Boolean(batchAgent.watchdogTripped),
      watchdogReason: batchAgent.watchdogReason ?? null,
      editCount: batchAgent.editCount ?? null,
      promotion: {
        discard: promotion.discard,
        promote: promotion.promote,
        worseCount: promotion.worse.length,
        improvedCount: promotion.improved.length
      }
    };

    if (!stillFailing.length) break;

    if (batchAttempt >= MAX_BATCH_TRIES) {
      await appendLog(`[fix-all] batch — exhausted ${MAX_BATCH_TRIES} rounds\n`);
    }
  }

  remaining = storyIds.filter((id) => readStoryStatus(suiteId, id)?.status !== "pass");
  storiesPassed = storyIds.length - remaining.length;
  const storiesExhausted = remaining.length;

  if (!existsSync(killFlagPath)) {
    if (remaining.length > 0 && remaining.length < storyIds.length) {
      await appendLog(`[fix-all] batch — refreshing ${remaining.length} still-failing stories…\n`);
      await runFullSuiteGolden(suiteId, appendLog, jobId, killFlagPath, { storyIds: remaining });
    } else if (remaining.length === 0) {
      spawnSync("node", ["scripts/test-portfolio-merge.mjs"], { cwd: ROOT, stdio: "ignore" });
    }
    spawnSync("node", ["scripts/orchestrator-context.mjs"], { cwd: ROOT, stdio: "ignore" });
  }

  if (storiesPassed === storyIds.length && batchTierCRequired && !existsSync(killFlagPath)) {
    const tierOk = await runTierC({
      repoRoot: ROOT,
      suiteId,
      runCommand: makeTierCCommandRunner(jobId, appendLog, killFlagPath),
      appendLog
    });
    if (!tierOk) {
      await appendLog("[fix-all] batch — Tier C failed; portfolio may have regressions\n");
    }
  }

  const killed = existsSync(killFlagPath);
  const allPass = storiesPassed === storyIds.length && storyIds.length > 0;
  const exitCode = killed ? 130 : allPass ? 0 : 1;

  writeOrchestratorState(ROOT, {
    phase: "fix-all-batch",
    suiteId,
    jobId,
    verdict: killed ? "CANCELLED" : allPass ? "ON_TRACK" : "EXHAUSTED",
    nextWorkerMode: killed ? "stopped" : "continue",
    finished: true,
    summary: killed
      ? "cancelled"
      : `${storiesPassed}/${storyIds.length} pass`
  });

  await appendLog(
    `\n[fix-all] Batch done: ${storiesPassed}/${storyIds.length} pass` +
      (storiesExhausted ? `, ${storiesExhausted} still failing` : "") +
      (killed ? " (cancelled)" : "") +
      (suggestSerial ? " · auto-falling back to serial mode" : "") +
      "\n"
  );

  return {
    exitCode,
    passed: allPass && !killed,
    summary: `${storiesPassed}/${storyIds.length} pass`,
    suggestSerial
  };
}

/**
 * @param {string} jobId
 * @param {{ killFlagPath: string, suiteId?: string, storyIds?: string[] }} [options]
 */
export async function runFixAllIterate(jobId, { killFlagPath, suiteId: suiteOverride, storyIds: storyIdsOverride } = {}) {
  if (!hasCursorAgent()) {
    throw new Error("Cursor CLI not found");
  }

  // Wall-clock anchor used to detect stale per-story result.json files that
  // were left behind by a prior cancelled job (common cause of misleading
  // "error 100%" handed to the agent on attempt 1).
  const jobStartedAtMs = Date.now();

  const job = await api(`/api/jobs/${jobId}`);
  const suiteId = suiteOverride ?? String(job.action ?? "").replace(/^fix-all:/, "");
  const cfg = SUITES[suiteId];
  if (!cfg) {
    throw new Error(`Unknown fix-all suite: ${suiteId}`);
  }

  const storyIds = storyIdsOverride ?? job.storyIds ?? [];
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

  if (suiteId === "figmaLive") {
    const relay = await relayPluginReady();
    if (!relay.ok || !relay.pluginConnected) {
      await appendLog(
        "[fix-all] Figma live requires relay + plugin connected. Start relay and open the plugin, then retry.\n"
      );
      return { exitCode: 2, passed: false, summary: "blocked: relay/plugin" };
    }
  }

  ensureFleetAgents(ROOT);
  await appendLog(
    fixAllSerialMode(storyIds)
      ? `[fix-all] Serial mode (default): up to ${MAX_TRIES_PER_STORY} fix→test cycles per story across ${storyIds.length} stor${storyIds.length === 1 ? "y" : "ies"} (${cfg.label})\n` +
          `[fix-all] Worker supervisor ON — observes git diff + metrics, steers stuck agents.\n` +
          `[fix-all] Investigator gate ON — fixer blocked until lab-memory root cause is filled (set FIX_ALL_SKIP_INVESTIGATOR_GATE=1 to bypass).\n` +
          `[fix-all] Supervisor stays in this tab; child Terminal tabs open for agents, builds, and tests.\n` +
          `[fix-all] Legacy batch mode is opt-in: set FIX_ALL_BATCH=1.\n`
      : `[fix-all] Legacy BATCH mode (FIX_ALL_BATCH=1): ${storyIds.length} stories — investigate report → one fixer session → re-test all (${cfg.label})\n` +
          `[fix-all] Up to ${MAX_BATCH_TRIES} batch rounds.\n`
  );

  let serialStoryIds = storyIds;

  if (!fixAllSerialMode(storyIds)) {
    const batchResult = await runFixAllBatch(jobId, {
      killFlagPath,
      suiteId,
      storyIds,
      cfg,
      appendLog
    });
    if (batchResult.blocked) return batchResult;
    if (batchResult.passed) return batchResult;
    if (existsSync(killFlagPath)) return batchResult;
    if (!batchResult.suggestSerial) return batchResult;

    serialStoryIds = storyIds.filter((id) => readStoryStatus(suiteId, id)?.status !== "pass");
    if (!serialStoryIds.length) return batchResult;
    await appendLog(
      `\n[fix-all] ↩ Auto-fallback: continuing into SERIAL mode for ${serialStoryIds.length} still-failing stories ` +
        `(${serialStoryIds.slice(0, 5).join(", ")}${serialStoryIds.length > 5 ? "…" : ""}).\n`
    );
  }

  serialStoryIds = [...serialStoryIds].sort((a, b) => {
    const pa = readStoryStatus(suiteId, a)?.percent ?? 0;
    const pb = readStoryStatus(suiteId, b)?.percent ?? 0;
    return pb - pa;
  });

  writeOrchestratorState(ROOT, {
    phase: "fix-all",
    suiteId,
    suiteLabel: cfg.label,
    jobId,
    storyIndex: 0,
    storyTotal: serialStoryIds.length,
    verdict: "ON_TRACK",
    nextWorkerMode: "continue"
  });

  let storiesPassed = 0;
  let storiesExhausted = 0;

  for (let i = 0; i < serialStoryIds.length; i++) {
    if (existsSync(killFlagPath)) break;

    const storyId = serialStoryIds[i];
    const prefix = `[fix-all] ${i + 1}/${serialStoryIds.length} ${storyId}`;

    let current = readStoryStatus(suiteId, storyId);
    if (current?.status === "pass") {
      await appendLog(`${prefix} — already PASS, skip\n`);
      storiesPassed += 1;
      continue;
    }

    let storyMeta = agent.getStoryFromReport(suiteId, storyId, SUITES, safeSegment);
    if (!storyMeta) {
      await appendLog(`${prefix} — no report row, skip\n`);
      continue;
    }

    let passed = false;
    /** @type {FixAllAttemptOutcome | null} */
    let lastAttemptOutcome = null;
    /** @type {{ verdict: string, nextWorkerMode: string, interventionLines: string[] } | null} */
    let lastSupervisor = null;
    let storyTierCRequired = false;
    /** @type {string[]} */
    let storyFilesChanged = [];
    const storyRegistry = loadStoryFamilyRegistry(ROOT);

    for (let attempt = 1; attempt <= MAX_TRIES_PER_STORY; attempt++) {
      if (existsSync(killFlagPath)) break;

      current = readStoryStatus(suiteId, storyId);
      if (current?.status === "pass") {
        passed = true;
        break;
      }

      let pluginBuildFailed = false;
      let pluginBuildTail = "";

      if (attempt === 1) {
        const refreshed = await refreshStaleStoryResult({
          suiteId,
          storyId,
          jobStartedAtMs,
          appendLog,
          jobId,
          killFlagPath,
          prefix
        });
        if (refreshed) {
          const after = readStoryStatus(suiteId, storyId);
          if (after?.status === "pass") {
            await appendLog(`${prefix} — refreshed result is PASS; skipping agent\n`);
            passed = true;
            break;
          }
        }
      }

      storyMeta = agent.getStoryFromReport(suiteId, storyId, SUITES, safeSegment) ?? storyMeta;
      const beforeAttempt = metricsFromStory(storyMeta);
      const hotspotNote =
        beforeAttempt.maxRegionPercent != null
          ? `, hotspot ${beforeAttempt.maxRegionPercent.toFixed(2)}%`
          : "";
      await appendLog(
        `${prefix} attempt ${attempt}/${MAX_TRIES_PER_STORY} (${beforeAttempt.status} ${beforeAttempt.percent.toFixed(2)}%${hotspotNote}) — agent fix…\n`
      );

      recordStoryFailureInVault(ROOT, storyMeta, suiteId, {
        jobId,
        source: "fix-all pre-agent",
        attempt,
        cfg,
        safeSegment
      });

      writeOrchestratorState(ROOT, {
        phase: "fix-all",
        suiteId,
        suiteLabel: cfg.label,
        jobId,
        storyId,
        storyIndex: i + 1,
        storyTotal: serialStoryIds.length,
        attempt,
        maxAttempts: MAX_TRIES_PER_STORY,
        verdict: lastSupervisor?.verdict ?? "ON_TRACK",
        nextWorkerMode: lastSupervisor?.nextWorkerMode ?? "continue",
        metrics: beforeAttempt
      });

      const supervisorForPrompt = lastSupervisor
        ? {
            verdict: lastSupervisor.verdict,
            nextWorkerMode: lastSupervisor.nextWorkerMode,
            interventionLines: lastSupervisor.interventionLines
          }
        : null;
      const workerMode = supervisorForPrompt?.nextWorkerMode ?? "continue";

      const useWorktreeSerial = sandboxWorktreeEnabled();
      /** @type {{ path: string, branch: string, jobId: string } | null} */
      let serialSandbox = null;
      let activeRoot = ROOT;
      if (useWorktreeSerial) {
        const created = createSandboxWorktree(ROOT, `${jobId}-${storyId}-t${attempt}`);
        if (created.ok) {
          serialSandbox = created;
          activeRoot = created.path;
          await appendLog(`[sandbox] serial worktree ${activeRoot}\n`);
        }
      }

      const gitBefore = snapshotWorkspace(activeRoot);

      const gate = investigatorGateAllowsFixer(ROOT, storyId, suiteId);
      if (!gate.allowed) {
        await appendLog(
          `${prefix} attempt ${attempt} — INVESTIGATOR phase (fixer blocked: ${gate.reason})…\n`
        );
        updateAgentStatus(ROOT, "investigator", {
          status: "working",
          currentTask: { jobId, storyId, suiteId, attempt, phase: "investigator" }
        });
        emitFleetEvent(ROOT, "orchestrator.assign", {
          agentId: "investigator",
          jobId,
          storyId,
          suiteId,
          attempt,
          phase: "investigator"
        });

        const invPrompt = agent.buildInvestigatorOnlyPrompt(
          storyMeta,
          cfg.mode,
          suiteId,
          attempt,
          MAX_TRIES_PER_STORY
        );
        const invAgent = normalizeAgentResult(
          await runManagedAgent({
            parentJobId: jobId,
            tag: `${storyId}:investigate-${attempt}`,
            prompt: invPrompt,
            appendLog,
            killFlagPath,
            investigateFirst: true,
            fixMode: cfg.mode,
            workspaceRoot: activeRoot !== ROOT ? activeRoot : undefined
          })
        );

        const invComplete = isInvestigationComplete(ROOT, storyId, suiteId);
        writeStructuredJobResult(ROOT, jobId, storyId, "investigator", attempt, {
          suiteId,
          mode: cfg.mode,
          status: invComplete ? "completed" : "incomplete",
          investigationComplete: invComplete,
          gateReason: gate.reason,
          agentExitCode: invAgent.exitCode ?? 1,
          usageBlocked: Boolean(invAgent.usageBlocked),
          watchdogTripped: Boolean(invAgent.watchdogTripped),
          watchdogReason: invAgent.watchdogReason ?? null
        });
        updateAgentStatus(ROOT, "investigator", {
          status: invComplete ? "idle" : "failed",
          currentTask: null
        });
        emitFleetEvent(ROOT, "agent.complete", {
          agentId: "investigator",
          jobId,
          storyId,
          suiteId,
          attempt,
          status: invComplete ? "completed" : "incomplete",
          investigationComplete: invComplete
        });

        if (invAgent.usageBlocked) {
          if (serialSandbox) teardownSandbox(serialSandbox, ROOT);
          markCursorUsageBlocked();
          await appendLog(
            "[fix-all] BLOCKED — Cursor CLI out of usage during investigator. Stopping serial fix-all.\n"
          );
          return {
            exitCode: 2,
            passed: false,
            summary: "blocked: cursor_usage",
            blocked: true,
            blockedReason: "cursor_usage_limit"
          };
        }
        if (existsSync(killFlagPath)) break;

        if (!invComplete) {
          if (attempt >= 2) {
            await appendLog(
              `${prefix} — investigator vault still incomplete after attempt ${attempt - 1}; dispatching fixer anyway\n`
            );
          } else {
            await appendLog(
              `${prefix} — investigator incomplete (root cause still pending); fixer skipped this attempt\n`
            );
            lastAttemptOutcome = {
              attempt,
              beforeAttempt,
              afterTest: beforeAttempt,
              agentExitCode: invAgent.exitCode ?? 0,
              pluginBuildFailed: false,
              testTail: "investigator-only (no test)",
              testExitCode: null
            };
            continue;
          }
        } else {
          await appendLog(`${prefix} — investigation complete; dispatching fixer…\n`);
        }
      } else if (gate.reason === "cached_investigation") {
        const hint = loadLabMemoryFixHint(ROOT, storyId, suiteId);
        await appendLog(
          `${prefix} attempt ${attempt} — using cached investigation (${hint?.recommendedFixArea?.split("\n")[0] ?? "lab-memory"})\n`
        );
      }

      const fixerAgentId = fixerAgentIdForSuite(suiteId);
      updateAgentStatus(ROOT, fixerAgentId, {
        status: "working",
        currentTask: { jobId, storyId, suiteId, attempt, phase: "fixer" }
      });
      emitFleetEvent(ROOT, "orchestrator.assign", {
        agentId: fixerAgentId,
        jobId,
        storyId,
        suiteId,
        attempt,
        phase: "fixer"
      });

      const prompt = agent.buildFixAllStoryPrompt(
        storyMeta,
        cfg.mode,
        suiteId,
        attempt,
        MAX_TRIES_PER_STORY,
        lastAttemptOutcome,
        supervisorForPrompt
      );
      const storyAgent = normalizeAgentResult(
        await runManagedAgent({
          parentJobId: jobId,
          tag: `${storyId}:fix-${attempt}`,
          prompt,
          appendLog,
          killFlagPath,
          investigateFirst: workerMode === "investigate_first",
          fixMode: cfg.mode,
          workspaceRoot: activeRoot !== ROOT ? activeRoot : undefined
        })
      );
      if (storyAgent.usageBlocked) {
        if (serialSandbox) teardownSandbox(serialSandbox, ROOT);
        markCursorUsageBlocked();
        await appendLog(
          "[fix-all] BLOCKED — Cursor CLI out of usage. Stopping serial fix-all. " +
            "Switch fix agent model to Auto or restore org limits; turn off portfolio AUTO.\n"
        );
        return {
          exitCode: 2,
          passed: false,
          summary: "blocked: cursor_usage",
          blocked: true,
          blockedReason: "cursor_usage_limit"
        };
      }
      const agentCode = storyAgent.exitCode;
      if (existsSync(killFlagPath)) break;

      const gitAfter = snapshotWorkspace(activeRoot);
      let filesChanged = diffWorkspaceSnapshots(gitBefore, gitAfter);

      writeStructuredJobResult(ROOT, jobId, storyId, "fixer", attempt, {
        suiteId,
        mode: cfg.mode,
        status: agentCode === 0 ? "completed" : "failed",
        agentExitCode: agentCode ?? 1,
        filesChanged,
        workerMode,
        usageBlocked: Boolean(storyAgent.usageBlocked),
        watchdogTripped: Boolean(storyAgent.watchdogTripped),
        watchdogReason: storyAgent.watchdogReason ?? null,
        editCount: storyAgent.editCount ?? 0
      });
      updateAgentStatus(ROOT, fixerAgentId, { status: "idle", currentTask: null });
      emitFleetEvent(ROOT, "agent.complete", {
        agentId: fixerAgentId,
        jobId,
        storyId,
        suiteId,
        attempt,
        phase: "fixer",
        agentExitCode: agentCode ?? 1,
        filesChanged: filesChanged.slice(0, 12)
      });

      if (serialSandbox && filesChanged.length) {
        const promoted = promoteSandboxFiles(ROOT, serialSandbox.path, filesChanged);
        await appendLog(`[sandbox] promoted ${promoted.length} file(s) to main for test\n`);
        filesChanged = promoted;
        teardownSandbox(serialSandbox, ROOT);
        serialSandbox = null;
      } else if (serialSandbox) {
        teardownSandbox(serialSandbox, ROOT);
        serialSandbox = null;
      }

      if (agentCode !== 0) {
        await appendLog(`${prefix} attempt ${attempt} — agent exited ${agentCode}\n`);
      }
      if (filesChanged.length) {
        await appendLog(
          `${prefix} attempt ${attempt} — files changed: ${filesChanged.slice(0, 8).join(", ")}${filesChanged.length > 8 ? "…" : ""}\n`
        );
      }

      if (cfg.needsPluginBuild) {
        await appendLog(`${prefix} attempt ${attempt} — plugin build (child terminal)…\n`);
        const buildCode = await runPluginBuildManaged(jobId, appendLog, killFlagPath);
        if (buildCode !== 0) {
          pluginBuildFailed = true;
          pluginBuildTail = `plugin build exited ${buildCode}`;
          await appendLog(`${prefix} plugin build failed (exit ${buildCode})\n`);
        }
      }

      await appendLog(`${prefix} attempt ${attempt} — running test (child terminal)…\n`);
      const priorsOk = await ensurePriorStepsPass(
        suiteId,
        storyId,
        appendLog,
        jobId,
        killFlagPath
      );
      if (!priorsOk) break;
      const testExit = await runStoryTestManaged(suiteId, storyId, jobId, appendLog, killFlagPath);
      const testTail = testExit === 0 ? "PASS" : `exit ${testExit}`;
      await appendLog(`${prefix} test finished: ${testTail}\n`);

      storyMeta = agent.getStoryFromReport(suiteId, storyId, SUITES, safeSegment) ?? storyMeta;
      const afterTest = metricsFromStory(storyMeta);
      current = afterTest;

      if (afterTest.status === "pass") {
        passed = true;
        const hint = loadLabMemoryFixHint(ROOT, storyId, suiteId);
        appendStoryResolution({
          repoRoot: ROOT,
          storyId,
          suiteId,
          attempt
        });
        await appendLog(`${prefix} — PASS after attempt ${attempt}\n`);
        if (hint?.recommendedFixArea && !hint.recommendedFixArea.includes("infra")) {
          await appendLog(
            `${prefix} — consider adding lab-memory/visual/patterns/ for this fix (reusable rule, not story-only).\n`
          );
        }
        break;
      }

      const priorRuns = loadPriorWorkerRuns(ROOT, jobId, storyId);
      const evaluation = evaluateAttempt({
        suiteId,
        mode: cfg.mode,
        storyId,
        attempt,
        beforeAttempt,
        afterTest,
        agentExitCode: agentCode ?? 0,
        pluginBuildFailed,
        filesChanged,
        priorRuns,
        repoRoot: ROOT
      });

      writeWorkerRun(ROOT, jobId, storyId, attempt, {
        suiteId,
        mode: cfg.mode,
        beforeAttempt,
        afterTest,
        agentExitCode: agentCode ?? 0,
        pluginBuildFailed,
        filesChanged,
        evaluation
      });

      lastSupervisor = evaluation;
      if (evaluation.tierCRequired) storyTierCRequired = true;
      if (filesChanged.length) {
        storyFilesChanged = [...new Set([...storyFilesChanged, ...filesChanged])];
      }

      await appendLog(
        `[supervisor] ${storyId} try ${attempt}: ${evaluation.verdict} → next mode ${evaluation.nextWorkerMode}\n`
      );
      for (const line of evaluation.interventionLines) {
        await appendLog(`[supervisor] ${line}\n`);
      }

      // SHARED_ADAPTER: merge-captain owns promotion; no inline Tier C blocking the pipeline.
      if (
        evaluation.nextWorkerMode === "tier_c_required" &&
        !existsSync(killFlagPath)
      ) {
        await appendLog(
          `${prefix} — shared adapter edit noted; merge-captain promotion gate applies (no inline Tier C block)\n`
        );
      }

      const adapterEdits = adapterFilesForMode(cfg.mode, filesChanged);
      if (
        attempt >= 2 &&
        adapterEdits.length === 0 &&
        (evaluation.verdict === "STUCK_LOOP" ||
          evaluation.verdict === "NO_ADAPTER_EDIT" ||
          evaluation.verdict === "WRONG_DIRECTION" ||
          evaluation.verdict === "NO_EDIT")
      ) {
        await appendLog(
          `${prefix} — early stop: ${MAX_TRIES_PER_STORY - attempt} attempt(s) skipped (metrics flat, no render-html/extract edits). ` +
            `Escalate: open compare PNG + artifact, edit adapter by hand, or paste BLOCKED in lab-memory.\n`
        );
        break;
      }

      if (evaluation.verdict === "WORSE_METRICS" && filesChanged.length) {
        const restored = gitRestorePaths(ROOT, filesChanged);
        await appendLog(
          `[sandbox] DISCARD ${storyId} try ${attempt} — metrics regressed; git restore ${restored.restored.length} file(s)` +
            (restored.ok ? "\n" : ` (warn: ${restored.stderr})\n`)
        );
        if (cfg.needsPluginBuild && restored.restored.length) {
          await appendLog(`${prefix} — rebuilding plugin after restore…\n`);
          await runPluginBuildManaged(jobId, appendLog, killFlagPath);
        }
        storyFilesChanged = storyFilesChanged.filter((f) => !restored.restored.includes(f));
      }

      writeOrchestratorState(ROOT, {
        phase: "fix-all",
        suiteId,
        suiteLabel: cfg.label,
        jobId,
        storyId,
        storyIndex: i + 1,
        storyTotal: serialStoryIds.length,
        attempt,
        maxAttempts: MAX_TRIES_PER_STORY,
        verdict: evaluation.verdict,
        nextWorkerMode: evaluation.nextWorkerMode,
        metrics: afterTest,
        filesChanged,
        tierCRequired: storyTierCRequired
      });

      if (evaluation.verdict === "WRONG_STEP") {
        await appendLog(`${prefix} — supervisor blocked: fix mock/pixel before ${suiteId}\n`);
        break;
      }

      if (
        evaluation.verdict === "REGION_ONLY_FAIL" &&
        attempt >= 2 &&
        serialStoryIds.length === 1
      ) {
        await appendLog(
          `${prefix} — supervisor stop: global PASS but hotspot still over bar — check tolerance or compare PNG, not code-v2 loop\n`
        );
        break;
      }

      const st = afterTest.status ?? "unknown";
      const pct = afterTest.percent?.toFixed(2) ?? "?";
      const region =
        afterTest.maxRegionPercent != null
          ? `, hotspot ${afterTest.maxRegionPercent.toFixed(2)}%`
          : "";
      await appendLog(`${prefix} attempt ${attempt} — still ${st} (${pct}%${region})\n`);

      lastAttemptOutcome = {
        attempt,
        beforeAttempt,
        afterTest,
        agentExitCode: agentCode ?? 0,
        pluginBuildFailed,
        pluginBuildTail,
        testTail,
        testExitCode: testExit ?? 1
      };
    }

    if (passed) {
      const runStep = makeStoryStepRunner(jobId, appendLog, killFlagPath);
      const tierBRequired =
        touchedStoryComponentPackage(storyFilesChanged, storyId, storyRegistry) ||
        process.env.FIX_ALL_TIER_B === "1";
      let regressionOk = true;

      if (!existsSync(killFlagPath)) {
        regressionOk = await runTierA({
          repoRoot: ROOT,
          suiteId,
          storyId,
          runStep,
          appendLog
        });
        if (!regressionOk) {
          await appendLog(`${prefix} — step passed but Tier A failed; treat as not done\n`);
        }
      }

      if (regressionOk && tierBRequired && !existsSync(killFlagPath)) {
        await appendLog(`${prefix} — Tier B (component family) required…\n`);
        regressionOk = await runTierB({
          repoRoot: ROOT,
          suiteId,
          storyId,
          runStep,
          appendLog
        });
        if (!regressionOk) {
          await appendLog(`${prefix} — Tier B failed; treat as not done\n`);
        }
      }

      if (regressionOk && storyTierCRequired && !existsSync(killFlagPath)) {
        await appendLog(
          `${prefix} — shared adapter touched; merge-captain owns promotion (full Tier C not blocking pipeline)\n`
        );
      }

      if (regressionOk && storyFilesChanged.length && !existsSync(killFlagPath)) {
        const mergeReview = runMergeCaptainReview({
          jobId,
          storyId,
          suiteId,
          mode: cfg.mode,
          filesChanged: storyFilesChanged,
          attempt: null,
          promotion: {
            promote: true,
            discard: false,
            worse: [],
            improved: [{ storyId }]
          },
          verification: {
            tierAOk: true,
            tierBOk: !tierBRequired || regressionOk,
            tierCOk: true
          }
        });
        await appendLog(
          `[merge-captain] ${mergeReview.decision.toUpperCase()} ${storyId} — ${mergeReview.reasons.join(" ")}\n`
        );
        if (mergeReview.decision !== "approve") {
          const restored = gitRestorePaths(ROOT, storyFilesChanged);
          await appendLog(
            `[sandbox] DISCARD ${storyId} — merge-captain did not approve; git restore ${restored.restored.length} file(s)` +
              (restored.ok ? "\n" : ` (warn: ${restored.stderr})\n`)
          );
          if (cfg.needsPluginBuild && restored.restored.length) {
            await runPluginBuildManaged(jobId, appendLog, killFlagPath);
          }
          if (!existsSync(killFlagPath)) {
            await runStoryTestManaged(suiteId, storyId, jobId, appendLog, killFlagPath);
          }
          regressionOk = false;
        }
      }

      if (regressionOk) {
        storiesPassed += 1;
      } else {
        passed = false;
      }
    } else if (!existsSync(killFlagPath)) {
      storiesExhausted += 1;
      await appendLog(`${prefix} — gave up after ${MAX_TRIES_PER_STORY} attempts\n`);
    }
  }

  if (!existsSync(killFlagPath)) {
    if (serialStoryIds.length === 1) {
      await appendLog(`[fix-all] Refreshing report for ${serialStoryIds[0]} only…\n`);
      await runStoryTestManaged(suiteId, serialStoryIds[0], jobId, appendLog, killFlagPath);
      spawnSync("node", ["scripts/test-portfolio-merge.mjs"], { cwd: ROOT, stdio: "ignore" });
    } else {
      await appendLog("[fix-all] Refreshing full suite report (child terminal)…\n");
      await runFullSuiteGolden(suiteId, appendLog, jobId, killFlagPath, { storyIds: serialStoryIds });
    }
    spawnSync("node", ["scripts/orchestrator-context.mjs"], {
      cwd: ROOT,
      stdio: "ignore"
    });
  }

  const killed = existsSync(killFlagPath);
  const allPass = storiesPassed === serialStoryIds.length && serialStoryIds.length > 0;
  const exitCode = killed ? 130 : allPass ? 0 : 1;

  writeOrchestratorState(ROOT, {
    phase: "fix-all",
    suiteId,
    jobId,
    verdict: killed ? "CANCELLED" : allPass ? "ON_TRACK" : "EXHAUSTED",
    nextWorkerMode: killed ? "stopped" : "continue",
    finished: true,
    summary: killed ? "cancelled" : `${storiesPassed}/${serialStoryIds.length} pass`
  });

  await appendLog(
    `\n[fix-all] Done: ${storiesPassed}/${serialStoryIds.length} pass` +
      (storiesExhausted ? `, ${storiesExhausted} exhausted` : "") +
      (killed ? " (cancelled)" : "") +
      "\n"
  );

  return {
    exitCode,
    passed: allPass && !killed,
    summary: `${storiesPassed}/${serialStoryIds.length} pass`
  };
}
