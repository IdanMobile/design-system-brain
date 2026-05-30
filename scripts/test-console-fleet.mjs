/**
 * Fleet / Agent Console API payload for GET /api/fleet.
 */

import {
  buildFleetAgentView,
  ensureFleetAgents,
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
  const events = loadFleetEvents(repoRoot, 200);
  const runningJobIds = new Set(
    jobs.filter((j) => j.status === "running" || j.finalizing).map((j) => j.id)
  );
  const { agents: rosterAgents } = ensureFleetAgents(repoRoot);
  const agents = buildFleetAgentView(rosterAgents, events, runningJobIds).map((agent) => ({
    ...agent,
    cli: runSettings.agentCli ?? "cursor",
    model: runSettings.agentModel ?? "composer-2.5-fast"
  }));

  const working = agents.filter((a) => a.status === "working").length;
  const waiting = agents.filter(
    (a) => a.id !== "orchestrator" && a.status !== "working" && a.status !== "failed"
  ).length;

  const orchestrator = loadOrchestratorState(repoRoot);
  const recentEvents = loadFleetEvents(repoRoot, 50).slice().reverse();

  return {
    generatedAt: new Date().toISOString(),
    orchestratorRunning,
    orchestratorAuto: loadOrchestratorAuto().enabled,
    runSettings,
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
