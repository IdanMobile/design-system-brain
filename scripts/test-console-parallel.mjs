#!/usr/bin/env node
/**
 * Run pixel, figma emulator, and delivery goldens in parallel (refresh-only).
 * Sequential step gate is bypassed (TEST_SKIP_STEP_GATE) — not for fix verification.
 * Figma live stays serial (relay) — run separately.
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const JOBS = [
  { label: "Pixel (schema)", cmd: ["pnpm", "test:pixel:golden"] },
  { label: "Figma emulator", cmd: ["pnpm", "figma:iterate"] },
  { label: "Delivery (3-way)", cmd: ["pnpm", "test:delivery:golden"] }
];

function runJob({ label, cmd }) {
  return new Promise((resolveJob, reject) => {
    console.log(`[parallel] start ${label}`);
    const child = spawn(cmd[0], cmd.slice(1), {
      cwd: ROOT,
      env: { ...process.env, FORCE_COLOR: "0", TEST_SKIP_STEP_GATE: "1" },
      stdio: "inherit"
    });
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`[parallel] done ${label}`);
        resolveJob({ label, code: 0 });
      } else {
        reject(new Error(`${label} exited ${code}`));
      }
    });
  });
}

try {
  await Promise.all(JOBS.map(runJob));
  const merge = spawn("node", ["scripts/test-portfolio-merge.mjs"], {
    cwd: ROOT,
    stdio: "inherit"
  });
  merge.on("close", (code) => process.exit(code ?? 0));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
