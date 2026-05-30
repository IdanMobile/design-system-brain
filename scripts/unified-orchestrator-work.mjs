/**
 * Unified portfolio orchestrator — scan matrix, map cells to test/fix suites, human exits.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  UNIFIED_STEP_ORDER,
  buildUnifiedPortfolioState
} from "./build-unified-portfolio.mjs";
import { loadPortfolioStoryIds, isStorybookOnlyStory } from "./test-portfolio-config.mjs";
import { discoverFigmaScreens } from "./figma-screen-portfolio.mjs";
import { loadRunSettings, harnessEnvForSuite } from "./test-console-run-settings.mjs";

export { UNIFIED_STEP_ORDER };

export const DEFAULT_MAX_FIX_ROUNDS_PER_STEP = Math.min(
  20,
  Math.max(1, Number(process.env.UNIFIED_ORCH_MAX_FIX_ROUNDS ?? 10))
);

export const DEFAULT_MAX_AUTO_RETRIES_WHEN_STUCK = Math.min(
  10,
  Math.max(0, Number(process.env.UNIFIED_ORCH_MAX_AUTO_RETRIES ?? 3))
);

export const DEFAULT_MAX_AGENT_CALLS = Math.min(
  500,
  Math.max(10, Number(process.env.UNIFIED_ORCH_MAX_AGENT_CALLS ?? 100))
);

/** @typedef {'full'|'failures_only'|'fresh_only'|'single_step'} OrchestratorScope */
/** @typedef {'step_first'|'worst_first'} OrchestratorSort */

export const HUMAN_ACTIONS = {
  figma_plugin_not_connected: {
    title: "Figma plugin required",
    message:
      "Open Figma Desktop → Development → Universal JSON Importer Lab. Wait for “bridge connected”, then re-Launch or turn Auto back on."
  },
  cursor_usage_blocked: {
    title: "Agent CLI blocked",
    message:
      "Cursor CLI hit a usage limit. Restore quota, change the fix agent model, delete .test-console/cursor-usage-blocked.flag, then re-Launch."
  },
  stuck_no_progress: {
    title: "No progress on failures",
    message:
      "The same items failed after multiple fix rounds. Open compare PNG + test report for the worst row, fix by hand, or Invalidate and re-Launch."
  },
  max_rounds_exceeded: {
    title: "Safety limit reached",
    message:
      "Orchestrator hit the max fix-round or agent-call cap for this Launch session. Review logs, adjust limits, or fix remaining items manually."
  },
  infra_down: {
    title: "Infrastructure not ready",
    message:
      "Storybook, Figma relay, or delivery playground did not come up in time. Run pnpm infra:ensure, fix infra, then re-Launch."
  },
  step_not_green: {
    title: "Step still failing",
    message:
      "This pipeline step did not reach all PASS. Review the portfolio column, fix manually, or re-Launch with failures-only scope."
  },
  cancelled: {
    title: "Orchestrator cancelled",
    message: "Supervisor was stopped from the test console."
  }
};

const STATUS_ORDER = { error: 0, fail: 1, warn: 2, not_tested: 3, skipped: 4, pass: 5 };

/**
 * @param {string} repoRoot
 * @returns {import('./build-unified-portfolio.mjs').buildUnifiedPortfolioState extends (...args: any[]) => infer R ? R : never}
 */
export function loadUnifiedPortfolio(repoRoot) {
  const path = join(repoRoot, "test-portfolio", "portfolio.json");
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      if (raw?.source === "unified" && raw.rows?.length) return raw;
    } catch {
      /* rebuild */
    }
  }
  const storyIds = loadPortfolioStoryIds(repoRoot, readFileSync, existsSync, join);
  return buildUnifiedPortfolioState(repoRoot, storyIds, isStorybookOnlyStory);
}

/**
 * Map unified UI scope to golden filters.
 * @param {import('./test-console-run-settings.mjs').RunSettings} settings
 */
export function effectiveOrchestratorFilters(settings) {
  const scope = settings.scope ?? "failures_only";
  if (scope === "fresh_only") {
    return { skipPass: false, onlyNotTested: true, applyToOrchestrator: true };
  }
  if (scope === "full") {
    return { skipPass: false, onlyNotTested: false, applyToOrchestrator: true };
  }
  if (scope === "single_step") {
    return {
      skipPass: false,
      onlyNotTested: false,
      applyToOrchestrator: true,
      singleStepId: settings.singleStepId ?? "structural"
    };
  }
  return { skipPass: true, onlyNotTested: false, applyToOrchestrator: true };
}

