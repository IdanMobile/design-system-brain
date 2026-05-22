/**
 * Regression tiers (ROADMAP §1.4).
 *
 * Tier A — after fix at step N: re-run steps 1..N for that story.
 * Tier B — component family: all variants of the same Lab component.
 * Tier C — shared adapter edit: full strict golden suites.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { TEST_STEP_ORDER, isStepPassing, loadStoryStepCellsFromDisk } from "./step-gate.mjs";
import {
  SHARED_ADAPTER_PREFIXES,
  touchedSharedAdapter
} from "./test-console-worker-supervisor.mjs";

export { SHARED_ADAPTER_PREFIXES, touchedSharedAdapter };

/** @typedef {'pixel' | 'figma' | 'figmaLive' | 'delivery'} SuiteId */

/**
 * Load story ids grouped by Storybook title (e.g. Lab/Button → all button variants).
 * @param {string} repoRoot
 */
export function loadStoryFamilyRegistry(repoRoot) {
  const indexPath = join(repoRoot, "artifacts", "stories.index.json");
  /** @type {Map<string, string[]>} */
  const byTitle = new Map();
  /** @type {Map<string, string>} */
  const idToTitle = new Map();
  /** @type {string[]} */
  const allIds = [];

  if (existsSync(indexPath)) {
    try {
      const raw = JSON.parse(readFileSync(indexPath, "utf8"));
      for (const s of raw.stories ?? []) {
        if (!s?.id) continue;
        allIds.push(s.id);
        if (s.title) {
          idToTitle.set(s.id, s.title);
          if (!byTitle.has(s.title)) byTitle.set(s.title, []);
          byTitle.get(s.title).push(s.id);
        }
      }
    } catch {
      /* fall through */
    }
  }

  /** @type {Map<string, string[]>} */
  const idToFamily = new Map();
  for (const ids of byTitle.values()) {
    const sorted = [...ids].sort();
    for (const id of sorted) idToFamily.set(id, sorted);
  }

  return { allIds, idToTitle, idToFamily };
}

/**
 * @param {string} storyId
 * @param {ReturnType<typeof loadStoryFamilyRegistry>} registry
 */
export function storiesInComponentFamily(storyId, registry) {
  const family = registry.idToFamily.get(storyId);
  if (family?.length) return family;
  return [storyId];
}

/**
 * UI package path for a Storybook title (Lab/Button → packages/ui/src/components/Button.tsx).
 * @param {string} title
 */
export function componentUiPathFromTitle(title) {
  const segment = title.split("/").pop();
  if (!segment) return null;
  return `packages/ui/src/components/${segment}.tsx`;
}

/**
 * True when edits touch the @lab/ui component backing this story (Tier B trigger).
 * @param {string[]} filesChanged
 * @param {string} storyId
 * @param {ReturnType<typeof loadStoryFamilyRegistry>} registry
 */
export function touchedStoryComponentPackage(filesChanged, storyId, registry) {
  const title = registry.idToTitle.get(storyId);
  if (!title) return false;
  const uiPath = componentUiPathFromTitle(title);
  if (!uiPath) return false;
  const componentDir = uiPath.replace(/\.tsx$/, "/");
  return filesChanged.some(
    (f) => f === uiPath || f.startsWith(componentDir) || f.startsWith("packages/ui/src/")
  );
}

/**
 * Run a single story test step (sync — for CLI and inline checks).
 * @param {string} repoRoot
 * @param {SuiteId} suiteId
 * @param {string} storyId
 */
export function runStoryTestSync(repoRoot, suiteId, storyId) {
  const opts = { cwd: repoRoot, env: process.env, stdio: "pipe", encoding: "utf8" };
  switch (suiteId) {
    case "pixel":
      return spawnSync(
        "pnpm",
        ["--filter", "@lab/pixel-test", "run", "test:golden", "--", "--stories", storyId],
        opts
      );
    case "figma":
      return spawnSync("node", ["scripts/figma-iterate.mjs", "--story", storyId, "--strict"], opts);
    case "figmaLive":
      return spawnSync("node", ["scripts/figma-live-iterate.mjs", "--story", storyId, "--strict"], opts);
    case "delivery":
      return spawnSync(
        "pnpm",
        [
          "--filter",
          "@lab/pixel-test",
          "run",
          "test:delivery:golden",
          "--",
          "--stories",
          storyId
        ],
        opts
      );
    default:
      return { status: 1, stdout: "", stderr: `Unknown suite ${suiteId}` };
  }
}

