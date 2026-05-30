#!/usr/bin/env node
/**
 * One-time migration: move legacy flat files in .test-console/ root into their
 * correct subdirectories.
 *
 *   agent-batch_try<N>-<ts>.prompt.txt          → agent-prompts/
 *   agent-<story>_try<N>-<ts>.prompt.txt        → agent-prompts/
 *   fix-all-<uuid>.prompt.txt                   → runs/<uuid>/prompt.txt
 *   fix-all-<uuid>.kill                         → runs/<uuid>/kill
 *   portfolio-orchestrator-<uuid>.prompt.txt    → runs/<uuid>/prompt.txt
 *   portfolio-orchestrator-<uuid>.kill          → runs/<uuid>/kill
 *   fix-all-batch-<uuid>-try-<N>.json           → runs/<uuid>/batch-try-<N>.json
 *   fix-all-batch-<uuid>-try-<N>.md             → runs/<uuid>/batch-try-<N>.md
 *
 * Safe: skips if the destination already exists; never deletes.
 * Usage: node scripts/test-console-migrate-dirs.mjs [--dry-run]
 */

import { readdirSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TC   = join(ROOT, ".test-console");
const dryRun = process.argv.includes("--dry-run");

let moved = 0, skipped = 0, conflicts = 0;

function move(src, dst, label) {
  if (!existsSync(src)) return;          // already gone
  if (existsSync(dst)) {
    console.log(`  skip (exists) ${label}`);
    conflicts++;
    return;
  }
  if (dryRun) {
    console.log(`  [dry] ${label}`);
    moved++;
    return;
  }
  renameSync(src, dst);
  console.log(`  → ${label}`);
  moved++;
}

function ensureDir(d) {
  if (!dryRun) mkdirSync(d, { recursive: true });
}

// ── UUID regex ──────────────────────────────────────────────────────────────
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const FIX_ALL_PROMPT   = new RegExp(`^fix-all-(${UUID})\\.prompt\\.txt$`);
const FIX_ALL_KILL     = new RegExp(`^fix-all-(${UUID})\\.kill$`);
const PORT_ORCH_PROMPT = new RegExp(`^portfolio-orchestrator-(${UUID})\\.prompt\\.txt$`);
const PORT_ORCH_KILL   = new RegExp(`^portfolio-orchestrator-(${UUID})\\.kill$`);
const BATCH_REPORT     = new RegExp(`^fix-all-batch-(${UUID})-try-(\\d+)\\.(json|md)$`);
const STORY_BATCH      = /^fix-all-batch-story-(.+)-try-(\d+)\.(json|md)$/;
const AGENT_PROMPT     = /^agent-.+\.(prompt\.txt)$/;
const ARCHITECT_AUDIT  = /^architect-audit\.prompt\.txt$/;

// ── Scan root ──────────────────────────────────────────────────────────────
console.log(`\n[migrate] .test-console/ → organised subdirs${dryRun ? " (dry run)" : ""}\n`);

const entries = readdirSync(TC);
for (const name of entries) {
  // Skip directories and non-files we want to keep
  const src = join(TC, name);

  // fix-all prompt
  let m = name.match(FIX_ALL_PROMPT);
  if (m) {
    const dir = join(TC, "runs", m[1]);
    ensureDir(dir);
    move(src, join(dir, "prompt.txt"), `runs/${m[1]}/prompt.txt`);
    continue;
  }

  // fix-all kill
  m = name.match(FIX_ALL_KILL);
  if (m) {
    const dir = join(TC, "runs", m[1]);
    ensureDir(dir);
    move(src, join(dir, "kill"), `runs/${m[1]}/kill`);
    continue;
  }

  // portfolio-orchestrator prompt
  m = name.match(PORT_ORCH_PROMPT);
  if (m) {
    const dir = join(TC, "runs", m[1]);
    ensureDir(dir);
    // If the dir already has a prompt.txt (from fix-all matching same uuid), suffix it.
    const dst = join(dir, "prompt.txt");
    if (!existsSync(dst)) {
      move(src, dst, `runs/${m[1]}/prompt.txt`);
    } else {
      move(src, join(dir, "orchestrator.prompt.txt"), `runs/${m[1]}/orchestrator.prompt.txt`);
    }
    continue;
  }

  // portfolio-orchestrator kill
  m = name.match(PORT_ORCH_KILL);
  if (m) {
    const dir = join(TC, "runs", m[1]);
    ensureDir(dir);
    move(src, join(dir, "kill"), `runs/${m[1]}/kill`);
    continue;
  }

  // fix-all-batch reports
  m = name.match(BATCH_REPORT);
  if (m) {
    const [, uuid, tryN, ext] = m;
    const dir = join(TC, "runs", uuid);
    ensureDir(dir);
    move(src, join(dir, `batch-try-${tryN}.${ext}`), `runs/${uuid}/batch-try-${tryN}.${ext}`);
    continue;
  }

  // fix-all-batch-story reports → batch-reports/
  m = name.match(STORY_BATCH);
  if (m) {
    const [, slug, tryN, ext] = m;
    const dir = join(TC, "batch-reports");
    ensureDir(dir);
    move(src, join(dir, `${slug}-try-${tryN}.${ext}`), `batch-reports/${slug}-try-${tryN}.${ext}`);
    continue;
  }

  // architect-audit.prompt.txt → agent-prompts/
  if (ARCHITECT_AUDIT.test(name)) {
    const dir = join(TC, "agent-prompts");
    ensureDir(dir);
    move(src, join(dir, name), `agent-prompts/${name}`);
    continue;
  }

  // agent prompt files (batch or per-story)
  if (AGENT_PROMPT.test(name)) {
    const dir = join(TC, "agent-prompts");
    ensureDir(dir);
    move(src, join(dir, name), `agent-prompts/${name}`);
    continue;
  }

  skipped++;
}

console.log(
  `\n[migrate] Done.${dryRun ? " (dry run)" : ""}` +
  `\n  Moved:     ${moved}` +
  `\n  Conflicts: ${conflicts} (destination already existed — left in place)` +
  `\n  Unchanged: ${skipped} (state files, dirs, etc.)\n`
);
