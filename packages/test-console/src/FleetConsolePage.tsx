import { useCallback, useEffect, useMemo, useState } from "react";
import type { FleetAgent, FleetEvent, FleetState } from "./types";
import "./fleet-console.css";

const AGENT_UI: Record<
  string,
  { title: string; subtitle: string; icon: string; short: string; flowOrder?: number }
> = {
  orchestrator: {
    title: "Project Orchestrator",
    subtitle: "Schedule · Gate · Assign",
    icon: "OR",
    short: "CEO"
  },
  investigator: {
    title: "Investigator",
    subtitle: "Diagnose before edit",
    icon: "IN",
    short: "INV",
    flowOrder: 1
  },
  infra: {
    title: "Infra Agent",
    subtitle: "Storybook · Relay · Plugin",
    icon: "IF",
    short: "INF"
  },
  "pixel-fixer": {
    title: "Pixel Fixer",
    subtitle: "Schema replay · Step 1",
    icon: "PX",
    short: "PIX",
    flowOrder: 2
  },
  "mock-figma-fixer": {
    title: "Mock Figma Fixer",
    subtitle: "Emulator · Step 2",
    icon: "MF",
    short: "MCK",
    flowOrder: 3
  },
  "live-figma-fixer": {
    title: "Live Figma Fixer",
    subtitle: "Desktop plugin · Step 3",
    icon: "LF",
    short: "LIV",
    flowOrder: 4
  },
  "delivery-fixer": {
    title: "Delivery Fixer",
    subtitle: "@lab/ui · Step 4",
    icon: "DL",
    short: "DEL",
    flowOrder: 5
  },
  verifier: {
    title: "Verifier",
    subtitle: "Tier A/B/C regression",
    icon: "VR",
    short: "VER",
    flowOrder: 6
  },
  "merge-captain": {
    title: "Merge Captain",
    subtitle: "Sandbox review before promotion",
    icon: "MC",
    short: "MRG",
    flowOrder: 7
  }
};

const FLOW_STEPS = [
  { id: "fail", label: "Test fail", icon: "01" },
  { id: "investigator", label: "Investigate", icon: "02" },
  { id: "fixer", label: "Fix", icon: "03" },
  { id: "verify", label: "Verify", icon: "04" },
  { id: "portfolio", label: "Portfolio", icon: "05" }
];

function agentBaseId(agent: FleetAgent): string {
  return agent.baseAgentId ?? agent.id.split("#")[0];
}

async function fetchFleet(): Promise<FleetState | null> {
  const res = await fetch("/api/fleet");
  if (!res.ok) return null;
  return res.json();
}