/**
 * Tier A — re-run steps 1..N for one story (always, not only failing priors).
 * @param {object} opts
 * @param {string} opts.repoRoot
 * @param {SuiteId} opts.suiteId
 * @param {string} opts.storyId
 * @param {(stepId: SuiteId, storyId: string) => Promise<number>} [opts.runStep]
 * @param {(line: string) => Promise<void>} [opts.appendLog]
 */
export async function runTierA(opts) {
  const { repoRoot, suiteId, storyId, appendLog = async () => {} } = opts;
  const idx = TEST_STEP_ORDER.indexOf(suiteId);
  if (idx < 0) return false;

  const runStep =
    opts.runStep ??
    (async (stepId, sid) => runStoryTestSync(repoRoot, stepId, sid).status ?? 1);

  await appendLog(`[regression] Tier A — ${storyId} steps 1..${idx + 1} (${suiteId})…\n`);

  for (let i = 0; i <= idx; i += 1) {
    const stepId = TEST_STEP_ORDER[i];
    const code = await runStep(stepId, storyId);
    await appendLog(`[regression] Tier A — ${storyId} ${stepId} exit ${code}\n`);
    if (code !== 0) {
      await appendLog(`[regression] Tier A failed at ${stepId}\n`);
      return false;
    }
    const cells = loadStoryStepCellsFromDisk(repoRoot, storyId, readFileSync, existsSync, join);
    const status = cells[stepId]?.status ?? "not_tested";
    if (!isStepPassing(status)) {
      await appendLog(`[regression] Tier A — ${stepId} status ${status} after run\n`);
      return false;
    }
  }

  await appendLog(`[regression] Tier A passed for ${storyId}\n`);
  return true;
}

/**
 * Tier B — Tier A for every story in the same component family.
 * @param {object} opts
 * @param {string} opts.repoRoot
 * @param {SuiteId} opts.suiteId
 * @param {string} opts.storyId
 * @param {(stepId: SuiteId, storyId: string) => Promise<number>} [opts.runStep]
 * @param {(line: string) => Promise<void>} [opts.appendLog]
 */
export async function runTierB(opts) {
  const registry = loadStoryFamilyRegistry(opts.repoRoot);
  const family = storiesInComponentFamily(opts.storyId, registry);
  await (opts.appendLog ?? (async () => {}))(
    `[regression] Tier B — ${family.length} stor${family.length === 1 ? "y" : "ies"} in family…\n`
  );

  for (const sid of family) {
    const ok = await runTierA({ ...opts, storyId: sid });
    if (!ok) return false;
  }
  await (opts.appendLog ?? (async () => {}))("[regression] Tier B passed\n");
  return true;
}

/**
 * Tier C — full strict golden suites after shared adapter edits.
 * @param {object} opts
 * @param {string} opts.repoRoot
 * @param {SuiteId} opts.suiteId
 * @param {(spec: { tag: string, bin: string, args: string[] }) => Promise<number>} [opts.runCommand]
 * @param {(line: string) => Promise<void>} [opts.appendLog]
 * @param {boolean} [opts.includeLive]
 */
export async function runTierC(opts) {
  const { repoRoot, suiteId, appendLog = async () => {} } = opts;
  const idx = TEST_STEP_ORDER.indexOf(suiteId);
  const includeLive = opts.includeLive ?? idx >= 2;

  const runCommand =
    opts.runCommand ??
    (async (spec) => {
      const r = spawnSync(spec.bin, spec.args, {
        cwd: repoRoot,
        env: process.env,
        stdio: "inherit"
      });
      return r.status ?? 1;
    });

  await appendLog("[regression] Tier C — shared adapter touched; strict golden regression…\n");

  const steps = [
    { tag: "tierC:pixel", bin: "pnpm", args: ["test:pixel:golden"] },
    { tag: "tierC:figma", bin: "node", args: ["scripts/figma-iterate.mjs", "--strict"] }
  ];
  if (includeLive) {
    steps.push({
      tag: "tierC:figmaLive",
      bin: "node",
      args: ["scripts/figma-live-iterate.mjs", "--strict"]
    });
  }

  for (const step of steps) {
    await appendLog(`[regression] Tier C — ${step.tag}…\n`);
    const code = await runCommand(step);
    if (code !== 0) {
      await appendLog(`[regression] Tier C failed at ${step.tag} (exit ${code})\n`);
      return false;
    }
  }

  await appendLog("[regression] Tier C passed\n");
  return true;
}
