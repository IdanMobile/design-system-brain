#!/usr/bin/env node
/**
 * Poll fix-all job until it stops, then kill (if needed) and start a fresh figmaLive fix-all.
 * Usage: node scripts/watch-fix-all-restart.mjs [jobId]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONSOLE = process.env.TEST_CONSOLE_URL ?? "http://127.0.0.1:6110";
const POLL_MS = Number(process.env.WATCH_POLL_MS ?? 15_000);
const jobId =
  process.argv[2] ??
  JSON.parse(readFileSync(resolve(ROOT, ".test-console/orchestrator-state.json"), "utf8"))
    .jobId;

async function api(path, opts = {}) {
  const res = await fetch(`${CONSOLE}${path}`, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${body.error ?? text}`);
  return body;
}

function readOrch() {
  const p = resolve(ROOT, ".test-console/orchestrator-state.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function isAgentRunning() {
  try {
    const out = execSync(
      `ps aux | grep -E "agent-child-run.*${jobId}|run-fix-all ${jobId}" | grep -v grep || true`,
      { encoding: "utf8" }
    );
    return /agent-child-run|run-fix-all/.test(out);
  } catch {
    return false;
  }
}

function log(msg) {
  process.stdout.write(`[watch-fix-all] ${new Date().toISOString()} ${msg}\n`);
}

async function killJob() {
  try {
    await api(`/api/jobs/${jobId}/kill`, { method: "POST" });
    log(`Killed job ${jobId}`);
    return true;
  } catch (e) {
    if (String(e.message).includes("409")) {
      log(`Job ${jobId} already stopped`);
      return false;
    }
    throw e;
  }
}

async function startFixAll() {
  const body = await api("/api/agent/request-fix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixAll: true, suiteId: "figmaLive" })
  });
  log(`Started new fix-all: ${body.jobId} — ${body.label ?? ""}`);
  return body;
}

async function waitForQuiescent() {
  let lastStory = "";
  let lastIndex = 0;
  let stableTicks = 0;
  /** After story 20 completes test, wait for orchestrator to finish golden refresh */
  let sawStory20 = false;

  while (true) {
    let job;
    try {
      job = await api(`/api/jobs/${jobId}`);
    } catch (e) {
      log(`Job ${jobId} gone: ${e.message}`);
      break;
    }

    const orch = readOrch();
    const idx = orch?.storyIndex ?? 0;
    const total = orch?.storyTotal ?? 20;
    const story = orch?.storyId ?? "?";
    const attempt = orch?.attempt ?? 1;
    const running = job.status === "running" || job.finalizing;

    if (story !== lastStory || idx !== lastIndex) {
      log(`Progress: ${idx}/${total} ${story} attempt ${attempt} (job: ${job.status})`);
      lastStory = story;
      lastIndex = idx;
      stableTicks = 0;
    }

    if (idx >= total) sawStory20 = true;

    if (!running) {
      log(`Job finished with status: ${job.status}`);
      break;
    }

    const agentUp = isAgentRunning();
    if (sawStory20 && !agentUp) {
      stableTicks += 1;
      if (stableTicks >= 2) {
        log("Story 20 cycle complete — job still running (likely final golden refresh)");
        /** Give orchestrator up to 10 min for full-suite refresh */
        if (stableTicks >= 40) {
          log("Refresh taking long — proceeding to restart");
          break;
        }
      }
    } else if (!agentUp && idx < total) {
      stableTicks += 1;
    } else {
      stableTicks = 0;
    }

    /** Job still running but all stories processed and no agent for 3 polls → stop waiting */
    if (sawStory20 && !agentUp && stableTicks >= 6) {
      log("All stories processed, no active agent — ready to restart");
      break;
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function main() {
  log(`Watching job ${jobId} (poll every ${POLL_MS / 1000}s)`);
  await waitForQuiescent();

  try {
    const job = await api(`/api/jobs/${jobId}`);
    if (job.status === "running" || job.finalizing) {
      await killJob();
      await new Promise((r) => setTimeout(r, 3000));
    }
  } catch {
    /* job may already be gone */
  }

  /** Brief pause so kill propagates before new fix-all */
  await new Promise((r) => setTimeout(r, 2000));

  const next = await startFixAll();
  log(`Done. New job: ${next.jobId}`);
  console.log(JSON.stringify({ ok: true, oldJobId: jobId, newJobId: next.jobId }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
