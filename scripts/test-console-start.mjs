#!/usr/bin/env node
/**
 * Start test console server detached so Cursor agent shells are not blocked.
 * Exits immediately after the server is listening.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_CONSOLE_SERVER_VERSION } from "./test-console-version.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.TEST_CONSOLE_PORT ?? 6110);
const PID_FILE = resolve(ROOT, ".test-console/server.pid");
const UI_ROOT = resolve(ROOT, "packages/test-console/dist");

async function fetchState() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/state`, {
      signal: AbortSignal.timeout(2000)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function apiUp() {
  return (await fetchState()) != null;
}

function stopServer() {
  const pid = readPid();
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already dead */
    }
  }
  try {
    unlinkSync(PID_FILE);
  } catch {
    /* ok */
  }
}

function readPid() {
  if (!existsSync(PID_FILE)) return null;
  try {
    const n = Number(readFileSync(PID_FILE, "utf8").trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function savePid(pid) {
  mkdirSync(resolve(ROOT, ".test-console"), { recursive: true });
  writeFileSync(PID_FILE, String(pid));
}

async function main() {
  if (!existsSync(resolve(UI_ROOT, "index.html"))) {
    console.log("[test-console] Building UI…");
    const build = spawn("pnpm", ["test:console:build"], {
      cwd: ROOT,
      stdio: "inherit"
    });
    await new Promise((res, rej) => {
      build.on("exit", (c) => (c === 0 ? res() : rej(new Error("build failed"))));
    });
  }

  const forceStart = process.env.TEST_CONSOLE_FORCE_START === "1";
  const state = await fetchState();
  if (state && !forceStart) {
    const remoteVersion = state.serverVersion ?? 0;
    if (remoteVersion === TEST_CONSOLE_SERVER_VERSION) {
      console.log(`[test-console] Already running at http://127.0.0.1:${PORT}`);
      return;
    }
    console.log(
      `[test-console] Stale server (v${remoteVersion}, need v${TEST_CONSOLE_SERVER_VERSION}) — restarting…`
    );
    stopServer();
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && (await fetchState())) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const child = spawn("node", ["scripts/test-console-server.mjs"], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    env: process.env
  });
  child.unref();
  savePid(child.pid);

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await apiUp()) {
      console.log(`[test-console] http://127.0.0.1:${PORT} (pid ${child.pid}, detached)`);
      console.log("[test-console] Server runs in background — Cursor chat is not blocked.");
      return;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  console.error("[test-console] Server did not respond in time.");
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
