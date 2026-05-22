#!/usr/bin/env node
/**
 * Open the OS terminal and run a shell command in the repo root.
 */

import { spawn, spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Escape a string for use inside double quotes in a shell one-liner. */
function shellQuote(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$")}"`;
}

/**
 * Kill a process and its descendants (agent/golden child terminals stay attached on macOS).
 * @param {number | null | undefined} pid
 * @param {NodeJS.Signals | number} [signal="SIGTERM"]
 */
export function killProcessTree(pid, signal = "SIGTERM") {
  if (pid == null || pid <= 0) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    const r = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" });
    for (const line of (r.stdout || "").trim().split("\n").filter(Boolean)) {
      killProcessTree(Number(line), signal);
    }
    process.kill(pid, signal);
  } catch {
    /* already exited */
  }
}

/**
 * @param {object} job
 * @returns {number[]}
 */
export function collectOrchestratorJobPids(job) {
  return [
    ...new Set(
      [job.fixAllOrchestratorPid, job.fixAllActivePid, job.fixAllPid, ...(job.fixAllActivePids ?? [])].filter(
        (p) => p != null && p > 0
      )
    )
  ];
}

/**
 * Terminate orchestrator/fix-all job processes.
 * @param {object} job
 * @param {{ signal?: NodeJS.Signals | number }} [opts]
 */
export function killOrchestratorJobProcesses(job, opts = {}) {
  const signal = opts.signal ?? "SIGTERM";
  const pids = collectOrchestratorJobPids(job);
  for (const pid of pids) {
    killProcessTree(pid, signal);
  }
  return pids;
}

/**
 * @param {string} command One shell command line (already safe for the target shell).
 * @param {string} [cwd]
 * @param {{ keepOpen?: boolean, tabTitle?: string, focus?: boolean }} [options]
 *   keepOpen — leave the shell running after the command (orchestrator tabs)
 */
export function openTerminal(command, cwd = ROOT, { keepOpen = false, tabTitle, focus } = {}) {
  const platform = process.platform;
  const wrapped = keepOpen ? command : `{ ${command}; }; exit`;
  const line = `cd ${shellQuote(cwd)} && ${wrapped}`;
  const stealFocus = focus ?? keepOpen;

  if (platform === "darwin") {
    const titleArg = tabTitle ? JSON.stringify(tabTitle) : null;
    const script = [
      'tell application "Terminal"',
      stealFocus ? "  activate" : null,
      `  do script ${JSON.stringify(line)}`,
      titleArg ? `  set custom title of front window's selected tab to ${titleArg}` : null,
      "end tell"
    ]
      .filter(Boolean)
      .join("\n");
    spawn("osascript", ["-e", script], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  if (platform === "win32") {
    const flag = keepOpen ? "/k" : "/c";
    spawn("cmd", ["/c", "start", "cmd", flag, `cd /d ${cwd} && ${command}`], {
      detached: true,
      stdio: "ignore"
    }).unref();
    return;
  }

  const bashLine = keepOpen ? `${line}; exec bash` : line;
  for (const [bin, args] of [
    ["gnome-terminal", ["--", "bash", "-lc", bashLine]],
    ["konsole", ["-e", "bash", "-lc", bashLine]],
    ["xterm", ["-e", "bash", "-lc", bashLine]]
  ]) {
    try {
      spawn(bin, args, { detached: true, stdio: "ignore" }).unref();
      return;
    } catch {
      /* try next */
    }
  }
  console.warn("[terminal] No graphical terminal found — run manually:", command);
}
