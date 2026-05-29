/**
 * Canonical lab-memory vault paths (single source of truth).
 *
 *   visual/     — Storybook → Figma parity (patterns + investigations)
 *   logic/      — element behavior specs (JSON)
 *   ops/        — runbooks, orchestrator briefs, agent notes
 */

import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/** @param {string} [repoRoot] */
export function resolveRepoRoot(repoRoot) {
  return repoRoot ? resolve(repoRoot) : resolve(SCRIPT_DIR, "..");
}

/** @param {string} [repoRoot] */
export function labMemoryRoot(repoRoot) {
  return join(resolveRepoRoot(repoRoot), "lab-memory");
}

/** @param {string} [repoRoot] */
export function visualDir(repoRoot) {
  return join(labMemoryRoot(repoRoot), "visual");
}

/** @param {string} [repoRoot] */
export function patternsDir(repoRoot) {
  return join(visualDir(repoRoot), "patterns");
}

/** @param {string} [repoRoot] */
export function investigationsDir(repoRoot) {
  return join(visualDir(repoRoot), "investigations");
}

/** @param {string} [repoRoot] */
export function investigationsActiveDir(repoRoot) {
  return join(investigationsDir(repoRoot), "active");
}

/** @param {string} [repoRoot] */
export function investigationsArchiveDir(repoRoot) {
  return join(investigationsDir(repoRoot), "archive");
}

/** @param {string} [repoRoot] */
export function logicDir(repoRoot) {
  return join(labMemoryRoot(repoRoot), "logic");
}

/** @param {string} [repoRoot] */
export function logicSpecsDir(repoRoot) {
  return join(logicDir(repoRoot), "specs");
}

/** @param {string} [repoRoot] */
export function logicArchiveDir(repoRoot) {
  return join(logicDir(repoRoot), "archive");
}

/** @param {string} [repoRoot] */
export function opsDir(repoRoot) {
  return join(labMemoryRoot(repoRoot), "ops");
}

/** @param {string} [repoRoot] @param {string} storyId */
export function investigationPath(repoRoot, storyId, tier = "active") {
  const base = tier === "archive" ? investigationsArchiveDir(repoRoot) : investigationsActiveDir(repoRoot);
  return join(base, `${storyId}.md`);
}

/**
 * Resolve investigation note (active, then archive, then legacy flat stories/).
 * @param {string} repoRoot
 * @param {string} storyId
 */
export function resolveInvestigationPath(repoRoot, storyId) {
  const active = investigationPath(repoRoot, storyId, "active");
  if (existsSync(active)) return active;
  const archive = investigationPath(repoRoot, storyId, "archive");
  if (existsSync(archive)) return archive;
  const legacy = join(labMemoryRoot(repoRoot), "stories", `${storyId}.md`);
  if (existsSync(legacy)) return legacy;
  return active;
}

/** Wiki link prefix for patterns in Obsidian. */
export const PATTERN_WIKI_PREFIX = "visual/patterns";
