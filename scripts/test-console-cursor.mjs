#!/usr/bin/env node
/**
 * Dispatch test-console fix prompts via Cursor CLI when available.
 *
 * Docs: https://cursor.com/docs/cli/overview
 *   Interactive:  agent "refactor the auth module…"
 *   Automation:   agent -p "find and fix…" --output-format text  (print mode; we use this)
 *
 *   pnpm test:console:cursor pending          # print pending prompt
 *   pnpm test:console:cursor agent            # run agent -p with pending prompt
 *   pnpm test:console:cursor after-job <id>   # wait for job, dispatch if fix queued
 *   pnpm test:console:cursor watch-job <id>   # stream job logs in Terminal
 */
import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openTerminal } from "./test-console-terminal.mjs";
import { runFixAllIterate, MAX_TRIES_PER_STORY } from "./test-console-fix-all-iterate.mjs";
import { loadRunSettings, resolveAgentModel } from "./test-console-run-settings.mjs";
import { runPortfolioGolden } from "./test-console-portfolio-orchestrator.mjs";
import { loadOrchestratorAuto } from "./test-console-orchestrator-auto.mjs";
import { skillFollowLines } from "./test-console-agent-bridge.mjs";
import { api } from "./test-console-api.mjs";
import { runKillPath } from "./test-console-paths.mjs";
import {
  ROOT,
  hasCursorAgent,
  cursorAgentInvocation,
  parseStreamJsonAgentLine,
  spawnCursorAgent
} from "./test-console-cursor-cli.mjs";

export { api } from "./test-console-api.mjs";
export {
  ROOT,
  resolveAgentCli,
  hasCursorAgent,
  buildAgentPrompt,
  cursorAgentInvocation,
  cursorAgentArgs,
  parseStreamJsonAgentLine,
  formatStreamJsonEvent,
  spawnCursorAgent
} from "./test-console-cursor-cli.mjs";

const UI = process.env.TEST_CONSOLE_UI ?? "http://127.0.0.1:6110";

/** @param {object | null | undefined} msg */
export function isDispatchableMessage(msg) {
  if (!msg?.cursorPrompt) return false;
  if (msg.cursorPhrase === "open test console") return false;
  const skip = new Set([
    "action_started",
    "prerequisite",
    "run_until_pass_complete",
    "fix_all_requested",
    "portfolio_orchestrator_requested"
  ]);
  return !skip.has(msg.type);
}

/** Fix-all / orchestrator inbox entries — Terminal CLI only. */
export function isFixAllEntry(msg) {
  if (!msg || msg.type !== "fix_all_requested") return false;
  const n = msg.storyIds?.length ?? msg.storyCount ?? 0;
  return n > 0 && Boolean(msg.cursorPrompt);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** @returns {Promise<object | null>} */
export async function fetchPending() {
  const data = await api("/api/agent/pending");
  const msg = data?.message ?? data;
  return msg?.id ? msg : null;
}

export async function runCursorAgent(prompt) {
  if (!hasCursorAgent()) {
    console.error(
      "Cursor CLI not found. Install from https://cursor.com/docs/cli/overview or paste the prompt into IDE chat."
    );
    process.exit(1);
  }
  const cli = resolveAgentCli();
  const cliName = cli?.type === "gemini" ? "gemini" : "cursor";
  console.log(`[${cliName}] Starting agent -p in ${ROOT} (stream-json, model: ${resolveAgentModel(loadRunSettings())})\n`);
  const { bin, args } = cursorAgentInvocation(prompt, {
    streamProgress: true,
    model: resolveAgentModel(loadRunSettings())
  });
  const child = spawn(bin, args, {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let buf = "";
  let terminalExit = null;

  const flushLines = (chunk, isErr = false) => {
    buf += chunk;
    const parts = buf.split("\n");
    buf = parts.pop() ?? "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (isErr) {
        console.error(`[agent] stderr: ${trimmed}`);
        continue;
      }
      const parsed = parseStreamJsonAgentLine(trimmed);
      if (parsed.label) console.log(`[agent] ${parsed.label}`);
      if (parsed.terminal) terminalExit = parsed.exitCode ?? 0;
    }
  };

  return new Promise((resolveRun) => {
    child.stdout.on("data", (c) => flushLines(String(c), false));
    child.stderr.on("data", (c) => flushLines(String(c), true));
    child.on("close", (code) => resolveRun(terminalExit ?? code ?? 0));
    child.on("error", (err) => {
      console.error(`[agent] spawn error: ${err.message}`);
      resolveRun(1);
    });
  });
}

const STORY_START_RE = /▶\s+(.+?)\s+\.\.\./g;
const STORY_DONE_RE = /[✓⚠✗]\s+(?:PASS|WARN|FAIL|ERROR)/g;
const TOTAL_FROM_LABEL = /\((\d+)\s+stories\)/;

function lastOrchestratorStatusLine(logs) {
  const lines = logs
    .split("\n")
    .filter(
      (l) =>
        l.includes("[orchestrator]") ||
        l.includes("[portfolio]") ||
        l.includes("[fix-all]") ||
        l.includes("[agent:") ||
        l.includes("[agent]") ||
        l.includes("[golden:")
    );
  const last = lines[lines.length - 1];
  return last ? last.replace(/^\[[^\]]+\]\s*/, "").trim() : null;
}

