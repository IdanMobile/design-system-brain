import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { attachJobStream, killJob, type JobProgress } from "./job-stream";
import { DeveloperConsolePage } from "./DeveloperConsolePage";
import { SERVICES, type ServiceKey } from "./services";
import type {
  ActionDef,
  ConsoleState,
  PortfolioState,
  RunSettings,
  WorkerSupervisorState
} from "./types";

type AppPage = "tests" | "developer";

function pageFromHash(): AppPage {
  return window.location.hash === "#developer" ? "developer" : "tests";
}

function syncHash(page: AppPage) {
  const next = page === "developer" ? "#developer" : "#tests";
  if (window.location.hash !== next) window.location.hash = next;
}

const SUITE_SUMMARY_ORDER = ["pixel", "figma", "figmaLive", "delivery", "logic"] as const;

const SUITE_RUN_ACTION: Record<(typeof SUITE_SUMMARY_ORDER)[number], string> = {
  pixel: "pixel:golden",
  figma: "figma:golden",
  figmaLive: "figma:live:golden",
  delivery: "delivery:golden",
  logic: "logic:golden"
};

const DEFAULT_RUN_SETTINGS: RunSettings = {
  skipPass: false,
  onlyNotTested: false,
  parallelWorkers: 20,
  processPool: false,
  applyToOrchestrator: true,
  agentModel: "composer-2.5-fast"
};

function fixAllActionId(suiteId: string): string {
  return `fix-all:${suiteId}`;
}

/** Pixel is schema parity (0% = no crop); compare PNGs only on diffs — skip the column. */
const STEPS_WITH_COMPARE = new Set(["figma", "figmaLive", "delivery", "logic"]);

function stepColSpan(stepId: string): number {
  return STEPS_WITH_COMPARE.has(stepId) ? 3 : 2;
}

async function fetchState(): Promise<ConsoleState> {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error("API unavailable");
  return res.json();
}

function syncRunningSuiteActions(jobs: ConsoleState["jobs"] | undefined): Set<string> {
  const next = new Set<string>();
  for (const j of jobs ?? []) {
    if (!j.story && (j.status === "running" || j.finalizing)) {
      next.add(j.action);
    }
  }
  return next;
}

async function fetchActions(): Promise<ActionDef[]> {
  const res = await fetch("/api/actions");
  return res.json();
}

async function fetchPortfolio(): Promise<PortfolioState | null> {
  const res = await fetch("/api/portfolio");
  if (!res.ok) return null;
  return res.json();
}

function statusClass(s: string): string {
  if (s === "pass") return "pass";
  if (s === "warn") return "warn";
  if (s === "not_tested") return "not_tested";
  return "fail";
}

type RunningJobEntry = {
  jobId: string;
  actionId: string;
  storyId?: string;
  allStories?: boolean;
  label: string;
  progress?: JobProgress;
};

function shortStoryId(id: string): string {
  const parts = id.split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : id;
}

function orchestratorActivityView(
  progress: JobProgress | undefined,
  workerSupervisor?: WorkerSupervisorState | null
): { title: string; meta?: string; detail?: string } {
  const title = progress?.activityTitle ?? "Listening to Terminal";
  const metaParts: string[] = [];
  if (progress?.activityMeta) metaParts.push(progress.activityMeta);

  if (workerSupervisor && !workerSupervisor.finished) {
    const step =
      workerSupervisor.suiteLabel ??
      (workerSupervisor.suiteId ? suiteStepLabel(workerSupervisor.suiteId) : undefined);
    if (step && !metaParts.some((p) => p.includes(step))) {
      metaParts.unshift(step);
    }
    if (workerSupervisor.phase === "fix-all-batch") {
      const batchLabel = `Batch ${workerSupervisor.attempt ?? "?"}/${workerSupervisor.maxAttempts ?? "?"}`;
      if (!metaParts.some((p) => p.startsWith("Batch"))) metaParts.push(batchLabel);
      const n = workerSupervisor.storyIds?.length ?? workerSupervisor.storyTotal;
      if (n != null && n > 0 && !metaParts.some((p) => p.includes("stor"))) {
        metaParts.push(`${n} ${n === 1 ? "story" : "stories"}`);
      }
    } else if (workerSupervisor.storyId && workerSupervisor.attempt != null) {
      const tryLabel = `Try ${workerSupervisor.attempt}/${workerSupervisor.maxAttempts ?? "?"}`;
      if (!metaParts.some((p) => p.startsWith("Try"))) metaParts.push(tryLabel);
    }
  }

  let detail = progress?.activityDetail;
  if (workerSupervisor?.storyId) {
    const q = `"${shortStoryId(workerSupervisor.storyId)}"`;
    detail = detail?.includes(workerSupervisor.storyId) ? detail : q + (detail ? ` · ${detail}` : "");
  } else if (
    workerSupervisor?.storyIds?.length &&
    (!detail || !detail.includes('"'))
  ) {
    const preview = workerSupervisor.storyIds
      .slice(0, 3)
      .map((s) => `"${shortStoryId(s)}"`)
      .join(", ");
    const extra =
      workerSupervisor.storyIds.length > 3
        ? ` +${workerSupervisor.storyIds.length - 3} more`
        : "";
    const hint = detail?.replace(/^Reading artifacts.*/, "reading batch report & diffs");
    detail = preview + extra + (hint && !hint.startsWith('"') ? ` · ${hint}` : "");
  }

  return {
    title,
    meta: metaParts.length ? metaParts.join(" · ") : undefined,
    detail
  };
}

function suiteStepLabel(suiteId: string): string {
  const labels: Record<string, string> = {
    pixel: "Pixel",
    figma: "Figma mock",
    figmaLive: "Figma live",
    delivery: "Delivery",
    logic: "Logic audit"
  };
  return labels[suiteId] ?? suiteId;
}

