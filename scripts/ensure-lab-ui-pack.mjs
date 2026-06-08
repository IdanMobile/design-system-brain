#!/usr/bin/env node
/**
 * Ensure @lab/ui download tarball is fresh vs packages/ui sources.
 * Used by test console, delivery tests, and fix-all when UI changes.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LAB_UI_DOWNLOAD_DIRS = [
  "packages/developer-playground/public/downloads",
  "packages/storybook-lab/public/downloads"
];
export const LAB_UI_TARBALL = "lab-ui.tgz";
export const LAB_UI_STAMP = ".pack-stamp.json";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);
const SKIP_EXT = [".tgz"];

/** @param {string} repo */
export function labUiPrimaryDownloadsDir(repo) {
  return join(repo, LAB_UI_DOWNLOAD_DIRS[0]);
}

/** @param {string} dir @param {number} max */
function walkMaxMtime(dir, max = 0) {
  if (!existsSync(dir)) return max;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      max = walkMaxMtime(path, max);
      continue;
    }
    if (SKIP_EXT.some((ext) => entry.name.endsWith(ext))) continue;
    max = Math.max(max, statSync(path).mtimeMs);
  }
  return max;
}

/** @param {string} repo */
export function labUiSourceMaxMtime(repo) {
  let max = walkMaxMtime(join(repo, "packages/ui"), 0);
  for (const rel of [
    "scripts/bake-figma-screen-ui.mjs",
    "scripts/pack-lab-ui.mjs",
    "packages/ui/package.json"
  ]) {
    const path = join(repo, rel);
    if (existsSync(path)) max = Math.max(max, statSync(path).mtimeMs);
  }
  return max;
}

/** @param {string} repo */
export function readLabUiPackStamp(repo) {
  const path = join(labUiPrimaryDownloadsDir(repo), LAB_UI_STAMP);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** @param {string} repo */
export function readLabUiPackMeta(repo) {
  const path = join(labUiPrimaryDownloadsDir(repo), "meta.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** @param {string} repo */
export function isLabUiPackStale(repo) {
  const tarball = join(labUiPrimaryDownloadsDir(repo), LAB_UI_TARBALL);
  if (!existsSync(tarball)) return true;
  let version = "0.0.0";
  try {
    version = JSON.parse(readFileSync(join(repo, "packages/ui/package.json"), "utf8")).version;
  } catch {
    return true;
  }
  const stamp = readLabUiPackStamp(repo);
  const sourceMax = labUiSourceMaxMtime(repo);
  if (!stamp || stamp.version !== version) return true;
  if (sourceMax > (stamp.sourceMaxMtime ?? 0) + 500) return true;
  return false;
}

/** @param {string} repo */
export function writeLabUiPackStamp(repo) {
  const version = JSON.parse(readFileSync(join(repo, "packages/ui/package.json"), "utf8")).version;
  const payload = {
    version,
    sourceMaxMtime: labUiSourceMaxMtime(repo),
    packedAt: new Date().toISOString()
  };
  for (const rel of LAB_UI_DOWNLOAD_DIRS) {
    writeFileSync(join(repo, rel, LAB_UI_STAMP), `${JSON.stringify(payload, null, 2)}\n`);
  }
}

/** @type {Promise<{ packed: boolean, stale: boolean, reason: string }> | null} */
let packInFlight = null;

export function labUiPackInFlight() {
  return packInFlight != null;
}

/**
 * @param {string} repo
 * @param {{ force?: boolean, quiet?: boolean, reason?: string }} [options]
 */
export function ensureLabUiPack(repo, options = {}) {
  const { force = false, quiet = false, reason = "" } = options;
  if (!force && !isLabUiPackStale(repo)) {
    return Promise.resolve({ packed: false, stale: false, reason: "fresh" });
  }
  if (packInFlight) return packInFlight;

  packInFlight = Promise.resolve()
    .then(() => {
      if (!quiet) {
        console.log(`[lab-ui] Packing @lab/ui${reason ? ` (${reason})` : ""}…`);
      }
      execSync("node scripts/pack-lab-ui.mjs", {
        cwd: repo,
        stdio: quiet ? "pipe" : "inherit"
      });
      writeLabUiPackStamp(repo);
      return { packed: true, stale: true, reason: reason || "stale" };
    })
    .finally(() => {
      packInFlight = null;
    });

  return packInFlight;
}

/**
 * @param {string} repo
 * @param {{ force?: boolean, reason?: string }} [options]
 */
export function scheduleEnsureLabUiPack(repo, options = {}) {
  return ensureLabUiPack(repo, { ...options, quiet: true });
}

/**
 * @param {string} repo
 */
export function readPackageDownloadState(repo) {
  const meta = readLabUiPackMeta(repo);
  const tarball = join(labUiPrimaryDownloadsDir(repo), LAB_UI_TARBALL);
  const stale = isLabUiPackStale(repo);
  const building = labUiPackInFlight();
  if (stale && !building) {
    scheduleEnsureLabUiPack(repo, { reason: "auto" });
  }
  return {
    name: meta?.name ?? "@lab/ui",
    version: meta?.version ?? null,
    file: LAB_UI_TARBALL,
    href: `/downloads/${LAB_UI_TARBALL}`,
    available: existsSync(tarball) && !building,
    building: building || stale,
    stale
  };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const repo = resolve(process.cwd());
  const force = process.argv.includes("--force");
  ensureLabUiPack(repo, { force, quiet: false, reason: "cli" })
    .then((result) => {
      if (result.packed) {
        console.log("✓ @lab/ui download package ready");
      } else {
        console.log("✓ @lab/ui download package already fresh");
      }
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
