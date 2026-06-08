/**
 * Orchestrator-managed child runs: open a child Terminal, stream logs to parent job, wait for exit.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openTerminal } from "./test-console-terminal.mjs";
import { api } from "./test-console-api.mjs";
import { parseStreamJsonAgentLine } from "./test-console-cursor-cli.mjs";
import { shellQuote } from "./shell-quote.mjs";
import {
  buildGoldenSpawnSpec,
  loadRunSettings,
  orchestratorGoldenStoryIds,
  resolveAgentModel
} from "./test-console-run-settings.mjs";
import {
  figmaEntryGoldenSpawn,
  isFigmaEntryFixSuite
} from "./figma-entry-fix.mjs";
import {
  childStatusDir,
  childStatusPath,
  agentPromptsDir,
  agentPromptPath
} from "./test-console-paths.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATUS_DIR = childStatusDir(ROOT);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const WAIT_HEARTBEAT_MS = 15_000;

/**
 * Mirror new `[agent:…]` lines from the parent job log into the supervisor terminal.
 * Agent child processes append to the job API; headless runs do not inherit stdio.
 * @param {string} parentJobId
 * @param {{ value: number }} logCursor
 * @param {(text: string, opts?: { localOnly?: boolean }) => Promise<void>} appendLog
 */
async function mirrorNewAgentLogs(parentJobId, logCursor, appendLog) {
  if (!parentJobId || !appendLog) return;
  try {
    const job = await api(`/api/jobs/${parentJobId}`);
    const logs = typeof job?.logs === "string" ? job.logs : "";
    if (logs.length <= logCursor.value) return;
    const newChunk = logs.slice(logCursor.value);
    logCursor.value = logs.length;
    for (const line of newChunk.split("\n")) {
      if (!line.trim() || !line.includes("[agent:")) continue;
      await appendLog(line.endsWith("\n") ? line : `${line}\n`, { localOnly: true });
    }
  } catch {
    /* ok */
  }
}

/**
 * Poll until child status file appears or deadline; heartbeat + agent log mirroring.
 * @param {object} opts
 */
async function waitForChildStatus({
  parentJobId,
  tag,
  statusFile,
  appendLog,
  killFlagPath,
  deadline,
  startedAt = Date.now(),
  logCursor
}) {
  let lastHeartbeat = Date.now();
  while (Date.now() < deadline) {
    if (killFlagPath && existsSync(killFlagPath)) {
      return { exitCode: 130, usageBlocked: false };
    }

    await mirrorNewAgentLogs(parentJobId, logCursor, appendLog);

    if (existsSync(statusFile)) {
      try {
        const s = JSON.parse(readFileSync(statusFile, "utf8"));
        if (s.finishedAt || s.exitCode != null) {
          const detail =
            s.watchdogTripped
              ? ` [watchdog: ${s.watchdogReason ?? "stalled"}]`
              : typeof s.editCount === "number"
                ? ` (edits=${s.editCount}, reads=${s.readCount ?? 0})`
                : "";
          await log(
            parentJobId,
            appendLog,
            "orchestrator",
            `${tag} finished exit ${s.exitCode ?? 1}${detail}\n`
          );
          return {
            exitCode: s.exitCode ?? 1,
            usageBlocked: Boolean(s.usageBlocked),
            watchdogTripped: Boolean(s.watchdogTripped),
            watchdogReason: s.watchdogReason ?? null,
            editCount: s.editCount ?? 0
          };
        }
      } catch {
        return { exitCode: 1, usageBlocked: false };
      }
    }

    const now = Date.now();
    if (now - lastHeartbeat >= WAIT_HEARTBEAT_MS) {
      lastHeartbeat = now;
      const elapsedMin = ((now - startedAt) / 60_000).toFixed(1);
      let progress = "";
      if (existsSync(statusFile)) {
        try {
          const partial = JSON.parse(readFileSync(statusFile, "utf8"));
          if (partial.inProgress) {
            progress = ` · edits=${partial.editCount ?? 0}, reads=${partial.readCount ?? 0}`;
            if (partial.lastActivity) progress += ` · ${partial.lastActivity}`;
          }
        } catch {
          /* ok */
        }
      }
      await log(
        parentJobId,
        appendLog,
        "orchestrator",
        `Waiting for ${tag} … ${elapsedMin}m elapsed${progress}\n`
      );
    }

    await sleep(400);
  }

  await log(
    parentJobId,
    appendLog,
    "orchestrator",
    `${tag} EXCEEDED orchestrator deadline (watchdog did not trip). Returning failure.\n`
  );
  return { exitCode: 1, usageBlocked: false, watchdogTripped: false };
}

