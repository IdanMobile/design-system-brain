export interface ServiceState {
  storybook: { ok: boolean; url: string };
  playground: { ok: boolean; url: string; showcaseUrl: string };
  relay: { ok: boolean; pluginConnected: boolean; url: string };
  pluginBuilt: boolean;
  uiBuilt: boolean;
}

export interface ReportSummary {
  suiteId: string;
  label: string;
  dir: string;
  exists: boolean;
  generatedAt?: string | null;
  total?: number;
  tested?: number;
  counts?: {
    pass: number;
    warn: number;
    fail: number;
    error: number;
    not_tested?: number;
  };
  htmlUrl?: string;
}

export interface StoryRow {
  storyId: string;
  status: string;
  percent: number;
  maxRegionPercent?: number;
  action?: string;
  storybookUrl?: string | null;
  figmaUrl?: string | null;
  diffUrl?: string | null;
  compareUrl?: string | null;
}

export interface PortfolioStep {
  id: string;
  label: string;
  dir: string;
  actionId?: string | null;
  serialOnly?: boolean;
  needsRelay?: boolean;
}

export interface PortfolioCell {
  status: string;
  percent?: number;
  maxRegionPercent?: number;
  testedAt?: string | null;
  action: string;
  compareUrl?: string | null;
  testReportUrl?: string | null;
  /** Raw JSON artifact when HTML viewer exists */
  testReportJsonUrl?: string | null;
  canRun?: boolean;
  blockedBy?: string | null;
  blockedReason?: string | null;
}

export interface PortfolioRow {
  storyId: string;
  entryPoint?: "figma" | "storybook";
  storybookOnly?: boolean;
  cells: Record<string, PortfolioCell>;
}

export interface PortfolioState {
  generatedAt: string | null;
  storyCount: number;
  steps: PortfolioStep[];
  stepIds: string[];
  rows: PortfolioRow[];
  htmlUrl?: string;
  /** @deprecated use entryPoint on rows */
  source?: "storybook" | "figma" | "unified";
  entryPointLabel?: string;
  /** First column header — Item id */
  itemLabel?: string;
}

/** @deprecated same shape as PortfolioState */
export type FigmaScreenPortfolioState = PortfolioState;

export interface ActionDef {
  id: string;
  label: string;
  description: string;
  detail?: string;
  when?: string;
  whenHint?: string;
  output?: string | null;
  phase?: string;
  order?: number;
  background?: boolean;
  needsRelay?: boolean;
  sweep?: boolean;
}

export interface Recommendation {
  actionId: string | null;
  title: string;
  reason: string;
  step?: number;
  totalSteps?: number;
  done?: boolean;
  checklist?: string[];
  altActionId?: string;
  altLabel?: string;
}

export interface SuiteHelp {
  title: string;
  blurb: string;
}

export interface JobInfo {
  id: string;
  action: string;
  story?: string | null;
  allStories?: boolean;
  label: string;
  status: string;
  finalizing?: boolean;
  exitCode: number | null;
  startedAt: string;
  endedAt?: string;
  logFile?: string | null;
}

export interface AgentMessage {
  id: string;
  createdAt: string;
  read: boolean;
  /** When false, inbox only — no chat stop-hook or pending poll */
  chatDispatch?: boolean;
  type: string;
  cursorPhrase?: string;
  cursorPrompt?: string;
  storyId?: string;
  percent?: number;
  status?: string;
  suiteId?: string;
}

export interface WorkerSupervisorState {
  updatedAt?: string;
  phase?: string;
  suiteId?: string;
  suiteLabel?: string;
  jobId?: string;
  storyId?: string;
  storyIds?: string[];
  storyIndex?: number;
  storyTotal?: number;
  attempt?: number;
  maxAttempts?: number;
  verdict?: string;
  nextWorkerMode?: string;
  tierCRequired?: boolean;
  finished?: boolean;
  summary?: string;
  exitReason?: "COMPLETE" | "HUMAN_ACTION" | "STUCK" | string;
  humanAction?: string | null;
  humanTitle?: string | null;
  humanMessage?: string | null;
  metrics?: { status?: string; percent?: number; maxRegionPercent?: number | null };
}

export interface ConsoleState {
  serverVersion?: number;
  storybook: ServiceState["storybook"];
  playground: ServiceState["playground"];
  relay: ServiceState["relay"];
  pluginBuilt: boolean;
  orchestratorAuto?: boolean;
  orchestratorRunning?: boolean;
  workerSupervisor?: WorkerSupervisorState | null;
  runSettings?: RunSettings;
  /** Upper bound for parallel workers slider (matches server clamp). */
  maxParallelWorkers?: number;
  agentModelOptions?: AgentModelOption[];
  agentUnread?: number;
  pendingForCursor?: AgentMessage | null;
  agentLatest?: AgentMessage | null;
  recommendation?: Recommendation;
  suiteHelp?: Record<string, SuiteHelp>;
  reports: ReportSummary[];
  jobs: JobInfo[];
}

/** Run-all speed toggles + orchestrator launch options. */
export type OrchestratorScope = "full" | "failures_only" | "fresh_only" | "single_step";
export type OrchestratorSort = "step_first" | "worst_first" | "flow_first";

export interface RunSettings {
  skipPass: boolean;
  onlyNotTested: boolean;
  parallelWorkers: number;
  processPool: boolean;
  applyToOrchestrator: boolean;
  agentModel: string;
  agentCli?: string;
  devAgentModel?: string;
  devAgentCli?: string;
  scope?: OrchestratorScope;
  singleStepId?: string | null;
  sortBy?: OrchestratorSort;
  maxFixRoundsPerStep?: number;
  maxAutoRetriesWhenStuck?: number;
  maxAgentCallsPerLaunch?: number;
  launchAutoMode?: boolean;
}

