/**
 * Fleet / Agent Console API payload for GET /api/fleet.
 */

import {
  buildFleetAgentView,
  computeAgentActivity24h,
  ensureFleetAgents,
  formatRuntimeMs,
  loadFleetEvents,
  loadSupervisorState
} from "./lab-worker-supervisor.mjs";
import { loadOrchestratorState } from "./test-console-worker-supervisor.mjs";
import { loadOrchestratorAuto } from "./test-console-orchestrator-auto.mjs";
import { loadRunSettings } from "./test-console-run-settings.mjs";

/**
 * @param {string} repoRoot
 * @param {{ jobs?: object[], orchestratorRunning?: boolean }} [ctx]
 */
export function buildFleetState(repoRoot, ctx = {}) {
  const { jobs = [], orchestratorRunning = false } = ctx;
  ensureFleetAgents(repoRoot);

  const runSettings = loadRunSettings();
  const events = loadFleetEvents(repoRoot, 500);
  const runningJobIds = new Set(
    jobs.filter((j) => j.status === "running" || j.finalizing).map((j) => j.id)
  );
  const { agents: rosterAgents } = ensureFleetAgents(repoRoot);
  const { runtimeMs: runtimeMs24h, launchCount: launches24h } = computeAgentActivity24h(events);
  const modelForAgent = (agentId) => {
    if (agentId === "infra") return "pnpm scripts";
    return runSettings.agentModel ?? "composer-2.5-fast";
  };

  const agents = buildFleetAgentView(rosterAgents, events, runningJobIds).map((agent) => {
    const ms = runtimeMs24h.get(agent.id) ?? 0;
    const launches = launches24h.get(agent.id) ?? 0;
    return {
      ...agent,
      cli: runSettings.agentCli ?? "cursor",
      model: modelForAgent(agent.id),
      runtimeMs24h: ms,
      runtimeLabel24h: formatRuntimeMs(ms),
      launches24h: launches,
      runCount: launches
    };
  });

  const working = agents.reduce(
    (sum, agent) => sum + (agent.workerCount ?? (agent.status === "working" ? 1 : 0)),
    0
  );
  const waiting = agents.filter(
    (a) => a.id !== "orchestrator" && a.status !== "working" && a.status !== "failed"
  ).length;

  const orchestrator = loadOrchestratorState(repoRoot);
  const recentEvents = loadFleetEvents(repoRoot, 50).slice().reverse();

  const now = new Date().toISOString();
  return {
    generatedAt: now,
    updatedAt: now,
    orchestratorRunning,
    orchestratorAuto: loadOrchestratorAuto().enabled,
    runSettings: {
      agentModel: runSettings.agentModel,
      agentCli: runSettings.agentCli,
      parallelWorkers: runSettings.parallelWorkers
    },
    orchestrator: orchestrator?.finished ? null : orchestrator,
    supervisor: loadSupervisorState(repoRoot),
    agents,
    recentEvents,
    stats: {
      routes: events.filter((e) => e.type === "orchestrator.assign").length,
      completes: events.filter((e) => e.type === "agent.complete").length,
      working,
      waiting
    },
    runningJobs: jobs
      .filter((j) => j.status === "running" || j.finalizing)
      .map((j) => ({
        id: j.id,
        label: j.label,
        status: j.status,
        action: j.action,
        story: j.story ?? null
      }))
  };
}
