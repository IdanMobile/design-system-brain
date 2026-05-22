#!/usr/bin/env node
/**
 * Test console helper — open dashboard, optional terminal peek.
 * Fix dispatch: use `pnpm test:console:cursor agent` (not chat listen/pending).
 *
 *   pnpm test:console:agent open              # open UI (non-blocking)
 *   pnpm test:console:agent open --wait       # optional terminal peek loop
 *   pnpm test:console:agent pending           # print pending (terminal debugging)
 *   pnpm test:console:agent listen [--once]   # legacy ack path (prefer cursor CLI)
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const UI = process.env.TEST_CONSOLE_UI ?? "http://127.0.0.1:6110";

/** @type {string | null} */
let resolvedApi = process.env.TEST_CONSOLE_API ?? null;

async function resolveApiBase() {
  if (resolvedApi) return resolvedApi;
  for (const base of ["http://127.0.0.1:6111", "http://127.0.0.1:6110"]) {
    try {
      const r = await fetch(`${base}/api/state`, { signal: AbortSignal.timeout(1200) });
      if (r.ok) {
        resolvedApi = base;
        return base;
      }
    } catch {
      /* try next */
    }
  }
  resolvedApi = "http://127.0.0.1:6111";
  return resolvedApi;
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const [cmd, ...rest] = process.argv.slice(2);
const timeoutMs = Number(
  rest.find((a) => a.startsWith("--timeout="))?.split("=")[1] ?? 90_000
);
const once = rest.includes("--once");

async function api(path, init) {
  const base = await resolveApiBase();
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  return res.json();
}

function ensureConsoleRunning() {
  return new Promise((resolveRun, reject) => {
    resolveApiBase()
      .then((base) => fetch(`${base}/api/state`, { signal: AbortSignal.timeout(1500) }))
      .then((r) => (r.ok ? resolveRun() : reject(new Error("API not ok"))))
      .catch(() => {
        console.log("[agent] Starting test console (detached)…");
        const child = spawn("node", ["scripts/test-console-start.mjs"], {
          cwd: ROOT,
          detached: true,
          stdio: "ignore",
          env: process.env
        });
        child.unref();
        const deadline = Date.now() + 12_000;
        const poll = () => {
          resolveApiBase()
            .then((base) => fetch(`${base}/api/state`, { signal: AbortSignal.timeout(1500) }))
            .then((r) => {
              if (r.ok) resolveRun();
              else if (Date.now() < deadline) setTimeout(poll, 500);
              else reject(new Error("Test console API did not start"));
            })
            .catch(() => {
              if (Date.now() < deadline) setTimeout(poll, 500);
              else reject(new Error("Test console API did not start"));
            });
        };
        setTimeout(poll, 800);
      });
  });
}

function openBrowser(url) {
  const platform = process.platform;
  const bin =
    platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args =
    platform === "win32" ? ["/c", "start", "", url] : platform === "darwin" ? [url] : [url];
  spawn(bin, args, { stdio: "ignore", detached: true }).unref();
}

function formatMessage(msg) {
  if (!msg) return "(no message)";
  const lines = [
    "--- Test console → Cursor ---",
    `type: ${msg.type}`,
    `phrase: ${msg.cursorPhrase ?? "(none)"}`,
    "",
    msg.cursorPrompt ?? "(no prompt)",
    ""
  ];
  if (msg.storyId) {
    lines.push(
      `story: ${msg.storyId} (${msg.percent?.toFixed?.(2) ?? "?"}% ${msg.status})`
    );
  }
  if (msg.rerunCommand) lines.push(`rerun: ${msg.rerunCommand}`);
  if (msg.paths?.comparePng) lines.push(`compare: ${msg.paths.comparePng}`);
  if (msg.actionId) lines.push(`action: ${msg.actionId}`);
  if (msg.logTail) {
    lines.push("", "--- job output (tail) ---", msg.logTail);
  }
  lines.push(`id: ${msg.id}`);
  return lines.join("\n");
}

/** Message for Cursor chat — pending file first, then unread inbox. */
async function pullForChat() {
  const { message: pending } = await api("/api/agent/pending");
  if (pending?.id) return pending;
  const inbox = await api("/api/agent/inbox");
  if (inbox.unread?.length) return inbox.unread[inbox.unread.length - 1];
  return null;
}

async function ackForChat(msg) {
  if (!msg?.id) return;
  await api("/api/agent/ack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [msg.id], forChat: true })
  });
}

