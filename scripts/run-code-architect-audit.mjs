#!/usr/bin/env node
/**
 * Dispatch code-architect-investigator — writes stub report paths for agent or CI.
 * Full audit content is produced by Cursor agent reading the skill.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const date = new Date().toISOString().slice(0, 10);
const specDir = join(ROOT, "docs", "superpowers", "specs");
const mdPath = join(specDir, `${date}-code-architect-audit.md`);
const jsonPath = join(ROOT, ".test-console", "architecture-findings.json");

mkdirSync(specDir, { recursive: true });
mkdirSync(join(ROOT, ".test-console"), { recursive: true });

const stub = {
  auditedAt: new Date().toISOString(),
  scope: [
    "packages/figma-importer-plugin/src/code-v2.ts",
    "packages/pixel-test/src/scene-to-html.ts",
    "scripts/test-console-fix-all-iterate.mjs",
    "scripts/sandbox-promote.mjs"
  ],
  critical: [],
  high: [],
  medium: [],
  recommendations: [
    "Run Cursor agent with .cursor/skills/code-architect-investigator/SKILL.md to populate findings."
  ],
  status: "pending_agent"
};

writeFileSync(jsonPath, JSON.stringify(stub, null, 2));

const md = `# Code Architect Audit — ${date}

> Stub — dispatch agent with \`.cursor/skills/code-architect-investigator/SKILL.md\`

## Executive summary

Pending agent audit. Trigger after PHASE_COMPLETE or post-incident.

## Machine-readable

See \`.test-console/architecture-findings.json\`
`;

writeFileSync(mdPath, md);

console.log(`Architecture audit stub written:`);
console.log(`  ${mdPath}`);
console.log(`  ${jsonPath}`);
console.log(`\nDispatch: read .cursor/skills/code-architect-investigator/SKILL.md and fill both files.`);
