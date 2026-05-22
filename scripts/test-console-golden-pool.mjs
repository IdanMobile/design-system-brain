#!/usr/bin/env node
/**
 * Process-level golden pool — one Node process per story chunk (isolated figma mock).
 * Used when Run settings → "Process pool" is ON.
 *
 *   node scripts/test-console-golden-pool.mjs --suite figma --stories a,b,c --workers 4
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_PARALLEL_WORKERS } from "./test-console-run-settings.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = { suite: null, stories: [], workers: 4 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--suite") out.suite = argv[++i];
    else if (a === "--stories") {
      out.stories = String(argv[++i] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === "--workers") {
      out.workers = Math.min(MAX_PARALLEL_WORKERS, Math.max(1, Number(argv[++i]) || 4));
    }
  }
  return out;
}

function chunkStories(ids, workers) {
  const n = Math.min(workers, ids.length);
  const chunks = Array.from({ length: n }, () => []);
  for (let i = 0; i < ids.length; i += 1) {
    chunks[i % n].push(ids[i]);
  }
  return chunks.filter((c) => c.length > 0);
}

function commandForChunk(suite, storiesCsv) {
  switch (suite) {
    case "pixel":
      return {
        label: "Pixel",
        cmd: [
          "pnpm",
          "--filter",
          "@lab/pixel-test",
          "test:golden",
          "--",
          "--stories",
          storiesCsv
        ]
      };
    case "figma":
      return {
        label: "Figma emulator",
        cmd: [
          "pnpm",
          "--filter",
          "@lab/pixel-test",
          "test:figma:golden",
          "--",
          "--stories",
          storiesCsv
        ]
      };
    case "figmaLive":
      return {
        label: "Figma live",
        cmd: [
          "pnpm",
          "--filter",
          "@lab/pixel-test",
          "test:figma:live:golden",
          "--",
          "--stories",
          storiesCsv
        ]
      };
    case "delivery":
      return {
        label: "Delivery",
        cmd: [
          "pnpm",
          "--filter",
          "@lab/pixel-test",
          "test:delivery:golden",
          "--",
          "--stories",
          storiesCsv
        ]
      };
    default:
      return null;
  }
}

function runChunk(spec, index, total) {
  return new Promise((resolveJob, reject) => {
    const [bin, ...args] = spec.cmd;
    console.log(
      `[golden-pool] worker ${index + 1}/${total} start ${spec.label} (${args[args.length - 1].split(",").length} stories)`
    );
    const child = spawn(bin, args, {
      cwd: ROOT,
      env: { ...process.env, FORCE_COLOR: "0", TEST_PARALLEL: "1" },
      stdio: "inherit"
    });
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`[golden-pool] worker ${index + 1}/${total} done`);
        resolveJob();
      } else {
        reject(new Error(`${spec.label} worker ${index + 1} exited ${code ?? 1}`));
      }
    });
    child.on("error", reject);
  });
}

function mergePortfolio() {
  return new Promise((resolveMerge, reject) => {
    const child = spawn("node", ["scripts/test-portfolio-merge.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env
    });
    child.on("close", (code) => {
      if (code === 0) resolveMerge();
      else reject(new Error(`portfolio merge exited ${code ?? 1}`));
    });
    child.on("error", reject);
  });
}

const { suite, stories, workers } = parseArgs(process.argv);

if (!suite || !stories.length) {
  console.error(
    "Usage: test-console-golden-pool.mjs --suite pixel|figma|figmaLive|delivery --stories id1,id2 --workers 4"
  );
  process.exit(2);
}

const effectiveWorkers = suite === "figmaLive" ? 1 : workers;
const chunks = chunkStories(stories, effectiveWorkers);
const specs = chunks
  .map((chunk) => commandForChunk(suite, chunk.join(",")))
  .filter(Boolean);

if (!specs.length) {
  console.error(`[golden-pool] Unknown suite: ${suite}`);
  process.exit(2);
}

console.log(
  `[golden-pool] ${suite} — ${stories.length} stories in ${specs.length} process${specs.length === 1 ? "" : "es"}`
);

try {
  await Promise.all(specs.map((spec, i) => runChunk(spec, i, specs.length)));
  await mergePortfolio();
  console.log("[golden-pool] complete");
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  try {
    await mergePortfolio();
  } catch {
    /* partial results still useful */
  }
  process.exit(1);
}
