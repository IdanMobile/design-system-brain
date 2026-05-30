#!/usr/bin/env node
/**
 * Local worker supervisor — logical agent roster, heartbeats, file-based event bus.
 * Phase 3 local-first (no cloud WSS). See upload_to_cloud/AGENT-PLATFORM.md.
 *
 *   pnpm lab:supervisor start    # daemon (heartbeats every 5s)
 *   pnpm lab:supervisor status   # print fleet JSON
 *   pnpm lab:supervisor stop     # request daemon stop
 *   pnpm lab:supervisor init     # register roster without daemon
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOrchestratorState } from "./test-console-worker-supervisor.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const AGENT_ROSTER = [
  { id: "orchestrator", purpose: "Schedule, gate, assign", capabilities: ["rules"] },
  { id: "infra", purpose: "Storybook, relay, plugin build", capabilities: ["infra", "macos"] },
  { id: "investigator", purpose: "Diagnose before edit", capabilities: ["read-only"] },
  { id: "pixel-fixer", purpose: "Pixel step 1", capabilities: ["pixel"] },
  { id: "mock-figma-fixer", purpose: "Figma mock step 2", capabilities: ["figma-mock"] },
  { id: "live-figma-fixer", purpose: "Figma live step 3", capabilities: ["figma-live", "macos"] },
  { id: "delivery-fixer", purpose: "Delivery step 4", capabilities: ["delivery"] },
  { id: "verifier", purpose: "Tier A/B/C regression", capabilities: ["test"] },
  { id: "merge-captain", purpose: "Review sandbox code changes before promotion", capabilities: ["review", "merge-gate"] }
];

const STOP_FLAG = "supervisor.stop";
const SUPERVISOR_JSON = "supervisor.json";
const AGENTS_JSON = "agents.json";
const EVENTS_LOG = "events.jsonl";

/** @param {string} [repoRoot] */
export function fleetDir(repoRoot = ROOT) {
  return join(repoRoot, ".test-console", "fleet");
}

/** @param {string} suiteId */
export function fixerAgentIdForSuite(suiteId) {
  if (suiteId === "pixel") return "pixel-fixer";
  if (suiteId === "figma") return "mock-figma-fixer";
  if (suiteId === "figmaLive") return "live-figma-fixer";
  if (suiteId === "delivery") return "delivery-fixer";
  return "orchestrator";
}

/**
 * @param {string} [repoRoot]
 * @returns {{ updatedAt: string, agents: object[] }}
 */