function statusPath(parentJobId, runId) {
  return childStatusPath(ROOT, parentJobId, runId);
}

/**
 * @param {string} parentJobId
 * @param {(text: string) => Promise<void>} appendLog
 * @param {string} tag
 * @param {string} text
 */
async function log(parentJobId, appendLog, tag, text) {
  const line = text.startsWith("[") ? text : `[${tag}] ${text}`;
  const out = line.endsWith("\n") ? line : `${line}\n`;
  if (appendLog) {
    await appendLog(out);
    return;
  }
  process.stdout.write(out);
  if (parentJobId) {
    try {
      await api(`/api/jobs/${parentJobId}/append-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: out })
      });
    } catch {
      /* ok */
    }
  }
}

/**
 * Run a command in a new Terminal tab; orchestrator waits for completion.
 * @param {object} opts
 * @param {string} opts.parentJobId
 * @param {string} opts.tag
 * @param {string} opts.bin
 * @param {string[]} opts.args
 * @param {(text: string) => Promise<void>} [opts.appendLog]
 * @param {string} [opts.killFlagPath]
 * @param {boolean} [opts.openTerminal=true]
 * @param {Record<string, string>} [opts.env]
 */
export async function runManagedCommand({
  parentJobId,
  tag,
  bin,
  args,
  appendLog,
  killFlagPath,
  openTerminal: openTermOverride,
  env: extraEnv,
  cwd
}) {
  const workdir = cwd ?? ROOT;
  const settings = loadRunSettings();
  const openTerm =
    openTermOverride ??
    (!settings.headlessAgents && process.env.TEST_CONSOLE_HEADLESS_AGENTS !== "1");
  mkdirSync(STATUS_DIR, { recursive: true });
  const runId = `${tag.replace(/[^a-zA-Z0-9._-]+/g, "_")}-${Date.now()}`;
  const statusFile = statusPath(parentJobId, runId);
  if (existsSync(statusFile)) unlinkSync(statusFile);

  const childEnv = {
    ...process.env,
    FORCE_COLOR: "0",
    ...(workdir !== ROOT ? { TEST_CONSOLE_CWD: workdir } : {}),
    ...(extraEnv ?? {})
  };
  const envPrefix = extraEnv
    ? Object.entries(extraEnv)
        .map(([k, v]) => `${k}=${shellQuote(String(v))}`)
        .join(" ")
    : "";

  const runnerBody = [
    "node",
    "scripts/test-console-child-run.mjs",
    "--parent",
    parentJobId,
    "--tag",
    tag,
    "--status",
    statusFile,
    "--",
    bin,
    ...args
  ]
    .map((p) => (/\s/.test(p) ? shellQuote(p) : p))
    .join(" ");
  const runner = envPrefix ? `${envPrefix} ${runnerBody}` : runnerBody;

  await log(
    parentJobId,
    appendLog,
    "orchestrator",
    openTerm ? `Opening terminal → ${tag}\n` : `Headless run → ${tag}\n`
  );

  if (openTerm) {
    const tabTitle = `${tag} · ${String(parentJobId).slice(0, 8)}`;
    const opened = openTerminal(runner, workdir, {
      tabTitle,
      keepOpen: false,
      focus: true
    });
    if (opened) {
      await log(
        parentJobId,
        appendLog,
        "orchestrator",
        `Terminal.app tab opened — "${tabTitle}" (not the Cursor integrated terminal)\n`
      );
    } else {
      await log(
        parentJobId,
        appendLog,
        "orchestrator",
        `Terminal tab unavailable — running ${tag} inline (synchronous fallback)\n`
      );
      spawnSync(
        "node",
        [
          "scripts/test-console-child-run.mjs",
          "--parent",
          parentJobId,
          "--tag",
          tag,
          "--status",
          statusFile,
          "--",
          bin,
          ...args
        ],
        { cwd: workdir, stdio: "inherit", env: childEnv }
      );
      if (existsSync(statusFile)) {
        const s = JSON.parse(readFileSync(statusFile, "utf8"));
        return s.exitCode ?? 1;
      }
      return 1;
    }
  } else {
    const r = spawnSync(
      "node",
      [
        "scripts/test-console-child-run.mjs",
        "--parent",
        parentJobId,
        "--tag",
        tag,
        "--status",
        statusFile,
        "--",
        bin,
        ...args
      ],
      { cwd: workdir, stdio: "inherit", env: childEnv }
    );
    if (existsSync(statusFile)) {
      const s = JSON.parse(readFileSync(statusFile, "utf8"));
      return s.exitCode ?? r.status ?? 1;
    }
    return r.status ?? 1;
  }

  const logCursor = { value: 0 };
  try {
    const job = await api(`/api/jobs/${parentJobId}`);
    const logs = typeof job?.logs === "string" ? job.logs : "";
    logCursor.value = logs.length;
  } catch {
    /* ok */
  }

  const result = await waitForChildStatus({
    parentJobId,
    tag,
    statusFile,
    appendLog,
    killFlagPath,
    deadline: Date.now() + 3_600_000,
    logCursor
  });
  return result.exitCode ?? 1;
}

/** Golden suite commands for managed child terminals. */
export function goldenCommandForSuite(suiteId, options = {}) {
  const settings = options.settings ?? loadRunSettings();
  const storyIds = options.storyIds ?? null;

  if (storyIds && storyIds.length) {
    const spec = buildGoldenSpawnSpec(suiteId, storyIds, settings);
    if (spec) {
      return { bin: spec.bin, args: spec.args, tag: spec.tag, env: spec.env, empty: spec.empty };
    }
    if (isFigmaEntryFixSuite(suiteId) && storyIds.length === 1) {
      const spawnSpec = figmaEntryGoldenSpawn(suiteId, storyIds[0], ROOT);
      if (spawnSpec) {
        return {
          bin: spawnSpec.bin,
          args: spawnSpec.args,
          tag: spawnSpec.tag,
          env: {}
        };
      }
    }
  }

  if (isFigmaEntryFixSuite(suiteId)) {
    const stepArg =
      suiteId === "manifestContract"
        ? ":manifest"
        : suiteId === "vsStorybook"
          ? ":storybook"
          : suiteId === "vsReactHtml"
            ? ":reacthtml"
            : suiteId === "logic"
              ? ":logic"
              : "";
    return {
      bin: "pnpm",
      args: [`test:figma:screen${stepArg}`],
      tag: `golden:figmaEntry:${suiteId}`,
      env: { TEST_PARALLEL: "1" }
    };
  }

  switch (suiteId) {
    case "pixel":
      return {
        bin: "pnpm",
        args: ["test:pixel:golden"],
        tag: "golden:pixel",
        env: { TEST_PARALLEL: String(settings.parallelWorkers) }
      };
    case "figma":
      return {
        bin: "node",
        args: ["scripts/figma-iterate.mjs", "--allow-test-errors"],
        tag: "golden:figma",
        env: { TEST_PARALLEL: String(settings.parallelWorkers) }
      };
    case "figmaLive":
      return {
        bin: "node",
        args: ["scripts/figma-live-iterate.mjs"],
        tag: "golden:figmaLive",
        env: { TEST_PARALLEL: String(settings.parallelWorkers) }
      };
    case "delivery":
      return {
        bin: "pnpm",
        args: ["test:delivery:golden"],
        tag: "golden:delivery",
        env: { TEST_PARALLEL: String(settings.parallelWorkers) }
      };
    default:
      return null;
  }
}

export { orchestratorGoldenStoryIds, loadRunSettings };

/**
 * Run Cursor agent in a child terminal with stream-json mirrored to parent job.
 */
export async function runManagedAgent({
  parentJobId,
  tag,
  prompt,
  appendLog,
  killFlagPath,
  workspaceRoot,
  investigateFirst = false,
  investigateOnly = false,
  /** @type {'pixel' | 'emulator' | 'live' | undefined} */ fixMode,
  fixerUpstream = false,
  fixerAllowlistExtra = [],
  openTerminal: openTermOverride
}) {
  const workdir = workspaceRoot ?? ROOT;
  const settings = loadRunSettings();
  const openTerm =
    openTermOverride ??
    (!settings.headlessAgents && process.env.TEST_CONSOLE_HEADLESS_AGENTS !== "1");
  mkdirSync(STATUS_DIR, { recursive: true });
  const runId = `agent-${tag.replace(/[^a-zA-Z0-9._-]+/g, "_")}-${Date.now()}`;
  const statusFile = statusPath(parentJobId, runId);
  mkdirSync(agentPromptsDir(workdir), { recursive: true });
  const promptFile = agentPromptPath(workdir, runId);
  writeFileSync(promptFile, prompt, "utf8");
  const promptLines = prompt.split("\n").length;
  const promptBytes = Buffer.byteLength(prompt, "utf8");

  if (existsSync(statusFile)) unlinkSync(statusFile);

  const agentModel = resolveAgentModel(settings);
  /** Pixel fix-all: shorter budgets — adapter edits must land quickly. */
  const agentEnvParts = [];
  if (investigateFirst) agentEnvParts.push("AGENT_WATCHDOG_INVESTIGATE_MODE=1");
  if (investigateOnly) agentEnvParts.push("AGENT_WATCHDOG_INVESTIGATE_ONLY=1");
  if (fixMode === "pixel") {
    agentEnvParts.push(
      `AGENT_WATCHDOG_FIRST_EDIT_MS=${investigateFirst ? 6 * 60_000 : 5 * 60_000}`
    );
    agentEnvParts.push(`AGENT_WATCHDOG_TOTAL_MS=${18 * 60_000}`);
  } else if (fixMode === "live" || fixMode === "emulator" || fixMode === "figmaEntry") {
    agentEnvParts.push(
      `AGENT_WATCHDOG_FIRST_EDIT_MS=${investigateFirst ? 5 * 60_000 : 4 * 60_000}`
    );
    agentEnvParts.push(`AGENT_WATCHDOG_TOTAL_MS=${12 * 60_000}`);
    agentEnvParts.push(`AGENT_WATCHDOG_STALE_STREAM_MS=${3 * 60_000}`);
  }
  if (fixerUpstream) agentEnvParts.push("AGENT_FIXER_UPSTREAM=1");
  if (fixerAllowlistExtra?.length) {
    agentEnvParts.push(`AGENT_FIXER_ALLOWLIST_EXTRA=${fixerAllowlistExtra.join("|")}`);
  }
  const envPrefix = agentEnvParts.join(" ");
  const agentRunnerBody = [
    "node",
    "scripts/test-console-agent-child-run.mjs",
    "--parent",
    parentJobId,
    "--tag",
    tag,
    "--status",
    statusFile,
    "--prompt-file",
    promptFile,
    "--model",
    agentModel
  ]
    .map((p) => (/\s/.test(p) ? shellQuote(p) : p))
    .join(" ");
  const agentRunner = envPrefix ? `${envPrefix} ${agentRunnerBody}` : agentRunnerBody;

  const tabTitle = `Agent ${tag} · ${String(parentJobId).slice(0, 8)}`;
  await log(
    parentJobId,
    appendLog,
    "orchestrator",
    `Launching fixer agent → ${tag} (model: ${agentModel}, prompt ${promptLines} lines / ${(promptBytes / 1024).toFixed(1)}KB)${workdir !== ROOT ? " [sandbox]" : ""}\n`
  );
  const opened = openTerm
    ? openTerminal(agentRunner, workdir, {
        tabTitle,
        keepOpen: false,
        focus: true
      })
    : false;
  if (opened) {
    await log(
      parentJobId,
      appendLog,
      "orchestrator",
      `Terminal.app tab opened — "${tabTitle}" (agent output in that tab; this tab waits)\n`
    );
  } else {
    await log(
      parentJobId,
      appendLog,
      "orchestrator",
      openTerm
        ? `Terminal tab unavailable — running agent headless (progress mirrored below every 15s)\n`
        : `Headless agent — ${tag} (model: ${agentModel}); progress mirrored below every 15s\n`
    );
    spawn(
      "node",
      [
        "scripts/test-console-agent-child-run.mjs",
        "--parent",
        parentJobId,
        "--tag",
        tag,
        "--status",
        statusFile,
        "--prompt-file",
        promptFile,
        "--model",
        agentModel
      ],
      {
        cwd: workdir,
        env: {
          ...process.env,
          FORCE_COLOR: "0",
          ...(workdir !== ROOT ? { TEST_CONSOLE_CWD: workdir } : {}),
          ...(investigateFirst ? { AGENT_WATCHDOG_INVESTIGATE_MODE: "1" } : {}),
          ...(investigateOnly ? { AGENT_WATCHDOG_INVESTIGATE_ONLY: "1" } : {}),
          ...(fixMode === "pixel"
            ? {
                AGENT_WATCHDOG_FIRST_EDIT_MS: String(investigateFirst ? 6 * 60_000 : 5 * 60_000),
                AGENT_WATCHDOG_TOTAL_MS: String(18 * 60_000)
              }
            : fixMode === "live" || fixMode === "emulator" || fixMode === "figmaEntry"
              ? {
                  AGENT_WATCHDOG_FIRST_EDIT_MS: String(investigateFirst ? 5 * 60_000 : 4 * 60_000),
                  AGENT_WATCHDOG_TOTAL_MS: String(12 * 60_000),
                  AGENT_WATCHDOG_STALE_STREAM_MS: String(3 * 60_000)
                }
              : {}),
          ...(fixerUpstream ? { AGENT_FIXER_UPSTREAM: "1" } : {}),
          ...(fixerAllowlistExtra?.length
            ? { AGENT_FIXER_ALLOWLIST_EXTRA: fixerAllowlistExtra.join("|") }
            : {})
        },
        detached: true,
        stdio: "ignore"
      }
    ).unref();
  }

  const totalBudgetMs = Math.max(
    60_000,
    Number(process.env.AGENT_WATCHDOG_TOTAL_MS ?? 0) ||
      (fixMode === "live" || fixMode === "emulator" || fixMode === "figmaEntry" ? 12 * 60_000 : 25 * 60_000)
  );
  const orchestratorGraceMs =
    fixMode === "live" || fixMode === "emulator" || fixMode === "figmaEntry" ? 60_000 : 2 * 60_000;
  const startedAt = Date.now();
  const logCursor = { value: 0 };
  try {
    const job = await api(`/api/jobs/${parentJobId}`);
    const logs = typeof job?.logs === "string" ? job.logs : "";
    logCursor.value = logs.length;
  } catch {
    /* ok */
  }

  const deadline = startedAt + totalBudgetMs + orchestratorGraceMs;
  const graceAt = deadline - orchestratorGraceMs;
  let warnedOverdue = false;
  let lastHeartbeat = startedAt;

  while (Date.now() < deadline) {
    if (killFlagPath && existsSync(killFlagPath)) {
      return { exitCode: 130, usageBlocked: false };
    }

    await mirrorNewAgentLogs(parentJobId, logCursor, appendLog);

    if (existsSync(statusFile)) {
      try {
        const s = JSON.parse(readFileSync(statusFile, "utf8"));
        if (s.finishedAt || s.exitCode != null) {
          const detail =
            s.watchdogTripped
              ? ` [watchdog: ${s.watchdogReason ?? "stalled"}]`
              : typeof s.editCount === "number"
                ? ` (edits=${s.editCount}, reads=${s.readCount ?? 0})`
                : "";
          await log(
            parentJobId,
            appendLog,
            "orchestrator",
            `Agent ${tag} finished exit ${s.exitCode ?? 1}${detail}\n`
          );
          return {
            exitCode: s.exitCode ?? 1,
            usageBlocked: Boolean(s.usageBlocked),
            watchdogTripped: Boolean(s.watchdogTripped),
            watchdogReason: s.watchdogReason ?? null,
            editCount: s.editCount ?? 0
          };
        }
      } catch {
        return { exitCode: 1, usageBlocked: false };
      }
    }

    const now = Date.now();
    if (now - lastHeartbeat >= WAIT_HEARTBEAT_MS) {
      lastHeartbeat = now;
      const elapsedMin = ((now - startedAt) / 60_000).toFixed(1);
      let progress = "";
      if (existsSync(statusFile)) {
        try {
          const partial = JSON.parse(readFileSync(statusFile, "utf8"));
          if (partial.inProgress) {
            progress = ` · edits=${partial.editCount ?? 0}, reads=${partial.readCount ?? 0}`;
            if (partial.lastActivity) progress += ` · ${partial.lastActivity}`;
          }
        } catch {
          /* ok */
        }
      }
      await log(
        parentJobId,
        appendLog,
        "orchestrator",
        `Waiting for ${tag} … ${elapsedMin}m elapsed${progress}\n`
      );
    }

    if (!warnedOverdue && now > graceAt) {
      warnedOverdue = true;
      await log(
        parentJobId,
        appendLog,
        "orchestrator",
        `Agent ${tag} approaching budget — watchdog should terminate within 2m grace.\n`
      );
    }

    await sleep(400);
  }

  await log(
    parentJobId,
    appendLog,
    "orchestrator",
    `Agent ${tag} EXCEEDED orchestrator deadline (watchdog did not trip). Returning failure.\n`
  );
  return { exitCode: 1, usageBlocked: false, watchdogTripped: false };
}

/**
 * @param {number | { exitCode?: number, usageBlocked?: boolean, watchdogTripped?: boolean, watchdogReason?: string | null, editCount?: number }} result
 */
export function normalizeAgentResult(result) {
  if (result != null && typeof result === "object") {
    return {
      exitCode: result.exitCode ?? 1,
      usageBlocked: Boolean(result.usageBlocked),
      watchdogTripped: Boolean(result.watchdogTripped),
      watchdogReason: result.watchdogReason ?? null,
      editCount: result.editCount ?? 0
    };
  }
  const exitCode = typeof result === "number" ? result : 1;
  return { exitCode, usageBlocked: false, watchdogTripped: false, watchdogReason: null, editCount: 0 };
}

export { parseStreamJsonAgentLine };
