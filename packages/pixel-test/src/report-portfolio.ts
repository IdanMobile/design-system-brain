/**
 * Per-story result files + merged suite reports + master portfolio.
 *
 * Layout per suite (e.g. figma-diffs/):
 *   by-story/<story-segment>/result.json   — latest run for that story only
 *   <story-segment>/…                     — PNG artifacts (unchanged)
 *   report.json / report.html             — merged view (all portfolio stories)
 *
 * Master: test-portfolio/portfolio.json + report.html
 */

import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  PORTFOLIO_STORY_IDS,
  TEST_STEPS,
  recommendAction,
  recommendActionForRow,
  canRunStep,
  resolvePipelineStatuses,
  type StepStatus,
  type TestStepId
} from "../../contract/src/test-portfolio.ts";
import { isStorybookOnlyStory } from "../../contract/src/stories.ts";

export function safeStorySegment(storyId: string): string {
  return storyId
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function storyResultPath(outDir: string, storyId: string): string {
  return resolve(outDir, "by-story", safeStorySegment(storyId), "result.json");
}

export interface StoryResultRecord {
  storyId: string;
  status: string;
  percent: number;
  maxRegionPercent?: number;
  error?: string;
  /** Set on write; optional on in-memory harness rows */
  testedAt?: string;
  width?: number;
  height?: number;
  pixelsDiffered?: number;
  pixelsTotal?: number;
  storybookPng?: string;
  renderedPng?: string;
  figmaPng?: string;
  diffPng?: string;
  artifactPath?: string;
  sceneJsonPath?: string;
  diffRegions?: unknown[];
  /** Delivery-only legs */
  storybookVsFigma?: { percent?: number; status?: string; diffPng?: string };
  storybookVsDev?: { percent?: number; status?: string; diffPng?: string };
  devVsFigma?: { percent?: number; status?: string; diffPng?: string };
  hasDevPackage?: boolean;
  /** Logic audit — per-story interaction demo */
  demoVideo?: string;
}

/** Cast harness rows for legacy HTML reporters that expect suite-specific result shapes. */
export function storyResultsForHtmlReport<T>(results: StoryResultRecord[]): T[] {
  return results.filter((r) => r.status !== "not_tested" && r.status !== "skipped") as unknown as T[];
}

export async function writePerStoryResult(
  outDir: string,
  result: StoryResultRecord
): Promise<void> {
  const path = storyResultPath(outDir, result.storyId);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({ ...result, testedAt: result.testedAt ?? new Date().toISOString() }, null, 2)
  );
}

export async function readPerStoryResult(
  outDir: string,
  storyId: string
): Promise<StoryResultRecord | null> {
  const path = storyResultPath(outDir, storyId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as StoryResultRecord;
  } catch {
    return null;
  }
}

export async function loadPortfolioStoryIds(repoRoot?: string): Promise<string[]> {
  const root = repoRoot ?? resolve(process.cwd(), "../..");
  const indexPath = resolve(root, "artifacts/stories.index.json");
  if (existsSync(indexPath)) {
    try {
      const raw = JSON.parse(await readFile(indexPath, "utf8")) as {
        stories?: { id: string }[];
      };
      const ids = (raw.stories ?? []).map((s) => s.id).filter(Boolean);
      if (ids.length) return [...ids].sort();
    } catch {
      /* fall through */
    }
  }
  return [...PORTFOLIO_STORY_IDS].sort();
}

export function getDefaultConcurrency(suite: "pixel" | "figma" | "figmaLive" | "delivery" | "logic"): number {
  const step = TEST_STEPS.find((s) => s.id === suite);
  if (step?.serialOnly) return 1;
  const n = Number(process.env.TEST_PARALLEL ?? "4");
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 20) : 4;
}

/** Run story jobs with a bounded pool (separate browser contexts per story). */
/** Serialize suite report.json writes (parallel pool stories finish together). */
const suiteReportWriteChains = new Map<string, Promise<void>>();

