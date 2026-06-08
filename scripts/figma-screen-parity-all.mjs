#!/usr/bin/env node
/**
 * Run all three contract-first original parity legs for Figma-entry screens.
 *
 *   Original → Figma live   (figma-screen-test.mjs)
 *   Original → Storybook    (figma-screen-storybook-test.mjs — contract HTML)
 *   Original → ReactHtml    (figma-screen-reacthtml-test.mjs — contract HTML)
 *
 *   node scripts/figma-screen-parity-all.mjs
 *   node scripts/figma-screen-parity-all.mjs --artifact path/to.manifest.json
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverFigmaScreens } from "./figma-screen-portfolio.mjs";

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

function runNode(script, artifact) {
  const args = ["node", script];
  if (artifact) args.push("--artifact", artifact);
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(args[0], args.slice(1), {
      cwd: WORKSPACE,
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${script} exited ${code ?? 1}`));
    });
    child.on("error", rejectRun);
  });
}

async function main() {
  const { artifact } = parseCli();
  const targets = artifact
    ? [{ manifestPath: resolve(artifact) }]
    : discoverFigmaScreens(WORKSPACE);

  if (!targets.length) {
    console.log("[figma-screen-parity] No manifests found");
    process.exit(0);
  }

  let failed = 0;
  for (const { manifestPath } of targets) {
    console.log(`\n[figma-screen-parity] ${manifestPath}`);
    for (const script of LEG_SCRIPTS) {
      try {
        await runNode(script, manifestPath);
      } catch (err) {
        failed += 1;
        console.error(`[figma-screen-parity] ${err.message}`);
      }
    }
  }

  console.log(`\n[figma-screen-parity] Done — ${failed ? "some legs failed" : "all legs pass"}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("[figma-screen-parity] Fatal:", err.message);
  process.exit(1);
});
