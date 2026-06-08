#!/usr/bin/env node
/**
 * Original parity — runs all three contract-first legs (backward-compatible entry).
 *
 * Delegates to per-leg scripts (no story map):
 *   figma-screen-test.mjs          → vsFigmaLive
 *   figma-screen-storybook-test.mjs → vsStorybook
 *   figma-screen-reacthtml-test.mjs → vsReactHtml
 *
 *   node scripts/original-parity-test.mjs
 *   node scripts/original-parity-test.mjs --artifact path/to.manifest.json
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverFigmaScreens, mergeFigmaScreenReport } from "./figma-screen-portfolio.mjs";

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LEG_SCRIPTS = [
  "scripts/figma-screen-test.mjs",
  "scripts/figma-screen-storybook-test.mjs",
  "scripts/figma-screen-reacthtml-test.mjs",
];

function parseCli() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v.startsWith("--") && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) {
      args.set(v.slice(2), process.argv[i + 1]);
      i++;
    }
  }
  return { artifact: args.get("artifact") ?? null };
}

function runLeg(script, artifact) {
  const args = ["node", script];
  if (artifact) args.push("--artifact", artifact);
  return new Promise((resolveRun) => {
    const child = spawn(args[0], args.slice(1), {
      cwd: WORKSPACE,
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => resolveRun(code ?? 1));
    child.on("error", () => resolveRun(1));
  });
}

async function main() {
  const { artifact } = parseCli();
  const targets = artifact
    ? [{ manifestPath: resolve(artifact) }]
    : discoverFigmaScreens(WORKSPACE);

  if (!targets.length) {
    console.log("[original-parity] No manifests in artifacts/figma-screens/");
    process.exit(0);
  }

  let anyFail = 0;
  for (const { manifestPath } of targets) {
    for (const script of LEG_SCRIPTS) {
      const code = await runLeg(script, manifestPath);
      if (code !== 0) anyFail += 1;
    }
  }

  mergeFigmaScreenReport(WORKSPACE);
  console.log(`\n[original-parity] Done — ${anyFail ? "some legs failed" : "all legs pass"}`);
  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error("[original-parity] Fatal:", err.message);
  process.exit(1);
});
