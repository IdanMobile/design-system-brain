/**
 * Developer Agent sandbox proposals — isolated worktree edits with human approve/discard.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadPortfolioStoryIds } from "./test-portfolio-config.mjs";
import { readStoryResultFromDisk } from "./test-console-run-settings.mjs";
import { promoteSandboxFiles, teardownSandbox } from "./sandbox-worktree.mjs";
import { gitRestorePaths } from "./sandbox-promote.mjs";
import { touchedSharedAdapter } from "./test-console-worker-supervisor.mjs";

export const PROPOSAL_PATH = ".test-console/developer-proposal.json";

const SUITE_IDS = ["pixel", "figma", "figmaLive", "delivery"];

/**
 * @param {string} repoRoot
 */
export function proposalFilePath(repoRoot) {
  return join(repoRoot, PROPOSAL_PATH);
}

/**
 * @param {string} repoRoot
 */
export function loadDeveloperProposal(repoRoot) {
  const path = proposalFilePath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {string} repoRoot
 * @param {object} patch
 */
export function saveDeveloperProposal(repoRoot, patch) {
  const path = proposalFilePath(repoRoot);
  mkdirSync(join(repoRoot, ".test-console"), { recursive: true });
  const prev = loadDeveloperProposal(repoRoot) ?? {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  writeFileSync(path, JSON.stringify(next, null, 2));
  return next;
}

/**
 * Portfolio pass/fail counts per suite (from cached report files on disk).
 * @param {string} repoRoot
 */
export function capturePortfolioSnapshot(repoRoot) {
  const storyIds = loadPortfolioStoryIds(repoRoot, readFileSync, existsSync, join);
  /** @type {Record<string, { pass: number, fail: number, warn: number, not_tested: number, total: number }>} */
  const suites = {};
  for (const suiteId of SUITE_IDS) {
    let pass = 0;
    let fail = 0;
    let warn = 0;
    let not_tested = 0;
    for (const storyId of storyIds) {
      const rec = readStoryResultFromDisk(repoRoot, suiteId, storyId);
      const status = rec?.status ?? "not_tested";
      if (status === "pass") pass += 1;
      else if (status === "warn") warn += 1;
      else if (status === "not_tested") not_tested += 1;
      else fail += 1;
    }
    suites[suiteId] = {
      pass,
      fail,
      warn,
      not_tested,
      total: storyIds.length
    };
  }
  const totalPass = Object.values(suites).reduce((n, s) => n + s.pass, 0);
  const totalCells = Object.values(suites).reduce((n, s) => n + s.total, 0);
  return {
    capturedAt: new Date().toISOString(),
    storyCount: storyIds.length,
    suites,
    totalPass,
    totalCells,
    successRate: totalCells ? totalPass / totalCells : 0
  };
}

/**
 * @param {ReturnType<typeof capturePortfolioSnapshot>} before
 * @param {ReturnType<typeof capturePortfolioSnapshot>} after
 */
export function comparePortfolioSnapshots(before, after) {
  /** @type {Array<{ suiteId: string, passDelta: number, failDelta: number }>} */
  const deltas = [];
  let passDelta = 0;
  let failDelta = 0;
  for (const suiteId of SUITE_IDS) {
    const b = before.suites[suiteId];
    const a = after.suites[suiteId];
    const dPass = a.pass - b.pass;
    const dFail = a.fail - b.fail;
    passDelta += dPass;
    failDelta += dFail;
    if (dPass !== 0 || dFail !== 0) {
      deltas.push({ suiteId, passDelta: dPass, failDelta: dFail });
    }
  }
  return {
    passDelta,
    failDelta,
    successRateBefore: before.successRate,
    successRateAfter: after.successRate,
    successRateDelta: after.successRate - before.successRate,
    improved: passDelta > 0 || failDelta < 0,
    regressed: failDelta > 0 || passDelta < 0,
    deltas
  };
}

/**
 * @param {string} repoRoot
 * @param {string} worktreePath
 */
export function findProposalReport(repoRoot, worktreePath) {
  const specsDir = join(worktreePath, "docs", "superpowers", "specs");
  if (!existsSync(specsDir)) return null;
  const candidates = readdirSync(specsDir)
    .filter((f) => f.includes("developer-proposal") && f.endsWith(".md"))
    .sort()
    .reverse();
  if (!candidates.length) return null;
  const rel = `docs/superpowers/specs/${candidates[0]}`;
  const abs = join(worktreePath, rel);
  const content = readFileSync(abs, "utf8");
  return {
    path: rel,
    excerpt: content.slice(0, 4000),
    fullLength: content.length
  };
}

/**
 * Temporarily copy worktree edits to main, verify, restore main (worktree kept).
 * @param {string} repoRoot
 * @param {string} worktreePath
 * @param {string[]} filesChanged
 */
export function verifyWorktreeChanges(repoRoot, worktreePath, filesChanged) {
  const tracked = filesChanged.filter((f) => f && !f.startsWith(".test-console/"));
  if (!tracked.length) {
    const snap = capturePortfolioSnapshot(repoRoot);
    return {
      ok: false,
      supervisorExit: 1,
      regressionExit: null,
      baseline: snap,
      after: snap,
      comparison: comparePortfolioSnapshots(snap, snap),
      error: "No tracked files changed"
    };
  }

  const baseline = capturePortfolioSnapshot(repoRoot);
  promoteSandboxFiles(repoRoot, worktreePath, tracked);

  const supervisor = spawnSync("pnpm", ["test:supervisor"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, FORCE_COLOR: "0" }
  });

  let regressionExit = null;
  if (touchedSharedAdapter(tracked)) {
    const reg = spawnSync("pnpm", ["test:regression"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, FORCE_COLOR: "0" },
      timeout: 1_800_000
    });
    regressionExit = reg.status ?? 1;
  }

  const after = capturePortfolioSnapshot(repoRoot);
  const comparison = comparePortfolioSnapshots(baseline, after);
  gitRestorePaths(repoRoot, tracked);

  const supervisorOk = (supervisor.status ?? 1) === 0;
  const regressionOk = regressionExit === null || regressionExit === 0;
  const portfolioOk = !comparison.regressed;

  return {
    ok: supervisorOk && regressionOk && portfolioOk,
    supervisorExit: supervisor.status ?? 1,
    regressionExit,
    baseline,
    after,
    comparison,
    portfolioOk,
    supervisorOk,
    regressionOk
  };
}

