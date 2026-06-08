import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { attachJobStream, killJob, type JobProgress } from "./job-stream";
import { jobRuntimeLabel } from "./format-elapsed";
import { DeveloperConsolePage } from "./DeveloperConsolePage";
import { FleetConsolePage } from "./FleetConsolePage";
import { LlmSettingsCard } from "./LlmSettingsCard";
import { preloadPreviewImages } from "./preview-image-cache";
import { resolveRowOriginalUrl } from "./resolve-original-url";
import { ItemDetailPage } from "./ItemDetailPage";
import { PortfolioTable } from "./PortfolioTable";
import { OrchestratorLaunchDialog } from "./OrchestratorLaunchDialog";
import { SERVICES, type ServiceKey } from "./services";
import type {
  ActionDef,
  ConsoleState,
  JobInfo,
  PortfolioRow,
  PortfolioState,
  RunSettings,
  LlmSettingsPublic,
  WorkerSupervisorState
} from "./types";

declare const __TEST_CONSOLE_SERVER_VERSION__: number;
const EXPECTED_SERVER_VERSION: number = __TEST_CONSOLE_SERVER_VERSION__;

type AppPage = "tests" | "developer" | "fleet";

type AppRoute =
  | { page: AppPage }
  | { page: "tests"; storyId: string };

const STORY_HASH_PREFIX = "#story/";

const INSPECT_PANEL_WIDTH_KEY = "test-console.inspectPanelWidth";
const INSPECT_PANEL_WIDTH_DEFAULT = 420;
const INSPECT_PANEL_WIDTH_MIN = 320;
const INSPECT_PANEL_WIDTH_MAX_RATIO = 0.92;
const INSPECT_PANEL_WIDTH_MAX_PX = 1200;

function inspectPanelWidthMax(): number {
  if (typeof window === "undefined") return INSPECT_PANEL_WIDTH_MAX_PX;
  return Math.min(window.innerWidth * INSPECT_PANEL_WIDTH_MAX_RATIO, INSPECT_PANEL_WIDTH_MAX_PX);
}

function readInspectPanelWidth(): number {
  if (typeof window === "undefined") return INSPECT_PANEL_WIDTH_DEFAULT;
  const saved = window.localStorage.getItem(INSPECT_PANEL_WIDTH_KEY);
  const n = saved ? Number.parseInt(saved, 10) : INSPECT_PANEL_WIDTH_DEFAULT;
  if (!Number.isFinite(n)) return INSPECT_PANEL_WIDTH_DEFAULT;
  return Math.min(inspectPanelWidthMax(), Math.max(INSPECT_PANEL_WIDTH_MIN, n));
}

function routeFromHash(): AppRoute {
  const h = window.location.hash;
  if (h === "#developer") return { page: "developer" };
  if (h === "#fleet" || h === "#agents") return { page: "fleet" };
  if (h.startsWith(STORY_HASH_PREFIX)) {
    const storyId = decodeURIComponent(h.slice(STORY_HASH_PREFIX.length));
    if (storyId) return { page: "tests", storyId };
  }
  return { page: "tests" };
}

function pageFromRoute(route: AppRoute): AppPage {
  return route.page === "tests" && "storyId" in route ? "tests" : route.page;
}

function syncHashPage(page: AppPage) {
  const next =
    page === "developer" ? "#developer" : page === "fleet" ? "#fleet" : "#tests";
  if (window.location.hash !== next) window.location.hash = next;
}

function storyHash(storyId: string): string {
  return `${STORY_HASH_PREFIX}${encodeURIComponent(storyId)}`;
}

const UNIFIED_STEP_ORDER = [
  "structural",
  "vsFigmaLive",
  "vsStorybook",
  "vsReactHtml",
  "vsReactTsx",
  "logic"
] as const;

const FIGMA_ENTRY_STEP_ORDER = [
  "manifestContract",
  "vsFigmaLive",
  "vsStorybook",
  "vsReactHtml",
  "vsReactTsx",
  "logic"
] as const;

const FIGMA_ENTRY_RUN_ACTION: Record<
  (typeof FIGMA_ENTRY_STEP_ORDER)[number],
  string | null
> = {
  manifestContract: "figma:screen:manifest",
  vsFigmaLive: "figma:screen:parity",
  vsStorybook: "figma:screen:parity",
  vsReactHtml: "figma:screen:parity",
  vsReactTsx: "figma:screen:reacttsx",
  logic: "figma:screen:logic"
};

/** Storybook ingress — legacy suite mapping until storybook-parity harness lands. */
const STORYBOOK_FIX_ORDER = ["pixel", "figmaLive", "delivery", "logic"] as const;

const STORYBOOK_RUN_ACTION: Record<(typeof STORYBOOK_FIX_ORDER)[number], string> = {
  pixel: "pixel:golden",
  figmaLive: "figma:live:golden",
  delivery: "delivery:golden",
  logic: "logic:golden"
};

const UNIFIED_TO_STORYBOOK_FIX: Partial<Record<(typeof UNIFIED_STEP_ORDER)[number], string>> = {
  structural: "pixel",
  vsFigmaLive: "figmaLive",
  vsReactHtml: "delivery",
  vsReactTsx: "delivery",
  logic: "logic"
};

/** Map unified portfolio step id → legacy fix-all suite id (pixel, figmaLive, …). */
function legacyFixSuiteId(unifiedStepId: string): string {
  return (
    UNIFIED_TO_STORYBOOK_FIX[unifiedStepId as (typeof UNIFIED_STEP_ORDER)[number]] ??
    unifiedStepId
  );
}

