/**
 * Quick-component-generation portfolio — separate from strict test portfolio.
 * One row per quick publish job (not mixed with the 59-item test matrix).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  buildUnifiedPortfolioState,
  UNIFIED_STEPS,
  UNIFIED_STEP_ORDER
} from "./build-unified-portfolio.mjs";
import { discoverFigmaScreens } from "./figma-screen-portfolio.mjs";
import { quickStepProceeds, QUICK_COMPONENT_GATE_TOLERANCE } from "./quick-component-gate.mjs";

export const QUICK_GENERATION_DIR = "test-portfolio/quick-generation";
export const QUICK_RUNS_DIR = join(QUICK_GENERATION_DIR, "runs");

function toRepoPath(repoRoot, absPath) {
  if (!absPath) return null;
  const normalized = absPath.replace(/\\/g, "/");
  const repo = repoRoot.replace(/\\/g, "/");
  if (normalized.startsWith(repo)) {
    return `/repo/${normalized.slice(repo.length).replace(/^\//, "")}`;
  }
  return null;
}

/**
 * @param {string} repoRoot
 * @param {object} entry
 */
/** Persist a row as soon as the lab accepts the job (so Quick generation tab updates immediately). */
export function recordQuickGenerationJobStarted(repoRoot, job) {
  const screenId = job.quickComponentPayload?.screenId ?? job.storyId ?? "pending";
  recordQuickGenerationRun(repoRoot, {
    jobId: job.id,
    screenId,
    componentName: job.quickComponentPayload?.componentName ?? null,
    jobStatus: "running",
    summary: "Pipeline started…",
    stepCells: {},
    startedAt: job.startedAt ?? new Date().toISOString(),
    completedAt: null,
    packageTarballPath: null,
    quickGatePct: QUICK_COMPONENT_GATE_TOLERANCE
  });
}

/** Update run record when job finishes (pass, fail, or kill). */
export function recordQuickGenerationJobFinished(repoRoot, job) {
  const result = job.quickComponentResult;
  if (result?.screenId) {
    persistQuickRunFromResult(repoRoot, job.id, result, { startedAt: job.startedAt });
    return;
  }

  const screenId = job.quickComponentPayload?.screenId ?? job.storyId;
  if (!screenId) return;

  const logs = job.logs ?? [];
  const errLine = [...logs]
    .reverse()
    .map((l) => String(l))
    .find((l) => l.includes("[quick] ERROR:") || l.includes("Error:"));
  const summary =
    errLine?.replace(/^[^\n]*\[quick\] ERROR:\s*/i, "").trim() ||
    (job.status === "killed" ? "cancelled" : `Job ${job.status ?? "failed"}`);

  recordQuickGenerationRun(repoRoot, {
    jobId: job.id,
    screenId,
    componentName: job.quickComponentPayload?.componentName ?? null,
    jobStatus: job.status === "passed" ? "passed" : job.status === "killed" ? "killed" : "failed",
    summary,
    stepCells: result?.stepCells ?? {},
    startedAt: job.startedAt ?? null,
    completedAt: job.endedAt ?? new Date().toISOString(),
    packageTarballPath: null,
    quickGatePct: QUICK_COMPONENT_GATE_TOLERANCE
  });
}

