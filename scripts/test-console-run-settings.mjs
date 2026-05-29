/**
 * Persisted Run-all speed options (test console UI toggles).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SETTINGS_PATH = join(ROOT, ".test-console", "run-settings.json");

/** @typedef {{
 *   skipPass: boolean,
 *   onlyNotTested: boolean,
 *   parallelWorkers: number,
 *   processPool: boolean,
 *   applyToOrchestrator: boolean,
 *   agentModel: string
 * }} RunSettings */

export const DEFAULT_AGENT_MODEL = "composer-2.5-fast";

/** Upper bound for Run settings → parallel workers (in-process pool / figma live workers). */
export const MAX_PARALLEL_WORKERS = 100;

/** Default cap for simultaneous Storybook loads (extract + iframe goto). */
export const DEFAULT_STORYBOOK_PARALLEL = 12;

/**
 * @param {number} requestedWorkers
 */
export function storybookParallelCap(requestedWorkers) {
  const fromEnv = Number(process.env.STORYBOOK_PARALLEL);
  const cap =
    Number.isFinite(fromEnv) && fromEnv > 0
      ? Math.min(Math.round(fromEnv), MAX_PARALLEL_WORKERS)
      : DEFAULT_STORYBOOK_PARALLEL;
  return Math.min(clampWorkers(requestedWorkers), cap);
}

/**
 * Env for golden harness spawns.
 * @param {string} suiteId
 * @param {number} requestedWorkers
 */
export function harnessEnvForSuite(suiteId, requestedWorkers) {
  const workers = clampWorkers(requestedWorkers);
  const storybook = storybookParallelCap(workers);
  return {
    TEST_PARALLEL: String(storybook),
    STORYBOOK_PARALLEL: String(storybook),
    FORCE_COLOR: "0"
  };
}

export const DEFAULT_RUN_SETTINGS = {
  skipPass: false,
  onlyNotTested: false,
  parallelWorkers: 20,
  processPool: false,
  applyToOrchestrator: true,
  agentModel: DEFAULT_AGENT_MODEL,
  agentCli: "cursor",
  devAgentModel: DEFAULT_AGENT_MODEL,
  devAgentCli: "cursor"
};

export const ACTION_SUITE = {
  "pixel:golden": "pixel",
  "figma:golden": "figma",
  "figma:live:golden": "figmaLive",
  "delivery:golden": "delivery",
  "logic:golden": "logic"
};

export const SUITE_ACTION = {
  pixel: "pixel:golden",
  figma: "figma:golden",
  figmaLive: "figma:live:golden",
  delivery: "delivery:golden",
  logic: "logic:golden"
};

function clampWorkers(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_RUN_SETTINGS.parallelWorkers;
  return Math.min(MAX_PARALLEL_WORKERS, Math.max(1, Math.round(v)));
}

function normalizeAgentModel(raw, agentCli = "cursor") {
  const defaultModel = agentCli === "gemini" ? "gemini-2.5-flash" : DEFAULT_AGENT_MODEL;
  let id = String(raw ?? defaultModel).trim();
  if (agentCli === "gemini" && !id.startsWith("gemini")) {
    id = "gemini-2.5-flash";
  } else if (agentCli === "cursor" && id.startsWith("gemini")) {
    id = DEFAULT_AGENT_MODEL;
  }
  return id || defaultModel;
}

/** @param {RunSettings} [settings] @returns {string} */
export function resolveAgentModel(settings) {
  const env = process.env.TEST_CONSOLE_AGENT_MODEL?.trim();
  if (env) return env;
  return normalizeAgentModel(settings?.agentModel, settings?.agentCli);
}

/** @param {RunSettings} [settings] @returns {string} */
export function resolveDevAgentModel(settings) {
  const env = process.env.TEST_CONSOLE_DEV_AGENT_MODEL?.trim() || process.env.TEST_CONSOLE_AGENT_MODEL?.trim();
  if (env) return env;
  return normalizeAgentModel(settings?.devAgentModel, settings?.devAgentCli);
}

/** @returns {RunSettings} */
export function normalizeRunSettings(raw = {}) {
  const agentCli = String(raw.agentCli ?? "cursor").trim();
  const devAgentCli = String(raw.devAgentCli ?? "cursor").trim();
  return {
    skipPass: Boolean(raw.skipPass),
    onlyNotTested: Boolean(raw.onlyNotTested),
    parallelWorkers: clampWorkers(raw.parallelWorkers ?? DEFAULT_RUN_SETTINGS.parallelWorkers),
    processPool: Boolean(raw.processPool),
    applyToOrchestrator: raw.applyToOrchestrator !== false,
    agentCli,
    agentModel: normalizeAgentModel(raw.agentModel, agentCli),
    devAgentCli,
    devAgentModel: normalizeAgentModel(raw.devAgentModel, devAgentCli)
  };
}

/** @returns {RunSettings} */
export function loadRunSettings() {
  if (!existsSync(SETTINGS_PATH)) return { ...DEFAULT_RUN_SETTINGS };
  try {
    return normalizeRunSettings(JSON.parse(readFileSync(SETTINGS_PATH, "utf8")));
  } catch {
    return { ...DEFAULT_RUN_SETTINGS };
  }
}

/** @param {Partial<RunSettings>} partial @returns {RunSettings} */
export function setRunSettings(partial) {
  const next = normalizeRunSettings({ ...loadRunSettings(), ...partial, updatedAt: undefined });
  mkdirSync(join(ROOT, ".test-console"), { recursive: true });
  writeFileSync(
    SETTINGS_PATH,
    JSON.stringify({ ...next, updatedAt: new Date().toISOString() }, null, 2)
  );
  return next;
}

