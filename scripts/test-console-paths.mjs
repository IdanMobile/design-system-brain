/**
 * Central path helpers for .test-console/ directory.
 *
 * Directory layout
 * ─────────────────────────────────────────────────────────────────────
 * .test-console/
 *   # Active server state (root-level, always present)
 *   agent-inbox.json
 *   agent-models-cache.json
 *   orchestrator-auto.json
 *   orchestrator-state.json
 *   pending-for-cursor.json
 *   run-settings.json
 *   server.pid
 *
 *   # Per-run session data  (keyed by job/run UUID)
 *   runs/<uuid>/
 *     prompt.txt          ← fix-all or portfolio-orchestrator prompt
 *     kill                ← kill flag (touch to stop the run)
 *     batch-try-<N>.json  ← fix-all-batch report JSON
 *     batch-try-<N>.md    ← fix-all-batch report Markdown
 *
 *   # Agent prompt files written for each Cursor agent dispatch
 *   agent-prompts/
 *     <runId>.prompt.txt
 *
 *   # Per-parent child-status files (one JSON per managed child process)
 *   child-status/
 *     <parentJobId>-<runId>.json
 *
 *   # Orchestrator session logs
 *   orchestrator-logs/
 *     YYYY-MM-DD_HH-MM-SS_<shortId>.log
 *
 *   # Worker run supervisor records
 *   worker-runs/<jobId>/
 *     <story>-try-<N>.json
 *
 *   # Other subdirs (fleet, sandbox-baseline, job-results)
 * ─────────────────────────────────────────────────────────────────────
 */

import { join } from "node:path";

/** Root of the .test-console directory. */
export function tcDir(repoRoot) {
  return join(repoRoot, ".test-console");
}

// ── Per-run directory ────────────────────────────────────────────────

/** Directory for a single run (fix-all or portfolio-orchestrator). */
export function runDir(repoRoot, jobId) {
  return join(repoRoot, ".test-console", "runs", jobId);
}

/** Prompt file for a fix-all or portfolio-orchestrator run. */
export function runPromptPath(repoRoot, jobId) {
  return join(runDir(repoRoot, jobId), "prompt.txt");
}

/** Kill-flag file for a run (touch → stop). */
export function runKillPath(repoRoot, jobId) {
  return join(runDir(repoRoot, jobId), "kill");
}

/** fix-all-batch report base path (append .json or .md). */
export function runBatchBasePath(repoRoot, jobId, batchAttempt) {
  return join(runDir(repoRoot, jobId), `batch-try-${batchAttempt}`);
}

// ── Agent prompt files ───────────────────────────────────────────────

/** Directory where per-dispatch agent prompt files are written. */
export function agentPromptsDir(repoRoot) {
  return join(repoRoot, ".test-console", "agent-prompts");
}

/** Full path for a single agent dispatch prompt file. */
export function agentPromptPath(repoRoot, runId) {
  return join(agentPromptsDir(repoRoot), `${runId}.prompt.txt`);
}

// ── Child-status files ───────────────────────────────────────────────

/** Directory for child-process status files. */
export function childStatusDir(repoRoot) {
  return join(repoRoot, ".test-console", "child-status");
}

/** Path for a single child-status JSON file. */
export function childStatusPath(repoRoot, parentJobId, runId) {
  return join(childStatusDir(repoRoot), `${parentJobId}-${runId}.json`);
}

// ── Story-keyed batch reports (no UUID, keyed by story slug) ─────────────────

/** Directory for per-story batch investigation reports. */
export function batchReportsDir(repoRoot) {
  return join(repoRoot, ".test-console", "batch-reports");
}

/** Base path for a story-keyed batch report (append .json or .md). */
export function storyBatchBasePath(repoRoot, storySlug, tryN) {
  return join(batchReportsDir(repoRoot), `${storySlug}-try-${tryN}`);
}

// ── Other stable directories ─────────────────────────────────────────

export function orchestratorLogsDir(repoRoot) {
  return join(repoRoot, ".test-console", "orchestrator-logs");
}

export function workerRunsDir(repoRoot) {
  return join(repoRoot, ".test-console", "worker-runs");
}

export function fleetDir(repoRoot) {
  return join(repoRoot, ".test-console", "fleet");
}