function formatActivityLabel(progress: JobProgress | undefined): string | undefined {
  if (!progress?.activityTitle) return progress?.currentStory;
  const parts = [progress.activityTitle];
  if (progress.activityMeta) parts.push(progress.activityMeta);
  if (progress.activityDetail) parts.push(progress.activityDetail);
  return parts.join(" · ");
}

function formatSuiteRunLabel(
  entry: RunningJobEntry | undefined,
  finalizing?: boolean
): string {
  if (finalizing) return "Saving reports…";
  if (!entry) return "Running…";
  const p = entry.progress;
  if (p?.total != null && p.total > 0) {
    const n = Math.min(p.completed, p.total);
    return `Running ${n}/${p.total}…`;
  }
  if (p?.currentStory) return `Running… ${shortStoryId(p.currentStory)}`;
  return "Running…";
}

function formatFixAllLabel(entry: RunningJobEntry | undefined, finished: boolean): string {
  if (finished) return "Finished";
  if (!entry) return "Fix all";
  const activity = formatActivityLabel(entry.progress);
  if (activity) {
    const snippet = activity.length > 44 ? `${activity.slice(0, 44)}…` : activity;
    return snippet.startsWith("Fixing") ? `${snippet}` : `Fixing… ${snippet}`;
  }
  return "Fixing…";
}

function runningJobLabel(actionId: string, storyId: string | undefined, actions: ActionDef[]): string {
  const label = actions.find((a) => a.id === actionId)?.label ?? actionId;
  return storyId ? `${label} · ${storyId}` : label;
}

function syncRunningFromServer(
  jobs: ConsoleState["jobs"] | undefined,
  actions: ActionDef[],
  finishedJobIds: ReadonlySet<string>
): Record<string, RunningJobEntry> {
  const next: Record<string, RunningJobEntry> = {};
  for (const j of jobs ?? []) {
    if ((!j.finalizing && j.status !== "running") || finishedJobIds.has(j.id)) continue;
    const storyId = j.story ?? undefined;
    next[j.id] = {
      jobId: j.id,
      actionId: j.action,
      storyId,
      allStories: j.allStories,
      label: j.label || runningJobLabel(j.action, storyId, actions)
    };
  }
  return next;
}

function ServicePill({
  label,
  variant,
  detail,
  tooltip,
  startLabel,
  onStart,
  starting
}: {
  label: string;
  variant: "ok" | "warn" | "bad";
  detail?: string;
  tooltip: string;
  startLabel?: string;
  onStart?: () => void;
  starting?: boolean;
}) {
  return (
    <div className={`pill pill-${variant}`} title={tooltip}>
      <span className="dot" />
      <span className="pill-text">
        {label}
        {detail ? <span className="pill-detail"> · {detail}</span> : null}
      </span>
      {startLabel && onStart && variant !== "ok" && (
        <button
          type="button"
          className="pill-start"
          disabled={starting}
          onClick={onStart}
        >
          {starting ? "…" : startLabel}
        </button>
      )}
    </div>
  );
}

