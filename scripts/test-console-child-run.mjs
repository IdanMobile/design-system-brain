#!/usr/bin/env node
/**
 * Run a subprocess in a child Terminal tab; stream lines to parent job + write exit status.
 *
 *   node scripts/test-console-child-run.mjs --parent <jobId> --tag golden:pixel --status <path> -- pnpm test:pixel:golden
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolve, dirname as pathDirname } from "node:path";
import { fileURLToPath } from "node:url";
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
  const out = { parent: null, tag: "child", status: null, cmd: [] };
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
    else if (a === "--cmd-json") {
      out.cmd = JSON.parse(argv[++i]);
      break;
    }
    i += 1;
  }
  return out;
}

async function append(parentJobId, tag, text) {
  const prefixed = text.startsWith("[") ? text : `[${tag}] ${text}`;
  process.stdout.write(prefixed.endsWith("\n") ? prefixed : `${prefixed}\n`);
  if (!parentJobId) return;
  try {
    await api(`/api/jobs/${parentJobId}/append-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: prefixed.endsWith("\n") ? prefixed : `${prefixed}\n` })
    });
  } catch {
    /* best-effort */
  }
}

function writeStatus(statusPath, payload) {
  if (!statusPath) return;
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(statusPath, JSON.stringify(payload, null, 2));
}

const { parent, tag, status, cmd } = parseArgs(process.argv);
if (!cmd.length) {
  console.error("Usage: test-console-child-run.mjs --parent <id> --tag <tag> --status <path> -- <cmd...>");
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

const [bin, ...args] = cmd;
await append(parent, tag, `▶ ${cmd.join(" ")}\n`);

const child = spawn(bin, args, {
  cwd: CWD,
  env: { ...process.env, FORCE_COLOR: "0" },
  stdio: ["ignore", "pipe", "pipe"]
});

let buf = "";
const flush = async (chunk, isErr) => {
  buf += chunk;
  const parts = buf.split("\n");
  buf = parts.pop() ?? "";
  for (const line of parts) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    if (isErr) await append(parent, tag, `stderr: ${trimmed}\n`);
    else await append(parent, tag, `${trimmed}\n`);
  }
};

child.stdout.on("data", (c) => void flush(String(c), false));
child.stderr.on("data", (c) => void flush(String(c), true));

child.on("close", (code) => {
  const exitCode = code ?? 1;
  const statusLabel = exitCode === 0 ? "PASS" : "FAIL";
  void append(parent, tag, `✓ ${statusLabel} exit ${exitCode}\n`).then(() => {
    writeStatus(status, {
      tag,
      exitCode,
      finishedAt: new Date().toISOString()
    });
    process.exit(exitCode);
  });
});

child.on("error", (err) => {
  void append(parent, tag, `spawn error: ${err.message}\n`).then(() => {
    writeStatus(status, { tag, exitCode: 1, error: err.message, finishedAt: new Date().toISOString() });
    process.exit(1);
  });
});