function safeSegment(id) {
  return id.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-");
}

const SUITE_DIRS = {
  pixel: "pixel-diffs",
  figma: "figma-diffs",
  figmaLive: "figma-live-diffs",
  delivery: "delivery-diffs",
  logic: "logic-audit-diffs"
};

/** @param {string} repoRoot @param {string} suiteId @param {string} storyId */
export function readStoryResultFromDisk(repoRoot, suiteId, storyId) {
  const dir = SUITE_DIRS[suiteId];
  if (!dir) return null;
  const path = join(repoRoot, dir, "by-story", safeSegment(storyId), "result.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Filter portfolio story ids for Run all / orchestrator golden.
 * @param {string} repoRoot
 * @param {string} suiteId
 * @param {string[]} storyIds
 * @param {RunSettings} settings
 */
export function filterStoriesForRun(repoRoot, suiteId, storyIds, settings) {
  if (!settings.onlyNotTested && !settings.skipPass) return [...storyIds];
  return storyIds.filter((id) => {
    const row = readStoryResultFromDisk(repoRoot, suiteId, id);
    const status = row?.status ?? "not_tested";
    if (settings.onlyNotTested) return status === "not_tested";
    if (settings.skipPass) return status !== "pass" && status !== "skipped";
    return true;
  });
}

/**
 * Story ids for orchestrator golden when applyToOrchestrator is on.
 * @param {{ notTested: string[], failing: { storyId: string }[], passed: string[] }} stepStatus
 * @param {RunSettings} settings
 * @param {string[]} portfolioIds
 */
export function orchestratorGoldenStoryIds(stepStatus, settings, portfolioIds) {
  if (!settings.applyToOrchestrator) return [...portfolioIds];
  if (settings.onlyNotTested) return [...stepStatus.notTested];
  if (settings.skipPass) {
    const ids = new Set([
      ...stepStatus.notTested,
      ...stepStatus.failing.map((f) => f.storyId)
    ]);
    return portfolioIds.filter((id) => ids.has(id));
  }
  return [...portfolioIds];
}

/**
 * @param {string} suiteId
 * @param {string[]} storyIds
 * @param {RunSettings} settings
 */
export function buildGoldenSpawnSpec(suiteId, storyIds, settings) {
  if (!storyIds.length) {
    return {
      bin: "node",
      args: [
        "-e",
        "console.log('[golden] Nothing to run — all stories pass or filtered by run settings');"
      ],
      tag: `golden:${suiteId}`,
      env: {},
      empty: true
    };
  }

  const workers = clampWorkers(settings.parallelWorkers);
  const poolProcesses =
    suiteId === "logic" ? 1 : Math.min(workers, storybookParallelCap(workers));

  if (settings.processPool && storyIds.length > 1 && suiteId !== "logic") {
    return {
      bin: "node",
      args: [
        "scripts/test-console-golden-pool.mjs",
        "--suite",
        suiteId,
        "--stories",
        storyIds.join(","),
        "--workers",
        String(poolProcesses)
      ],
      tag: `golden:${suiteId}`,
      env: harnessEnvForSuite(suiteId, workers),
      empty: false
    };
  }

  const storiesArg = storyIds.join(",");
  const env = harnessEnvForSuite(suiteId, workers);

  switch (suiteId) {
    case "pixel":
      return {
        bin: "pnpm",
        args: ["--filter", "@lab/pixel-test", "test:golden", "--", "--stories", storiesArg],
        tag: "golden:pixel",
        env,
        empty: false
      };
    case "figma":
      return {
        bin: "pnpm",
        args: ["--filter", "@lab/pixel-test", "test:figma:golden", "--", "--stories", storiesArg],
        tag: "golden:figma",
        env,
        empty: false
      };
    case "figmaLive":
      return {
        bin: "pnpm",
        args: [
          "--filter",
          "@lab/pixel-test",
          "test:figma:live:golden",
          "--",
          "--stories",
          storiesArg
        ],
        tag: "golden:figmaLive",
        env,
        empty: false
      };
    case "delivery":
      return {
        bin: "pnpm",
        args: [
          "--filter",
          "@lab/pixel-test",
          "test:delivery:golden",
          "--",
          "--stories",
          storiesArg
        ],
        tag: "golden:delivery",
        env,
        empty: false
      };
    default:
      return null;
  }
}

/**
 * Resolve spawn for console Run all (action id form).
 * @param {string} repoRoot
 * @param {string} actionId
 * @param {string[]} portfolioIds
 * @param {RunSettings} settings
 */
export function resolveGoldenRunAll(repoRoot, actionId, portfolioIds, settings) {
  const suiteId = ACTION_SUITE[actionId];
  if (!suiteId) return null;

  if (suiteId === "logic") {
    return {
      bin: "pnpm",
      args: ["test:logic:audit:all"],
      env: { FORCE_COLOR: "0" },
      labelSuffix: "",
      storyCount: portfolioIds.length,
      filteredCount: portfolioIds.length,
      empty: false
    };
  }

  const filtered = filterStoriesForRun(repoRoot, suiteId, portfolioIds, settings);
  const spec = buildGoldenSpawnSpec(suiteId, filtered, settings);
  if (!spec) return null;

  const suffix =
    filtered.length !== portfolioIds.length
      ? ` (${filtered.length} of ${portfolioIds.length} stories)`
      : filtered.length > 0
        ? ` (${filtered.length} stories)`
        : "";

  return {
    bin: spec.bin,
    args: spec.args,
    env: spec.env,
    labelSuffix: suffix,
    storyCount: portfolioIds.length,
    filteredCount: filtered.length,
    empty: spec.empty
  };
}