export function App() {
  const [state, setState] = useState<ConsoleState | null>(null);
  const [actions, setActions] = useState<ActionDef[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioState | null>(null);
  const [runningJobs, setRunningJobs] = useState<Record<string, RunningJobEntry>>({});
  const [runningSuiteActions, setRunningSuiteActions] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const finishedJobIdsRef = useRef(new Set<string>());
  const streamDetachRef = useRef(new Map<string, () => void>());
  const [openingService, setOpeningService] = useState<ServiceKey | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fixAllFinishedSuites, setFixAllFinishedSuites] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [portfolioOrchestratorFinished, setPortfolioOrchestratorFinished] = useState(false);
  const [runSettingsOpen, setRunSettingsOpen] = useState(true);
  const [activePage, setActivePage] = useState<AppPage>(() => pageFromHash());
  const orchestratorAuto = state?.orchestratorAuto ?? false;
  const orchestratorRunning = state?.orchestratorRunning ?? false;
  const orchestratorAutoStale = orchestratorAuto && !orchestratorRunning;
  const workerSupervisor = state?.workerSupervisor;
  const supervisorActive =
    workerSupervisor && !workerSupervisor.finished && workerSupervisor.storyId;
  const ensureAutoRef = useRef(0);
  const PORTFOLIO_ORCHESTRATOR_ACTION = "portfolio-orchestrator";
  const runSettings = state?.runSettings ?? DEFAULT_RUN_SETTINGS;
  const agentModelOptions = state?.agentModelOptions ?? [];
  const fixAgentModelOptions = useMemo(() => {
    const current = runSettings.agentModel ?? "composer-2.5-fast";
    if (!current || agentModelOptions.some((o) => o.id === current)) {
      return agentModelOptions;
    }
    return [{ id: current, label: `${current} (saved)` }, ...agentModelOptions];
  }, [agentModelOptions, runSettings.agentModel]);

  const patchRunSettings = useCallback(async (patch: Partial<RunSettings>) => {
    try {
      const res = await fetch("/api/run-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (!res.ok) return;
      const next = (await res.json()) as RunSettings;
      setState((s) => (s ? { ...s, runSettings: next } : s));
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchState();
      setState(s);
      setRunningJobs((prev) => {
        const fromServer = syncRunningFromServer(s.jobs, actions, finishedJobIdsRef.current);
        const next: Record<string, RunningJobEntry> = { ...fromServer };
        for (const id of Object.keys(next)) {
          const progress = prev[id]?.progress;
          if (progress) next[id] = { ...next[id], progress };
        }
        return next;
      });
      setRunningSuiteActions((prev) => {
        const fromServer = syncRunningSuiteActions(s.jobs);
        const next = new Set(fromServer);
        for (const actionId of prev) {
          if (!next.has(actionId)) next.add(actionId);
        }
        return next;
      });
      setApiError(null);
      const p = await fetchPortfolio();
      setPortfolio(p);
    } catch {
      setApiError("Cannot reach test console API. Start: pnpm test:console");
      setState(null);
      setPortfolio(null);
    }
  }, [actions]);

  const runningJobKey = Object.keys(runningJobs).sort().join(",");

  useEffect(() => {
    refresh();
    fetchActions().then(setActions);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [refresh]);

  useEffect(() => {
    const onHash = () => setActivePage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const goToPage = (page: AppPage) => {
    setActivePage(page);
    syncHash(page);
  };

  useEffect(() => {
    const busy = runningJobKey.length > 0;
    const t = setInterval(refresh, busy ? 1500 : 4000);
    return () => clearInterval(t);
  }, [refresh, runningJobKey]);

  useEffect(() => {
    if (!orchestratorAutoStale || orchestratorRunning) return;
    const now = Date.now();
    if (now - ensureAutoRef.current < 25_000) return;
    ensureAutoRef.current = now;
    void fetch("/api/orchestrator/ensure", { method: "POST" })
      .then((res) => res.json())
      .then((data: { started?: string | null; runningJobId?: string | null }) => {
        const jobId = data.started ?? data.runningJobId;
        if (jobId) {
          setRunningJobs((prev) => {
            if (Object.values(prev).some((j) => j.actionId === PORTFOLIO_ORCHESTRATOR_ACTION)) {
              return prev;
            }
            return {
              ...prev,
              [jobId]: {
                jobId,
                actionId: PORTFOLIO_ORCHESTRATOR_ACTION,
                label: "Orchestrator · AUTO"
              }
            };
          });
        }
        void refresh();
      })
      .catch(() => {
        /* retry on next refresh */
      });
  }, [orchestratorAutoStale, orchestratorRunning, refresh]);

  const finishJob = useCallback(
    (jobId: string, actionId: string, suiteScope: boolean, resultStatus?: string) => {
      if (finishedJobIdsRef.current.has(jobId)) return;
      finishedJobIdsRef.current.add(jobId);
      streamDetachRef.current.get(jobId)?.();
      streamDetachRef.current.delete(jobId);
      setRunningJobs((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
      if (suiteScope) {
        setRunningSuiteActions((prev) => {
          if (!prev.has(actionId)) return prev;
          const next = new Set(prev);
          next.delete(actionId);
          return next;
        });
      }
      const fixSuite = actionId.startsWith("fix-all:")
        ? actionId.slice("fix-all:".length)
        : null;
      if (fixSuite && (resultStatus === "passed" || resultStatus === "failed")) {
        setFixAllFinishedSuites((prev) => new Set(prev).add(fixSuite));
        window.setTimeout(() => {
          setFixAllFinishedSuites((prev) => {
            if (!prev.has(fixSuite)) return prev;
            const next = new Set(prev);
            next.delete(fixSuite);
            return next;
          });
        }, 4000);
      }
      if (actionId === PORTFOLIO_ORCHESTRATOR_ACTION && (resultStatus === "passed" || resultStatus === "failed")) {
        setPortfolioOrchestratorFinished(true);
        window.setTimeout(() => setPortfolioOrchestratorFinished(false), 6000);
      }
      void refresh();
      window.setTimeout(() => void refresh(), 800);
    },
    [refresh]
  );

  const beginJobStream = useCallback(
    (entry: RunningJobEntry, suiteScope: boolean) => {
      if (streamDetachRef.current.has(entry.jobId)) return;
      const detach = attachJobStream(
        entry.jobId,
        entry.label,
        {
          onLog: (_text, progress) => {
            setRunningJobs((prev) => {
              const cur = prev[entry.jobId];
              if (!cur) return prev;
              return { ...prev, [entry.jobId]: { ...cur, progress } };
            });
          },
          onDone: (result) => {
            const q = result.cursorQueued;
            if (
              q &&
              typeof Notification !== "undefined" &&
              Notification.permission === "granted"
            ) {
              const labelN = q.storyId ?? q.type ?? "action";
              new Notification("Test console → Cursor", {
                body: `Fix queued for ${labelN}. Terminal opened — Cursor CLI dispatching.`
              });
            }
            finishJob(entry.jobId, entry.actionId, suiteScope, result.status);
          }
        },
        entry.actionId
      );
      streamDetachRef.current.set(entry.jobId, detach);
    },
    [finishJob]
  );

  useEffect(() => {
    for (const entry of Object.values(runningJobs)) {
      beginJobStream(entry, Boolean(entry.allStories && !entry.storyId));
    }
  }, [runningJobKey, beginJobStream, runningJobs]);

  useEffect(() => {
    return () => {
      for (const detach of streamDetachRef.current.values()) detach();
      streamDetachRef.current.clear();
    };
  }, []);

  const queueFixAllForCursor = async (suiteId: string) => {
    setApiError(null);
    setFixAllFinishedSuites((prev) => {
      if (!prev.has(suiteId)) return prev;
      const next = new Set(prev);
      next.delete(suiteId);
      return next;
    });
    const actionId = fixAllActionId(suiteId);
    try {
      const res = await fetch("/api/agent/request-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suiteId, fixAll: true })
      });
      const text = await res.text();
      let data: {
        error?: string;
        terminalDispatched?: boolean;
        jobId?: string;
        message?: { storyCount?: number };
        label?: string;
      } = {};
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        if (!res.ok) {
          setApiError(`Fix all failed: ${text || res.statusText}`);
          return;
        }
      }
      if (!res.ok) {
        const err = data.error ?? text ?? res.statusText;
        setApiError(
          err === "run until pass"
            ? "Fix all failed (server bug — restart: pnpm test:console:restart, then retry)"
            : `Fix all failed: ${err}`
        );
        return;
      }
      if (!data.jobId) {
        setApiError("Fix all did not return a job id");
        return;
      }
      const jobLabel =
        data.label ??
        (data.message?.storyCount != null
          ? `Fix all · ${suiteId} (${data.message.storyCount} stories)`
          : `Fix all · ${suiteId}`);
      const entry: RunningJobEntry = {
        jobId: data.jobId,
        actionId,
        label: jobLabel
      };
      setRunningJobs((prev) => ({ ...prev, [data.jobId!]: entry }));
      if (!data.terminalDispatched) {
        setApiError("Terminal did not open — watch job in dashboard or run: pnpm test:console:cursor pending");
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    }
  };

  const queuePortfolioOrchestrator = async () => {
    setApiError(null);
    setPortfolioOrchestratorFinished(false);
    if (orchestratorRunning) {
      setApiError("Portfolio orchestrator is already running");
      return;
    }
    try {
      const res = await fetch("/api/agent/request-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioOrchestrator: true })
      });
      const text = await res.text();
      let data: {
        error?: string;
        terminalDispatched?: boolean;
        jobId?: string;
        label?: string;
      } = {};
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        if (!res.ok) {
          setApiError(`Orchestrator failed: ${text || res.statusText}`);
          return;
        }
      }
      if (!res.ok) {
        setApiError(`Orchestrator failed: ${data.error ?? text ?? res.statusText}`);
        return;
      }
      if (!data.jobId) {
        setApiError("Orchestrator did not return a job id");
        return;
      }
      const entry: RunningJobEntry = {
        jobId: data.jobId,
        actionId: PORTFOLIO_ORCHESTRATOR_ACTION,
        label: data.label ?? "Orchestrator · golden path ALL"
      };
      setRunningJobs((prev) => ({ ...prev, [data.jobId!]: entry }));
      if (!data.terminalDispatched) {
        setApiError(
          "Terminal did not open — run: pnpm test:console:cursor run-portfolio-orchestrator <jobId>"
        );
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    }
  };

  const startServiceInTerminal = async (serviceKey: ServiceKey) => {
    const def = SERVICES.find((s) => s.key === serviceKey);
    if (!def) return;
    setOpeningService(serviceKey);
    setApiError(null);
    try {
      const res = await fetch("/api/terminal/service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: serviceKey })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApiError(
          (data as { error?: string }).error ??
            `Could not open Terminal. Run from repo root: ${def.terminalCommand}`
        );
        return;
      }
      window.setTimeout(() => void refresh(), 2500);
      window.setTimeout(() => void refresh(), 6000);
    } catch {
      setApiError(
        `Test console API unreachable. Open Terminal in the project folder and run: ${def.terminalCommand}`
      );
    } finally {
      window.setTimeout(() => setOpeningService(null), 2500);
    }
  };

  const clearSuiteRunning = (actionId: string) => {
    setRunningSuiteActions((prev) => {
      if (!prev.has(actionId)) return prev;
      const next = new Set(prev);
      next.delete(actionId);
      return next;
    });
  };

  const run = async (actionId: string, storyId?: string, allStories = false) => {
    const jobLabel = allStories
      ? `${runningJobLabel(actionId, undefined, actions)} · all portfolio`
      : runningJobLabel(actionId, storyId, actions);
    const suiteScope = allStories && !storyId;
    if (suiteScope) {
      setRunningSuiteActions((prev) => new Set(prev).add(actionId));
    }
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionId, story: storyId, allStories })
      });
      const data = await res.json();
      if (!res.ok) {
        setApiError(data.error ?? res.statusText);
        if (suiteScope) clearSuiteRunning(actionId);
        return;
      }
      if (!data.jobId) {
        if (suiteScope) clearSuiteRunning(actionId);
        refresh();
        return;
      }
      const jobId = data.jobId as string;
      const entry: RunningJobEntry = {
        jobId,
        actionId,
        storyId,
        allStories: suiteScope,
        label: jobLabel
      };
      setRunningJobs((prev) => ({ ...prev, [jobId]: entry }));
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
      if (suiteScope) clearSuiteRunning(actionId);
    }
  };

  const relayOk = state?.relay.ok ?? false;
  const pluginOn = state?.relay.pluginConnected ?? false;

  function serviceVariant(key: ServiceKey): "ok" | "warn" | "bad" {
    if (key === "storybook") return state?.storybook.ok ? "ok" : "bad";
    if (key === "playground") return state?.playground.ok ? "ok" : "bad";
    if (key === "plugin") return state?.pluginBuilt ? "ok" : "bad";
    if (relayOk) return pluginOn ? "ok" : "warn";
    return "bad";
  }

  function serviceDetail(key: ServiceKey): string {
    if (key === "storybook") return state?.storybook.ok ? "serving" : "not running";
    if (key === "playground") return state?.playground.ok ? "serving" : "not running";
    if (key === "plugin") return state?.pluginBuilt ? "dist/code.js" : "needs build";
    if (!relayOk) return "relay off";
    return pluginOn ? "plugin connected" : "relay on — open plugin in Figma";
  }

  function serviceNeedsStart(key: ServiceKey): boolean {
    if (key === "storybook") return !state?.storybook.ok;
    if (key === "playground") return !state?.playground.ok;
    if (key === "plugin") return !state?.pluginBuilt;
    return !relayOk;
  }

  const suiteRunJob = (actionId: string) =>
    Object.values(runningJobs).find((j) => j.actionId === actionId && j.allStories && !j.storyId);

  const suiteFixAllJob = (suiteId: string) =>
    Object.values(runningJobs).find((j) => j.actionId === fixAllActionId(suiteId));

  const portfolioOrchestratorJob = () =>
    Object.values(runningJobs).find((j) => j.actionId === PORTFOLIO_ORCHESTRATOR_ACTION);

  const isPortfolioOrchestratorRunning = portfolioOrchestratorJob() != null;

  const isSuiteRunning = (actionId: string) =>
    runningSuiteActions.has(actionId) || suiteRunJob(actionId) != null;

  const cancelSuiteRun = async (actionId: string) => {
    const job = suiteRunJob(actionId);
    if (!job) return;
    await killJob(job.jobId);
    finishJob(job.jobId, actionId, true);
  };

  const cancelFixAll = async (suiteId: string) => {
    const job = suiteFixAllJob(suiteId);
    if (!job) return;
    await killJob(job.jobId);
    finishJob(job.jobId, fixAllActionId(suiteId), false, "killed");
  };

  const cancelPortfolioOrchestrator = async () => {
    const job = portfolioOrchestratorJob();
    if (!job) return;
    if (orchestratorAuto) {
      await fetch("/api/orchestrator/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false })
      });
    }
    await killJob(job.jobId);
    finishJob(job.jobId, PORTFOLIO_ORCHESTRATOR_ACTION, false, "killed");
  };

  const toggleOrchestratorAuto = async () => {
    setApiError(null);
    const enabling = !orchestratorAuto;
    try {
      const res = await fetch("/api/orchestrator/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: enabling })
      });
      const data = (await res.json()) as {
        error?: string;
        enabled?: boolean;
        started?: string | null;
        runningJobId?: string | null;
      };
      if (!res.ok) {
        setApiError(data.error ?? "Could not toggle Auto mode");
        return;
      }
      const jobId = data.started ?? data.runningJobId;
      if (enabling && jobId) {
        setPortfolioOrchestratorFinished(false);
        setRunningJobs((prev) => {
          if (Object.values(prev).some((j) => j.actionId === PORTFOLIO_ORCHESTRATOR_ACTION)) {
            return prev;
          }
          return {
            ...prev,
            [jobId]: {
              jobId,
              actionId: PORTFOLIO_ORCHESTRATOR_ACTION,
              label: "Orchestrator · AUTO"
            }
          };
        });
      }
      await refresh();
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="app">
      <nav className="top-page-nav" aria-label="Main">
        <button
          type="button"
          className={`top-page-tab${activePage === "tests" ? " top-page-tab-active" : ""}`}
          onClick={() => goToPage("tests")}
        >
          Tests Console
        </button>
        <button
          type="button"
          className={`top-page-tab${activePage === "developer" ? " top-page-tab-active" : ""}`}
          onClick={() => goToPage("developer")}
        >
          Developer Agent
        </button>
      </nav>

      {activePage === "developer" ? (
        <DeveloperConsolePage />
      ) : (
        <>
      <header>
        <div className="header-row">
          <div>
            <h1>Tests Console</h1>
            <p>
              Full story portfolio with per-step status. Per-story results live under{" "}
              <code>*/by-story/&lt;story&gt;/result.json</code>. After a test finishes, a terminal
              opens and dispatches the Cursor CLI agent automatically.
            </p>
          </div>
          <div className="header-orchestrator">
            <button
              type="button"
              className={`orchestrator-auto-btn${orchestratorAuto ? " orchestrator-auto-btn-on" : ""}`}
              title={
                orchestratorAuto
                  ? "Auto ON — supervisor stays alive and rescans for work. Click to turn off."
                  : "Auto mode — keep supervisor alive; continuously scan and fix portfolio"
              }
              onClick={() => void toggleOrchestratorAuto()}
            >
              {orchestratorAuto ? "Auto ON" : "Auto"}
            </button>
            <button
              type="button"
              className={`orchestrator-btn${isPortfolioOrchestratorRunning ? " orchestrator-btn-active" : ""}${portfolioOrchestratorFinished ? " orchestrator-btn-done" : ""}`}
              disabled={
                (isPortfolioOrchestratorRunning && !portfolioOrchestratorFinished) ||
                (portfolioOrchestratorFinished && !isPortfolioOrchestratorRunning)
              }
              title={
                isPortfolioOrchestratorRunning
                  ? portfolioOrchestratorJob()?.progress?.logTail ??
                    "Orchestrator running in Terminal — pixel → figma → live → delivery"
                  : "Run golden path for ALL portfolio stories until strict 0.1% green (opens Terminal + Cursor CLI)"
              }
              onClick={() => void queuePortfolioOrchestrator()}
            >
              {isPortfolioOrchestratorRunning
                ? (() => {
                    const activity = orchestratorActivityView(
                      portfolioOrchestratorJob()?.progress,
                      workerSupervisor
                    );
                    return activity.detail
                      ? `${activity.title} — ${activity.detail.length > 36 ? `${activity.detail.slice(0, 36)}…` : activity.detail}`
                      : activity.title;
                  })()
                : portfolioOrchestratorFinished
                  ? "PHASE_COMPLETE"
                  : "Orchestrator · golden ALL"}
            </button>
            {isPortfolioOrchestratorRunning && portfolioOrchestratorJob() ? (
              <button
                type="button"
                className="suite-summary-cancel"
                title="Stop portfolio orchestrator"
                onClick={() => void cancelPortfolioOrchestrator()}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
        {orchestratorAuto && (
          <div
            className={`orchestrator-auto-banner${orchestratorAutoStale ? " orchestrator-auto-banner-stale" : ""}`}
            aria-live="polite"
          >
            <span className="orchestrator-auto-dot" aria-hidden />
            {orchestratorAutoStale
              ? "Auto ON — supervisor not running; restarting Terminal…"
              : isPortfolioOrchestratorRunning
                ? "Automatic mode — supervisor active, scanning portfolio for work"
                : "Automatic mode — supervisor starting…"}
          </div>
        )}
        {supervisorActive && (
          <div className="worker-supervisor-banner" aria-live="polite">
            <span className="orchestrator-auto-dot" aria-hidden />
            <span>
              Worker supervisor · {workerSupervisor!.suiteLabel ?? workerSupervisor!.suiteId} ·{" "}
              {shortStoryId(workerSupervisor!.storyId!)} try {workerSupervisor!.attempt}/
              {workerSupervisor!.maxAttempts} · {workerSupervisor!.verdict} →{" "}
              {workerSupervisor!.nextWorkerMode}
            </span>
          </div>
        )}
        {isPortfolioOrchestratorRunning && portfolioOrchestratorJob()?.progress ? (
          <div className="orchestrator-live-panel" aria-live="polite">
            {(() => {
              const activity = orchestratorActivityView(
                portfolioOrchestratorJob()?.progress,
                workerSupervisor
              );
              return (
                <>
                  <div className="orchestrator-live-header">
                    <span className="orchestrator-spinner" aria-hidden />
                    <span className="orchestrator-live-title">{activity.title}</span>
                    {activity.meta ? (
                      <span className="orchestrator-live-meta">{activity.meta}</span>
                    ) : null}
                    {activity.detail ? (
                      <span className="orchestrator-live-phase">{activity.detail}</span>
                    ) : null}
                  </div>
                  {portfolioOrchestratorJob()?.progress?.logTail ? (
                    <pre className="orchestrator-log-tail">
                      {portfolioOrchestratorJob()!.progress!.logTail}
                    </pre>
                  ) : (
                    <p className="orchestrator-live-wait">
                      Supervisor tab open — waiting for first log line from orchestrator…
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        ) : null}
      </header>

      {apiError && (
        <div className="flow-hint api-error-banner">
          <span>{apiError}</span>
          <button type="button" className="pill-start" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      <section className="card run-settings-card">
        <div className="run-settings-header">
          <div>
            <h2>Run &amp; agent options</h2>
            <p className="run-settings-blurb">
              Golden toggles apply to <strong>Run all</strong> and orchestrator goldens.
              <strong> Fix agent model</strong> applies to Fix all, single-story fix, and portfolio
              auto-fix (batch mode when 2+ stories fail). Figma live stays serial.
            </p>
          </div>
          <button
            type="button"
            className="run-settings-toggle"
            aria-expanded={runSettingsOpen}
            onClick={() => setRunSettingsOpen((v) => !v)}
          >
            {runSettingsOpen ? "Hide" : "Show"}
          </button>
        </div>
        {runSettingsOpen ? (
          <div className="run-settings-grid">
            <label className="run-settings-option">
              <input
                type="checkbox"
                checked={runSettings.skipPass}
                onChange={(e) => void patchRunSettings({ skipPass: e.target.checked })}
              />
              <span>
                <strong>Skip passing stories</strong>
                <small>Do not re-run stories already PASS or skipped</small>
              </span>
            </label>
            <label className="run-settings-option">
              <input
                type="checkbox"
                checked={runSettings.onlyNotTested}
                onChange={(e) => void patchRunSettings({ onlyNotTested: e.target.checked })}
              />
              <span>
                <strong>Only not-tested</strong>
                <small>Stricter — run stories with no result yet (ignores fail/warn)</small>
              </span>
            </label>
            <label className="run-settings-option">
              <input
                type="checkbox"
                checked={runSettings.processPool}
                onChange={(e) => void patchRunSettings({ processPool: e.target.checked })}
              />
              <span>
                <strong>Process pool</strong>
                <small>Separate Node process per chunk (safer for figma mock at high parallelism)</small>
              </span>
            </label>
            <label className="run-settings-option">
              <input
                type="checkbox"
                checked={runSettings.applyToOrchestrator}
                onChange={(e) => void patchRunSettings({ applyToOrchestrator: e.target.checked })}
              />
              <span>
                <strong>Apply to orchestrator golden</strong>
                <small>Supervisor uses the filters above when running suite goldens</small>
              </span>
            </label>
            <label className="run-settings-option run-settings-model">
              <span>
                <strong>Fix agent model</strong>
                <small>Cursor CLI model for fix agents (override with TEST_CONSOLE_AGENT_MODEL)</small>
              </span>
              <select
                value={runSettings.agentModel ?? "composer-2.5-fast"}
                onChange={(e) => void patchRunSettings({ agentModel: e.target.value })}
              >
                {fixAgentModelOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {fixAgentModelOptions.length <= 3 ? (
                <small className="run-settings-model-hint">
                  Showing fallback list — restart test console to load all models from Cursor CLI.
                </small>
              ) : (
                <small className="run-settings-model-hint">
                  {fixAgentModelOptions.length} models from Cursor CLI (`agent --list-models`)
                </small>
              )}
            </label>
            <label className="run-settings-option run-settings-workers">
              <span>
                <strong>Parallel workers</strong>
                <small>
                  {runSettings.processPool
                    ? "Process count (in-process pool uses TEST_PARALLEL when off)"
                    : "In-process story pool (TEST_PARALLEL)"}
                  {" · "}
                  figma live forced to 1
                </small>
              </span>
              <input
                type="range"
                min={1}
                max={20}
                value={runSettings.parallelWorkers}
                onChange={(e) =>
                  void patchRunSettings({ parallelWorkers: Number(e.target.value) })
                }
              />
              <output>{runSettings.parallelWorkers}</output>
            </label>
          </div>
        ) : null}
      </section>

      <div className="grid">
        <div className="col-main">
          <section className="card">
            <h2>Services</h2>
            <p className="services-intro">Hover a service for details. Start opens a Terminal tab in this project.</p>
            <div className="pills">
              {SERVICES.map((svc) => (
                <ServicePill
                  key={svc.key}
                  label={`${svc.label}${svc.port ?? ""}`}
                  variant={serviceVariant(svc.key)}
                  detail={serviceDetail(svc.key)}
                  tooltip={svc.tooltip}
                  startLabel={svc.key === "plugin" ? "Build" : svc.key === "relay" ? "Start relay" : "Start"}
                  starting={openingService === svc.key}
                  onStart={
                    serviceNeedsStart(svc.key)
                      ? () => void startServiceInTerminal(svc.key)
                      : undefined
                  }
                />
              ))}
            </div>
            <div className="manual-preview-links">
              <span className="manual-preview-label">Manual preview</span>
              <a
                href={state?.storybook.url ?? "http://127.0.0.1:6107"}
                target="_blank"
                rel="noreferrer"
                className={state?.storybook.ok ? undefined : "manual-preview-muted"}
                title={
                  state?.storybook.ok
                    ? "Open Storybook in a new tab"
                    : "Storybook not running — start the service first"
                }
              >
                Storybook ↗
              </a>
              <a
                href={state?.playground.showcaseUrl ?? "http://127.0.0.1:6108/?view=showcase"}
                target="_blank"
                rel="noreferrer"
                className={state?.playground.ok ? undefined : "manual-preview-muted"}
                title={
                  state?.playground.ok
                    ? "Open Delivery showcase (all delivery-passed stories)"
                    : "Playground not running — start the service first"
                }
              >
                Delivery showcase ↗
              </a>
            </div>
          </section>

          <section className="card" style={{ marginTop: 16 }}>
            <h2>Test portfolio</h2>
            {portfolio?.htmlUrl && (
              <p style={{ marginTop: 0 }}>
                <a href={portfolio.htmlUrl} target="_blank" rel="noreferrer">
                  Open portfolio HTML ↗
                </a>
                {portfolio.generatedAt && (
                  <span style={{ color: "var(--muted)", marginLeft: 12 }}>
                    {new Date(portfolio.generatedAt).toLocaleString()} · {portfolio.storyCount}{" "}
                    stories
                  </span>
                )}
              </p>
            )}
            {state?.reports && state.reports.length > 0 && (
              <div className="suite-summary-col">
                {SUITE_SUMMARY_ORDER.map((suiteId) => {
                  const r = state.reports.find((x) => x.suiteId === suiteId);
                  if (!r) return null;
                  const failed = (r.counts?.fail ?? 0) + (r.counts?.error ?? 0);
                  const fixAllCount =
                    suiteId === "logic"
                      ? failed
                      : failed + (r.counts?.warn ?? 0);
                  const actionId = SUITE_RUN_ACTION[suiteId];
                  const activeJob = suiteRunJob(actionId);
                  const suiteFinalizing = Boolean(
                    state?.jobs?.find(
                      (j) => j.action === actionId && j.allStories && !j.story && j.finalizing
                    )
                  );
                  const suiteRunning = isSuiteRunning(actionId) || suiteFinalizing;
                  const fixAllJob = suiteFixAllJob(suiteId);
                  const fixAllRunning = fixAllJob != null;
                  const fixAllFinished = fixAllFinishedSuites.has(suiteId);
                  const needsRelay = actionId === "figma:live:golden";
                  const runDisabled =
                    suiteRunning || fixAllRunning || (needsRelay && !state?.relay.pluginConnected);
                  const fixAllDisabled =
                    fixAllCount === 0 || fixAllRunning || suiteRunning || isPortfolioOrchestratorRunning;
                  const suiteBusy = suiteRunning || fixAllRunning || isPortfolioOrchestratorRunning;
                  const runDisabledWithOrchestrator =
                    runDisabled || isPortfolioOrchestratorRunning;
                  return (
                    <div
                      key={r.suiteId}
                      className={`suite-summary${suiteBusy ? " suite-summary-busy" : ""}${fixAllRunning ? " suite-summary-fixing" : ""}`}
                    >
                      <strong className="suite-summary-label">{r.label}</strong>
                      {r.generatedAt && (
                        <span
                          className="suite-summary-stale"
                          title={`Report generated ${new Date(r.generatedAt).toLocaleString()}`}
                        >
                          {new Date(r.generatedAt).toLocaleString()}
                        </span>
                      )}
                      {r.total != null ? (
                        <div className="suite-summary-badges">
                          {(r.counts?.pass ?? 0) > 0 && (
                            <span className="badge pass">{r.counts!.pass} pass</span>
                          )}
                          {(r.counts?.warn ?? 0) > 0 && (
                            <span className="badge warn">{r.counts!.warn} warn</span>
                          )}
                          {failed > 0 && (
                            <span className="badge fail">{failed} failed</span>
                          )}
                          {(r.counts?.not_tested ?? 0) > 0 && (
                            <span className="badge not_tested">
                              {r.counts!.not_tested} not tested
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="suite-summary-empty">— no report</span>
                      )}
                      {suiteRunning && activeJob?.progress?.logTail ? (
                        <span className="suite-summary-progress" title={activeJob.progress.logTail}>
                          {activeJob.progress.currentStory
                            ? shortStoryId(activeJob.progress.currentStory)
                            : activeJob.progress.logTail.split("\n").pop()}
                        </span>
                      ) : null}
                      {fixAllRunning && fixAllJob?.progress ? (
                        <span
                          className="suite-summary-progress suite-summary-progress-fix"
                          title={fixAllJob.progress.logTail}
                        >
                          {formatActivityLabel(fixAllJob.progress) ??
                            fixAllJob.progress.logTail.split("\n").pop()}
                        </span>
                      ) : null}
                      <div className="suite-summary-actions">
                        <button
                          type="button"
                          className={`suite-summary-run${suiteRunning ? " suite-summary-run-active" : ""}`}
                          disabled={runDisabledWithOrchestrator}
                          title={
                            needsRelay && !state?.relay.pluginConnected
                              ? "Start Figma relay and connect the plugin first"
                              : suiteRunning && activeJob?.progress?.logTail
                                ? activeJob.progress.logTail
                                : `Run ${r.label} for all ${portfolio?.storyCount ?? "portfolio"} stories`
                          }
                          onClick={() => void run(actionId, undefined, true)}
                        >
                          {suiteRunning
                            ? formatSuiteRunLabel(activeJob, suiteFinalizing)
                            : "Run all"}
                        </button>
                        {suiteRunning && activeJob ? (
                          <button
                            type="button"
                            className="suite-summary-cancel"
                            title="Stop this run"
                            onClick={() => void cancelSuiteRun(actionId)}
                          >
                            Cancel
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={`suite-summary-fix${fixAllRunning ? " suite-summary-fix-active" : ""}${fixAllFinished ? " suite-summary-fix-done" : ""}`}
                          disabled={fixAllDisabled && !fixAllFinished}
                          title={
                            fixAllCount === 0
                              ? "No fail or warn stories in this suite"
                              : fixAllRunning && fixAllJob?.progress?.logTail
                                ? fixAllJob.progress.logTail
                                : `Fix all ${fixAllCount} fail/warn stor${fixAllCount === 1 ? "y" : "ies"} — up to 5 fix→test tries each (Terminal)`
                          }
                          onClick={() => void queueFixAllForCursor(suiteId)}
                        >
                          {formatFixAllLabel(fixAllJob, fixAllFinished)}
                        </button>
                        {fixAllRunning && fixAllJob ? (
                          <button
                            type="button"
                            className="suite-summary-cancel"
                            title="Stop Cursor agent"
                            onClick={() => void cancelFixAll(suiteId)}
                          >
                            Cancel
                          </button>
                        ) : null}
                        {r.htmlUrl && (
                          <a href={r.htmlUrl} target="_blank" rel="noreferrer">
                            report ↗
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {portfolio && portfolio.rows.length > 0 ? (
              <div className="portfolio-scroll">
                <table className="portfolio-table">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="story-col">
                        Story
                      </th>
                      {portfolio.steps.map((s, stepIndex) => (
                        <th
                          key={s.id}
                          colSpan={stepColSpan(s.id)}
                          className={stepIndex > 0 ? "step-group-start" : undefined}
                        >
                          {s.label}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {portfolio.steps.flatMap((s, stepIndex) => {
                        const cols = [
                          <th
                            key={`${s.id}-st`}
                            className={`subhead ${stepIndex > 0 ? "step-group-start" : ""}`}
                          >
                            Status
                          </th>,
                          <th key={`${s.id}-pct`} className="subhead">
                            {s.id === "logic" ? "Gaps" : "Diff %"}
                          </th>
                        ];
                        if (STEPS_WITH_COMPARE.has(s.id)) {
                          cols.push(
                            <th key={`${s.id}-cmp`} className="subhead">
                              Compare
                            </th>
                          );
                        }
                        return cols;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.rows.map((row) => (
                        <tr key={row.storyId} className="portfolio-row">
                          <td className="story-col">
                            <code title={row.storyId}>{row.storyId}</code>
                          </td>
                          {portfolio.steps.flatMap((step, stepIndex) => {
                            const c = row.cells[step.id];
                            const divider =
                              stepIndex > 0 ? "step-group-start" : "";
                            const cols = [
                              <td
                                key={`${row.storyId}-${step.id}-s`}
                                className={divider}
                              >
                                <span
                                  className={`badge ${statusClass(c?.status ?? "not_tested")}`}
                                  title={
                                    c?.maxRegionPercent != null && c.status !== "pass"
                                      ? `Global ${c.percent?.toFixed(2) ?? "?"}% · worst hotspot ${c.maxRegionPercent.toFixed(2)}% (both must be ≤ 0.1% strict, 1.5% for mui--showcase hotspot)${
                                          c?.testedAt
                                            ? ` · ${new Date(c.testedAt).toLocaleString()}`
                                            : ""
                                        }`
                                      : c?.testedAt
                                        ? `Last run: ${new Date(c.testedAt).toLocaleString()}`
                                        : undefined
                                  }
                                >
                                  {c?.status ?? "not tested"}
                                </span>
                              </td>,
                              <td key={`${row.storyId}-${step.id}-pct`} className="pct-cell">
                                {c?.status === "not_tested" || c?.percent == null
                                  ? "—"
                                  : step.id === "logic"
                                    ? String(Math.round(c.percent))
                                    : c.maxRegionPercent != null &&
                                        c.maxRegionPercent > 0.1 &&
                                        c.status !== "pass"
                                      ? `${c.percent.toFixed(2)}% · h ${c.maxRegionPercent.toFixed(2)}%`
                                      : `${c.percent.toFixed(2)}%`}
                              </td>
                            ];
                            if (STEPS_WITH_COMPARE.has(step.id)) {
                              cols.push(
                                <td key={`${row.storyId}-${step.id}-cmp`}>
                                  <div className="artifacts-cell">
                                    {c?.compareUrl && c.status !== "not_tested" ? (
                                      <a href={c.compareUrl} target="_blank" rel="noreferrer">
                                        compare
                                      </a>
                                    ) : (
                                      <span className="muted-artifacts">—</span>
                                    )}
                                  </div>
                                </td>
                              );
                            }
                            return cols;
                          })}
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: "var(--muted)" }}>
                No portfolio yet. Run a test suite or{" "}
                <code>pnpm test:portfolio:refresh</code> after Storybook index exists.
              </p>
            )}
          </section>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
