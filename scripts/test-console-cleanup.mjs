#!/usr/bin/env node
/**
 * test-console-cleanup — prune stale files from .test-console/
 *
 * Usage:
 *   pnpm test:console:cleanup              # default: keep 7 days
 *   pnpm test:console:cleanup --days 3     # keep only last 3 days
 *   pnpm test:console:cleanup --dry-run    # preview without deleting
 *
 * What is cleaned:
 *   runs/<uuid>/          — per-run dirs older than --days (prompt, kill, batch)
 *   agent-prompts/        — prompt files older than --days
 *   child-status/         — status JSON files older than --days
 *   worker-runs/<uuid>/   — worker-run dirs older than --days
 *   orchestrator-logs/    — log files older than --days
 *
 *   Legacy flat files in the root (pre-reorganization):
 *     fix-all-<uuid>.prompt.txt
 *     fix-all-<uuid>.kill
 *     portfolio-orchestrator-<uuid>.prompt.txt
 *     portfolio-orchestrator-<uuid>.kill
 *     fix-all-batch-<uuid>-try-<N>.json / .md
 *     agent-<story>_try<N>-<timestamp>.prompt.txt
 *     agent-batch_try<N>-<timestamp>.prompt.txt
 *
 * What is NEVER removed:
 *   server.pid
 *   *.json state files (agent-inbox, run-settings, orchestrator-auto, etc.)
 *   .gitkeep
 *   fleet/           — config, not ephemeral
 *   sandbox-baseline/ — baseline data
 */

import { rmSync, readdirSync, statSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TC = join(ROOT, ".test-console");

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const daysIdx = args.indexOf("--days");
const keepDays = daysIdx >= 0 ? Number(args[daysIdx + 1]) || 7 : 7;
const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;

let removed = 0;
let kept = 0;
let bytes = 0;

function isOld(filePath) {
  try {
    const st = statSync(filePath);
    return st.mtimeMs < cutoff;
  } catch {
    return false;
  }
}

function sizeOf(filePath) {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

function remove(filePath, label = "") {
  const sz = sizeOf(filePath);
  if (dryRun) {
    console.log(`  [dry] would remove ${label || filePath}`);
    removed++;
    bytes += sz;
    return;
  }
  try {
    rmSync(filePath, { recursive: true, force: true });
    console.log(`  removed ${label || filePath}`);
    removed++;
    bytes += sz;
  } catch (e) {
    console.warn(`  warn: could not remove ${filePath}: ${e.message}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanDirectory(dirPath, { isOldFn = isOld, label } = {}) {
  if (!existsSync(dirPath)) return;
  for (const entry of readdirSync(dirPath)) {
    const full = join(dirPath, entry);
    if (isOldFn(full)) {
      remove(full, label ? `${label}/${entry}` : full.replace(TC + "/", ""));
    } else {
      kept++;
    }
  }
}

function cleanFilesByPattern(dirPath, patterns) {
  if (!existsSync(dirPath)) return;
  for (const entry of readdirSync(dirPath)) {
    if (!patterns.some((p) => (typeof p === "string" ? entry.includes(p) : p.test(entry)))) continue;
    const full = join(dirPath, entry);
    if (isOld(full)) {
      remove(full, entry);
    } else {
      kept++;
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\n[test-console-cleanup] Cleaning .test-console/ — keeping last ${keepDays} day(s)${dryRun ? " (dry run)" : ""}\n`);

// 1. runs/<uuid>/ — per-run session directories
const runsDir = join(TC, "runs");
cleanDirectory(runsDir, { label: "runs" });

// 2. agent-prompts/
cleanDirectory(join(TC, "agent-prompts"), { label: "agent-prompts" });

// 3. child-status/ — flat JSON files (one per child process)
cleanDirectory(join(TC, "child-status"), { label: "child-status" });

// 4. worker-runs/<uuid>/ — per-job supervisor records
const workerRunsDir = join(TC, "worker-runs");
cleanDirectory(workerRunsDir, { label: "worker-runs" });

// 5. batch-reports/ — per-story investigation reports
cleanDirectory(join(TC, "batch-reports"), { label: "batch-reports" });

// 6. orchestrator-logs/ — timestamped .log files
cleanDirectory(join(TC, "orchestrator-logs"), { label: "orchestrator-logs" });

// 6. Legacy flat files in root (pre-reorganization)
const legacyPatterns = [
  /^fix-all-[0-9a-f-]+\.(prompt\.txt|kill)$/,
  /^portfolio-orchestrator-[0-9a-f-]+\.(prompt\.txt|kill)$/,
  /^fix-all-batch-[0-9a-f-]+-try-\d+\.(json|md)$/,
  /^fix-all-batch-story-.+\.(json|md)$/,
  /^agent-.+\.(prompt\.txt)$/,
  /^architect-audit\.prompt\.txt$/,
];
console.log("[test-console-cleanup] Scanning root for legacy flat files…");
if (existsSync(TC)) {
  for (const entry of readdirSync(TC)) {
    if (!legacyPatterns.some((p) => p.test(entry))) continue;
    const full = join(TC, entry);
    if (isOld(full)) {
      remove(full, `(legacy) ${entry}`);
    } else {
      kept++;
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
const kbRemoved = (bytes / 1024).toFixed(1);
console.log(
  `\n[test-console-cleanup] Done.${dryRun ? " (dry run — nothing was deleted)" : ""}` +
    `\n  Removed: ${removed} item(s)  (~${kbRemoved} KB freed)` +
    `\n  Kept:    ${kept} item(s) (newer than ${keepDays} day(s))\n`
);
