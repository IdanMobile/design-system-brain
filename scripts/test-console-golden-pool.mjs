#!/usr/bin/env node
/**
 * Process-level golden pool — one Node process per story chunk (isolated figma mock).
 * Figma **live** is different: one harness, N in-process workers. Storybook extract,
 * screenshot, and diff run in parallel; only inject→Figma→PNG waits on the relay queue.
 *
 *   node scripts/test-console-golden-pool.mjs --suite figmaLive --stories a,b,c --workers 12
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_PARALLEL_WORKERS,
  harnessEnvForSuite,
  storybookParallelCap
} from "./test-console-run-settings.mjs";

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

/**
 * @param {string} suite
 * @param {string[]} stories
 * @param {number} workers
 */
export function planGoldenPool(suite, stories, workers) {
  const harnessEnv = harnessEnvForSuite(suite, workers);
  if (suite === "figmaLive") {
    const inProcess = Number(harnessEnv.TEST_PARALLEL);
    return {
      suite,
      mode: "figma-live-single-harness",
      storyCount: stories.length,
      processCount: 1,
      inProcessParallel: inProcess,
      chunks: [stories]
    };
  }
  const effectiveWorkers = Math.min(workers, storybookParallelCap(workers));
  const chunks = chunkStories(stories, effectiveWorkers);
  return {
    suite,
    mode: "multi-process",
    storyCount: stories.length,
    processCount: chunks.length,
    inProcessParallel: 1,
    chunks
  };
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

function runChunk(spec, index, total, suite, harnessEnv, { relayQueueOnly = false } = {}) {
  return new Promise((resolveJob, reject) => {
    const [bin, ...args] = spec.cmd;
    const storyCount = args[args.length - 1].split(",").length;
    console.log(
      relayQueueOnly
        ? `[golden-pool] figma live harness — ${storyCount} stories · ${harnessEnv.TEST_PARALLEL} in-process workers (relay queues Figma export only)`
        : `[golden-pool] worker ${index + 1}/${total} start ${spec.label} (${storyCount} stories)`
    );
    const childEnv = {
      ...process.env,
      ...harnessEnv
    };
    if (!relayQueueOnly) {
      /** Mock/pixel/delivery: one story lane per process; parallelism is across processes. */
      childEnv.TEST_PARALLEL = "1";
      childEnv.STORYBOOK_PARALLEL = "1";
    }
    const child = spawn(bin, args, {
      cwd: ROOT,
      env: childEnv,
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

async function main() {
  const { suite, stories, workers } = parseArgs(process.argv);

  if (!suite || !stories.length) {
    console.error(
      "Usage: test-console-golden-pool.mjs --suite pixel|figma|figmaLive|delivery --stories id1,id2 --workers 4"
    );
    process.exit(2);
  }

  const plan = planGoldenPool(suite, stories, workers);
  const harnessEnv = harnessEnvForSuite(suite, workers);
  const specs = plan.chunks
    .map((chunk) => commandForChunk(suite, chunk.join(",")))
    .filter(Boolean);

  if (!specs.length) {
    console.error(`[golden-pool] Unknown suite: ${suite}`);
    process.exit(2);
  }

  console.log(
    plan.mode === "figma-live-single-harness"
      ? `[golden-pool] ${suite} — ${plan.storyCount} stories · 1 harness × ${plan.inProcessParallel} workers (export queued on relay)`
      : `[golden-pool] ${suite} — ${plan.storyCount} stories in ${plan.processCount} process${plan.processCount === 1 ? "" : "es"}`
  );

  try {
    await Promise.all(
      specs.map((spec, i) =>
        runChunk(spec, i, specs.length, suite, harnessEnv, {
          relayQueueOnly: plan.mode === "figma-live-single-harness"
        })
      )
    );
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
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