function enqueueSuiteReportWrite(outDir: string, task: () => Promise<void>): Promise<void> {
  const prev = suiteReportWriteChains.get(outDir) ?? Promise.resolve();
  const next = prev.then(task).catch((err) => {
    console.error(`[report] Failed to update ${outDir}:`, err);
  });
  suiteReportWriteChains.set(outDir, next);
  return next;
}

/** After each story: per-story file + merged report.html/json + master portfolio. */
export async function persistStoryProgress(options: {
  outDir: string;
  repoRoot: string;
  result: StoryResultRecord;
  meta: MergeSuiteMeta;
  writeHtml: (results: StoryResultRecord[]) => string;
  refreshPortfolio?: boolean;
}): Promise<void> {
  return enqueueSuiteReportWrite(options.outDir, async () => {
    await writePerStoryResult(options.outDir, {
      ...options.result,
      testedAt: options.result.testedAt ?? new Date().toISOString()
    });
    const portfolioIds = await loadPortfolioStoryIds(options.repoRoot);
    await writeSuiteReports(
      options.outDir,
      portfolioIds,
      options.meta,
      options.writeHtml
    );
    if (options.refreshPortfolio !== false) {
      await refreshMasterPortfolio(options.repoRoot);
    }
  });
}

export async function runStoriesPool<T extends { storyId: string }>(
  storyIds: string[],
  runOne: (storyId: string) => Promise<T>,
  concurrency: number,
  onProgress?: (storyId: string, result: T) => void | Promise<void>
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < storyIds.length) {
      const i = index++;
      const id = storyIds[i]!;
      const result = await runOne(id);
      results.push(result);
      if (onProgress) await onProgress(id, result);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, storyIds.length) }, () => worker());
  await Promise.all(workers);
  results.sort((a, b) => storyIds.indexOf(a.storyId) - storyIds.indexOf(b.storyId));
  return results;
}

export interface MergeSuiteMeta {
  generatedAt: string;
  baseUrl?: string;
  tolerance?: number;
  regionTolerance?: number;
}

export async function mergeSuiteReport(
  outDir: string,
  portfolioStoryIds: string[],
  meta: MergeSuiteMeta
): Promise<StoryResultRecord[]> {
  const merged: StoryResultRecord[] = [];
  for (const storyId of portfolioStoryIds) {
    const existing = await readPerStoryResult(outDir, storyId);
    if (existing) {
      merged.push({ ...existing, storyId });
    } else {
      merged.push({
        storyId,
        status: "not_tested",
        percent: 0,
        testedAt: meta.generatedAt
      });
    }
  }
  return merged;
}

export async function writeSuiteReports(
  outDir: string,
  portfolioStoryIds: string[],
  meta: MergeSuiteMeta,
  writeHtml: (results: StoryResultRecord[]) => string
): Promise<StoryResultRecord[]> {
  const results = await mergeSuiteReport(outDir, portfolioStoryIds, meta);
  await mkdir(outDir, { recursive: true });
  await writeFile(
    resolve(outDir, "report.json"),
    JSON.stringify({ ...meta, results }, null, 2)
  );
  await writeFile(resolve(outDir, "report.html"), writeHtml(results));
  return results;
}

export interface PortfolioCell {
  stepId: TestStepId;
  status: StepStatus;
  percent?: number;
  maxRegionPercent?: number;
  testedAt?: string | null;
  canRun?: boolean;
  blockedBy?: TestStepId | null;
  blockedReason?: string | null;
  action: string;
  compareUrl?: string | null;
}

export interface PortfolioRow {
  storyId: string;
  storybookOnly?: boolean;
  cells: Record<TestStepId, PortfolioCell>;
}

function normalizeStepStatus(status: string | undefined): StepStatus {
  if (!status || status === "not_tested") return "not_tested";
  if (status === "gap") return "warn";
  return status as StepStatus;
}

