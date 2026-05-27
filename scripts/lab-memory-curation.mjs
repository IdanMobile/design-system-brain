#!/usr/bin/env node
/**
 * Lab-memory curation report — patterns backlog, pending stubs, infra-tagged notes.
 *
 *   node scripts/lab-memory-curation.mjs
 *   node scripts/lab-memory-curation.mjs --json
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLabMemoryFixHint } from "./lab-memory-vault.mjs";
import {
  investigationsActiveDir,
  investigationsArchiveDir
} from "./lab-memory-paths.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function listStoryFiles() {
  /** @type {{ file: string, path: string, tier: 'active' | 'archive' }[]} */
  const out = [];
  for (const [tier, dirFn] of [
    ["active", investigationsActiveDir],
    ["archive", investigationsArchiveDir]
  ]) {
    const dir = dirFn(ROOT);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "_index.md")) {
      out.push({ file, path: join(dir, file), tier });
    }
  }
  return out;
}

function hasFilledRootCause(body) {
  const blocks = body.split(/^## Investigation — /m).slice(1);
  for (const block of blocks) {
    const m = block.match(/### Root cause\s*\n\n([\s\S]*?)(?=\n### |\n<!-- vault-fingerprint)/);
    if (!m) continue;
    const t = m[1].trim();
    if (t && !t.includes("<!-- pending")) return true;
  }
  return false;
}

function hasPatternLink(body) {
  return /\[\[(?:visual\/)?patterns\/[^\]]+\]\]/.test(body);
}

function pendingStubCount(body) {
  return (body.match(/<!-- pending — agent fills/g) ?? []).length;
}

function infraTagged(body) {
  return body.includes("Infrastructure — Storybook/Playwright");
}

function main() {
  const json = process.argv.includes("--json");
  const files = listStoryFiles();
  /** @type {object[]} */
  const rows = [];

  for (const { file, path, tier } of files) {
    const storyId = file.replace(/\.md$/, "");
    const body = readFileSync(path, "utf8");
    const filled = hasFilledRootCause(body);
    const linked = hasPatternLink(body);
    const pending = pendingStubCount(body);
    const infra = infraTagged(body);
    const hint = loadLabMemoryFixHint(ROOT, storyId, "pixel");

    rows.push({
      storyId,
      tier,
      filledDiagnosis: filled,
      linkedPatterns: linked,
      pendingStubs: pending,
      infraNotes: infra,
      needsPattern: filled && !linked,
      pixelHint: Boolean(hint)
    });
  }

  const needsPattern = rows.filter((r) => r.needsPattern);
  const pendingHeavy = rows.filter((r) => r.pendingStubs >= 3 && !r.filledDiagnosis);
  const infra = rows.filter((r) => r.infraNotes);

  if (json) {
    console.log(JSON.stringify({ needsPattern, pendingHeavy, infra, rows }, null, 2));
    return;
  }

  console.log("[lab-memory] Curation report\n");
  console.log(`Stories with notes: ${rows.length}`);
  console.log(`Filled diagnosis, no [[visual/patterns/]] link: ${needsPattern.length}`);
  console.log(`Pending-only heavy (≥3 pending stubs, no diagnosis): ${pendingHeavy.length}`);
  console.log(`Infra-tagged investigations: ${infra.length}\n`);

  if (needsPattern.length) {
    console.log("── Add or link patterns ──");
    for (const r of needsPattern.slice(0, 15)) {
      console.log(`  ${r.storyId}`);
    }
    if (needsPattern.length > 15) console.log(`  … +${needsPattern.length - 15} more`);
    console.log("");
  }

  if (pendingHeavy.length) {
    console.log("── Consider pruning or completing (pending stubs) ──");
    for (const r of pendingHeavy.slice(0, 10)) {
      console.log(`  ${r.storyId} [${r.tier}] (${r.pendingStubs} pending)`);
    }
    console.log("");
  }

  if (infra.length) {
    console.log("── Infra (re-run tests, do not fix renderer) ──");
    for (const r of infra.slice(0, 10)) {
      console.log(`  ${r.storyId}`);
    }
  }
}

main();