export function loadFleetAgents(repoRoot = ROOT) {
  const path = join(fleetDir(repoRoot), AGENTS_JSON);
  if (!existsSync(path)) return { updatedAt: null, agents: [] };
  try {
    return reconcileFleetRoster(repoRoot, JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return { updatedAt: null, agents: [] };
  }
}

/**
 * @param {string} [repoRoot]
 * @param {object[]} agents
 */
export function writeFleetAgents(repoRoot, agents) {
  const dir = fleetDir(repoRoot);
  mkdirSync(dir, { recursive: true });
  const body = { updatedAt: new Date().toISOString(), agents };
  writeFileSync(join(dir, AGENTS_JSON), JSON.stringify(body, null, 2));
  return body;
}

function rosterAgentState(agent, now = new Date().toISOString()) {
  return {
    ...agent,
    status: "idle",
    workerNode: process.env.LAB_WORKER_NODE_ID ?? "local-mac",
    since: now,
    currentTask: null
  };
}

/**
 * Keep persisted fleet state in sync when AGENT_ROSTER gains a new logical
 * worker, without resetting active status for existing agents.
 * @param {string} repoRoot
 * @param {{ updatedAt: string | null, agents: object[] }} data
 */
export function reconcileFleetRoster(repoRoot, data) {
  const now = new Date().toISOString();
  const existingById = new Map((data.agents ?? []).map((a) => [a.id, a]));
  let changed = false;
  const agents = AGENT_ROSTER.map((rosterAgent) => {
    const existing = existingById.get(rosterAgent.id);
    if (!existing) {
      changed = true;
      return rosterAgentState(rosterAgent, now);
    }
    return {
      ...existing,
      purpose: rosterAgent.purpose,
      capabilities: rosterAgent.capabilities
    };
  });
  if (!changed && agents.length === (data.agents ?? []).length) {
    return data;
  }
  return writeFleetAgents(repoRoot, agents);
}

/** @param {string} [repoRoot] */
export function initFleetAgents(repoRoot = ROOT) {
  const now = new Date().toISOString();
  const agents = AGENT_ROSTER.map((a) => rosterAgentState(a, now));
  return writeFleetAgents(repoRoot, agents);
}

/** @param {string} [repoRoot] */
export function ensureFleetAgents(repoRoot = ROOT) {
  const data = loadFleetAgents(repoRoot);
  if (!data.agents.length) return initFleetAgents(repoRoot);
  return data;
}

/**
 * @param {string} [repoRoot]
 * @param {string} agentId
 * @param {object} patch
 */
export function updateAgentStatus(repoRoot, agentId, patch) {
  const path = join(fleetDir(repoRoot), AGENTS_JSON);
  if (!existsSync(path)) initFleetAgents(repoRoot);
  const data = loadFleetAgents(repoRoot);
  const idx = data.agents.findIndex((a) => a.id === agentId);
  if (idx < 0) return null;
  data.agents[idx] = {
    ...data.agents[idx],
    ...patch,
    since: new Date().toISOString()
  };
  return writeFleetAgents(repoRoot, data.agents).agents[idx];
}

/** @param {object} e */
function eventTaskKey(e) {
  const stories = Array.isArray(e.stories) ? e.stories.join(",") : "";
  const steps = Array.isArray(e.steps) ? e.steps.join(",") : "";
  return [
    e.agentId ?? "",
    e.jobId ?? "",
    e.storyId ?? "",
    e.suiteId ?? "",
    e.attempt ?? "",
    stories,
    steps
  ].join("|");
}

/** @param {object} e */
function eventToTask(e) {
  return {
    jobId: e.jobId,
    storyId: e.storyId,
    suiteId: e.suiteId,
    attempt: e.attempt,
    phase: e.phase,
    parallelCount: e.parallelCount,
    stories: e.stories,
    steps: e.steps
  };
}

/**
 * Convert the append-only fleet event stream into one visible row per logical
 * roster agent. Parallel workers are summarized on that row instead of being
 * expanded into duplicate agent cards.
 *
 * @param {object[]} rosterAgents
 * @param {object[]} events chronological fleet events
 * @param {Set<string>} runningJobIds currently active job IDs
 * @returns {object[]}
 */
export function buildFleetAgentView(rosterAgents, events = [], runningJobIds = new Set()) {
  /** @type {Map<string, object>} */
  const active = new Map();
  const hasRunningJobs = runningJobIds?.size > 0;
  for (const e of events) {
    if (!e?.agentId) continue;
    if (!hasRunningJobs) continue;
    if (hasRunningJobs && e.jobId && !runningJobIds.has(e.jobId)) continue;
    const key = eventTaskKey(e);
    if (e.type === "agent.complete") {
      active.delete(key);
    } else if (e.type === "orchestrator.assign") {
      active.set(key, e);
    }
  }

  /** @type {Map<string, object[]>} */
  const activeByAgentId = new Map();
  for (const assignment of active.values()) {
    if (!assignment.agentId) continue;
    if (!activeByAgentId.has(assignment.agentId)) activeByAgentId.set(assignment.agentId, []);
    activeByAgentId.get(assignment.agentId).push(assignment);
  }

  return (rosterAgents ?? []).map((agent) => {
    const activeTasks = (activeByAgentId.get(agent.id) ?? [])
      .sort((left, right) => String(left.at ?? "").localeCompare(String(right.at ?? "")))
      .map(eventToTask);
    if (!activeTasks.length) {
      return {
        ...agent,
        baseAgentId: agent.id,
        workerCount: agent.status === "working" ? 1 : 0,
        activeTasks: agent.currentTask ? [agent.currentTask] : []
      };
    }
    return {
      ...agent,
      baseAgentId: agent.id,
      status: "working",
      since: activeByAgentId.get(agent.id)?.[0]?.at ?? agent.since,
      currentTask: activeTasks.length === 1
        ? activeTasks[0]
        : {
            phase: activeTasks[0]?.phase,
            parallelCount: activeTasks.length,
            stories: activeTasks.map((task) => task.storyId).filter(Boolean),
            steps: [...new Set(activeTasks.map((task) => task.suiteId).filter(Boolean))]
          },
      workerCount: activeTasks.length,
      activeTasks
    };
  });
}

/** @param {object | null | undefined} task */
function taskKey(task) {
  if (!task?.storyId || !task?.suiteId) return null;
  return `${task.storyId}::${task.suiteId}`;
}

/** @param {string} [repoRoot] */
export function detectDuplicateAssignments(repoRoot = ROOT) {
  const { agents } = loadFleetAgents(repoRoot);
  /** @type {Map<string, object[]>} */
  const groups = new Map();
  for (const agent of agents) {
    if (agent.status !== "working") continue;
    const key = taskKey(agent.currentTask);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(agent);
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => {
      const [storyId, suiteId] = key.split("::");
      return {
        storyId,
        suiteId,
        agentIds: items.map((a) => a.id),
        phases: items.map((a) => a.currentTask?.phase ?? null)
      };
    });
}

/**
 * Append-only local event bus (cloud Phase 2 will mirror to D1 + WSS).
 * @param {string} [repoRoot]
 * @param {string} type
 * @param {object} payload
 */
export function emitFleetEvent(repoRoot, type, payload = {}) {
  const dir = fleetDir(repoRoot);
  mkdirSync(dir, { recursive: true });
  const event = {
    type,
    at: new Date().toISOString(),
    nodeId: process.env.LAB_WORKER_NODE_ID ?? "local-mac",
    ...payload
  };
  appendFileSync(join(dir, EVENTS_LOG), `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

/**
 * @param {string} [repoRoot]
 * @param {number} [limit]
 * @returns {object[]}
 */
export function loadFleetEvents(repoRoot = ROOT, limit = 50) {
  const path = join(fleetDir(repoRoot), EVENTS_LOG);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  return lines
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** @param {string} [repoRoot] */
export function writeSupervisorHeartbeat(repoRoot = ROOT) {
  const dir = fleetDir(repoRoot);
  mkdirSync(dir, { recursive: true });
  const orch = loadOrchestratorState(repoRoot);
  const body = {
    pid: process.pid,
    nodeId: process.env.LAB_WORKER_NODE_ID ?? "local-mac",
    lastHeartbeat: new Date().toISOString(),
    orchestratorPhase: orch?.phase ?? null,
    orchestratorVerdict: orch?.verdict ?? null,
    orchestratorJobId: orch?.jobId ?? null
  };
  const path = join(dir, SUPERVISOR_JSON);
  const existing = existsSync(path)
    ? (() => {
        try {
          return JSON.parse(readFileSync(path, "utf8"));
        } catch {
          return {};
        }
      })()
    : {};
  writeFileSync(
    path,
    JSON.stringify({ ...existing, ...body, startedAt: existing.startedAt ?? body.lastHeartbeat }, null, 2)
  );
  return body;
}

/** @param {string} [repoRoot] */
export function loadSupervisorState(repoRoot = ROOT) {
  const path = join(fleetDir(repoRoot), SUPERVISOR_JSON);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** @param {string} [repoRoot] */
export function requestSupervisorStop(repoRoot = ROOT) {
  const flag = join(fleetDir(repoRoot), STOP_FLAG);
  mkdirSync(fleetDir(repoRoot), { recursive: true });
  writeFileSync(flag, `${new Date().toISOString()}\n`, "utf8");
  return flag;
}

/** @param {string} [repoRoot] */
export function clearSupervisorStop(repoRoot = ROOT) {
  const flag = join(fleetDir(repoRoot), STOP_FLAG);
  if (existsSync(flag)) unlinkSync(flag);
}

/**
 * @param {string} [repoRoot]
 * @param {number} intervalMs
 */
export async function runSupervisorDaemon(repoRoot = ROOT, intervalMs = 5000) {
  clearSupervisorStop(repoRoot);
  if (!existsSync(join(fleetDir(repoRoot), AGENTS_JSON))) {
    initFleetAgents(repoRoot);
  }
  emitFleetEvent(repoRoot, "agent.register", {
    agentId: "supervisor",
    capabilities: ["local-fleet"]
  });
  writeSupervisorHeartbeat(repoRoot);

  while (!existsSync(join(fleetDir(repoRoot), STOP_FLAG))) {
    writeSupervisorHeartbeat(repoRoot);
    const data = loadFleetAgents(repoRoot);
    const duplicates = detectDuplicateAssignments(repoRoot);
    for (const duplicate of duplicates) {
      emitFleetEvent(repoRoot, "orchestrator.duplicate_work", duplicate);
    }
    for (const agent of data.agents) {
      if (agent.status === "working") {
        emitFleetEvent(repoRoot, "agent.heartbeat", {
          agentId: agent.id,
          status: agent.status,
          currentTask: agent.currentTask
        });
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  clearSupervisorStop(repoRoot);
  emitFleetEvent(repoRoot, "supervisor.stopped", { pid: process.pid });
}

function printStatus(repoRoot) {
  const sup = loadSupervisorState(repoRoot);
  const agents = loadFleetAgents(repoRoot);
  const events = loadFleetEvents(repoRoot, 8);
  const out = {
    supervisor: sup,
    agents: agents.agents,
    recentEvents: events
  };
  console.log(JSON.stringify(out, null, 2));
}

async function main() {
  const cmd = process.argv[2] ?? "status";
  const repoRoot = process.env.LAB_REPO_ROOT ?? ROOT;

  switch (cmd) {
    case "start": {
      if (!existsSync(join(fleetDir(repoRoot), AGENTS_JSON))) initFleetAgents(repoRoot);
      console.log(`[lab-supervisor] starting daemon pid=${process.pid} fleet=${fleetDir(repoRoot)}`);
      await runSupervisorDaemon(repoRoot);
      console.log("[lab-supervisor] stopped");
      break;
    }
    case "stop":
      requestSupervisorStop(repoRoot);
      console.log("[lab-supervisor] stop requested");
      break;
    case "init":
      initFleetAgents(repoRoot);
      writeSupervisorHeartbeat(repoRoot);
      emitFleetEvent(repoRoot, "agent.register", { scope: "full-roster" });
      console.log(`[lab-supervisor] fleet initialized (${AGENT_ROSTER.length} agents)`);
      break;
    case "status":
      printStatus(repoRoot);
      break;
    case "events": {
      const limit = Number(process.argv[3] ?? 20);
      console.log(JSON.stringify(loadFleetEvents(repoRoot, limit), null, 2));
      break;
    }
    default:
      console.error(`Unknown command: ${cmd}. Use start | stop | status | init | events`);
      process.exit(1);
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