async function purgeInvalidPipelineResults(
  repoRoot: string,
  storyIds: string[]
): Promise<number> {
  let removed = 0;
  for (const storyId of storyIds) {
    const storybookOnly = isStorybookOnlyStory(storyId);
    const raw = {} as Partial<Record<TestStepId, StepStatus>>;
    for (const step of TEST_STEPS) {
      const rec = await readPerStoryResult(resolve(repoRoot, step.dir), storyId);
      raw[step.id] =
        rec && rec.status !== "not_tested" ? (rec.status as StepStatus) : "not_tested";
    }
    const effective = resolvePipelineStatuses(raw, { storybookOnly });
    for (const step of TEST_STEPS) {
      const eff = effective[step.id];
      const rawStatus = raw[step.id] ?? "not_tested";
      if (eff === rawStatus) continue;
      const path = storyResultPath(resolve(repoRoot, step.dir), storyId);
      if (existsSync(path)) {
        await unlink(path);
        removed += 1;
      }
    }
  }
  return removed;
}

export async function refreshMasterPortfolio(repoRoot: string): Promise<void> {
  const storyIds = await loadPortfolioStoryIds(repoRoot);
  await purgeInvalidPipelineResults(repoRoot, storyIds);
  const generatedAt = new Date().toISOString();
  const rows: PortfolioRow[] = [];

  for (const storyId of storyIds) {
    const cells = {} as Record<TestStepId, PortfolioCell>;
    const storybookOnly = isStorybookOnlyStory(storyId);
    const rawStatuses = {} as Partial<Record<TestStepId, StepStatus>>;

    for (const step of TEST_STEPS) {
      const outDir = resolve(repoRoot, step.dir);
      const rec = await readPerStoryResult(outDir, storyId);
      rawStatuses[step.id] =
        rec && rec.status !== "not_tested" ? normalizeStepStatus(rec.status) : "not_tested";
    }

    const effectiveStatuses = resolvePipelineStatuses(rawStatuses, { storybookOnly });
    const statusByStep = {} as Partial<Record<TestStepId, { status?: StepStatus }>>;
    for (const step of TEST_STEPS) {
      statusByStep[step.id] = { status: effectiveStatuses[step.id] };
    }

    for (const step of TEST_STEPS) {
      const outDir = resolve(repoRoot, step.dir);
      const rec = await readPerStoryResult(outDir, storyId);
      const status = effectiveStatuses[step.id];
      let percent: number | undefined;
      let maxRegionPercent: number | undefined;
      let testedAt: string | null = null;
      let compareUrl: string | null = null;

      if (rec && status !== "not_tested" && status !== "skipped") {
        percent = rec.percent;
        maxRegionPercent = rec.maxRegionPercent;
        testedAt = rec.testedAt ?? null;
        const seg = safeStorySegment(storyId);
        const region = (rec.diffRegions as { compare?: string }[] | undefined)?.[0]?.compare;
        if (step.id === "logic") {
          const demo = (rec as StoryResultRecord).demoVideo;
          compareUrl = demo ? join(step.dir, demo) : join(step.dir, "report.html");
        } else if (region) {
          compareUrl = join(step.dir, seg, region);
        }
      }

      const gate = canRunStep(step.id, statusByStep, { storybookOnly });

      cells[step.id] = {
        stepId: step.id,
        status,
        percent: status !== "not_tested" && status !== "skipped" ? percent : undefined,
        maxRegionPercent: status !== "not_tested" && status !== "skipped" ? maxRegionPercent : undefined,
        testedAt: status !== "not_tested" && status !== "skipped" ? testedAt : null,
        canRun: gate.ok,
        blockedBy: gate.ok ? null : gate.blockedBy,
        blockedReason: gate.ok ? null : gate.reason,
        action: recommendActionForRow(step.id, status, statusByStep, {
          percent,
          storybookOnly,
          error: rec?.error
        }),
        compareUrl: status !== "not_tested" && status !== "skipped" ? compareUrl : null
      };
    }
    rows.push({
      storyId,
      storybookOnly,
      cells
    });
  }

  const outDir = resolve(repoRoot, "test-portfolio");
  await mkdir(outDir, { recursive: true });

  const portfolio = {
    generatedAt,
    storyCount: storyIds.length,
    steps: TEST_STEPS.map((s) => ({ id: s.id, label: s.label, dir: s.dir, actionId: s.actionId })),
    stories: storyIds,
    rows
  };

  await writeFile(resolve(outDir, "portfolio.json"), JSON.stringify(portfolio, null, 2));
  await writeFile(resolve(outDir, "report.html"), writePortfolioHtml(portfolio));
}