/**
 * @param {string} entryPoint
 * @param {string} stepId
 */
export function fixSuiteForCell(entryPoint, stepId) {
  if (entryPoint === "figma") {
    if (stepId === "structural") return "manifestContract";
    if (stepId === "logic") return "logic";
    if (stepId === "vsFigmaLive" || stepId === "vsStorybook" || stepId === "vsReactHtml") {
      return stepId;
    }
  }
  const storybookMap = {
    structural: "pixel",
    vsFigmaLive: "figmaLive",
    vsStorybook: "pixel",
    vsReactHtml: "delivery",
    logic: "logic"
  };
  return storybookMap[stepId] ?? stepId;
}

/**
 * @param {string} stepId
 */
export function stepNeedsRelay(stepId) {
  return stepId === "vsFigmaLive";
}

/**
 * @param {string} stepId
 */
export function stepNeedsPlayground(stepId) {
  return stepId === "vsReactHtml";
}

/**
 * @param {string} stepId
 */
export function stepNeedsStorybook(stepId) {
  return stepId === "structural" || stepId === "vsStorybook";
}

function cellIncluded(status, filters) {
  if (status === "pass" || status === "skipped") {
    if (filters.onlyNotTested) return false;
    if (filters.skipPass) return false;
    return false;
  }
  if (status === "not_tested") {
    if (filters.onlyNotTested) return true;
    if (filters.skipPass) return true;
    return true;
  }
  return true;
}

/**
 * @param {ReturnType<loadUnifiedPortfolio>} portfolio
 * @param {string} stepId
 * @param {ReturnType<effectiveOrchestratorFilters>} filters
 */
export function summarizeUnifiedStep(portfolio, stepId, filters) {
  const failing = [];
  const notTested = [];
  const passed = [];
  const blocked = [];

  for (const row of portfolio.rows ?? []) {
    const cell = row.cells?.[stepId];
    const status = cell?.status ?? "not_tested";
    if (cell?.canRun === false && status === "not_tested") {
      blocked.push({ storyId: row.storyId, entryPoint: row.entryPoint, reason: cell.blockedReason });
      continue;
    }
    const item = {
      storyId: row.storyId,
      entryPoint: row.entryPoint ?? "storybook",
      status,
      percent: cell?.percent ?? 0
    };
    if (status === "pass" || status === "skipped") passed.push(item);
    else if (status === "not_tested") {
      if (cellIncluded(status, filters)) notTested.push(item);
    } else if (cellIncluded(status, filters)) failing.push(item);
  }

  failing.sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || b.percent - a.percent
  );
  notTested.sort((a, b) => a.storyId.localeCompare(b.storyId));

  return {
    stepId,
    failing,
    notTested,
    passed,
    blocked,
    total: portfolio.rows?.length ?? 0,
    complete: failing.length === 0 && notTested.length === 0
  };
}

/**
 * Flow-first work unit: find the first runnable cell for each row, then let a
 * passed row advance without waiting for every other row to finish the column.
 * The portfolio builder owns step-gate truth via `cell.canRun`.
 *
 * @param {ReturnType<loadUnifiedPortfolio>} portfolio
 * @param {ReturnType<effectiveOrchestratorFilters>} filters
 * @returns {{ stepId: string, storyId: string, entryPoint: string, status: string, percent: number, kind: 'fix'|'golden' } | null}
 */
export function findNextFlowWork(portfolio, filters) {
  return findFlowWorkQueue(portfolio, filters, { limit: 1 })[0] ?? null;
}

/**
 * @param {ReturnType<loadUnifiedPortfolio>} portfolio
 * @param {ReturnType<effectiveOrchestratorFilters>} filters
 * @param {{ limit?: number }} [options]
 * @returns {Array<{ stepId: string, storyId: string, entryPoint: string, status: string, percent: number, kind: 'fix'|'golden' }>}
 */