function formatJobProgress(job, logs) {
  if (
    job?.action === "portfolio-orchestrator" ||
    (job?.action && String(job.action).startsWith("fix-all:"))
  ) {
    return lastOrchestratorStatusLine(logs);
  }
  const label = job?.label ?? "";
  const totalM = label.match(TOTAL_FROM_LABEL);
  const total = totalM ? Number(totalM[1]) : undefined;
  const done = (logs.match(STORY_DONE_RE) ?? []).length;
  const starts = [...logs.matchAll(STORY_START_RE)];
  const current = starts.length > done ? starts[starts.length - 1][1] : null;
  if (total != null) return `${done}/${total}${current ? ` · ${current}` : ""}`;
  if (current) return current;
  return null;
}

/** Wait for a console job to leave the running state; print harness progress to this terminal. */
export async function waitForJob(jobId, timeoutMs = 3_600_000) {
  const deadline = Date.now() + timeoutMs;
  let lastLogLen = 0;
  let lastProgressLine = "";
  while (Date.now() < deadline) {
    let job;
    try {
      job = await api(`/api/jobs/${jobId}`);
    } catch {
      await sleep(500);
      continue;
    }
    const logs = job.logs ?? "";
    if (logs.length > lastLogLen) {
      const chunk = logs.slice(lastLogLen);
      lastLogLen = logs.length;
      process.stdout.write(chunk);
      const progress = formatJobProgress(job, logs);
      if (progress && progress !== lastProgressLine) {
        lastProgressLine = progress;
        console.log(`\n[cursor] ${progress}`);
      }
    }
    if (job.status !== "running" && !job.finalizing) return job;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

/**
 * After a job finishes, dispatch Cursor CLI if a fix-worthy message was queued.
 * @param {string | undefined} jobId
 * @param {string | undefined} pendingBeforeId pending message id before the action started
 */
/**
 * Wait briefly for a post-job fix prompt (portfolio merge + inbox enqueue).
 * @param {string | undefined} pendingBeforeId
 * @param {{ status?: string } | null} job
 * @returns {Promise<object | null>}
 */
async function waitForPostJobFix(pendingBeforeId, job) {
  const failed = job?.status === "failed" || job?.status === "killed";
  const deadline = Date.now() + (failed ? 30_000 : 8_000);
  while (Date.now() < deadline) {
    const pending = await fetchPending();
    if (pending && pending.id !== pendingBeforeId) {
      if (isDispatchableMessage(pending)) return pending;
      return null;
    }
    await sleep(350);
  }
  return null;
}

export async function afterJobDispatch(jobId, pendingBeforeId) {
  /** @type {{ status?: string; label?: string; action?: string; story?: string } | null} */
  let job = null;
  if (jobId) {
    console.log(`[cursor] Waiting for job ${jobId}…`);
    job = await waitForJob(jobId);
    console.log(`[cursor] Job finished: ${job.status} (${job.label ?? job.action})`);
  }

  const pending = await waitForPostJobFix(pendingBeforeId, job);

  /** Single-story fix→test loop (agent → build → re-test) when a specific story failed. */
  const storyId = pending?.storyId ?? job?.story ?? null;
  const suiteId = pending?.suiteId ?? null;
  if (
    pending &&
    isDispatchableMessage(pending) &&
    storyId &&
    suiteId &&
    pending.type !== "fix_all_requested"
  ) {
    console.log(
      `\n[cursor] Starting fix→test loop for ${storyId} (${suiteId}) — agent, then automatic re-test.\n`
    );
    let fixJobId;
    try {
      const created = await api("/api/agent/request-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suiteId, storyId, deferTerminal: true })
      });
      fixJobId = created?.jobId;
    } catch (e) {
      console.error("[cursor] Could not create fix job:", e instanceof Error ? e.message : e);
      process.exit(1);
    }
    if (!fixJobId) {
      console.error("[cursor] Fix job missing jobId — restart test console and retry.");
      exitWithClose(1);
    }

    const killFlag = fixAllKillFlagPath(fixJobId);
    const { exitCode, passed } = await runFixAllIterate(fixJobId, {
      killFlagPath: killFlag,
      suiteId,
      storyIds: [storyId]
    });

    const { existsSync, unlinkSync } = await import("node:fs");
    if (existsSync(killFlag)) unlinkSync(killFlag);

    const status = passed ? "passed" : "failed";
    try {
      await api(`/api/jobs/${fixJobId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, exitCode })
      });
    } catch {
      /* ok */
    }

    console.log(
      `\n[cursor] Fix→test loop ${status} for ${storyId} (exit ${exitCode}) — refresh the test console.\n`
    );
    exitWithClose(exitCode === 0 ? 0 : exitCode ?? 1);
  }

  if (pending) {
    console.log("\n--- Test console → Cursor CLI (Terminal) ---\n");
    console.log(pending.cursorPrompt);
    console.log("\n[cursor] Running agent -p in this terminal…\n");
    const code = await runCursorAgent(pending.cursorPrompt);
    exitWithClose(code);
  }

  if (job?.status === "passed") {
    console.log("[cursor] Reports updated — see test console dashboard or suite report ↗");
  } else if (job?.status === "killed") {
    console.log("[cursor] Run cancelled.");
  } else {
    console.log("[cursor] No fix prompt queued — check suite report ↗ in the test console.");
  }
  exitWithClose(0);
}

/** Open a visible terminal that waits for job completion then dispatches Cursor CLI. */
export function openTerminalForJob(jobId, pendingBeforeId) {
  const parts = ["node", "scripts/test-console-cursor.mjs", "after-job"];
  if (jobId) parts.push(jobId);
  if (pendingBeforeId) parts.push(pendingBeforeId);
  openTerminal(parts.join(" "), ROOT);
}

/** Stream job logs in Terminal only (test jobs — no second agent). */
export function openTerminalWatchJob(jobId) {
  openTerminal(`node scripts/test-console-cursor.mjs watch-job ${jobId}`, ROOT);
}

/** Run fix-all orchestrator in a persistent Terminal tab (opens child tabs for agent/tests). */
export function openTerminalRunFixAll(jobId) {
  // Default = serial (one-story-at-a-time); batch mode is opt-in via FIX_ALL_BATCH=1.
  const forceBatch =
    process.env.FIX_ALL_BATCH === "1" || process.env.FIX_ALL_BATCH === "true";
  const forceSerial =
    process.env.FIX_ALL_SERIAL === "1" || process.env.FIX_ALL_SERIAL === "true";
  const envParts = [];
  if (forceBatch && !forceSerial) envParts.push("FIX_ALL_BATCH=1");
  if (forceSerial) envParts.push("FIX_ALL_SERIAL=1");
  const prefix = envParts.length ? `${envParts.join(" ")} ` : "";
  openTerminal(`${prefix}node scripts/test-console-cursor.mjs run-fix-all ${jobId}`, ROOT, {
    keepOpen: false,
    tabTitle: `Fix all · ${jobId.slice(0, 8)}`
  });
}

/** Portfolio golden-path orchestrator — persistent supervisor tab. */
export function openTerminalRunPortfolioOrchestrator(jobId) {
  openTerminal(`node scripts/test-console-cursor.mjs run-portfolio-orchestrator ${jobId}`, ROOT, {
    keepOpen: false,
    tabTitle: `Orchestrator · ${jobId.slice(0, 8)}`
  });
}

function fixAllKillFlagPath(jobId) {
  return runKillPath(ROOT, jobId);
}

export { fixAllKillFlagPath };

function exitWithClose(code = 0) {
  process.exit(code);
}

/**
 * Run fix-all job: `agent -p` in this terminal (headless CLI), not IDE chat.
 * @param {string} jobId
 */
export async function runFixAllJob(jobId) {
  const { existsSync, unlinkSync } = await import("node:fs");
  const killFlag = fixAllKillFlagPath(jobId);
  if (existsSync(killFlag)) unlinkSync(killFlag);

  try {
    await api(`/api/jobs/${jobId}/register-child`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: process.pid, role: "orchestrator" })
    });
  } catch {
    /* ok */
  }

  try {
    await api("/api/agent/clear-pending", { method: "POST" });
  } catch {
    /* older server */
  }

  if (!hasCursorAgent()) {
    console.error("Cursor CLI not found. Install: https://cursor.com/docs/cli/installation");
    process.exit(1);
  }

  let job;
  try {
    job = await api(`/api/jobs/${jobId}`);
  } catch (e) {
    console.error(`[cursor] Job ${jobId} not found:`, e);
    process.exit(1);
  }

  console.log(
    `[cursor] Fix-all orchestrator — stay on THIS tab (supervisor).\n` +
      `  Batch mode (2+ stories): investigation report → ONE agent fixes all → re-test each story.\n` +
      `  Serial mode (1 story or FIX_ALL_SERIAL=1): up to ${MAX_TRIES_PER_STORY} tries per story.\n` +
      `  Child Terminal tabs open for each agent fix, plugin build, and test.\n`
  );

  const storyIds = job.storyIds ?? [];
  if (storyIds.length > 0) {
    console.log(`[cursor] Queue (${storyIds.length} stories, worst first):`);
    for (let i = 0; i < storyIds.length; i++) {
      console.log(`  ${i + 1}. ${storyIds[i]}`);
    }
    console.log("");
  }

  const { exitCode, passed } = await runFixAllIterate(jobId, { killFlagPath: killFlag });

  const killed = existsSync(killFlag);
  if (killed) unlinkSync(killFlag);

  const status = killed ? "killed" : passed ? "passed" : "failed";
  try {
    await api(`/api/jobs/${jobId}/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, exitCode: killed ? 130 : exitCode })
    });
  } catch {
    /* ok */
  }

  console.log(`\n[cursor] Fix-all ${status} (exit ${exitCode})`);
  if (passed) {
    console.log("[cursor] Suite report refreshed — check the test console dashboard.");
  }
  process.exit(killed ? 130 : exitCode);
}