async function stopAllAgents(): Promise<{
  ok?: boolean;
  stoppedJobIds?: string[];
  error?: string;
  fleet?: FleetState;
}> {
  const res = await fetch("/api/fleet/stop-all", { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error ?? res.statusText };
  return body;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch {
    return iso;
  }
}

function displayStatus(agent: FleetAgent): string {
  if (agent.status === "working") return "working";
  if (agent.status === "failed" && ((agent.workerCount ?? 0) > 0 || agent.currentTask)) return "failed";
  return "waiting";
}

function eventSummary(e: FleetEvent): string {
  const parts: string[] = [];
  if (e.agentId) parts.push(e.agentId);
  if (e.storyId) parts.push(e.storyId);
  if (e.phase) parts.push(e.phase);
  if (e.suiteId) parts.push(e.suiteId);
  if (e.attempt != null) parts.push(`try ${e.attempt}`);
  if (e.status) parts.push(e.status);
  return parts.join(" · ") || "—";
}

function AgentCard({ agent }: { agent: FleetAgent }) {
  const baseId = agentBaseId(agent);
  const ui = AGENT_UI[baseId] ?? {
    title: agent.id,
    subtitle: agent.purpose,
    icon: "AG",
    short: "AGT"
  };
  const status = displayStatus(agent);
  const task = agent.currentTask;
  const workerCount = agent.workerCount ?? (status === "working" ? 1 : 0);
  const activeTasks = agent.activeTasks?.length ? agent.activeTasks : task ? [task] : [];

  return (
    <article className={`fleet-agent-card ${status}`}>
      <span className="fleet-worker-counter" title={`${workerCount} active workers`}>
        {workerCount}
      </span>
      <div className="fleet-agent-icon" aria-hidden>
        {ui.icon}
      </div>
      <h3 className="fleet-agent-name">{ui.title}</h3>
      <p className="fleet-agent-role">{ui.subtitle}</p>
      <div className="fleet-agent-footer">
        <span className={`fleet-status-badge ${status}`}>{status}</span>
        <span className="fleet-model-pill" title={`CLI: ${agent.cli ?? "cursor"}`}>
          {agent.model?.split("/").pop() ?? "—"}
        </span>
      </div>
      <div
        className="fleet-agent-runtime"
        title="Worker launches and active time (24hrs)"
      >
        <strong>{agent.runtimeLabel24h ?? "0s"}</strong>
        <span>
          · {agent.launches24h ?? 0} launch{(agent.launches24h ?? 0) === 1 ? "" : "es"}
        </span>
        <em>24hrs</em>
      </div>
      {activeTasks.slice(0, 3).map((activeTask, index) => (
        <div className="fleet-agent-task" key={`${activeTask.storyId ?? "task"}-${activeTask.suiteId ?? ""}-${activeTask.attempt ?? index}`}>
          {activeTask.phase ? <strong>{activeTask.phase}</strong> : null}
          {activeTask.storyId ? (
            <>
              {activeTask.phase ? " · " : ""}
              {activeTask.storyId}
            </>
          ) : null}
          {activeTask.attempt != null ? ` · try ${activeTask.attempt}` : ""}
        </div>
      ))}
      {activeTasks.length > 3 ? (
        <div className="fleet-agent-task">+{activeTasks.length - 3} more active tasks</div>
      ) : null}
    </article>
  );
}

function AgentRail({
  agents,
  orchestratorRunning,
  orchestratorPhase
}: {
  agents: FleetAgent[];
  orchestratorRunning?: boolean;
  orchestratorPhase?: string;
}) {
  return (
    <aside className="fleet-rail" aria-label="Agent roster">
      <div className="fleet-rail-title">Agents</div>
      {agents.map((agent) => {
        const baseId = agentBaseId(agent);
        const ui = AGENT_UI[baseId] ?? {
          title: agent.id,
          subtitle: agent.purpose,
          icon: "AG",
          short: "AGT"
        };
        const status =
          agent.id === "orchestrator" && orchestratorRunning
            ? "working"
            : displayStatus(agent);
        const workerCount =
          status === "working" ? (agent.workerCount ?? 1) : 0;
        const phaseLabel =
          agent.id === "orchestrator"
            ? (orchestratorPhase ?? ui.subtitle)
            : (agent.currentTask?.phase ?? ui.subtitle);
        return (
          <div key={agent.id} className={`fleet-rail-item ${status}`}>
            <span className="fleet-rail-icon">{ui.short}</span>
            <span className="fleet-rail-copy">
              <strong>{ui.title}</strong>
              <span>
                {workerCount} workers · {phaseLabel}
              </span>
            </span>
            <span className="fleet-rail-status" />
          </div>
        );
      })}
    </aside>
  );
}

function RoleSummary({ agents }: { agents: FleetAgent[] }) {
  const rows = [
    { label: "Investigators", match: (a: FleetAgent) => agentBaseId(a) === "investigator" },
    { label: "Fixers", match: (a: FleetAgent) => agentBaseId(a).includes("fixer") },
    { label: "Infra", match: (a: FleetAgent) => agentBaseId(a) === "infra" },
    { label: "Verifiers", match: (a: FleetAgent) => agentBaseId(a) === "verifier" },
    { label: "Review", match: (a: FleetAgent) => agentBaseId(a) === "merge-captain" }
  ];

  return (
    <section className="fleet-role-summary" aria-label="Agent counts by role">
      {rows.map((row) => {
        const scoped = agents.filter(row.match);
        const working = scoped.reduce(
          (sum, agent) => sum + (agent.workerCount ?? (agent.status === "working" ? 1 : 0)),
          0
        );
        return (
          <div key={row.label} className="fleet-role-tile">
            <span>{row.label}</span>
            <strong>{working}</strong>
            <em>active workers</em>
          </div>
        );
      })}
    </section>
  );
}

function FlowBar({ fleet }: { fleet: FleetState }) {
  const orch = fleet.orchestrator;
  const activePhase = orch?.finished
    ? "portfolio"
    : orch?.phase?.includes("fix-all")
      ? orch?.nextWorkerMode === "investigate_first" || !orch?.storyId
        ? "investigator"
        : "fixer"
      : fleet.orchestratorRunning
        ? "fail"
        : null;

  return (
    <section className="fleet-pipeline" aria-label="Fix pipeline">
      <h2>Fix pipeline</h2>
      <div className="fleet-flow">
        {FLOW_STEPS.map((step, i) => {
          const isActive = activePhase === step.id;
          const isPast =
            activePhase &&
            FLOW_STEPS.findIndex((s) => s.id === activePhase) > i;
          return (
            <span key={step.id} style={{ display: "contents" }}>
              {i > 0 ? <span className="fleet-flow-arrow" aria-hidden>→</span> : null}
              <span
                className={`fleet-flow-step${isActive ? " active" : ""}${isPast ? " done" : ""}`}
              >
                <span className="fleet-flow-index" aria-hidden>{step.icon}</span>
                {step.label}
              </span>
            </span>
          );
        })}
      </div>
    </section>
  );
}

export function FleetConsolePage() {
  const [fleet, setFleet] = useState<FleetState | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [stopping, setStopping] = useState(false);
  const [stopMessage, setStopMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await fetchFleet();
    setFleet(data);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  const handleStopAll = useCallback(async () => {
    const confirmed = window.confirm(
      "Stop the orchestrator and all running agents?\n\nThis cancels active fix jobs, clears story locks, and turns off AUTO mode."
    );
    if (!confirmed) return;
    setStopping(true);
    setStopMessage(null);
    try {
      const result = await stopAllAgents();
      if (result.fleet) {
        setFleet(result.fleet);
        setLastRefresh(new Date());
      } else {
        await refresh();
      }
      const count = result.stoppedJobIds?.length ?? 0;
      setStopMessage(
        result.ok
          ? count > 0
            ? `Stopped ${count} job${count === 1 ? "" : "s"}.`
            : "All agents idle — nothing was running."
          : (result.error ?? "Stop failed")
      );
    } finally {
      setStopping(false);
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 2500);
    return () => clearInterval(id);
  }, [refresh]);

  const workers = useMemo(() => {
    if (!fleet?.agents?.length) return [];
    return fleet.agents.filter((a) => a.id !== "orchestrator");
  }, [fleet]);
  const allAgents = fleet?.agents ?? [];

  const hasRunningJobs = (fleet?.runningJobs?.length ?? 0) > 0;
  const isLive = Boolean(fleet?.orchestratorRunning) || hasRunningJobs;

  const orch = fleet?.orchestrator;
  const orchStatus =
    fleet?.orchestratorRunning || hasRunningJobs ? "working" : "waiting";

  return (
    <div className="fleet-shell">
      {loading && !fleet ? (
        <p className="fleet-empty">Loading fleet…</p>
      ) : !fleet ? (
        <p className="fleet-empty">
          Fleet unavailable — run <code>pnpm lab:supervisor init</code> then start a fix-all job.
        </p>
      ) : (
        <>
          <AgentRail
            agents={allAgents}
            orchestratorRunning={orchStatus === "working"}
            orchestratorPhase={orch?.phase}
          />
          <main className="fleet-app">
            <header className="fleet-header">
              <div>
                <span className="fleet-eyebrow">Agent operations</span>
                <h1>Agent Console</h1>
                <p>
                  See who is working, what the orchestrator assigned, which model is running, and where the fix flow is blocked.
                  {lastRefresh ? ` Updated ${formatTime(lastRefresh.toISOString())}.` : ""}
                </p>
              </div>
              <div className="fleet-header-actions">
                <span className={`fleet-live-pill${isLive ? "" : " idle"}`}>
                  <span className="fleet-live-dot" />
                  {isLive ? "Live" : "Idle"}
                </span>
                <button
                  type="button"
                  className="fleet-stop-btn"
                  onClick={() => void handleStopAll()}
                  disabled={stopping}
                  title="Cancel orchestrator and all agent jobs"
                >
                  {stopping ? "Stopping…" : "Stop all"}
                </button>
                <button type="button" className="fleet-refresh-btn" onClick={() => void refresh()}>
                  Refresh
                </button>
              </div>
            </header>
            {stopMessage ? <p className="fleet-stop-message">{stopMessage}</p> : null}

            <RoleSummary agents={workers} />

            <div className="fleet-orchestrator-wrap">
            <article className={`fleet-orchestrator-card ${orchStatus}`}>
              <div className="fleet-orchestrator-top">
                <div className="fleet-orchestrator-identity">
                  <div className="fleet-orchestrator-icon" aria-hidden>
                    PM
                  </div>
                  <div>
                    <h2 className="fleet-orchestrator-title">Project Orchestrator</h2>
                    <p className="fleet-orchestrator-sub">Manager / Supervisor · Directs specialists</p>
                  </div>
                </div>
                <div className="fleet-orchestrator-badges">
                  <span className="fleet-manager-badge">
                    <span className="fleet-manager-dot" />
                    Manager
                  </span>
                  <span className={`fleet-status-badge ${orchStatus}`}>{orchStatus}</span>
                  <span className="fleet-model-pill">
                    {fleet.runSettings?.agentCli ?? "cursor"} ·{" "}
                    {fleet.runSettings?.agentModel?.split("/").pop() ?? "default"}
                  </span>
                  {fleet.orchestratorAuto ? (
                    <span className="fleet-model-pill">AUTO on</span>
                  ) : null}
                </div>
              </div>
              <p className="fleet-orchestrator-desc">
                Sets priority from portfolio health, enforces investigator-before-fixer gate, assigns
                step fixers (pixel to mock to live to delivery), and runs Tier A/C verification before
                marking stories done.
              </p>
              <div className="fleet-orchestrator-metrics">
                <div className="fleet-metric-box">
                  <span className="fleet-metric-label">Assignments</span>
                  <span className="fleet-metric-value">{fleet.stats?.routes ?? 0}</span>
                </div>
                <div className="fleet-metric-box">
                  <span className="fleet-metric-label">Completed</span>
                  <span className="fleet-metric-value">{fleet.stats?.completes ?? 0}</span>
                </div>
                <div className="fleet-metric-box">
                  <span className="fleet-metric-label">Active workers</span>
                  <span className="fleet-metric-value">
                    {fleet.stats?.working ?? 0}
                  </span>
                  <span className="fleet-metric-note">{fleet.stats?.waiting ?? 0} agent types waiting</span>
                </div>
              </div>
              {orch ? (
                <div className="fleet-orchestrator-progress">
                  <strong>{orch.phase ?? "idle"}</strong>
                  {orch.suiteLabel ? ` · ${orch.suiteLabel}` : ""}
                  {orch.verdict ? ` · ${orch.verdict}` : ""}
                  {orch.storyId ? (
                    <>
                      {" "}
                      · story <strong>{orch.storyId}</strong>
                    </>
                  ) : null}
                  {orch.storyIndex != null && orch.storyTotal ? (
                    <>
                      {" "}
                      ({orch.storyIndex}/{orch.storyTotal})
                    </>
                  ) : null}
                  {orch.attempt != null && orch.maxAttempts ? (
                    <>
                      {" "}
                      · attempt {orch.attempt}/{orch.maxAttempts}
                    </>
                  ) : null}
                  {orch.metrics?.percent != null ? (
                    <>
                      {" "}
                      · diff {orch.metrics.percent.toFixed(2)}%
                    </>
                  ) : null}
                  {orch.nextWorkerMode ? ` · next: ${orch.nextWorkerMode}` : ""}
                </div>
              ) : fleet.supervisor?.lastHeartbeat ? (
                <div className="fleet-orchestrator-progress">
                  Supervisor heartbeat {formatTime(fleet.supervisor.lastHeartbeat)}
                  {fleet.supervisor.orchestratorPhase
                    ? ` · last phase ${fleet.supervisor.orchestratorPhase}`
                    : ""}
                </div>
              ) : null}
            </article>
            </div>

          <div className="fleet-connector" aria-hidden>
            <div className="fleet-connector-hub" />
          </div>

          <div className="fleet-agents-grid" role="list" aria-label="Specialist agents">
            {workers.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>

          <FlowBar fleet={fleet} />

          <div className="fleet-panels">
            <section className="fleet-panel">
              <div className="fleet-panel-header">Live event feed</div>
              <div className="fleet-panel-body">
                {fleet.recentEvents?.length ? (
                  fleet.recentEvents.slice(0, 24).map((e, i) => (
                    <div key={`${e.at}-${e.type}-${i}`} className="fleet-event">
                      <div>
                        <span className="fleet-event-time">{formatTime(e.at)}</span>{" "}
                        <span className="fleet-event-type">{e.type}</span>
                      </div>
                      <div className="fleet-event-detail">{eventSummary(e)}</div>
                    </div>
                  ))
                ) : (
                  <p className="fleet-empty">No events yet — run fix-all to populate.</p>
                )}
              </div>
            </section>

            <section className="fleet-panel">
              <div className="fleet-panel-header">Running jobs</div>
              <div className="fleet-panel-body">
                {fleet.runningJobs?.length ? (
                  fleet.runningJobs.map((j) => (
                    <div key={j.id} className="fleet-job-row">
                      <div className="fleet-job-label">{j.label}</div>
                      <div className="fleet-event-detail">
                        {j.status} · {j.action}
                        {j.story ? ` · ${j.story}` : ""}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="fleet-empty">No active jobs.</p>
                )}
              </div>
            </section>
          </div>
          </main>
        </>
      )}
    </div>
  );
}
