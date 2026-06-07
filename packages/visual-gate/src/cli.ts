#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compareStoryToRef, type VisualGateResult } from "./compare-story-to-ref.ts";
import { DEFAULT_DIFF_TOLERANCE_PERCENT } from "../../pixel-test/src/test-tolerance.ts";

const EXIT_PASS = 0;
const EXIT_WARN = 1;
const EXIT_FAIL = 2;
const EXIT_ERROR = 3;

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };
  const storyId = get("--storyId");
  const referencePng = get("--referencePng");
  if (!storyId) {
    process.stderr.write("Error: --storyId is required\n");
    return null;
  }
  if (!referencePng) {
    process.stderr.write("Error: --referencePng is required\n");
    return null;
  }
  return {
    storyId,
    referencePng: resolve(referencePng),
    storybookUrl: get("--storybookUrl") ?? "http://localhost:6006",
    outDir: resolve(get("--outDir") ?? "./visual-gate-output"),
    tolerance: Number(get("--tolerance") ?? String(DEFAULT_DIFF_TOLERANCE_PERCENT)),
    outputJson: get("--outputJson") ? resolve(get("--outputJson")!) : null,
  };
}

const parsed = parseArgs();
if (!parsed) {
  process.exit(EXIT_ERROR);
}

const result: VisualGateResult = await compareStoryToRef(
  parsed.storyId,
  parsed.referencePng,
  { baseUrl: parsed.storybookUrl, outDir: parsed.outDir, tolerance: parsed.tolerance }
);

if (parsed.outputJson) {
  writeFileSync(parsed.outputJson, JSON.stringify(result, null, 2));
}

const pct = result.percent.toFixed(2);
const line = `[${result.status}] ${result.storyId} ${pct}%${result.message ? " — " + result.message : ""}`;
if (result.status === "error" || result.status === "fail") {
  process.stderr.write(line + "\n");
} else {
  process.stdout.write(line + "\n");
}

const exitCode =
  result.status === "pass" ? EXIT_PASS :
  result.status === "warn" ? EXIT_WARN :
  result.status === "fail" ? EXIT_FAIL :
  EXIT_ERROR;
process.exit(exitCode);