function writePortfolioHtml(portfolio: {
  generatedAt: string;
  storyCount: number;
  steps: { id: string; label: string }[];
  rows: PortfolioRow[];
}): string {
  const stepHeaders = portfolio.steps
    .map((s) => `<th colspan="2">${escapeHtml(s.label)}</th>`)
    .join("");
  const subHeaders = portfolio.steps
    .map(() => `<th>Status</th><th>Action</th>`)
    .join("");

  const body = portfolio.rows
    .map((row) => {
      const cells = portfolio.steps
        .map((s) => {
          const c = row.cells[s.id as TestStepId];
          const cls = c.status === "not_tested" ? "muted" : c.status;
          const pct =
            c.percent != null && c.status !== "not_tested"
              ? `<br><span class="pct">${c.percent.toFixed(2)}%</span>`
              : "";
          const link = c.compareUrl
            ? `<br><a href="../${c.compareUrl}">compare</a>`
            : "";
          return `<td><span class="badge ${cls}">${c.status}</span>${pct}${link}</td><td class="action">${escapeHtml(c.action)}</td>`;
        })
        .join("");
      return `<tr><td><code>${escapeHtml(row.storyId)}</code></td>${cells}</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Test portfolio</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;background:#0f1419;color:#e6edf3}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid #30363d;padding:8px 10px;vertical-align:top}
th{background:#161b22}
.badge{font-weight:600;text-transform:uppercase;font-size:11px}
.pass{color:#3fb950}.warn{color:#d29922}.fail,.error{color:#f85149}
.not_tested,.muted{color:#8b949e}
.pct{color:#8b949e;font-size:11px}
.action{max-width:200px;color:#8b949e}
a{color:#58a6ff}
</style></head><body>
<h1>Storybook → Figma · Test portfolio</h1>
<p>${portfolio.storyCount} stories · ${portfolio.steps.length} test steps · ${new Date(portfolio.generatedAt).toLocaleString()}</p>
<table>
<thead>
<tr><th rowspan="2">Story</th>${stepHeaders}</tr>
<tr>${subHeaders}</tr>
</thead>
<tbody>${body}</tbody>
</table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** After a harness run, ensure suite + portfolio match latest per-story files. */
export async function finalizeHarnessRun(options: {
  outDir: string;
  repoRoot: string;
  ranResults: StoryResultRecord[];
  meta: MergeSuiteMeta;
  writeHtml: (results: StoryResultRecord[]) => string;
}): Promise<StoryResultRecord[]> {
  let merged: StoryResultRecord[] = [];
  await enqueueSuiteReportWrite(options.outDir, async () => {
    for (const r of options.ranResults) {
      await writePerStoryResult(options.outDir, {
        ...r,
        testedAt: r.testedAt ?? new Date().toISOString()
      });
    }
    const portfolioIds = await loadPortfolioStoryIds(options.repoRoot);
    merged = await writeSuiteReports(
      options.outDir,
      portfolioIds,
      options.meta,
      options.writeHtml
    );
    await refreshMasterPortfolio(options.repoRoot);
  });
  return merged;
}
