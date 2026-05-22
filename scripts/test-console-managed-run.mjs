/**
 * Orchestrator-managed child runs: open a child Terminal, stream logs to parent job, wait for exit.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openTerminal } from "./test-console-terminal.mjs";
import { api } from "./test-console-api.mjs";
import { cursorAgentInvocation, parseStreamJsonAgentLine } from "./test-console-cursor-cli.mjs";
import {
  buildGoldenSpawnSpec,
  loadRunSettings,
  orchestratorGoldenStoryIds,
  resolveAgentModel
} from "./test-console-run-settings.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATUS_DIR = join(ROOT, ".test-console", "child-status");

function shellQuote(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$")}"`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function statusPath(parentJobId, runId) {
  return join(STATUS_DIR, `${parentJobId}-${runId}.json`);
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
  openTerminal: openTerm = true,
  env: extraEnv,
  cwd
}) {
  const workdir = cwd ?? ROOT;
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
    .map((p) => (p.includes(" ") ? shellQuote(p) : p))
    .join(" ");
  const runner = envPrefix ? `${envPrefix} ${runnerBody}` : runnerBody;

  await log(parentJobId, appendLog, "orchestrator", `Opening terminal → ${tag}\n`);

  if (openTerm) {
    openTerminal(runner, workdir, {
      tabTitle: `${tag} · ${String(parentJobId).slice(0, 8)}`
    });
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

  const deadline = Date.now() + 3_600_000;
  while (Date.now() < deadline) {
    if (killFlagPath && existsSync(killFlagPath)) return 130;
    if (existsSync(statusFile)) {
      try {
        const s = JSON.parse(readFileSync(statusFile, "utf8"));
        await log(
          parentJobId,
          appendLog,
          "orchestrator",
          `${tag} finished exit ${s.exitCode ?? 1}\n`
        );
        return s.exitCode ?? 1;
      } catch {
        return 1;
      }
    }
    await sleep(400);
  }
  await log(parentJobId, appendLog, "orchestrator", `${tag} timed out waiting for child\n`);
  return 1;
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
        env: { TEST_PARALLEL: "1" }
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
  workspaceRoot
}) {
  const workdir = workspaceRoot ?? ROOT;
  mkdirSync(STATUS_DIR, { recursive: true });
  const runId = `agent-${tag.replace(/[^a-zA-Z0-9._-]+/g, "_")}-${Date.now()}`;
  const statusFile = statusPath(parentJobId, runId);
  mkdirSync(join(workdir, ".test-console"), { recursive: true });
  const promptFile = join(workdir, ".test-console", `${runId}.prompt.txt`);
  writeFileSync(promptFile, prompt, "utf8");

  if (existsSync(statusFile)) unlinkSync(statusFile);

  const agentModel = resolveAgentModel(loadRunSettings());
  const { bin, args } = cursorAgentInvocation(prompt, {
    streamProgress: true,
    model: agentModel
  });
  const agentRunner = [
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
    "--",
    bin,
    ...args
  ]
    .map((p) => (p.includes(" ") ? shellQuote(p) : p))
    .join(" ");

  await log(
    parentJobId,
    appendLog,
    "orchestrator",
    `Opening agent terminal → ${tag} (model: ${agentModel})${workdir !== ROOT ? " [sandbox]" : ""}\n`
  );
  openTerminal(agentRunner, workdir, {
    tabTitle: `Agent ${tag} · ${String(parentJobId).slice(0, 8)}`
  });

  const deadline = Date.now() + 900_000;
  while (Date.now() < deadline) {
    if (killFlagPath && existsSync(killFlagPath)) return 130;
    if (existsSync(statusFile)) {
      try {
        const s = JSON.parse(readFileSync(statusFile, "utf8"));
        await log(
          parentJobId,
          appendLog,
          "orchestrator",
          `Agent ${tag} finished exit ${s.exitCode ?? 1}\n`
        );
        return s.exitCode ?? 1;
      } catch {
        return 1;
      }
    }
    await sleep(400);
  }
  return 1;
}

export { parseStreamJsonAgentLine };
