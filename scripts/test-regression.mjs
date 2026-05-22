#!/usr/bin/env node
/**
 * Regression tier runner (ROADMAP §1.4).
 *
 *   pnpm test:regression                              # Tier C (default)
 *   pnpm test:regression -- --tier a --story ID --suite figmaLive
 *   pnpm test:regression -- --tier b --story lab-button--danger --suite figma
 *   pnpm test:regression -- --tier c --no-live
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runTierA, runTierB, runTierC } from "./regression-tiers.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VALID_SUITES = ["pixel", "figma", "figmaLive", "delivery"];

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const tier = (argValue("--tier") ?? "c").toLowerCase();
const storyId = argValue("--story");
const suiteId = argValue("--suite") ?? "figmaLive";
const noLive = flags.has("--no-live");

function usage() {
  console.log(`Usage:
  pnpm test:regression [-- --tier c] [--no-live]
  pnpm test:regression -- --tier a --story <id> --suite <pixel|figma|figmaLive|delivery>
  pnpm test:regression -- --tier b --story <id> --suite <pixel|figma|figmaLive|delivery>

Tier A — re-run steps 1..N for one story.
Tier B — Tier A for every variant in the same Lab component family.
Tier C — full strict goldens after shared adapter edits (default).`);
}

async function main() {
  if (flags.has("--help") || flags.has("-h")) {
    usage();
    process.exit(0);
  }

  const appendLog = async (line) => process.stdout.write(line);

  if (tier === "c") {
    const ok = await runTierC({
      repoRoot: ROOT,
      suiteId,
      includeLive: !noLive,
      appendLog
    });
    process.exit(ok ? 0 : 1);
  }

  if (!storyId) {
    console.error("Error: --story required for tier a/b");
    usage();
    process.exit(1);
  }

  if (!VALID_SUITES.includes(suiteId)) {
    console.error(`Error: --suite must be one of ${VALID_SUITES.join(", ")}`);
    process.exit(1);
  }

  if (tier === "a") {
    const ok = await runTierA({ repoRoot: ROOT, suiteId, storyId, appendLog });
    process.exit(ok ? 0 : 1);
  }

  if (tier === "b") {
    const ok = await runTierB({ repoRoot: ROOT, suiteId, storyId, appendLog });
    process.exit(ok ? 0 : 1);
  }

  console.error(`Error: unknown --tier ${tier} (use a, b, or c)`);
  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