/** Terminal watcher — logs only, never acks (dispatch via pnpm test:console:cursor agent). */
async function watchConsole() {
  console.log("[agent] Peeking at test console events (use: pnpm test:console:cursor agent)\n");
  let lastId = null;
  while (true) {
    const { message: pending } = await api("/api/agent/pending");
    if (pending?.id && pending.id !== lastId) {
      console.log(formatMessage(pending));
      console.log("[agent] ↑ Run: pnpm test:console:cursor agent\n");
      lastId = pending.id;
    }
    console.log(`[agent] Listening… (poll ${timeoutMs}ms)`);
    const { message } = await api(`/api/agent/wait?timeout=${timeoutMs}`);
    if (message?.id && message.id !== lastId) {
      console.log(formatMessage(message));
      console.log("[agent] ↑ Run: pnpm test:console:cursor agent\n");
      lastId = message.id;
    }
  }
}

async function main() {
  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(`Usage:
  node scripts/test-console-agent.mjs open [--wait] [--no-start]
  node scripts/test-console-agent.mjs pending
  node scripts/test-console-agent.mjs listen [--once]

Default "open" is non-blocking (browser only — no chat polling).

Env: TEST_CONSOLE_API, TEST_CONSOLE_UI (default ${UI})

Fix dispatch (terminal):
  pnpm test:console:cursor pending
  pnpm test:console:cursor agent`);
    process.exit(0);
  }

  const noStart = rest.includes("--no-start");
  const watch = rest.includes("--wait");

  if (!noStart) await ensureConsoleRunning();

  if (cmd === "pending") {
    const msg = await pullForChat();
    if (!msg) {
      console.log("(no pending fix for Cursor)");
      process.exit(1);
    }
    console.log(formatMessage(msg));
    return;
  }

  if (cmd === "open" || cmd === "open-test-console") {
    openBrowser(UI);
    console.log(`Test console: ${UI}`);
    console.log("Fix dispatch: pnpm test:console:cursor agent");
    if (watch) await watchConsole();
    return;
  }

  if (cmd === "listen") {
    console.error(
      "[agent] listen is deprecated — it blocks on /api/agent/wait and must not run in Cursor chat."
    );
    console.error("  Open UI only:  pnpm test:console:agent open");
    console.error("  Fix dispatch:  pnpm test:console:cursor agent");
    console.error("  Debug print:   pnpm test:console:cursor pending");
    if (!process.env.TEST_CONSOLE_ALLOW_LISTEN) {
      process.exit(2);
    }
    const msg = await pullForChat();
    if (!msg) {
      if (once) {
        console.log("(no pending message)");
        process.exit(1);
      }
      console.log(`Waiting for test console message (timeout ${timeoutMs}ms)…`);
      const { message } = await api(`/api/agent/wait?timeout=${timeoutMs}`);
      if (!message) {
        console.log("(timeout — no new message)");
        process.exit(1);
      }
      console.log(formatMessage(message));
      if (once) await ackForChat(message);
      return;
    }
    console.log(formatMessage(msg));
    if (once) await ackForChat(msg);
    return;
  }

  if (cmd === "context") {
    const ctx = await api("/api/agent/context");
    console.log(JSON.stringify(ctx, null, 2));
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  if (!existsSync(resolve(ROOT, "packages/test-console/dist/index.html"))) {
    console.error("Hint: pnpm test:console:build  or  pnpm test:console:dev");
  }
  process.exit(1);
});
