#!/usr/bin/env node
/**
 * Run quick-component-generation for a test-console job id.
 *   node scripts/run-quick-component-generation.mjs <jobId>
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runQuickComponentGeneration } from "./quick-component-generation.mjs";
import { api } from "./test-console-api.mjs";
import { runDir, runKillPath, runQuickComponentPayloadPath } from "./test-console-paths.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("Usage: node scripts/run-quick-component-generation.mjs <jobId>");
    process.exit(1);
  }

  const killFlag = runKillPath(ROOT, jobId);
  if (existsSync(killFlag)) unlinkSync(killFlag);

  try {
    await api(`/api/jobs/${jobId}/register-child`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: process.pid, role: "quick-component-generation" })
    });
  } catch {
    /* ok */
  }

  let payload = null;
  const payloadPath = runQuickComponentPayloadPath(ROOT, jobId);
  if (existsSync(payloadPath)) {
    try {
      payload = JSON.parse(readFileSync(payloadPath, "utf8"));
    } catch (e) {
      console.error(`[quick] Invalid payload file ${payloadPath}:`, e);
      process.exit(1);
    }
  }

  let job;
  try {
    job = await api(`/api/jobs/${jobId}`);
  } catch (e) {
    console.error(`[quick] Job ${jobId} not found:`, e);
    process.exit(1);
  }

  if (!payload) {
    payload = job.quickComponentPayload;
  }
  if (!payload?.manifest) {
    console.error("[quick] Job missing quickComponentPayload.manifest");
    process.exit(1);
  }

  const appendLog = async (text) => {
    try {
      await api(`/api/jobs/${jobId}/append-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
    } catch {
      process.stdout.write(text);
    }
  };

  let result;
  try {
    result = await runQuickComponentGeneration(payload, {
      appendLog,
      killFlagPath: killFlag
    });
  } catch (err) {
    await appendLog(`[quick] ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    try {
      await api(`/api/jobs/${jobId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "failed",
          exitCode: 1,
          quickComponentResult: { ok: false, error: err instanceof Error ? err.message : String(err) }
        })
      });
    } catch {
      /* ok */
    }
    process.exit(1);
  }

  const resultPath = join(runDir(ROOT, jobId), "quick-component-result.json");
  mkdirSync(dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n");

  const killed = existsSync(killFlag);
  const status = killed ? "killed" : result.ok ? "passed" : "failed";
  try {
    await api(`/api/jobs/${jobId}/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        exitCode: killed ? 130 : result.ok ? 0 : 1,
        quickComponentResult: result
      })
    });
  } catch {
    /* ok */
  }

  process.exit(killed ? 130 : result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[quick] Fatal:", err.message);
  process.exit(1);
});