export interface AgentModelOption {
  id: string;
  label: string;
}

export interface ArchitectureFindingItem {
  id?: string;
  title?: string;
  summary?: string;
  impact?: string;
  files?: string[];
}

export interface ArchitectureFindings {
  auditedAt?: string;
  status?: string;
  phase?: string;
  scope?: string[];
  critical?: Array<string | ArchitectureFindingItem>;
  high?: Array<string | ArchitectureFindingItem>;
  medium?: Array<string | ArchitectureFindingItem>;
  recommendations?: string[];
  verdict?: string;
  reportPath?: string;
  portfolioSnapshot?: Record<string, { pass: number; fail: number; warn: number; total: number }>;
}

export interface DeveloperActivityStep {
  id: string;
  label: string;
  state: "done" | "current" | "pending";
}

export interface DeveloperActivityView {
  active: boolean;
  idle?: boolean;
  kind?: "audit" | "implement";
  jobId?: string;
  status?: "running" | "complete" | "failed" | "awaiting_approval" | string;
  phase?: string;
  phaseIndex?: number;
  steps?: DeveloperActivityStep[];
  detail?: string;
  agentLabel?: string | null;
  logTail?: string[];
  terminalTitle?: string;
  model?: string | null;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  elapsed?: string;
  findingsReady?: boolean;
}

export interface DeveloperProposalVerification {
  ok?: boolean;
  supervisorExit?: number;
  regressionExit?: number | null;
  portfolioOk?: boolean;
  supervisorOk?: boolean;
  regressionOk?: boolean;
  successRateBefore?: number;
  successRateAfter?: number;
  successRateDelta?: number;
  passDelta?: number;
  failDelta?: number;
  improved?: boolean;
  regressed?: boolean;
  suiteDeltas?: Array<{ suiteId: string; passDelta: number; failDelta: number }>;
}

export interface DeveloperProposal {
  jobId?: string;
  status?: "running" | "pending_approval" | "approved" | "discarded" | "failed";
  createdAt?: string;
  completedAt?: string;
  approvedAt?: string;
  discardedAt?: string;
  updatedAt?: string;
  sandbox?: { path?: string; branch?: string; jobId?: string };
  sandboxAlive?: boolean;
  changedFiles?: string[];
  agentExitCode?: number;
  verification?: DeveloperProposalVerification | null;
  report?: { path?: string; excerpt?: string; fullLength?: number } | null;
  promotedFiles?: string[];
  error?: string;
}

export interface ArchitectureConsoleState {
  generatedAt: string;
  hasCursorCli: boolean;
  hasGitRepo: boolean;
  northStar: string;
  activePhase: string;
  pipeline: Array<{
    id: string;
    label: string;
    command?: string;
    files: string[];
    proves: string;
  }>;
  packages: Array<{ name: string; role: string }>;
  agentRoles: Array<{ role: string; skill: string; when: string }>;
  decisions: Array<{ id: string; title: string; implication: string }>;
  constraints: string[];
  findings: ArchitectureFindings | null;
  latestAudit: {
    filename: string;
    path: string;
    excerpt: string;
    fullLength: number;
  } | null;
  specs: Array<{ name: string; path: string }>;
  keyFiles: Array<{
    path: string;
    role: string;
    lines: number | null;
    exists: boolean;
    modifiedAt?: string;
  }>;
  agentContextMarkdown: string | null;
  proposal: DeveloperProposal | null;
  activity: DeveloperActivityView;
  runSettings?: RunSettings;
  agentModelOptions?: AgentModelOption[];
}

export interface FleetAgentTask {
  jobId?: string;
  storyId?: string;
  suiteId?: string;
  attempt?: number;
  phase?: "investigator" | "fixer" | "verify" | string;
  parallelCount?: number;
  stories?: string[];
  steps?: string[];
}

export interface FleetAgent {
  id: string;
  baseAgentId?: string;
  purpose: string;
  capabilities: string[];
  status: "idle" | "working" | "failed" | string;
  workerNode: string;
  since: string;
  currentTask: FleetAgentTask | null;
  workerCount?: number;
  activeTasks?: FleetAgentTask[];
  runCount?: number;
  runtimeMs24h?: number;
  runtimeLabel24h?: string;
  launches24h?: number;
  model?: string;
  cli?: string;
}

export interface FleetEvent {
  type: string;
  at: string;
  nodeId?: string;
  agentId?: string;
  jobId?: string;
  storyId?: string;
  suiteId?: string;
  attempt?: number;
  phase?: string;
  parallelCount?: number;
  stories?: string[];
  steps?: string[];
  status?: string;
  investigationComplete?: boolean;
}

export interface FleetSupervisorState {
  pid?: number;
  nodeId?: string;
  lastHeartbeat?: string;
  orchestratorPhase?: string | null;
  orchestratorVerdict?: string | null;
  orchestratorJobId?: string | null;
  startedAt?: string;
}

export interface FleetState {
  generatedAt?: string;
  updatedAt?: string;
  supervisor: FleetSupervisorState | null;
  orchestrator: WorkerSupervisorState | null;
  orchestratorAuto?: boolean;
  orchestratorRunning?: boolean;
  agents: FleetAgent[];
  recentEvents: FleetEvent[];
  runSettings: {
    agentModel: string;
    agentCli: string;
    parallelWorkers?: number;
  };
  runningJobs: JobInfo[];
  stats: {
    routes: number;
    completes: number;
    working: number;
    waiting: number;
  };
}
