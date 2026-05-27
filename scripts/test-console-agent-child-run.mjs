#!/usr/bin/env node
/**
 * Child-terminal Cursor agent: stream-json → parent job logs + local terminal output.
 */

import { spawn } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolve, dirname as pathDirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cursorAgentInvocation, parseStreamJsonAgentLine } from "./test-console-cursor-cli.mjs";
import { resolveAgentModel, loadRunSettings } from "./test-console-run-settings.mjs";

const ROOT = resolve(pathDirname(fileURLToPath(import.meta.url)), "..");
const CWD = process.env.TEST_CONSOLE_CWD || ROOT;
const UI = process.env.TEST_CONSOLE_UI ?? "http://127.0.0.1:6110";

async function api(path, init) {
  for (const base of ["http://127.0.0.1:6111", UI]) {
    try {
      const res = await fetch(`${base}${path}`, init);
      if (res.ok) return res.json();
    } catch {
      /* next */
    }
  }
}

function parseArgs(argv) {
  const out = { parent: null, tag: "agent", status: null, promptFile: null, model: null, cmd: [] };
  let i = 2;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--") {
      out.cmd = argv.slice(i + 1);
      break;
    }
    if (a === "--parent") out.parent = argv[++i];
    else if (a === "--tag") out.tag = argv[++i];
    else if (a === "--status") out.status = argv[++i];
    else if (a === "--prompt-file") out.promptFile = argv[++i];
    else if (a === "--model") out.model = argv[++i];
    i += 1;
  }
  return out;
}

async function append(parentJobId, tag, text) {
  const line = `[agent:${tag}] ${text}`;
  const out = line.endsWith("\n") ? line : `${line}\n`;
  process.stdout.write(out);
  if (!parentJobId) return;
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

function writeStatus(statusPath, payload) {
  if (!statusPath) return;
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(statusPath, JSON.stringify(payload, null, 2));
}

const { parent, tag, status, promptFile, model, cmd } = parseArgs(process.argv);

/** @type {string} */
let agentBin;
/** @type {string[]} */
let agentArgs;

if (promptFile) {
  let prompt;
  try {
    prompt = readFileSync(promptFile, "utf8");
  } catch (e) {
    console.error(
      `[agent:${tag}] Could not read --prompt-file: ${e instanceof Error ? e.message : e}`
    );
    process.exit(2);
  }
  const agentModel = model ?? resolveAgentModel(loadRunSettings());
  ({ bin: agentBin, args: agentArgs } = cursorAgentInvocation(prompt, {
    streamProgress: true,
    model: agentModel
  }));
} else if (cmd.length) {
  agentBin = cmd[0];
  agentArgs = cmd.slice(1);
} else {
  console.error("Usage: test-console-agent-child-run.mjs --prompt-file <path> [--model <id>]");
  console.error("   or: test-console-agent-child-run.mjs -- ... agent args");
  process.exit(2);
}

if (parent) {
  try {
    await api(`/api/jobs/${parent}/register-child`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: process.pid, role: "active" })
    });
  } catch {
    /* ok */
  }
}

if (promptFile) {
  const preview = readFileSync(promptFile, "utf8").split("\n").slice(0, 6).join("\n");
  await append(parent, tag, `Prompt preview:\n${preview}\n…\n`);
}

await append(parent, tag, `▶ ${agentBin} ${agentArgs.slice(0, 4).join(" ")}…\n`);

const child = spawn(agentBin, agentArgs, {
  cwd: CWD,
  env: { ...process.env, FORCE_COLOR: "0" },
  stdio: ["ignore", "pipe", "pipe"]
});

let buf = "";
let exitCode = 1;

const startedAt = Date.now();
let editCount = 0;
let bigReadCount = 0;
let readCount = 0;
let watchdogTripped = false;
let watchdogReason = "";

const ENV_INT = (key, fallback) => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Supervisor `investigate_first` — allow diagnosis before first edit (see test-console-managed-run). */
const INVESTIGATE_FIRST_MODE = process.env.AGENT_WATCHDOG_INVESTIGATE_MODE === "1";
const DEADLINE_FIRST_EDIT_MS = INVESTIGATE_FIRST_MODE
  ? ENV_INT("AGENT_WATCHDOG_FIRST_EDIT_MS", 14 * 60_000)
  : ENV_INT("AGENT_WATCHDOG_FIRST_EDIT_MS", 8 * 60_000);
