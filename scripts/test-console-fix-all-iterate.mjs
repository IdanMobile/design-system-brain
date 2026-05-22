#!/usr/bin/env node
/**
 * Fix-all orchestrator: per story, up to N attempts of agent fix → rebuild (if needed) → test → check PASS.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initAgentBridge } from "./test-console-agent-bridge.mjs";
import { api } from "./test-console-api.mjs";
import { hasCursorAgent } from "./test-console-cursor-cli.mjs";
import {
  runManagedAgent,
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
  loadPriorWorkerRuns,
  snapshotWorkspace,
  writeOrchestratorState,
  writeWorkerRun
} from "./test-console-worker-supervisor.mjs";
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const MAX_TRIES_PER_STORY = Math.min(
  20,
  Math.max(1, Number(process.env.TEST_CONSOLE_FIX_ALL_MAX_TRIES ?? 5))
);

export const MAX_BATCH_TRIES = Math.min(
  5,
  Math.max(1, Number(process.env.TEST_CONSOLE_FIX_ALL_BATCH_MAX_TRIES ?? 3))
);

function fixAllSerialMode(storyIds) {
  const env = process.env.FIX_ALL_SERIAL;
  if (env === "1" || env === "true") return true;
  return storyIds.length <= 1;
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
  delivery: { dir: "delivery-diffs", label: "Delivery (3-way)", mode: "emulator", needsPluginBuild: true }
};

const agent = initAgentBridge(ROOT);

function safeSegment(id) {
  return id.replace(/[<>:"/\\|?*]/g, "-").replace(/-+/g, "-");
}

function readStoryStatus(suiteId, storyId) {
  const story = agent.getStoryFromReport(suiteId, storyId, SUITES, safeSegment);
  if (!story) return null;
  return {
    status: story.status,
    percent: story.percent,
    maxRegionPercent: story.maxRegionPercent ?? null,
    error: story.error ?? null
  };
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
        openTerminal: true,
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
  switch (suiteId) {
    case "pixel":
      return runManagedCommand({
        parentJobId,
        tag: `test:${storyId}`,
        bin: "pnpm",
        args: ["--filter", "@lab/pixel-test", "run", "test:golden", "--", "--stories", storyId],
        appendLog,
        killFlagPath,
        openTerminal: true
      });
    case "figma":
      return runManagedCommand({
        parentJobId,
        tag: `test:${storyId}`,
        bin: "node",
        args: ["scripts/figma-iterate.mjs", "--story", storyId, "--allow-test-errors"],
        appendLog,
        killFlagPath,
        openTerminal: true
      });
    case "figmaLive":
      return runManagedCommand({
        parentJobId,
        tag: `test:${storyId}`,
        bin: "node",
        args: ["scripts/figma-live-iterate.mjs", "--story", storyId, "--strict"],
        appendLog,
        killFlagPath,
        openTerminal: true
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
        openTerminal: true
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
    openTerminal: true
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
      killFlagPath,
      openTerminal: true
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
  let suggestSerial = false;
  const useWorktree = sandboxWorktreeEnabled();

  await appendLog(
    `[fix-all] BATCH mode — ${remaining.length} stories · up to ${MAX_BATCH_TRIES} investigate→fix→retest rounds\n` +
      `[fix-all] Investigation report written before each agent session.\n` +
      `[fix-all] Sandbox gate ON — metrics regress → auto git restore.\n` +
      (useWorktree ? `[fix-all] FIX_ALL_SANDBOX=worktree — agent edits in isolated worktree.\n` : "") +
      `[fix-all] Set FIX_ALL_SERIAL=1 to force one-story-at-a-time mode.\n`
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

    const stories = remaining
      .map((id) => agent.getStoryFromReport(suiteId, id, SUITES, safeSegment))
      .filter(Boolean);

    if (!stories.length) {
      await appendLog("[fix-all] batch — no report rows for remaining stories\n");
      break;
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
      regionTolerance
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
    const agentCode = await runManagedAgent({
      parentJobId: jobId,
      tag: `batch:try${batchAttempt}`,
      prompt,
      appendLog,
      killFlagPath,
      workspaceRoot: activeRoot !== ROOT ? activeRoot : undefined
    });
    if (existsSync(killFlagPath)) {
      if (sandbox) teardownSandbox(sandbox, ROOT);
      break;
    }

    let filesChanged = diffWorkspaceSnapshots(gitBefore, snapshotWorkspace(activeRoot));
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
          `[fix-all] batch — ${batchRegressionStreak} consecutive regressions; stopping batch. Re-run with FIX_ALL_SERIAL=1.\n`
        );
        break;
      }
    } else if (filesChanged.length && promotion.promote) {
      batchRegressionStreak = 0;
      await appendLog(
        `[sandbox] PROMOTE batch ${batchAttempt} — ${promotion.passAfter}/${remaining.length} pass in batch` +
          (promotion.improved.length ? ` · improved: ${promotion.improved.map((x) => x.storyId).slice(0, 5).join(", ")}` : "") +
          "\n"
      );
    } else if (filesChanged.length) {
      await appendLog(`[sandbox] NEUTRAL batch ${batchAttempt} — no net improvement; keeping edits\n`);
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

  if (!killed) {
    writeOrchestratorState(ROOT, {
      phase: "fix-all-batch",
      suiteId,
      jobId,
      verdict: allPass ? "ON_TRACK" : "EXHAUSTED",
      nextWorkerMode: "continue",
      finished: true,
      summary: `${storiesPassed}/${storyIds.length} pass`
    });
  }

  await appendLog(
    `\n[fix-all] Batch done: ${storiesPassed}/${storyIds.length} pass` +
      (storiesExhausted ? `, ${storiesExhausted} still failing` : "") +
      (killed ? " (cancelled)" : "") +
      (suggestSerial ? " · suggest FIX_ALL_SERIAL=1" : "") +
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

  await appendLog(
    fixAllSerialMode(storyIds)
      ? `[fix-all] Serial mode: up to ${MAX_TRIES_PER_STORY} fix→test cycles per story (${cfg.label})\n` +
          `[fix-all] Worker supervisor ON — observes git diff + metrics, steers stuck agents.\n` +
          `[fix-all] Supervisor stays in this tab; child Terminal tabs open for agents, builds, and tests.\n`
      : `[fix-all] Batch mode: ${storyIds.length} stories — investigate report → one fixer session → re-test all (${cfg.label})\n` +
          `[fix-all] Up to ${MAX_BATCH_TRIES} batch rounds. Set FIX_ALL_SERIAL=1 for one-by-one.\n`
  );

  if (!fixAllSerialMode(storyIds)) {
    return runFixAllBatch(jobId, { killFlagPath, suiteId, storyIds, cfg, appendLog });
  }

  writeOrchestratorState(ROOT, {
    phase: "fix-all",
    suiteId,
    suiteLabel: cfg.label,
    jobId,
    storyIndex: 0,
    storyTotal: storyIds.length,
    verdict: "ON_TRACK",
    nextWorkerMode: "continue"
  });

  let storiesPassed = 0;
  let storiesExhausted = 0;

  for (let i = 0; i < storyIds.length; i++) {
    if (existsSync(killFlagPath)) break;

    const storyId = storyIds[i];
    const prefix = `[fix-all] ${i + 1}/${storyIds.length} ${storyId}`;

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

      storyMeta = agent.getStoryFromReport(suiteId, storyId, SUITES, safeSegment) ?? storyMeta;
      const beforeAttempt = metricsFromStory(storyMeta);
      const hotspotNote =
        beforeAttempt.maxRegionPercent != null
          ? `, hotspot ${beforeAttempt.maxRegionPercent.toFixed(2)}%`
          : "";
      await appendLog(
        `${prefix} attempt ${attempt}/${MAX_TRIES_PER_STORY} (${beforeAttempt.status} ${beforeAttempt.percent.toFixed(2)}%${hotspotNote}) — agent fix…\n`
      );

      writeOrchestratorState(ROOT, {
        phase: "fix-all",
        suiteId,
        suiteLabel: cfg.label,
        jobId,
        storyId,
        storyIndex: i + 1,
        storyTotal: storyIds.length,
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

      const gitBefore = snapshotWorkspace(ROOT);

      const prompt = agent.buildFixAllStoryPrompt(
        storyMeta,
        cfg.mode,
        suiteId,
        attempt,
        MAX_TRIES_PER_STORY,
        lastAttemptOutcome,
        supervisorForPrompt
      );
      const agentCode = await runManagedAgent({
        parentJobId: jobId,
        tag: `${storyId}:try${attempt}`,
        prompt,
        appendLog,
        killFlagPath
      });
      if (existsSync(killFlagPath)) break;

      const gitAfter = snapshotWorkspace(ROOT);
      const filesChanged = diffWorkspaceSnapshots(gitBefore, gitAfter);

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
        await appendLog(`${prefix} — PASS after attempt ${attempt}\n`);
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
        storyTotal: storyIds.length,
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
        storyIds.length === 1
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
        regressionOk = await runTierC({
          repoRoot: ROOT,
          suiteId,
          runCommand: makeTierCCommandRunner(jobId, appendLog, killFlagPath),
          appendLog
        });
        if (!regressionOk) {
          await appendLog(`${prefix} — Tier C failed; treat as not done for portfolio\n`);
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
    if (storyIds.length === 1) {
      await appendLog(`[fix-all] Refreshing report for ${storyIds[0]} only…\n`);
      await runStoryTestManaged(suiteId, storyIds[0], jobId, appendLog, killFlagPath);
      spawnSync("node", ["scripts/test-portfolio-merge.mjs"], { cwd: ROOT, stdio: "ignore" });
    } else {
      await appendLog("[fix-all] Refreshing full suite report (child terminal)…\n");
      await runFullSuiteGolden(suiteId, appendLog, jobId, killFlagPath, { storyIds });
    }
    spawnSync("node", ["scripts/orchestrator-context.mjs"], {
      cwd: ROOT,
      stdio: "ignore"
    });
  }

  const killed = existsSync(killFlagPath);
  const allPass = storiesPassed === storyIds.length && storyIds.length > 0;
  const exitCode = killed ? 130 : allPass ? 0 : 1;

  if (!killed) {
    writeOrchestratorState(ROOT, {
      phase: "fix-all",
      suiteId,
      jobId,
      verdict: allPass ? "ON_TRACK" : "EXHAUSTED",
      nextWorkerMode: "continue",
      finished: true,
      summary: `${storiesPassed}/${storyIds.length} pass`
    });
  }

  await appendLog(
    `\n[fix-all] Done: ${storiesPassed}/${storyIds.length} pass` +
      (storiesExhausted ? `, ${storiesExhausted} exhausted` : "") +
      (killed ? " (cancelled)" : "") +
      "\n"
  );

  return { exitCode, passed: allPass && !killed, summary: `${storiesPassed}/${storyIds.length} pass` };
}
