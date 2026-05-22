#!/usr/bin/env node
/**
 * Child-terminal Cursor agent: stream-json → parent job logs + local terminal output.
 */

import { spawn } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolve, dirname as pathDirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStreamJsonAgentLine } from "./test-console-cursor-cli.mjs";
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
  const out = { parent: null, tag: "agent", status: null, promptFile: null, cmd: [] };
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

const { parent, tag, status, promptFile, cmd } = parseArgs(process.argv);
if (!cmd.length) {
  console.error("Missing agent command after --");
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

const [bin, ...args] = cmd;
await append(parent, tag, `▶ ${bin} ${args.slice(0, 4).join(" ")}…\n`);

const child = spawn(bin, args, {
  cwd: CWD,
  env: { ...process.env, FORCE_COLOR: "0" },
  stdio: ["ignore", "pipe", "pipe"]
});

let buf = "";
let exitCode = 1;

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
    if (parsed.label) await append(parent, tag, `${parsed.label}\n`);
    if (parsed.terminal) exitCode = parsed.exitCode ?? 0;
  }
};

child.stdout.on("data", (c) => void flush(String(c), false));
child.stderr.on("data", (c) => void flush(String(c), true));

child.on("close", (code) => {
  const finalCode = code ?? exitCode ?? 1;
  void append(parent, tag, `Turn complete exit ${finalCode}\n`).then(() => {
    writeStatus(status, { tag, exitCode: finalCode, finishedAt: new Date().toISOString() });
    process.exit(finalCode);
  });
});

child.on("error", (err) => {
  void append(parent, tag, `spawn error: ${err.message}\n`).then(() => {
    writeStatus(status, { tag, exitCode: 1, error: err.message, finishedAt: new Date().toISOString() });
    process.exit(1);
  });
});