export function recordQuickGenerationRun(repoRoot, entry) {
  const dir = join(repoRoot, QUICK_RUNS_DIR);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${entry.jobId}.json`);
  writeFileSync(path, JSON.stringify(entry, null, 2) + "\n", "utf8");
  const portfolio = buildQuickGenerationPortfolio(repoRoot);
  writeFileSync(
    join(repoRoot, QUICK_GENERATION_DIR, "portfolio.json"),
    JSON.stringify(portfolio, null, 2) + "\n",
    "utf8"
  );
  return portfolio;
}

/**
 * @param {string} repoRoot
 */
function loadRunRecords(repoRoot) {
  const dir = join(repoRoot, QUICK_RUNS_DIR);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  /** @type {object[]} */
  const runs = [];
  for (const f of files) {
    try {
      runs.push(JSON.parse(readFileSync(join(dir, f), "utf8")));
    } catch {
      /* skip corrupt */
    }
  }
  runs.sort((a, b) => String(b.startedAt ?? "").localeCompare(String(a.startedAt ?? "")));
  return runs;
}

/**
 * @param {string} repoRoot
 * @param {{ activeJobs?: object[] }} [opts]
 */
export function buildQuickGenerationPortfolio(repoRoot, opts = {}) {
  const runs = loadRunRecords(repoRoot);
  const screenIds = discoverFigmaScreens(repoRoot).map((s) => s.screenId);
  const unified = buildUnifiedPortfolioState(repoRoot, screenIds, () => false);
  /** @type {Map<string, object>} */
  const figmaRowByScreen = new Map(
    unified.rows.filter((r) => r.entryPoint === "figma").map((r) => [r.storyId, r])
  );

  /** @type {object[]} */
  const rows = [];

  for (const run of runs) {
    const base = figmaRowByScreen.get(run.screenId);
    const cells = { ...(base?.cells ?? {}) };

    for (const stepId of UNIFIED_STEP_ORDER) {
      const snap = run.stepCells?.[stepId];
      const existing = cells[stepId] ?? { status: "not_tested" };
      cells[stepId] = {
        ...existing,
        status: snap?.status ?? existing.status,
        percent: snap?.percent ?? existing.percent,
        gateMode: "quick",
        quickProceeded: snap ? quickStepProceeds(snap) : undefined,
        blockedReason: snap?.error ?? existing.blockedReason
      };
    }

    rows.push({
      storyId: run.screenId,
      entryPoint: "figma",
      originalUrl: base?.originalUrl ?? null,
      cells,
      jobId: run.jobId,
      componentName: run.componentName ?? null,
      jobStatus: run.jobStatus ?? "unknown",
      jobSummary: run.summary ?? null,
      anthropicMode: run.anthropicMode ?? null,
      startedAt: run.startedAt ?? null,
      completedAt: run.completedAt ?? null,
      packageDownloadUrl: run.packageTarballPath
        ? toRepoPath(repoRoot, run.packageTarballPath)
        : null,
      quickGatePct: run.quickGatePct ?? QUICK_COMPONENT_GATE_TOLERANCE
    });
  }

  for (const job of opts.activeJobs ?? []) {
    if (job.action !== "quick-component-generation") continue;
    if (job.status !== "running" && !job.finalizing) continue;
    const screenId = job.quickComponentPayload?.screenId ?? job.storyId;
    if (!screenId) continue;
    const existing = rows.find((r) => r.jobId === job.id);
    if (existing) {
      existing.jobStatus = "running";
      continue;
    }

    const base = figmaRowByScreen.get(screenId);
    rows.unshift({
      storyId: screenId,
      entryPoint: "figma",
      originalUrl: base?.originalUrl ?? null,
      cells: base?.cells ?? {},
      jobId: job.id,
      componentName: job.quickComponentPayload?.componentName ?? null,
      jobStatus: "running",
      jobSummary: null,
      anthropicMode: null,
      startedAt: job.startedAt ?? null,
      completedAt: null,
      packageDownloadUrl: null,
      quickGatePct: QUICK_COMPONENT_GATE_TOLERANCE
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    storyCount: rows.length,
    source: "quick-generation",
    itemLabel: "Item",
    entryPointLabel: "EntryPoint",
    steps: UNIFIED_STEPS,
    stepIds: UNIFIED_STEP_ORDER,
    quickGatePct: QUICK_COMPONENT_GATE_TOLERANCE,
    reportTolerance: 0.1,
    rows,
    htmlUrl: "/repo/test-portfolio/quick-generation/index.html"
  };
}

/**
 * @param {string} repoRoot
 * @param {string} jobId
 * @param {object} result from runQuickComponentGeneration
 * @param {object} jobMeta
 */
export function persistQuickRunFromResult(repoRoot, jobId, result, jobMeta = {}) {
  const tarballPath = result?.generatedPackage?.tarballPath ?? null;
  recordQuickGenerationRun(repoRoot, {
    jobId,
    screenId: result.screenId,
    componentName: result.componentName,
    summary: result.summary,
    jobStatus: result.ok ? "passed" : "failed",
    anthropicMode: result.mode ?? null,
    stepCells: result.stepCells ?? {},
    quickGatePct: result.quickGatePct ?? QUICK_COMPONENT_GATE_TOLERANCE,
    startedAt: jobMeta.startedAt ?? null,
    completedAt: new Date().toISOString(),
    packageTarballPath: tarballPath
  });
}

/**
 * Remove one quick-generation run record only — does not touch test portfolio artifacts.
 * @param {string} repoRoot
 * @param {string} jobId
 */
export function deleteQuickGenerationRun(repoRoot, jobId) {
  if (!jobId || typeof jobId !== "string") {
    throw new Error("jobId is required");
  }
  const runPath = join(repoRoot, QUICK_RUNS_DIR, `${jobId}.json`);
  if (!existsSync(runPath)) {
    throw new Error(`Quick generation run not found: ${jobId}`);
  }
  unlinkSync(runPath);
  const portfolio = buildQuickGenerationPortfolio(repoRoot);
  writeFileSync(
    join(repoRoot, QUICK_GENERATION_DIR, "portfolio.json"),
    JSON.stringify(portfolio, null, 2) + "\n",
    "utf8"
  );
  return {
    ok: true,
    jobId,
    removedCount: 1,
    removedPaths: [runPath],
    scope: "quick-generation-run-only"
  };
}
