/**
 * Developer Agent live activity — phases, log tail, agent labels for UI indicator.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export const ACTIVITY_PATH = ".test-console/developer-activity.json";
const LOG_MAX = 40;

/** @typedef {'audit' | 'implement'} ActivityKind */
/** @typedef {'running' | 'complete' | 'failed' | 'idle'} ActivityStatus */

export const AUDIT_STEPS = [
  { id: "dispatch", label: "Dispatch code architect" },
  { id: "agent", label: "Investigate codebase" },
  { id: "report", label: "Write findings & report" },
  { id: "done", label: "Audit complete" }
];

export const IMPLEMENT_STEPS = [
  { id: "sandbox", label: "Create isolated worktree" },
  { id: "agent", label: "Implement recommendations" },
  { id: "verify", label: "Run verification tests" },
  { id: "review", label: "Ready for approval" }
];

/**
 * @param {string} repoRoot
 */
export function activityFilePath(repoRoot) {
  return join(repoRoot, ACTIVITY_PATH);
}

/**
 * @param {string} repoRoot
 */
export function loadDeveloperActivity(repoRoot) {
  const path = activityFilePath(repoRoot);
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
export function saveDeveloperActivity(repoRoot, patch) {
  const path = activityFilePath(repoRoot);
  mkdirSync(join(repoRoot, ".test-console"), { recursive: true });
  const prev = loadDeveloperActivity(repoRoot) ?? {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  writeFileSync(path, JSON.stringify(next, null, 2));
  return next;
}

/**
 * @param {string} repoRoot
 */
export function clearDeveloperActivity(repoRoot) {
  const path = activityFilePath(repoRoot);
  if (existsSync(path)) unlinkSync(path);
  return { ok: true };
}

/**
 * @param {ActivityKind} kind
 */
function stepsForKind(kind) {
  return kind === "audit" ? AUDIT_STEPS : IMPLEMENT_STEPS;
}

/**
 * @param {string} repoRoot
 * @param {{ kind: ActivityKind, jobId: string, terminalTitle?: string, model?: string, detail?: string }} opts
 */
export function startDeveloperActivity(repoRoot, opts) {
  const steps = stepsForKind(opts.kind);
  return saveDeveloperActivity(repoRoot, {
    kind: opts.kind,
    jobId: opts.jobId,
    status: "running",
    phase: steps[0].id,
    phaseIndex: 0,
    startedAt: new Date().toISOString(),
    detail: opts.detail ?? steps[0].label,
    agentLabel: null,
    logTail: [],
    terminalTitle: opts.terminalTitle ?? (opts.kind === "audit" ? "Architect audit" : "Developer implement"),
    model: opts.model ?? null
  });
}

/**
 * @param {string} repoRoot
 * @param {string} phase
 * @param {string} [detail]
 */
export function setDeveloperActivityPhase(repoRoot, phase, detail) {
  const cur = loadDeveloperActivity(repoRoot);
  if (!cur) return null;
  const steps = stepsForKind(cur.kind);
  const idx = Math.max(0, steps.findIndex((s) => s.id === phase));
  return saveDeveloperActivity(repoRoot, {
    phase,
    phaseIndex: idx >= 0 ? idx : cur.phaseIndex ?? 0,
    detail: detail ?? steps[idx]?.label ?? cur.detail
  });
}

/**
 * @param {string} repoRoot
 * @param {string} line
 */
export function appendDeveloperActivityLog(repoRoot, line) {
  const cur = loadDeveloperActivity(repoRoot);
  if (!cur) return null;
  const trimmed = String(line).trim();
  if (!trimmed) return cur;
  const tail = [...(cur.logTail ?? []), trimmed].slice(-LOG_MAX);
  return saveDeveloperActivity(repoRoot, { logTail: tail });
}

/**
 * @param {string} repoRoot
 * @param {string} label
 */
export function setDeveloperActivityAgentLabel(repoRoot, label) {
  const cur = loadDeveloperActivity(repoRoot);
  if (!cur) return null;
  appendDeveloperActivityLog(repoRoot, label);
  return saveDeveloperActivity(repoRoot, { agentLabel: label });
}

/**
 * @param {string} repoRoot
 * @param {'complete' | 'failed'} status
 * @param {string} [detail]
 */
export function finishDeveloperActivity(repoRoot, status, detail) {
  const cur = loadDeveloperActivity(repoRoot);
  if (!cur) return null;
  const steps = stepsForKind(cur.kind);
  const donePhase = steps[steps.length - 1].id;
  return saveDeveloperActivity(repoRoot, {
    status,
    phase: status === "complete" ? donePhase : cur.phase,
    phaseIndex: status === "complete" ? steps.length - 1 : cur.phaseIndex,
    detail: detail ?? (status === "complete" ? "Finished" : "Failed"),
    completedAt: new Date().toISOString()
  });
}

/**
 * @param {object | null} activity
 */
function elapsedMs(activity) {
  if (!activity?.startedAt) return 0;
  const end = activity.completedAt ?? activity.updatedAt ?? new Date().toISOString();
  return Math.max(0, Date.parse(end) - Date.parse(activity.startedAt));
}

/**
 * @param {number} ms
 */
function formatElapsed(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

/**
 * Build API view — merge activity file + proposal/findings hints.
 * @param {string} repoRoot
 * @param {object | null} proposal
 * @param {object | null} findings
 */
export function buildDeveloperActivityView(repoRoot, proposal, findings) {
  let activity = loadDeveloperActivity(repoRoot);

  // Stale running (>2h without update) → treat as failed
  if (activity?.status === "running" && activity.updatedAt) {
    const staleMs = Date.now() - Date.parse(activity.updatedAt);
    if (staleMs > 2 * 60 * 60 * 1000) {
      activity = {
        ...activity,
        status: "failed",
        detail: "Activity timed out — dismiss and retry"
      };
    }
  }

  // Sync implement proposal running with activity if missing
  if (!activity && proposal?.status === "running") {
    activity = {
      kind: "implement",
      jobId: proposal.jobId,
      status: "running",
      phase: "agent",
      phaseIndex: 1,
      startedAt: proposal.createdAt,
      detail: "Sandbox implement in progress",
      logTail: [],
      terminalTitle: "Developer implement"
    };
  }

  if (!activity) {
    return { active: false, idle: true };
  }

  const steps = activity.kind === "audit" ? AUDIT_STEPS : IMPLEMENT_STEPS;
  const running = activity.status === "running";
  const phaseIndex =
    proposal?.status === "pending_approval" && activity.kind === "implement"
      ? IMPLEMENT_STEPS.length - 1
      : (activity.phaseIndex ?? 0);

  return {
    active: running || activity.status === "complete" || activity.status === "failed",
    idle: !running && activity.status !== "complete" && activity.status !== "failed",
    kind: activity.kind,
    jobId: activity.jobId,
    status: proposal?.status === "pending_approval" && activity.kind === "implement" ? "awaiting_approval" : activity.status,
    phase: proposal?.status === "pending_approval" ? "review" : activity.phase,
    phaseIndex,
    steps: steps.map((s, i) => ({
      ...s,
      state: i < phaseIndex ? "done" : i === phaseIndex && (running || proposal?.status === "pending_approval") ? "current" : "pending"
    })),
    detail: activity.detail,
    agentLabel: activity.agentLabel,
    logTail: activity.logTail ?? [],
    terminalTitle: activity.terminalTitle,
    model: activity.model,
    startedAt: activity.startedAt,
    updatedAt: activity.updatedAt,
    completedAt: activity.completedAt,
    elapsed: formatElapsed(elapsedMs(activity)),
    findingsReady: findings?.status === "complete"
  };
}