export function findFlowWorkQueue(portfolio, filters, options = {}) {
  const stepIds =
    filters.singleStepId && UNIFIED_STEP_ORDER.includes(filters.singleStepId)
      ? [filters.singleStepId]
      : UNIFIED_STEP_ORDER;
  const limit = Math.max(1, Number(options.limit ?? 1));
  const queue = [];

  for (const row of portfolio.rows ?? []) {
    for (const stepId of stepIds) {
      const cell = row.cells?.[stepId];
      const status = cell?.status ?? "not_tested";
      if (status === "pass" || status === "skipped") continue;
      if (cell?.canRun === false) continue;
      if (!cellIncluded(status, filters)) continue;
      queue.push({
        stepId,
        storyId: row.storyId,
        entryPoint: row.entryPoint ?? "storybook",
        status,
        percent: cell?.percent ?? 0,
        kind: status === "not_tested" ? "golden" : "fix"
      });
      if (queue.length >= limit) return queue;
      break;
    }
  }

  return queue;
}

/**
 * Flow work parallelizes freely. Investigator runs inside each fix-all job (per
 * story + report). Figma live export serializes on the relay only; merge-captain
 * owns shared-adapter promotion — nothing here blocks the batch width.
 */
export function flowWorkCanRunInParallel(_repoRoot, _work) {
  return true;
}

/**
 * @param {string} _repoRoot
 * @param {ReturnType<loadUnifiedPortfolio>} portfolio
 * @param {ReturnType<effectiveOrchestratorFilters>} filters
 * @param {number} flowLimit
 */
export function selectFlowWorkBatch(_repoRoot, portfolio, filters, flowLimit) {
  const limit = Math.max(1, flowLimit);
  return findFlowWorkQueue(portfolio, filters, { limit }).map((work) => ({
    ...work,
    suiteId: fixSuiteForCell(work.entryPoint ?? "storybook", work.stepId)
  }));
}

/**
 * @param {ReturnType<loadUnifiedPortfolio>} portfolio
 * @param {ReturnType<effectiveOrchestratorFilters>} filters
 * @param {OrchestratorSort} [sortBy]
 */
export function findNextUnifiedWork(portfolio, filters, sortBy = "step_first") {
  const stepIds =
    filters.singleStepId && UNIFIED_STEP_ORDER.includes(filters.singleStepId)
      ? [filters.singleStepId]
      : UNIFIED_STEP_ORDER;

  if (sortBy === "worst_first") {
    /** @type {Array<ReturnType<summarizeUnifiedStep> & { score: number }>} */
    const candidates = [];
    for (const stepId of stepIds) {
      const s = summarizeUnifiedStep(portfolio, stepId, filters);
      if (s.complete) continue;
      const worst = s.failing[0]?.percent ?? 0;
      candidates.push({ ...s, score: worst + s.notTested.length * 0.01 });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] ?? null;
  }

  for (const stepId of stepIds) {
    const s = summarizeUnifiedStep(portfolio, stepId, filters);
    if (!s.complete) return s;
  }
  return null;
}

export function formatUnifiedStepStatus(status, stepLabel) {
  const parts = [];
  if (status.passed.length) parts.push(`${status.passed.length} pass`);
  if (status.failing.length) parts.push(`${status.failing.length} fail/warn`);
  if (status.notTested.length) parts.push(`${status.notTested.length} not tested`);
  if (status.blocked.length) parts.push(`${status.blocked.length} blocked`);
  return `${stepLabel ?? status.stepId} (${status.total} items): ${parts.join(", ") || "empty"}`;
}

/**
 * @param {string} repoRoot
 * @param {"pixel"|"figma"|"figmaLive"|"delivery"} suiteId
 * @param {Array<{ storyId: string }>} storybookItems
 * @param {(bin: string, args: string[], label: string) => Promise<number>} spawnOneAsync
 */
async function runStorybookGoldenPool(repoRoot, suiteId, storybookItems, spawnOneAsync) {
  const ids = storybookItems.map((i) => i.storyId);
  const settings = loadRunSettings();
  const workers = settings.parallelWorkers;
  const harnessEnv = harnessEnvForSuite(suiteId, workers);
  if (settings.processPool && ids.length > 1) {
    await spawnOneAsync(
      "node",
      [
        "scripts/test-console-golden-pool.mjs",
        "--suite",
        suiteId,
        "--stories",
        ids.join(","),
        "--workers",
        String(workers)
      ],
      `${suiteId} pool (${ids.length} stories × ${workers} workers)`,
      harnessEnv
    );
    return;
  }
  const storiesArg = ids.join(",");
  const cmd =
    suiteId === "pixel"
      ? ["pnpm", ["--filter", "@lab/pixel-test", "test:golden", "--", "--stories", storiesArg]]
      : suiteId === "figma"
        ? ["pnpm", ["--filter", "@lab/pixel-test", "test:figma:golden", "--", "--stories", storiesArg]]
        : suiteId === "figmaLive"
          ? [
              "pnpm",
              [
                "--filter",
                "@lab/pixel-test",
                "test:figma:live:golden",
                "--",
                "--stories",
                storiesArg
              ]
            ]
          : [
              "pnpm",
              [
                "--filter",
                "@lab/pixel-test",
                "test:delivery:golden",
                "--",
                "--stories",
                storiesArg
              ]
            ];
  await spawnOneAsync(cmd[0], cmd[1], `${suiteId} (${ids.length})`, harnessEnv);
}