/** True when workerSupervisor.suiteId (legacy) matches a unified portfolio step. */
function legacyMatchesUnifiedStep(
  legacySuiteId: string | undefined,
  unifiedStepId: string
): boolean {
  if (!legacySuiteId) return false;
  return legacyFixSuiteId(unifiedStepId) === legacySuiteId;
}

const SUITE_RUN_ACTION: Record<string, string> = {
  pixel: "pixel:golden",
  figma: "figma:golden",
  figmaLive: "figma:live:golden",
  delivery: "delivery:golden",
  logic: "logic:golden"
};

const DEFAULT_RUN_SETTINGS: RunSettings = {
  skipPass: true,
  onlyNotTested: false,
  parallelWorkers: 20,
  processPool: false,
  applyToOrchestrator: true,
  agentModel: "composer-2.5-fast",
  agentCli: "cursor",
  scope: "failures_only",
  singleStepId: null,
  sortBy: "flow_first",
  maxFixRoundsPerStep: 10,
  maxAutoRetriesWhenStuck: 3,
  maxAgentCallsPerLaunch: 100,
  launchAutoMode: true
};

function fixAllActionId(suiteId: string): string {
  return `fix-all:${suiteId}`;
}

const FIX_PIPELINE_STEPS = ["pixel", "figma", "figmaLive", "delivery"] as const;

function isFixableStatus(status: string | undefined): boolean {
  return status === "fail" || status === "warn" || status === "error";
}

function formatFixApiError(
  action: "Fix all" | "Fix story",
  err: string,
  _source?: string
): string {
  if (err.includes("Fix all already running")) {
    return `${action} blocked — a fix loop is already running for this suite. Cancel it from Running jobs, or wait ~20s for stale cleanup, then retry.`;
  }
  if (err.includes("No failing or warn stories") || err.includes("No report row for")) {
    return `${action} failed — test console server is outdated. Run \`pnpm test:console:restart\`, refresh this page, then retry.`;
  }
  if (err === "run until pass") {
    return `${action} failed (server bug — restart: pnpm test:console:restart, then retry)`;
  }
  return `${action} failed: ${err}`;
}

/** Earliest failing pipeline step — fix that suite until PASS. */
function fixSuiteForRow(row: PortfolioRow): string | null {
  for (const stepId of FIX_PIPELINE_STEPS) {
    if (isFixableStatus(row.cells[stepId]?.status)) {
      return stepId;
    }
  }
  return null;
}

function fixSuiteForUnifiedRow(row: PortfolioRow): string | null {
  const order =
    row.entryPoint === "figma"
      ? [...FIGMA_ENTRY_STEP_ORDER]
      : [...UNIFIED_STEP_ORDER];
  for (const stepId of order) {
    const c = row.cells[stepId];
    if (!c || c.canRun === false) continue;
    if (isFixableStatus(c.status)) return stepId;
    if (c.status === "not_tested") return stepId;
  }
  return null;
}

function rowPipelineComplete(row: PortfolioRow): boolean {
  for (const stepId of UNIFIED_STEP_ORDER) {
    const status = row.cells[stepId]?.status ?? "not_tested";
    if (status !== "pass" && status !== "skipped") return false;
  }
  return true;
}

function rowNeedsRelay(row: PortfolioRow): boolean {
  for (const stepId of UNIFIED_STEP_ORDER) {
    const status = row.cells[stepId]?.status ?? "not_tested";
    if (status === "pass" || status === "skipped") continue;
    return stepId === "vsFigmaLive";
  }
  return false;
}

const ROW_FIX_ACTION = "row-pipeline";

function runActionForRow(row: PortfolioRow, suiteId: string): string | null {
  if (row.entryPoint === "figma") {
    if (suiteId === "structural") return "figma:screen:manifest";
    if (suiteId === "logic") return "figma:screen:logic";
    if (suiteId.startsWith("vs")) return "figma:screen:parity";
    return FIGMA_ENTRY_RUN_ACTION[suiteId as (typeof FIGMA_ENTRY_STEP_ORDER)[number]] ?? null;
  }
  const legacy = UNIFIED_TO_STORYBOOK_FIX[suiteId as (typeof UNIFIED_STEP_ORDER)[number]];
  if (!legacy) return null;
  return STORYBOOK_RUN_ACTION[legacy as keyof typeof STORYBOOK_RUN_ACTION] ?? null;
}