const DEADLINE_MAX_BIG_READS = ENV_INT("AGENT_WATCHDOG_MAX_BIG_READS", 20);
const DEADLINE_TOTAL_MS = ENV_INT("AGENT_WATCHDOG_TOTAL_MS", 25 * 60_000);
const BIG_READ_LINE_THRESHOLD = 800;
const WATCHDOG_DISABLED = process.env.AGENT_WATCHDOG_DISABLED === "1";

function tripWatchdog(reason) {
  if (watchdogTripped) return;
  watchdogTripped = true;
  watchdogReason = reason;
  void append(parent, tag, `WATCHDOG: ${reason} — terminating agent (no progress detected)\n`);
  try {
    child.kill("SIGTERM");
  } catch {
    /* ok */
  }
  setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      /* ok */
    }
  }, 4000);
}

const READ_RE = /^Read .+ \((\d+) lines\)$/;

const checkWatchdog = () => {
  if (WATCHDOG_DISABLED || watchdogTripped) return;
  const elapsed = Date.now() - startedAt;
  if (elapsed > DEADLINE_TOTAL_MS) {
    tripWatchdog(`total wall clock ${(elapsed / 60_000).toFixed(1)}m exceeded ${(DEADLINE_TOTAL_MS / 60_000).toFixed(0)}m`);
    return;
  }
  if (editCount === 0 && elapsed > DEADLINE_FIRST_EDIT_MS) {
    tripWatchdog(
      INVESTIGATE_FIRST_MODE
        ? `${(elapsed / 60_000).toFixed(1)}m elapsed, 0 edits (reads=${readCount}, big-file reads=${bigReadCount}). Investigate-first budget exceeded — land a targeted edit or write BLOCKED in lab-memory.`
        : `${(elapsed / 60_000).toFixed(1)}m elapsed, 0 edits (reads=${readCount}, big-file reads=${bigReadCount}). Investigation paralysis.`
    );
    return;
  }
  if (editCount === 0 && bigReadCount >= DEADLINE_MAX_BIG_READS) {
    tripWatchdog(
      `${bigReadCount} big-file reads (≥${BIG_READ_LINE_THRESHOLD} lines each) with 0 edits — redundant context loading.`
    );
  }
};

const flush = async (chunk, isErr) => {
  buf += chunk;
  const parts = buf.split("\n");
  buf = parts.pop() ?? "";
  for (const line of parts) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isErr) {
      await append(parent, tag, `stderr: ${trimmed}\n`);
      continue;
    }
    const parsed = parseStreamJsonAgentLine(trimmed);
    if (parsed.label) {
      const label = parsed.label;
      if (label.startsWith("Editing ") || label.startsWith("Wrote ")) editCount += 1;
      else {
        const readMatch = READ_RE.exec(label);
        if (readMatch) {
          readCount += 1;
          if (Number(readMatch[1]) >= BIG_READ_LINE_THRESHOLD) bigReadCount += 1;
        }
      }
      await append(parent, tag, `${label}\n`);
    }
    if (parsed.terminal) exitCode = parsed.exitCode ?? 0;
  }
  checkWatchdog();
};

const watchdogInterval = setInterval(checkWatchdog, 15_000);

child.stdout.on("data", (c) => void flush(String(c), false));
child.stderr.on("data", (c) => void flush(String(c), true));

child.on("close", (code) => {
  clearInterval(watchdogInterval);
  let finalCode = code ?? exitCode ?? 1;
  if (watchdogTripped && finalCode === 0) finalCode = 124;
  const note = watchdogTripped
    ? `Turn terminated by watchdog (${watchdogReason}) exit ${finalCode}`
    : `Turn complete exit ${finalCode} (edits=${editCount}, reads=${readCount}, bigReads=${bigReadCount}, elapsed=${((Date.now() - startedAt) / 60_000).toFixed(1)}m)`;
  void append(parent, tag, `${note}\n`).then(() => {
    writeStatus(status, {
      tag,
      exitCode: finalCode,
      finishedAt: new Date().toISOString(),
      editCount,
      readCount,
      bigReadCount,
      watchdogTripped,
      watchdogReason: watchdogTripped ? watchdogReason : undefined,
      elapsedMs: Date.now() - startedAt
    });
    process.exit(finalCode);
  });
});

child.on("error", (err) => {
  clearInterval(watchdogInterval);
  void append(parent, tag, `spawn error: ${err.message}\n`).then(() => {
    writeStatus(status, { tag, exitCode: 1, error: err.message, finishedAt: new Date().toISOString() });
    process.exit(1);
  });
});