function portfolioKillFlagPath(jobId) {
  return runKillPath(ROOT, jobId);
}

/**
 * Run portfolio golden-path orchestrator job in Terminal.
 * @param {string} jobId
 */
export async function runPortfolioOrchestratorJob(jobId) {
  const killFlag = portfolioKillFlagPath(jobId);
  if (existsSync(killFlag)) unlinkSync(killFlag);

  try {
    await api(`/api/jobs/${jobId}/register-child`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: process.pid, role: "orchestrator" })
    });
  } catch {
    /* ok */
  }

  try {
    await api("/api/agent/clear-pending", { method: "POST" });
  } catch {
    /* ok */
  }

  if (!hasCursorAgent()) {
    console.error("Cursor CLI not found. Install: https://cursor.com/docs/cli/installation");
    process.exit(1);
  }

  let job;
  try {
    job = await api(`/api/jobs/${jobId}`);
  } catch (e) {
    console.error(`[cursor] Job ${jobId} not found:`, e);
    process.exit(1);
  }

  const autoMode = Boolean(job.autoMode) || loadOrchestratorAuto().enabled;

  console.log(
    "[cursor] Portfolio orchestrator — golden path ALL (pixel → figma → live → delivery).\n" +
      (autoMode
        ? "  AUTO mode — supervisor stays alive and rescans until you turn Auto off or cancel.\n"
        : "  One-shot — stops at PHASE_COMPLETE.\n") +
      "  Stay on THIS tab (supervisor). Child tabs open for golden runs, agents, and tests.\n"
  );

  const storyIds = job.storyIds ?? [];
  if (storyIds.length > 0) {
    console.log(`[cursor] Portfolio (${storyIds.length} stories)\n`);
  }

  const { exitCode, passed, summary } = await runPortfolioGolden(jobId, {
    killFlagPath: killFlag,
    autoMode
  });

  const killed = existsSync(killFlag);
  if (killed) unlinkSync(killFlag);

  const status = killed ? "killed" : passed ? "passed" : "failed";
  try {
    await api(`/api/jobs/${jobId}/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, exitCode: killed ? 130 : exitCode })
    });
  } catch {
    /* ok */
  }

  console.log(`\n[cursor] Portfolio orchestrator ${status} — ${summary} (exit ${exitCode})`);
  process.exit(killed ? 130 : exitCode);
}

/** Open terminal and dispatch immediately (legacy — prefer server-spawned fix-all job). */
export function openTerminalForAgent() {
  openTerminal("pnpm test:console:cursor agent", ROOT);
}

/** @param {string} jobId */
export async function watchJobTerminal(jobId) {
  console.log(
    `[cursor] Watching job ${jobId} (test harness logs — not the Fix-all agent)…\n`
  );
  const { existsSync } = await import("node:fs");
  let initial;
  try {
    initial = await api(`/api/jobs/${jobId}`);
  } catch {
    initial = null;
  }
  const action = initial?.action ? String(initial.action) : "";
  if (action.startsWith("fix-all:")) {
    const { runPromptPath } = await import("./test-console-paths.mjs");
    const promptPath = runPromptPath(ROOT, jobId);
    const logs = String(initial?.logs ?? "");
    if (existsSync(promptPath)) {
      console.log("[cursor] Fix-all: running agent in this terminal (run-fix-all)…\n");
      return runFixAllJob(jobId);
    }
    if (logs.includes("Starting Cursor agent")) {
      console.error(
        "[cursor] This fix-all job was created by an outdated test-console server.\n" +
          "  It opened watch-job but never started the CLI agent (no logs will appear).\n\n" +
          "  Fix: pnpm test:console:restart\n" +
          "  Then click Fix all again — Terminal should run run-fix-all with [agent] lines.\n"
      );
      process.exit(1);
    }
    if (logs.includes("Launching agent -p")) {
      console.error(
        "[cursor] Fix-all agent did not start in this terminal.\n" +
          "  Restart the server: pnpm test:console:restart\n" +
          "  Then click Fix all again.\n"
      );
      process.exit(1);
    }
  }
  const job = await waitForJob(jobId);
  console.log(`\n[cursor] Finished: ${job.status} (${job.label ?? job.action})`);
  if (String(job.action ?? "").startsWith("fix-all:")) {
    console.log("[cursor] This was a fix-all job — use the run-fix-all tab for agent output.");
  } else if (job.status === "passed") {
    console.log("[cursor] Reports updated — refresh the test console dashboard.");
  } else if (job.status === "killed" && (job.logs ?? "").includes("Fix all started")) {
    console.log("[cursor] Run stopped because Fix all started — watch the run-fix-all tab instead.");
  }
  exitWithClose(job.exitCode === 0 ? 0 : job.exitCode ?? 1);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

async function main() {
  const [cmd = "pending", arg1, arg2] = process.argv.slice(2);

  if (cmd === "agent") {
    const pending = await fetchPending();
    const prompt =
      pending?.cursorPrompt ??
      [...skillFollowLines(), "Fix worst failing story from test console."].join("\n");
    const code = await runCursorAgent(prompt);
    exitWithClose(code);
  } else if (cmd === "after-job") {
    await afterJobDispatch(arg1 || undefined, arg2 || undefined);
  } else if (cmd === "watch-job") {
    if (!arg1) {
      console.error("Usage: test-console-cursor.mjs watch-job <jobId>");
      process.exit(1);
    }
    await watchJobTerminal(arg1);
  } else if (cmd === "run-fix-all") {
    if (!arg1) {
      console.error("Usage: test-console-cursor.mjs run-fix-all <jobId>");
      process.exit(1);
    }
    await runFixAllJob(arg1);
  } else if (cmd === "run-portfolio-orchestrator") {
    if (!arg1) {
      console.error("Usage: test-console-cursor.mjs run-portfolio-orchestrator <jobId>");
      process.exit(1);
    }
    await runPortfolioOrchestratorJob(arg1);
  } else if (cmd === "dispatch-terminal") {
    if (arg1) {
      openTerminalForJob(arg1, arg2 || undefined);
    } else {
      openTerminalForAgent();
    }
  } else if (cmd === "pending" || cmd === "listen") {
    const pending = await fetchPending();
    if (!pending?.cursorPrompt) {
      console.log("No pending fix request.");
      process.exit(0);
    }
    console.log(pending.cursorPrompt);
    if (process.argv.includes("--cli") && hasCursorAgent()) {
      spawnCursorAgent(pending.cursorPrompt, {
        stdio: "inherit",
        detached: true,
        model: resolveAgentModel(loadRunSettings())
      }).unref();
      console.log("\n[cursor] Dispatched background agent.");
    } else if (process.argv.includes("--cli")) {
      console.log("\n[cursor] CLI unavailable — paste pending output into Cursor chat or install Cursor CLI");
    }
  } else {
    console.log(`Usage:
  test-console-cursor.mjs pending
  test-console-cursor.mjs agent
  test-console-cursor.mjs after-job [jobId] [pendingBeforeId]
  test-console-cursor.mjs watch-job <jobId>
  test-console-cursor.mjs run-fix-all <jobId>
  test-console-cursor.mjs run-portfolio-orchestrator <jobId>
  test-console-cursor.mjs dispatch-terminal [jobId] [pendingBeforeId]`);
    process.exit(1);
  }
}

if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