/**
 * @param {string} repoRoot
 */
export function approveDeveloperProposal(repoRoot) {
  const proposal = loadDeveloperProposal(repoRoot);
  if (!proposal) return { ok: false, error: "No proposal on disk" };
  if (proposal.status !== "pending_approval") {
    return { ok: false, error: `Proposal status is ${proposal.status}, not pending_approval` };
  }
  if (!proposal.sandbox?.path || !existsSync(proposal.sandbox.path)) {
    return { ok: false, error: "Sandbox worktree missing — re-run implement or discard" };
  }

  const files = proposal.changedFiles ?? [];
  const promoted = promoteSandboxFiles(repoRoot, proposal.sandbox.path, files);
  teardownSandbox(proposal.sandbox, repoRoot);

  saveDeveloperProposal(repoRoot, {
    status: "approved",
    approvedAt: new Date().toISOString(),
    promotedFiles: promoted
  });

  return { ok: true, promotedFiles: promoted };
}

/**
 * @param {string} repoRoot
 */
export function discardDeveloperProposal(repoRoot) {
  const proposal = loadDeveloperProposal(repoRoot);
  if (!proposal) return { ok: false, error: "No proposal on disk" };
  if (proposal.sandbox?.path && existsSync(proposal.sandbox.path)) {
    teardownSandbox(proposal.sandbox, repoRoot);
  }
  saveDeveloperProposal(repoRoot, {
    status: "discarded",
    discardedAt: new Date().toISOString()
  });
  return { ok: true };
}

/**
 * @param {object | null} proposal
 */
export function proposalForApi(proposal) {
  if (!proposal) return null;
  const sandboxAlive =
    proposal.sandbox?.path && existsSync(proposal.sandbox.path) ? true : false;
  return { ...proposal, sandboxAlive };
}
