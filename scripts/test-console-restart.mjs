#!/usr/bin/env node
/**
 * Stop detached test-console server and start a fresh one (picks up script changes).
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { killListenersOnPort, waitForPortDown } from "./test-console-port.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.TEST_CONSOLE_PORT ?? 6110);
const PID_FILE = resolve(ROOT, ".test-console/server.pid");

function readPid() {
  if (!existsSync(PID_FILE)) return null;
  try {
    const n = Number(readFileSync(PID_FILE, "utf8").trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
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
  killListenersOnPort(PORT);
  try {
    unlinkSync(PID_FILE);
  } catch {
    /* ok */
  }
}

async function ensurePortDown() {
  let down = await waitForPortDown(PORT, 8000);
  if (down) return true;
  killListenersOnPort(PORT, "SIGKILL");
  down = await waitForPortDown(PORT, 4000);
  if (!down) {
    console.error(
      `[test-console] Port ${PORT} still in use — free it manually: lsof -ti :${PORT} | xargs kill`
    );
  }
  return down;
}

async function main() {
  console.log("[test-console] Stopping server…");
  stopServer();
  if (!(await ensurePortDown())) {
    process.exit(1);
  }
  const child = spawn("node", ["scripts/test-console-start.mjs"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, TEST_CONSOLE_FORCE_START: "1" }
  });
  await new Promise((res, rej) => {
    child.on("exit", (c) => (c === 0 ? res() : rej(new Error(`start exited ${c}`))));
  });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
