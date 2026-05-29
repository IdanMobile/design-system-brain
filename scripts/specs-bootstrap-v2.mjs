#!/usr/bin/env node
/**
 * Migrate v1 spec files to v2 (elements-shape):
 *   1. Copy every existing lab-memory/logic/specs/<id>.spec.json to lab-memory/logic/archive/
 *      (only if it doesn't look v2 already — schemaVersion !== 2).
 *   2. Write fresh v2 files for every DEV_STORY with empty elements[] and intent.
 *
 * Idempotent: re-running after migration is a no-op.
 *
 * Run: node --experimental-strip-types scripts/specs-bootstrap-v2.mjs
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { logicSpecsDir, logicArchiveDir } from "./lab-memory-paths.mjs";

const repoRoot = resolve(process.cwd());

const vault = logicSpecsDir(repoRoot);
const legacy = logicArchiveDir(repoRoot);

mkdirSync(vault, { recursive: true });
mkdirSync(legacy, { recursive: true });

const storiesModule = await import(
  resolve(repoRoot, "packages/contract/src/stories.ts")
);
const DEV_STORIES = storiesModule.DEV_STORIES;

let archived = 0;
let written = 0;
let skipped = 0;

for (const name of readdirSync(vault)) {
  if (!name.endsWith(".spec.json")) continue;
  const source = resolve(vault, name);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(source, "utf8"));
  } catch {
    continue;
  }
  if (parsed.schemaVersion === 2) continue;
  const dest = resolve(legacy, name);
  if (!existsSync(dest)) {
    writeFileSync(dest, readFileSync(source, "utf8"));
    archived += 1;
  }
}

for (const entry of DEV_STORIES) {
  const target = resolve(vault, `${entry.id}.spec.json`);
  if (existsSync(target)) {
    try {
      const parsed = JSON.parse(readFileSync(target, "utf8"));
      if (parsed.schemaVersion === 2) {
        skipped += 1;
        continue;
      }
    } catch {
      // fall through to overwrite
    }
  }
  const fresh = {
    storyId: entry.id,
    schemaVersion: 2,
    intent: "",
    status: "proposed",
    approvedAt: null,
    approvedBy: null,
    specVersion: 1,
    elements: []
  };
  writeFileSync(target, JSON.stringify(fresh, null, 2) + "\n", "utf8");
  written += 1;
}

console.log(`✓ specs:bootstrap-v2 — archived ${archived}, wrote ${written}, skipped ${skipped}`);
console.log(`  vault:  ${vault}`);
console.log(`  legacy: ${legacy}`);
console.log(`  Next: pnpm test:logic:audit:all   (populates elements[] from the DOM)`);