function suiteLabelForFix(suiteId: string): string {
  const labels: Record<string, string> = {
    structural: "Structural",
    vsFigmaLive: "→ Figma live",
    vsStorybook: "→ Storybook",
    vsReactHtml: "→ ReactHtml",
    vsReactTsx: "→ ReactTsx",
    manifestContract: "Manifest → Contract",
    logic: "Logic audit",
    pixel: "Pixel",
    figmaLive: "Figma live",
    delivery: "Delivery"
  };
  return labels[suiteId] ?? suiteId;
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

async function fetchQuickGenerationPortfolio(): Promise<PortfolioState | null> {
  const res = await fetch("/api/quick-generation-portfolio");
  if (!res.ok) return null;
  return res.json();
}

async function fetchPortfolio(): Promise<PortfolioState | null> {
  const res = await fetch("/api/portfolio");
  if (!res.ok) return null;
  return res.json();
}

async function fetchFigmaScreens(): Promise<PortfolioState | null> {
  const res = await fetch("/api/figma-screens");
  if (!res.ok) return null;
  return res.json();
}

type RunningJobEntry = {
  jobId: string;
  actionId: string;
  storyId?: string;
  allStories?: boolean;
  label: string;
  startedAt?: string;
  endedAt?: string;
  status?: string;
  progress?: JobProgress;
  logFile?: string | null;
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
  const supervisorLive = workerSupervisor && !workerSupervisor.finished;

  if (supervisorLive) {
    const step =
      workerSupervisor.suiteLabel ??
      (workerSupervisor.suiteId ? suiteStepLabel(workerSupervisor.suiteId) : undefined);
    if (step) metaParts.push(step);

    if (workerSupervisor.phase === "fix-all-batch") {
      metaParts.push(
        `Batch ${workerSupervisor.attempt ?? "?"}/${workerSupervisor.maxAttempts ?? "?"}`
      );
      const n = workerSupervisor.storyIds?.length ?? workerSupervisor.storyTotal;
      if (n != null && n > 0) {
        metaParts.push(`${n} ${n === 1 ? "story" : "stories"}`);
      }
    } else if (workerSupervisor.storyIndex != null && workerSupervisor.storyTotal) {
      metaParts.push(`Story ${workerSupervisor.storyIndex}/${workerSupervisor.storyTotal}`);
      if (workerSupervisor.attempt != null) {
        metaParts.push(`Try ${workerSupervisor.attempt}/${workerSupervisor.maxAttempts ?? "?"}`);
      }
    }
  } else if (progress?.activityMeta) {
    metaParts.push(progress.activityMeta);
  }

  let detail = progress?.activityDetail;
  if (supervisorLive && workerSupervisor.storyId) {
    const q = `"${shortStoryId(workerSupervisor.storyId)}"`;
    const actionHint = detail?.includes("·")
      ? detail
          .split("·")
          .slice(1)
          .join("·")
          .trim()
      : undefined;
    const hintOk =
      actionHint &&
      !actionHint.includes(workerSupervisor.storyId) &&
      !actionHint.startsWith('"');
    detail = hintOk ? `${q} · ${actionHint}` : q;
  } else if (workerSupervisor?.storyIds?.length && (!detail || !detail.includes('"'))) {
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

function formatOrchestratorActivityLabel(
  progress: JobProgress | undefined,
  workerSupervisor?: WorkerSupervisorState | null
): string | undefined {
  const activity = orchestratorActivityView(progress, workerSupervisor);
  const parts = [activity.title];
  if (activity.meta) parts.push(activity.meta);
  if (activity.detail) parts.push(activity.detail);
  return parts.join(" · ");
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

function formatFixAllLabel(
  entry: RunningJobEntry | undefined,
  finished: boolean,
  workerSupervisor?: WorkerSupervisorState | null
): string {
  if (finished) return "Finished";
  if (!entry) return "Fix all";
  const activity = formatOrchestratorActivityLabel(entry.progress, workerSupervisor);
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
      label: j.label || runningJobLabel(j.action, storyId, actions),
      startedAt: j.startedAt,
      endedAt: j.endedAt,
      status: j.status,
      logFile: j.logFile ?? null
    };
  }
  return next;
}

function mergeSupervisorFixAllJob(
  running: Record<string, RunningJobEntry>,
  workerSupervisor: WorkerSupervisorState | null | undefined
): Record<string, RunningJobEntry> {
  if (!workerSupervisor?.jobId || workerSupervisor.finished) return running;
  const phase = workerSupervisor.phase;
  if (phase !== "fix-all" && phase !== "fix-all-batch") return running;
  const suiteId = workerSupervisor.suiteId;
  if (!suiteId) return running;
  const jobId = workerSupervisor.jobId;
  if (running[jobId]) return running;
  const count = workerSupervisor.storyTotal ?? workerSupervisor.storyIds?.length ?? "?";
  return {
    ...running,
    [jobId]: {
      jobId,
      actionId: fixAllActionId(suiteId),
      label: `Fix all · ${workerSupervisor.suiteLabel ?? suiteStepLabel(suiteId)} (${count} stories)`,
      startedAt: workerSupervisor.updatedAt
    }
  };
}

function findRecentJobForActions(
  jobs: JobInfo[] | undefined,
  actionIds: string[]
): JobInfo | undefined {
  if (!jobs?.length) return undefined;
  return jobs.find((j) => actionIds.includes(j.action) && j.startedAt);
}

function resolveSuiteRuntime(
  fixAllJob: RunningJobEntry | undefined,
  activeJob: RunningJobEntry | undefined,
  fixAllRunning: boolean,
  suiteRunning: boolean,
  jobs: JobInfo[] | undefined,
  actionId: string,
  fixAllActionId: string,
  runClock: number,
  showRecentDone: boolean
): { label: string; live: boolean; title?: string } | null {
  if (fixAllRunning && fixAllJob?.startedAt) {
    const label = jobRuntimeLabel(fixAllJob.startedAt, undefined, runClock);
    if (!label) return null;
    return {
      label,
      live: true,
      title: `Running since ${new Date(fixAllJob.startedAt).toLocaleString()}`
    };
  }
  if (suiteRunning && activeJob?.startedAt) {
    const label = jobRuntimeLabel(activeJob.startedAt, undefined, runClock);
    if (!label) return null;
    return {
      label,
      live: true,
      title: `Running since ${new Date(activeJob.startedAt).toLocaleString()}`
    };
  }
  if (!showRecentDone) return null;
  const recent = findRecentJobForActions(jobs, [actionId, fixAllActionId]);
  if (!recent?.startedAt || !recent.endedAt || recent.status === "running") return null;
  const endedMs = Date.parse(recent.endedAt);
  if (Number.isNaN(endedMs) || runClock - endedMs > 15 * 60 * 1000) return null;
  const label = jobRuntimeLabel(recent.startedAt, recent.endedAt, runClock);
  if (!label) return null;
  return {
    label,
    live: false,
    title: `Finished ${new Date(recent.endedAt).toLocaleString()}`
  };
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
  const [quickPortfolio, setQuickPortfolio] = useState<PortfolioState | null>(null);
  const [portfolioViewTab, setPortfolioViewTab] = useState<"test" | "quick">("test");
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
  const [invalidatingPortfolio, setInvalidatingPortfolio] = useState(false);
  const [deletingRowKey, setDeletingRowKey] = useState<string | null>(null);
  const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
  const [orchestratorLaunching, setOrchestratorLaunching] = useState(false);
  const [route, setRoute] = useState<AppRoute>(() => routeFromHash());
  const activePage = pageFromRoute(route);
  const inspectStoryId = route.page === "tests" && "storyId" in route ? route.storyId : null;
  const [inspectPanelWidth, setInspectPanelWidth] = useState(readInspectPanelWidth);
  const [inspectPanelResizing, setInspectPanelResizing] = useState(false);
  const inspectPanelResizeRef = useRef({ startX: 0, startWidth: INSPECT_PANEL_WIDTH_DEFAULT });
  const [runClock, setRunClock] = useState(() => Date.now());
  const orchestratorAuto = state?.orchestratorAuto ?? false;
  const orchestratorRunning = state?.orchestratorRunning ?? false;
  const orchestratorAutoStale = orchestratorAuto && !orchestratorRunning;
  const workerSupervisor = state?.workerSupervisor;
  const supervisorFixAllActive = Boolean(
    workerSupervisor?.jobId &&
      !workerSupervisor.finished &&
      workerSupervisor.suiteId &&
      (workerSupervisor.phase === "fix-all" || workerSupervisor.phase === "fix-all-batch")
  );
  const supervisorActive =
    workerSupervisor && !workerSupervisor.finished && workerSupervisor.storyId;
  const fleetLive = orchestratorRunning || supervisorFixAllActive || Boolean(supervisorActive);
  const ensureAutoRef = useRef(0);
  const PORTFOLIO_ORCHESTRATOR_ACTION = "portfolio-orchestrator";
  const runSettings = state?.runSettings ?? DEFAULT_RUN_SETTINGS;
  const maxParallelWorkers = state?.maxParallelWorkers ?? 100;
  const agentModelOptions = state?.agentModelOptions ?? [];
  const fixAgentModelOptions = useMemo(() => {
    const current = runSettings.agentModel ?? "composer-2.5-fast";
    if (!current || agentModelOptions.some((o) => o.id === current)) {
      return agentModelOptions;
    }
    return [{ id: current, label: `${current} (saved)` }, ...agentModelOptions];
  }, [agentModelOptions, runSettings.agentModel]);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchState();
      setState(s);
      setRunningJobs((prev) => {
        const fromServer = syncRunningFromServer(s.jobs, actions, finishedJobIdsRef.current);
        const withSupervisor = mergeSupervisorFixAllJob(fromServer, s.workerSupervisor);
        const next: Record<string, RunningJobEntry> = { ...withSupervisor };
        for (const id of Object.keys(next)) {
          const progress = prev[id]?.progress;
          const merged = next[id]!;
          if (progress) next[id] = { ...merged, progress };
        }
        return next;
      });
      setRunningSuiteActions(syncRunningSuiteActions(s.jobs));
      setApiError(null);
      const p = await fetchPortfolio();
      setPortfolio(p);
      const qp = await fetchQuickGenerationPortfolio();
      setQuickPortfolio(qp);
    } catch {
      setApiError("Cannot reach test console API. Start: pnpm test:console");
      setState(null);
      setPortfolio(null);
      setQuickPortfolio(null);
    }
  }, [actions]);

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
      if (patch.agentCli !== undefined) {
        void refresh();
      }
    } catch {
      /* ignore */
    }
  }, [refresh]);

  const runningJobKey = Object.keys(runningJobs).sort().join(",");

  useEffect(() => {
    refresh();
    fetchActions().then(setActions);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [refresh]);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const goToPage = (page: AppPage) => {
    setRoute({ page });
    syncHashPage(page);
  };

  const closeInspectPanel = () => {
    setRoute({ page: "tests" });
    if (window.location.hash.startsWith(STORY_HASH_PREFIX)) {
      window.location.hash = "#tests";
    }
  };

  const toggleInspectStory = (storyId: string) => {
    if (inspectStoryId === storyId) {
      closeInspectPanel();
      return;
    }
    const next = storyHash(storyId);
    if (window.location.hash !== next) window.location.hash = next;
    setRoute({ page: "tests", storyId });
  };

  useEffect(() => {
    if (!inspectStoryId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [inspectStoryId]);

  useEffect(() => {
    window.localStorage.setItem(INSPECT_PANEL_WIDTH_KEY, String(inspectPanelWidth));
  }, [inspectPanelWidth]);

  useEffect(() => {
    if (!inspectStoryId) return;
    const clamp = () => {
      setInspectPanelWidth((w) =>
        Math.min(inspectPanelWidthMax(), Math.max(INSPECT_PANEL_WIDTH_MIN, w))
      );
    };
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [inspectStoryId]);

  useEffect(() => {
    if (!inspectPanelResizing) return;
    const onMove = (e: PointerEvent) => {
      const { startX, startWidth } = inspectPanelResizeRef.current;
      const next = startWidth + (startX - e.clientX);
      setInspectPanelWidth(
        Math.min(inspectPanelWidthMax(), Math.max(INSPECT_PANEL_WIDTH_MIN, next))
      );
    };
    const onUp = () => setInspectPanelResizing(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [inspectPanelResizing]);

  const beginInspectPanelResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    inspectPanelResizeRef.current = { startX: e.clientX, startWidth: inspectPanelWidth };
    setInspectPanelResizing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const toggleInspectPanelWidth = () => {
    const max = inspectPanelWidthMax();
    const expanded = Math.min(max, Math.max(640, Math.round(max * 0.65)));
    setInspectPanelWidth((w) =>
      w >= expanded - 24 ? INSPECT_PANEL_WIDTH_DEFAULT : expanded
    );
  };

  useEffect(() => {
    const busy = runningJobKey.length > 0;
    const t = setInterval(refresh, busy ? 1500 : 4000);
    return () => clearInterval(t);
  }, [refresh, runningJobKey]);

  useEffect(() => {
    if (!runningJobKey.length && !supervisorFixAllActive) return;
    const t = setInterval(() => setRunClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runningJobKey, supervisorFixAllActive]);

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

  const queueFixStoryForCursor = async (storyId: string, entryPoint?: string) => {
    setApiError(null);
    try {
      const res = await fetch("/api/agent/request-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowPipeline: true,
          storyId,
          entryPoint: entryPoint ?? "storybook"
        })
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
          setApiError(`Fix story failed: ${text || res.statusText}`);
          return;
        }
      }
      if (!res.ok) {
        setApiError(data.error ?? text ?? "Fix story failed");
        return;
      }
      if (!data.jobId) {
        setApiError("Fix story did not return a job id");
        return;
      }
      const entry: RunningJobEntry = {
        jobId: data.jobId,
        actionId: ROW_FIX_ACTION,
        storyId,
        label: data.label ?? `Fix story · ${storyId}`,
        startedAt: new Date().toISOString(),
        status: "running"
      };
      setRunningJobs((prev) => ({ ...prev, [data.jobId!]: entry }));
      if (!data.terminalDispatched) {
        setApiError("Terminal did not open — watch job in dashboard");
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    }
  };

  const invalidateAllTests = async () => {
    if (
      !window.confirm(
        "Clear all stored test results? Every row returns to not tested. PNG artifacts are kept."
      )
    ) {
      return;
    }
    setInvalidatingPortfolio(true);
    setApiError(null);
    try {
      const res = await fetch("/api/portfolio/invalidate", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string; removedCount?: number };
      if (!res.ok || !data.ok) {
        setApiError(data.error ?? "Failed to invalidate test results");
        return;
      }
      await refresh();
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setInvalidatingPortfolio(false);
    }
  };

  const deletePortfolioRow = async (row: PortfolioRow) => {
    const entryPoint = row.entryPoint ?? "storybook";
    const detail =
      entryPoint === "figma"
        ? "Deletes the Guing manifest/PNG, all figma-screen-diffs artifacts, delivery package, lab-memory notes, and locks for this screen."
        : "Removes this story from the portfolio (excluded from Storybook index), deletes all suite diff artifacts, delivery package, lab-memory notes, and locks. Storybook source code is not touched.";
    if (
      !window.confirm(
        `Delete "${row.storyId}" (${entryPoint}) from tests?\n\n${detail}\n\nThis cannot be undone.`
      )
    ) {
      return;
    }
    const rowKey = `${entryPoint}:${row.storyId}`;
    setDeletingRowKey(rowKey);
    setApiError(null);
    try {
      const res = await fetch("/api/portfolio/rows/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId: row.storyId, entryPoint })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        removedCount?: number;
      };
      if (!res.ok || !data.ok) {
        setApiError(data.error ?? "Failed to delete row");
        return;
      }
      if (inspectStoryId === row.storyId) {
        closeInspectPanel();
      }
      await refresh();
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingRowKey(null);
    }
  };

  const deleteQuickGenerationRow = async (row: PortfolioRow) => {
    if (!row.jobId) {
      setApiError("Quick generation row is missing job id");
      return;
    }
    if (
      !window.confirm(
        `Delete quick run "${row.jobId}" (${row.storyId})?\n\nRemoves only this Quick generation record. The Test portfolio row for ${row.storyId} and its artifacts are unchanged.`
      )
    ) {
      return;
    }
    setDeletingRowKey(`quick:${row.jobId}`);
    setApiError(null);
    try {
      const res = await fetch("/api/quick-generation-portfolio/runs/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: row.jobId })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        removedCount?: number;
      };
      if (!res.ok || !data.ok) {
        setApiError(data.error ?? "Failed to delete quick generation run");
        return;
      }
      await refresh();
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingRowKey(null);
    }
  };

  const launchOrchestrator = async (settings: RunSettings, options: { invalidateAll: boolean }) => {
    setApiError(null);
    setPortfolioOrchestratorFinished(false);
    setOrchestratorLaunching(true);
    if (orchestratorRunning) {
      setApiError("Orchestrator is already running");
      setOrchestratorLaunching(false);
      return;
    }
    try {
      const res = await fetch("/api/orchestrator/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings, invalidateAll: options.invalidateAll })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; jobId?: string };
      if (!res.ok || !data.ok) {
        setApiError(data.error ?? "Launch failed");
        setOrchestratorLaunching(false);
        return;
      }
      if (data.jobId) {
        setRunningJobs((prev) => ({
          ...prev,
          [data.jobId!]: {
            jobId: data.jobId!,
            actionId: PORTFOLIO_ORCHESTRATOR_ACTION,
            label: "Orchestrator · unified portfolio",
            startedAt: new Date().toISOString(),
            status: "running"
          }
        }));
      }
      await refresh();
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrchestratorLaunching(false);
    }
  };

  const queuePortfolioOrchestrator = async () => {
    setLaunchDialogOpen(true);
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
        label: jobLabel,
        startedAt: new Date().toISOString(),
        status: "running"
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

  const storyFixJob = (suiteId: string, storyId: string) =>
    Object.values(runningJobs).find(
      (j) => j.actionId === fixAllActionId(suiteId) && j.storyId === storyId
    );

  const portfolioOrchestratorJob = () =>
    Object.values(runningJobs).find((j) => j.actionId === PORTFOLIO_ORCHESTRATOR_ACTION);

  const rowFixJob = (storyId: string) =>
    Object.values(runningJobs).find(
      (j) => j.actionId === ROW_FIX_ACTION && j.storyId === storyId
    );

  const anyRowFixJob = () =>
    Object.values(runningJobs).find((j) => j.actionId === ROW_FIX_ACTION);

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
    void refresh();
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

  const activePortfolio = portfolio;

  const inspectRow = useMemo(() => {
    if (!inspectStoryId || !activePortfolio) return null;
    return activePortfolio.rows.find((r) => r.storyId === inspectStoryId) ?? null;
  }, [inspectStoryId, activePortfolio]);

  useEffect(() => {
    if (!activePortfolio?.rows.length) return;
    preloadPreviewImages(activePortfolio.rows.map((row) => resolveRowOriginalUrl(row)));
  }, [activePortfolio]);

  const serverVersionMismatch =
    state?.serverVersion != null && state.serverVersion !== EXPECTED_SERVER_VERSION;

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
          className={`top-page-tab${activePage === "fleet" ? " top-page-tab-active" : ""}${fleetLive && activePage !== "fleet" ? " top-page-tab-live" : ""}`}
          onClick={() => goToPage("fleet")}
        >
          Agent Console
          {fleetLive && activePage !== "fleet" ? (
            <span className="top-page-tab-dot" title="Agents active" />
          ) : null}
        </button>
        <button
          type="button"
          className={`top-page-tab${activePage === "developer" ? " top-page-tab-active" : ""}`}
          onClick={() => goToPage("developer")}
        >
          Developer Agent
        </button>
      </nav>

      {activePage === "fleet" ? (
        <FleetConsolePage />
      ) : activePage === "developer" ? (
        <DeveloperConsolePage />
      ) : (
        <>
      <header>
        <div className="header-row">
          <div>
            <h1>Tests Console</h1>
            <p>
              Per-row <strong>Fix story</strong> runs the full pipeline for one item (test → fix until
              green). <strong>Run all</strong> does the same, one row after another.
            </p>
          </div>
          <div className="header-orchestrator">
            <button
              type="button"
              className={`orchestrator-btn${isPortfolioOrchestratorRunning || orchestratorLaunching ? " orchestrator-btn-active" : ""}${portfolioOrchestratorFinished ? " orchestrator-btn-done" : ""}`}
              disabled={(isPortfolioOrchestratorRunning && !portfolioOrchestratorFinished) || orchestratorLaunching}
              title={
                isPortfolioOrchestratorRunning
                  ? portfolioOrchestratorJob()?.progress?.logTail ?? "Orchestrator running in Terminal"
                  : "Open Run all — one row at a time until portfolio green"
              }
              onClick={() => void queuePortfolioOrchestrator()}
            >
              {orchestratorLaunching && !isPortfolioOrchestratorRunning
                ? "Launching…"
                : isPortfolioOrchestratorRunning
                  ? (() => {
                      const activity = orchestratorActivityView(
                        portfolioOrchestratorJob()?.progress,
                        workerSupervisor
                      );
                      return activity.detail
                        ? `${activity.title} — ${activity.detail.length > 32 ? `${activity.detail.slice(0, 32)}…` : activity.detail}`
                        : activity.title;
                    })()
                  : portfolioOrchestratorFinished
                    ? "PHASE_COMPLETE"
                    : "Run all"}
            </button>
            {isPortfolioOrchestratorRunning && portfolioOrchestratorJob() ? (
              <button
                type="button"
                className="suite-summary-cancel"
                title="Stop orchestrator and turn off Auto"
                onClick={() => void cancelPortfolioOrchestrator()}
              >
                Stop
              </button>
            ) : null}
          </div>
        </div>
        {orchestratorAuto && isPortfolioOrchestratorRunning && (
          <div className="orchestrator-auto-banner" aria-live="polite">
            <span className="orchestrator-auto-dot" aria-hidden />
            Launch session active — supervisor runs until complete, stuck, or human action
          </div>
        )}
        {workerSupervisor?.humanMessage && workerSupervisor.finished ? (
          <div className="orchestrator-human-banner" role="alert">
            <strong>{workerSupervisor.humanTitle ?? "Orchestrator paused"}</strong>
            <p>{workerSupervisor.humanMessage}</p>
            <button type="button" className="pill-start" onClick={() => setLaunchDialogOpen(true)}>
              Re-launch
            </button>
          </div>
        ) : null}
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
              const logFile = portfolioOrchestratorJob()?.logFile;
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
                    {logFile ? (
                      <span
                        className="orchestrator-log-file-badge"
                        title={logFile}
                      >
                        📄 {logFile.split("/").pop()}
                      </span>
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

      {serverVersionMismatch && (
        <div className="flow-hint api-error-banner">
          <span>
            Test console server is out of date (running v{state?.serverVersion}, UI expects v
            {EXPECTED_SERVER_VERSION}). Fix buttons may not work until you restart:{" "}
            <code>pnpm test:console:restart</code>
          </span>
        </div>
      )}

      {apiError && (
        <div className="flow-hint api-error-banner">
          <span>{apiError}</span>
          <button type="button" className="pill-start" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      <OrchestratorLaunchDialog
        open={launchDialogOpen}
        onClose={() => setLaunchDialogOpen(false)}
        initialSettings={runSettings}
        portfolio={portfolio}
        agentModelOptions={fixAgentModelOptions}
        maxParallelWorkers={maxParallelWorkers}
        orchestratorRunning={isPortfolioOrchestratorRunning}
        onLaunch={launchOrchestrator}
      />

      <div className="tests-workspace">
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
                href={
                  state?.manualPreview?.storybookUrl ??
                  state?.storybook.url ??
                  "http://127.0.0.1:6107"
                }
                target="_blank"
                rel="noreferrer"
                className={state?.storybook.ok ? undefined : "manual-preview-muted"}
                title={
                  state?.storybook.ok
                    ? `Storybook — ${state?.manualPreview?.storybookCount ?? 0} passed Storybook ${(state?.manualPreview?.storybookCount ?? 0) === 1 ? "story" : "stories"}`
                    : "Storybook not running — start the service first"
                }
              >
                Storybook ↗
              </a>
              <a
                href={
                  state?.manualPreview?.deliveryShowcaseUrl ??
                  state?.playground.showcaseUrl ??
                  "http://127.0.0.1:6108/?view=showcase"
                }
                target="_blank"
                rel="noreferrer"
                className={state?.playground.ok ? undefined : "manual-preview-muted"}
                title={
                  state?.playground.ok
                    ? `Delivery showcase — JSX packages from logic audit (${state?.manualPreview?.deliveryCount ?? 0} stories)`
                    : "Playground not running — start the service first"
                }
              >
                Delivery showcase ↗
              </a>
            </div>
          </section>

          <LlmSettingsCard
            settings={state?.llmSettings ?? null}
            onSaved={(next: LlmSettingsPublic) =>
              setState((s) => (s ? { ...s, llmSettings: next } : s))
            }
          />

          <section className="card" style={{ marginTop: 16 }}>
            <div className="portfolio-card-header">
              <div>
                <h2>Portfolio</h2>
                <div className="console-tabs portfolio-list-tabs">
                  <button
                    type="button"
                    className={
                      portfolioViewTab === "test"
                        ? "console-tab console-tab-active"
                        : "console-tab"
                    }
                    onClick={() => setPortfolioViewTab("test")}
                  >
                    Test portfolio
                  </button>
                  <button
                    type="button"
                    className={
                      portfolioViewTab === "quick"
                        ? "console-tab console-tab-active"
                        : "console-tab"
                    }
                    onClick={() => setPortfolioViewTab("quick")}
                  >
                    Quick generation
                    {quickPortfolio?.storyCount ? (
                      <span style={{ marginLeft: 6, opacity: 0.75 }}>
                        ({quickPortfolio.storyCount})
                      </span>
                    ) : null}
                  </button>
                </div>
              </div>
              {portfolioViewTab === "test" ? (
                <button
                  type="button"
                  className="portfolio-invalidate-btn"
                  disabled={
                    invalidatingPortfolio ||
                    isPortfolioOrchestratorRunning ||
                    Object.keys(runningJobs).length > 0
                  }
                  title="Remove all result.json files — every item returns to not tested"
                  onClick={() => void invalidateAllTests()}
                >
                  {invalidatingPortfolio ? "Invalidating…" : "Invalidate all tests"}
                </button>
              ) : null}
            </div>
            {portfolioViewTab === "test" ? (
              <>
            <p style={{ marginTop: 0, color: "var(--muted)" }}>
              Unified original-parity gates — every visual step compares against{" "}
              <strong>Original</strong> only (≤ 0.1% <code>PIXEL_PERFECT_TOLERANCE</code>):{" "}
              <strong>→ Figma live</strong> · <strong>→ Storybook</strong> ·{" "}
              <strong>→ ReactHtml</strong>. EntryPoint column shows Figma (Guing) vs Storybook
              ingress.
            </p>
            {activePortfolio?.htmlUrl && (
              <p style={{ marginTop: 0 }}>
                <a
                  href={activePortfolio.htmlUrl.includes("unified-steps")
                    ? activePortfolio.htmlUrl
                    : "/repo/test-portfolio/unified-steps/index.html"}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open portfolio HTML ↗
                </a>
                {activePortfolio.generatedAt && (
                  <span style={{ color: "var(--muted)", marginLeft: 12 }}>
                    {new Date(activePortfolio.generatedAt).toLocaleString()} ·{" "}
                    {activePortfolio.storyCount} items
                  </span>
                )}
              </p>
            )}
            {activePortfolio && activePortfolio.rows.length > 0 ? (
              <PortfolioTable
                portfolio={activePortfolio}
                mode="test"
                actions={{
                  inspectStoryId,
                  onInspectStory: toggleInspectStory,
                  onFixStory: (storyId, entryPoint) =>
                    void queueFixStoryForCursor(storyId, entryPoint),
                  onDeleteRow: (row) => void deletePortfolioRow(row),
                  rowFixJob,
                  rowPipelineComplete,
                  isPortfolioOrchestratorRunning,
                  anyRowFixJob,
                  rowNeedsRelay,
                  pluginConnected: state?.relay.pluginConnected,
                  deletingRowKey
                }}
              />
            ) : (
              <p style={{ color: "var(--muted)" }}>
                No portfolio yet. Run{" "}
                <code>pnpm test:portfolio:refresh</code> or a parity test suite.
              </p>
            )}
              </>
            ) : (
              <>
                <p style={{ marginTop: 0, color: "var(--muted)" }}>
                  Guing publish → <strong>quick-component-generation</strong> only. Proceed gate ≤{" "}
                  <strong>{quickPortfolio?.quickGatePct ?? 5}%</strong> (no fixers); reports still
                  show strict <strong>{quickPortfolio?.reportTolerance ?? 0.1}%</strong> diff truth.
                </p>
                {quickPortfolio?.htmlUrl && (
                  <p style={{ marginTop: 0 }}>
                    <a href={quickPortfolio.htmlUrl} target="_blank" rel="noreferrer">
                      Open quick portfolio HTML ↗
                    </a>
                    {quickPortfolio.generatedAt && (
                      <span style={{ color: "var(--muted)", marginLeft: 12 }}>
                        {new Date(quickPortfolio.generatedAt).toLocaleString()} ·{" "}
                        {quickPortfolio.storyCount} runs
                      </span>
                    )}
                  </p>
                )}
                {quickPortfolio && quickPortfolio.rows.length > 0 ? (
                  <PortfolioTable
                    portfolio={quickPortfolio}
                    mode="quick"
                    totalCaption="Runs"
                    actions={{
                      onDeleteRow: (row) => void deleteQuickGenerationRow(row),
                      deletingRowKey
                    }}
                  />
                ) : (
                  <p style={{ color: "var(--muted)" }}>
                    No quick generation runs yet. Publish from Guing — each job appears here as its
                    own row.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {inspectStoryId ? (
        <>
          <button
            type="button"
            className="inspect-panel-backdrop"
            aria-label="Close inspection panel"
            onClick={closeInspectPanel}
          />
          <aside
            className={`inspect-panel-overlay${inspectPanelResizing ? " is-resizing" : ""}`}
            aria-label="Story inspection"
            style={{ width: inspectPanelWidth }}
          >
            <div
              className="inspect-panel-resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Drag to resize inspection panel"
              aria-valuemin={INSPECT_PANEL_WIDTH_MIN}
              aria-valuemax={inspectPanelWidthMax()}
              aria-valuenow={inspectPanelWidth}
              onPointerDown={beginInspectPanelResize}
              onDoubleClick={toggleInspectPanelWidth}
              title="Drag to resize · double-click to expand/collapse"
            />
            {inspectRow && activePortfolio ? (
              <ItemDetailPage
                row={inspectRow}
                steps={activePortfolio.steps}
                onClose={closeInspectPanel}
                layout="panel"
                showFixStory={!rowPipelineComplete(inspectRow)}
                fixStoryActive={rowFixJob(inspectRow.storyId) != null}
                fixStoryDisabled={
                  rowPipelineComplete(inspectRow) ||
                  isPortfolioOrchestratorRunning ||
                  (anyRowFixJob() != null && rowFixJob(inspectRow.storyId) == null)
                }
                fixStoryTitle={
                  rowPipelineComplete(inspectRow)
                    ? "All steps pass"
                    : isPortfolioOrchestratorRunning
                      ? "Run all is in progress"
                      : anyRowFixJob() && rowFixJob(inspectRow.storyId) == null
                        ? "Another Fix story is running"
                        : rowNeedsRelay(inspectRow) && !state?.relay.pluginConnected
                          ? "Test → fix loop — waits for Figma relay at live step"
                          : "Run full row: test → fix until green, then stop"
                }
                onFixStory={() =>
                  void queueFixStoryForCursor(inspectRow.storyId, inspectRow.entryPoint)
                }
                onDeleteRow={() => void deletePortfolioRow(inspectRow)}
                deleteRowDisabled={
                  deletingRowKey === `${inspectRow.entryPoint ?? "storybook"}:${inspectRow.storyId}` ||
                  isPortfolioOrchestratorRunning ||
                  rowFixJob(inspectRow.storyId) != null
                }
                deleteRowActive={
                  deletingRowKey === `${inspectRow.entryPoint ?? "storybook"}:${inspectRow.storyId}`
                }
              />
            ) : (
              <div className="inspect-panel-inner inspect-panel-inner-missing">
                <header className="item-detail-header inspect-panel-header">
                  <button
                    type="button"
                    className="item-detail-close"
                    onClick={closeInspectPanel}
                    aria-label="Close inspection panel"
                  >
                    ×
                  </button>
                  <div className="item-detail-title-block">
                    <h1>Story not found</h1>
                  </div>
                </header>
                <div className="inspect-panel-body">
                  <section className="card item-detail-missing">
                    <p>
                      Story <code>{inspectStoryId}</code> not found in portfolio.
                    </p>
                  </section>
                </div>
              </div>
            )}
          </aside>
        </>
      ) : null}
        </>
      )}
    </div>
  );
}