/**
 * @param {string} repoRoot
 * @param {Array<{ storyId: string, entryPoint: string }>} items
 * @param {string} stepId
 * @param {(text: string) => void | Promise<void>} appendLog
 */
export async function runUnifiedGoldenBatch(repoRoot, items, stepId, appendLog) {
  const figmaScreens = discoverFigmaScreens(repoRoot);
  const manifestByScreen = new Map(figmaScreens.map((s) => [s.screenId, s.manifestPath]));

  const figmaItems = items.filter((i) => i.entryPoint === "figma");
  const storybookItems = items.filter((i) => i.entryPoint === "storybook");

  const spawnOneAsync = (bin, args, label, extraEnv = {}) =>
    new Promise((resolveSpawn) => {
      appendLog(`[portfolio] golden · ${label}\n`);
      const child = spawn(bin, args, {
        cwd: repoRoot,
        env: { ...process.env, FORCE_COLOR: "0", ...extraEnv },
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("close", (code) => {
        if (stdout) appendLog(stdout);
        if (stderr) appendLog(stderr);
        resolveSpawn(code ?? 1);
      });
      child.on("error", () => resolveSpawn(1));
    });

  if (stepId === "structural") {
    await Promise.all(
      figmaItems.map(async ({ storyId }) => {
        const manifest = manifestByScreen.get(storyId);
        if (!manifest) {
          await appendLog(`[portfolio] skip ${storyId} — no manifest\n`);
          return;
        }
        await spawnOneAsync(
          "node",
          ["scripts/figma-screen-manifest-test.mjs", "--artifact", manifest],
          storyId
        );
      })
    );
    if (storybookItems.length) {
      await runStorybookGoldenPool(repoRoot, "pixel", storybookItems, spawnOneAsync);
    }
    return;
  }

  if (stepId === "logic") {
    await Promise.all(
      figmaItems.map(async ({ storyId }) => {
        const manifest = manifestByScreen.get(storyId);
        if (!manifest) return;
        await spawnOneAsync(
          "node",
          ["scripts/figma-screen-logic-test.mjs", "--artifact", manifest],
          `logic figma ${storyId}`
        );
      })
    );
    if (storybookItems.length) {
      await spawnOneAsync("pnpm", ["test:logic:audit:all"], "logic storybook all");
    }
    return;
  }

  if (stepId === "vsFigmaLive") {
    await Promise.all(
      figmaItems.map(async ({ storyId }) => {
        const manifest = manifestByScreen.get(storyId);
        if (!manifest) return;
        await spawnOneAsync(
          "node",
          ["scripts/original-parity-test.mjs", "--artifact", manifest],
          `parity figma ${storyId}`
        );
      })
    );
    if (storybookItems.length) {
      await runStorybookGoldenPool(repoRoot, "figmaLive", storybookItems, spawnOneAsync);
    }
    return;
  }

  if (stepId === "vsStorybook" || stepId === "vsReactHtml") {
    await Promise.all([
      ...figmaItems.map(async ({ storyId }) => {
        const manifest = manifestByScreen.get(storyId);
        if (!manifest) return;
        await spawnOneAsync(
          "node",
          ["scripts/original-parity-test.mjs", "--artifact", manifest],
          `parity figma ${storyId}`
        );
      }),
      ...storybookItems.map(async ({ storyId }) => {
        await spawnOneAsync(
          "node",
          ["scripts/storybook-parity-test.mjs", "--story", storyId],
          `parity storybook ${storyId}`
        );
      })
    ]);
  }
}

/**
 * @param {string} code
 */
export function humanActionPayload(code) {
  const def = HUMAN_ACTIONS[code] ?? {
    title: "Orchestrator paused",
    message: String(code)
  };
  return {
    humanAction: code,
    humanTitle: def.title,
    humanMessage: def.message,
    exitReason: "HUMAN_ACTION",
    verdict: "BLOCKED",
    finished: true
  };
}
