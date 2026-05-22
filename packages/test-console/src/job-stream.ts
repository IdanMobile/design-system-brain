/** Progress parsed from harness stdout (▶ story … / ✓ PASS lines). */

export type JobProgress = {
  completed: number;
  total?: number;
  currentStory?: string;
  /** Human-readable headline, e.g. "Running test" or "Fixing (batch)". */
  activityTitle?: string;
  /** Secondary line — story id, suite, or agent action. */
  activityDetail?: string;
  /** Phase · batch · story count */
  activityMeta?: string;
  logTail: string;
};

export type OrchestratorActivity = {
  title: string;
  detail?: string;
  storyId?: string;
  actionHint?: string;
};

export type OrchestratorActivityView = {
  title: string;
  /** Phase / suite / batch round */
  meta?: string;
  /** Story + current action */
  detail?: string;
};

export type WorkerSupervisorHint = {
  phase?: string;
  suiteId?: string;
  suiteLabel?: string;
  storyId?: string;
  storyIds?: string[];
  storyIndex?: number;
  storyTotal?: number;
  attempt?: number;
  maxAttempts?: number;
  finished?: boolean;
};

const SUITE_LABELS: Record<string, string> = {
  pixel: "Pixel",
  figma: "Figma mock",
  figmaLive: "Figma live",
  delivery: "Delivery",
  logic: "Logic audit"
};

function suiteLabel(suiteId: string): string {
  return SUITE_LABELS[suiteId] ?? suiteId;
}

function storyIdFromAgentTag(tag: string): string | undefined {
  if (tag.startsWith("batch")) return undefined;
  const m = tag.match(/^(.+):try\d+$/);
  return m ? m[1] : undefined;
}

/** Extract story id from artifact/diff paths in agent Read/Edit lines. */
function storyIdFromPath(path: string): string | undefined {
  const m = path.match(
    /(?:pixel-diffs|figma-diffs|figma-live-diffs|delivery-diffs)(?:\/by-story)?\/([a-z0-9][a-z0-9-]*(?:--[a-z0-9-]+)*)/i
  );
  return m?.[1];
}

function shortActionHint(detail?: string): string | undefined {
  if (!detail) return undefined;
  if (detail.startsWith("Reading artifacts")) return "reading batch report & diffs";
  if (detail.startsWith("Batch agent")) return "editing shared renderer";
  return detail.length > 56 ? `${detail.slice(0, 56)}…` : detail;
}

type OrchestratorContext = {
  portfolioStep?: string;
  suiteId?: string;
  batchRound?: string;
  batchMax?: string;
  batchStoryCount?: number;
  lastTestStory?: string;
  fixAllQueueStory?: string;
  fixAllQueueIndex?: number;
  fixAllQueueTotal?: number;
};

function extractOrchestratorContext(lines: string[]): OrchestratorContext {
  const ctx: OrchestratorContext = {};
  for (const line of lines) {
    const next = line.match(/\[portfolio\] ══ Next: (.+?) ══/);
    if (next) ctx.portfolioStep = next[1];

    const batchHeader = line.match(/\[fix-all\] ══ Batch (\d+)\/(\d+) — (\d+) stories ══/);
    if (batchHeader) {
      ctx.batchRound = batchHeader[1];
      ctx.batchMax = batchHeader[2];
      ctx.batchStoryCount = Number(batchHeader[3]);
    }

    const batchRetestOne = line.match(/\[fix-all\] batch — running test ([^\s]+) \((\w+)\)/);
    if (batchRetestOne) {
      ctx.lastTestStory = batchRetestOne[1];
      ctx.suiteId = batchRetestOne[2];
    }

    const testTag = line.match(/^\[test:([^\]]+)\]/);
    if (testTag) ctx.lastTestStory = testTag[1];

    const goldenTag = line.match(/^\[golden:(\w+)\]/);
    if (goldenTag) ctx.suiteId = goldenTag[1];

    const goldenMeta = line.match(/\[golden\] (\w+)/);
    if (goldenMeta) ctx.suiteId = goldenMeta[1];

    const fixStory = line.match(/\[fix-all\] (\d+)\/(\d+) ([^\s]+)/);
    if (fixStory) {
      ctx.fixAllQueueIndex = Number(fixStory[1]);
      ctx.fixAllQueueTotal = Number(fixStory[2]);
      ctx.fixAllQueueStory = fixStory[3];
    }

    const fixRound = line.match(/\[portfolio\] Fix-all round (\d+) — (\d+) stor/);
    if (fixRound) ctx.batchStoryCount = Number(fixRound[2]);
  }
  return ctx;
}

/** Merge parsed logs + worker supervisor into a 2-line dashboard view. */
export function buildOrchestratorActivityView(
  logText: string,
  supervisor?: WorkerSupervisorHint | null
): OrchestratorActivityView {
  const lines = logText
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);
  const activity = describeOrchestratorActivity(logText);
  const ctx = extractOrchestratorContext(lines);

  const suiteStep =
    supervisor?.suiteLabel ??
    (supervisor?.suiteId ? suiteLabel(supervisor.suiteId) : undefined) ??
    ctx.portfolioStep ??
    (ctx.suiteId ? suiteLabel(ctx.suiteId) : undefined);

  const metaParts: string[] = [];
  if (suiteStep) metaParts.push(suiteStep);

  const isBatch =
    supervisor?.phase === "fix-all-batch" ||
    activity.title.toLowerCase().includes("batch") ||
    Boolean(ctx.batchRound);

  if (isBatch) {
    const round = supervisor?.attempt ?? ctx.batchRound;
    const max = supervisor?.maxAttempts ?? ctx.batchMax;
    if (round != null) metaParts.push(`Batch ${round}${max != null ? `/${max}` : ""}`);
    const n = supervisor?.storyIds?.length ?? ctx.batchStoryCount ?? supervisor?.storyTotal;
    if (n != null && n > 0) metaParts.push(`${n} ${n === 1 ? "story" : "stories"}`);
  } else if (supervisor?.storyIndex != null && supervisor?.storyTotal) {
    metaParts.push(`Story ${supervisor.storyIndex}/${supervisor.storyTotal}`);
  } else if (ctx.fixAllQueueIndex != null && ctx.fixAllQueueTotal) {
    metaParts.push(`Story ${ctx.fixAllQueueIndex}/${ctx.fixAllQueueTotal}`);
  }

  if (supervisor?.phase === "portfolio" && !metaParts.length) {
    metaParts.push("Portfolio scan");
  }

  const storyId =
    activity.storyId ??
    supervisor?.storyId ??
    ctx.lastTestStory ??
    ctx.fixAllQueueStory;

  let detail: string | undefined;
  const actionHint = activity.actionHint ?? shortActionHint(activity.detail);

  if (storyId) {
    detail = `"${storyId}"`;
    if (actionHint && !actionHint.includes(storyId)) {
      detail += ` · ${actionHint}`;
    }
  } else if (supervisor?.storyIds?.length) {
    const preview = supervisor.storyIds
      .slice(0, 3)
      .map((s) => `"${s}"`)
      .join(", ");
    const extra =
      supervisor.storyIds.length > 3 ? ` +${supervisor.storyIds.length - 3} more` : "";
    detail = preview + extra;
    if (actionHint) detail += ` · ${actionHint}`;
  } else if (actionHint) {
    detail = actionHint;
  } else {
    detail = activity.detail;
  }

  return {
    title: activity.title,
    meta: metaParts.length ? metaParts.join(" · ") : undefined,
    detail
  };
}

function storyDetail(storyId: string, suffix?: string): string {
  const quoted = `"${storyId}"`;
  return suffix ? `${quoted} · ${suffix}` : quoted;
}

/**
 * Derive a short headline + detail from orchestrator / fix-all / agent log lines.
 */
export function describeOrchestratorActivity(logText: string): OrchestratorActivity {
  const lines = logText
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;

    const testTag = line.match(/^\[test:([^\]]+)\]/);
    if (testTag) {
      return {
        title: "Running test",
        detail: storyDetail(testTag[1]!),
        storyId: testTag[1],
        actionHint: "re-test after fix"
      };
    }

    const batchRunTest = line.match(/\[fix-all\] batch — running test ([^\s]+)/);
    if (batchRunTest) {
      return {
        title: "Running test",
        detail: storyDetail(batchRunTest[1]!),
        storyId: batchRunTest[1],
        actionHint: "batch re-test"
      };
    }

    const agentMatch = line.match(/^\[agent:([^\]]+)\]\s*(.+)/);
    if (agentMatch) {
      const tag = agentMatch[1]!;
      const action = agentMatch[2]!.trim();
      const storyId = storyIdFromAgentTag(tag);

      if (/^Editing /i.test(action)) {
        return {
          title: storyId ? "Fixing" : "Fixing (batch)",
          detail: storyId ? storyDetail(storyId) : "Batch agent editing files",
          storyId
        };
      }
      if (/^Reading |^Read /i.test(action)) {
        const pathStory = storyIdFromPath(action);
        const sid = storyId ?? pathStory;
        return {
          title: sid ? "Investigating" : "Investigating (batch)",
          detail: sid ? storyDetail(sid) : "Reading artifacts & compare PNGs",
          storyId: sid,
          actionHint: sid
            ? `reading ${action.replace(/^(Reading|Read)\s+/i, "").split("/").pop() ?? "artifact"}`
            : "reading batch report & compare PNGs"
        };
      }
      if (/^Shell:/i.test(action)) {
        return {
          title: "Running command",
          detail: action.replace(/^Shell:\s*/i, "").slice(0, 80)
        };
      }
      if (/Turn complete|Agent turn complete/i.test(action)) {
        return { title: "Agent finishing", detail: tag };
      }
      if (tag.startsWith("batch")) {
        const round = tag.match(/try(\d+)/)?.[1];
        return {
          title: "Fixing (batch)",
          detail: round ? `Agent round ${round}` : tag
        };
      }
      return {
        title: "Fix agent",
        detail: storyId ?? tag,
        storyId
      };
    }

    if (/\[fix-all\][^\n]*running test/i.test(line)) {
      const m = line.match(/\[fix-all\] (\d+)\/(\d+) ([^\s]+)/);
      if (m) {
        return {
          title: "Running test",
          detail: storyDetail(m[3]!, `${m[1]}/${m[2]}`),
          storyId: m[3]
        };
      }
    }

    const batchRetest = line.match(/\[fix-all\] batch (\d+) — re-testing (\d+) stories/);
    if (batchRetest) {
      return {
        title: "Re-testing stories",
        detail: `${batchRetest[2]} stories · batch round ${batchRetest[1]}`
      };
    }

    if (/\[fix-all\] batch \d+ — plugin build/i.test(line)) {
      const round = line.match(/batch (\d+)/)?.[1];
      return {
        title: "Building Figma plugin",
        detail: round ? `After batch round ${round}` : undefined
      };
    }

    const fixStory = line.match(/\[fix-all\] (\d+)\/(\d+) ([^\s]+)/);
    if (fixStory) {
      const storyId = fixStory[3]!;
      if (/plugin build/i.test(line)) {
        return { title: "Building Figma plugin", detail: storyDetail(storyId), storyId };
      }
      if (/agent exited|files changed|attempt/i.test(line)) {
        return {
          title: "Fixing",
          detail: storyDetail(storyId, `try ${fixStory[1]}/${fixStory[2]}`),
          storyId
        };
      }
    }

    if (/\[fix-all\] ══ Batch (\d+)\/(\d+)/.test(line)) {
      const m = line.match(/Batch (\d+)\/(\d+) — (\d+) stories/);
      if (m) {
        return {
          title: "Batch fix round",
          detail: `Round ${m[1]}/${m[2]} · ${m[3]} stories`
        };
      }
    }

    if (/\[fix-all\] Investigation:/i.test(line)) {
      return { title: "Writing investigation report", detail: "Before batch fix agent" };
    }

    const openAgent = line.match(/\[orchestrator\] Opening agent terminal → ([^\s(]+)/);
    if (openAgent) {
      const tag = openAgent[1]!;
      if (tag.startsWith("batch")) {
        const round = tag.match(/try(\d+)/)?.[1];
        return {
          title: "Launching batch fix agent",
          detail: round ? `Round ${round}` : tag
        };
      }
      const storyId = storyIdFromAgentTag(tag);
      return {
        title: "Launching fix agent",
        detail: storyId ? storyDetail(storyId) : tag,
        storyId
      };
    }

    const openTerm = line.match(/\[orchestrator\] Opening terminal → ([^\s\n]+)/);
    if (openTerm) {
      const tag = openTerm[1]!;
      if (tag.startsWith("golden:")) {
        return {
          title: "Running golden tests",
          detail: suiteLabel(tag.replace("golden:", ""))
        };
      }
      if (/plugin/i.test(tag)) {
        return { title: "Building Figma plugin", detail: tag };
      }
      return { title: "Opening terminal", detail: tag };
    }

    const goldenLine = line.match(/^\[golden:([^\]]+)\]\s*(.*)/);
    if (goldenLine) {
      const suite = goldenLine[1]!;
      const rest = goldenLine[2] ?? "";
      const storyMatch = rest.match(/▶\s+(.+?)\s+\.\.\./);
      if (storyMatch) {
        return {
          title: "Running golden test",
          detail: storyDetail(storyMatch[1]!, suiteLabel(suite)),
          storyId: storyMatch[1]
        };
      }
      if (/PASS|FAIL|exit|finished/i.test(rest)) {
        return { title: "Golden run finishing", detail: suiteLabel(suite) };
      }
      return { title: "Running golden tests", detail: suiteLabel(suite) };
    }

    if (/\[golden\][^\n]*/.test(line)) {
      const suite = line.match(/\[golden\] (\w+)/)?.[1];
      return {
        title: "Running golden tests",
        detail: suite ? suiteLabel(suite) : undefined
      };
    }

    if (/\[supervisor\] Tier C/i.test(line)) {
      return { title: "Regression test (Tier C)", detail: "Shared adapter changed" };
    }

    const portfolioNext = line.match(/\[portfolio\] ══ Next: (.+?) ══/);
    if (portfolioNext) {
      return { title: "Portfolio step", detail: portfolioNext[1] };
    }

    const fixRound = line.match(/\[portfolio\] Fix-all round (\d+)/);
    if (fixRound) {
      return { title: "Starting fix-all", detail: `Round ${fixRound[1]}` };
    }

    if (/\[portfolio\][^\n]*golden/i.test(line) && /not tested|re-running golden/i.test(line)) {
      return { title: "Running golden tests", detail: "Untested stories only" };
    }

    if (/\[portfolio\] Waiting for (delivery playground|Figma relay)/i.test(line)) {
      const m = line.match(/Waiting for (.+?) on/i);
      return { title: "Waiting for infra", detail: m?.[1] ?? "services" };
    }

    if (/\[portfolio\] AUTO ON — watching/i.test(line)) {
      return { title: "Watching for work", detail: "Auto mode · portfolio scan" };
    }

    if (/\[portfolio\] AUTO ON — retrying/i.test(line)) {
      return { title: "Waiting to retry", detail: "Auto mode" };
    }

    if (/\[portfolio\] PHASE_COMPLETE/i.test(line)) {
      return { title: "Phase complete", detail: "All steps green" };
    }
  }

  return { title: "Listening to Terminal" };
}

export type JobStreamDone = {
  status: string;
  exitCode: number | null;
  cursorQueued?: { suiteId?: string; storyId?: string; type?: string } | null;
};

const TOTAL_FROM_LABEL = /\((\d+)\s+stories\)/;
const STORY_START_RE = /▶\s+(.+?)\s+\.\.\./g;
const STORY_DONE_RE = /[✓⚠✗]\s+(?:PASS|WARN|FAIL|ERROR)/g;
const PORTFOLIO_STEP_RE = /\[portfolio\] ══ (.+?) ══/;
const PORTFOLIO_NEXT_RE = /\[portfolio\] ══ Next: (.+?) ══/;
const FIX_ALL_STORY_RE = /\[fix-all\] (\d+)\/(\d+) ([^\s]+)/;

const ORCHESTRATOR_LINE =
  /\[portfolio\]|\[orchestrator\]|\[fix-all\]|\[agent:|^\[agent\]|\[golden:/;

export function totalStoriesFromLabel(label: string): number | undefined {
  const m = label.match(TOTAL_FROM_LABEL);
  return m ? Number(m[1]) : undefined;
}

function parseOrchestratorProgress(label: string, logText: string): JobProgress {
  const lines = logText
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);

  let currentPhase: string | undefined;
  for (const line of lines) {
    const m =
      line.match(PORTFOLIO_NEXT_RE) ??
      line.match(PORTFOLIO_STEP_RE) ??
      line.match(/\[portfolio\] ── Next step: (.+?) ──/);
    if (m) currentPhase = m[1];
  }

  let fixAllCurrent: string | undefined;
  let fixAllDone = 0;
  let fixAllTotal: number | undefined;
  for (const line of lines) {
    const m = line.match(FIX_ALL_STORY_RE);
    if (m) {
      fixAllDone = Number(m[1]);
      fixAllTotal = Number(m[2]);
      fixAllCurrent = m[3];
    }
  }

  const orchLines = lines.filter((l) => ORCHESTRATOR_LINE.test(l));
  const lastOrch = orchLines[orchLines.length - 1];
  const lastDetail = lastOrch
    ? lastOrch.replace(/^\[[^\]]+\]\s*/, "").replace(/^\[agent:[^\]]+\]\s*/, "").trim()
    : undefined;

  const autoWatch = logText.includes("AUTO ON — watching");
  const autoRetry = logText.includes("AUTO ON — retrying");

  const activity = describeOrchestratorActivity(logText);
  const view = buildOrchestratorActivityView(logText, null);

  let currentStory: string | undefined;
  if (view.detail) {
    currentStory = view.meta ? `${view.title} · ${view.meta} · ${view.detail}` : `${view.title} · ${view.detail}`;
  } else if (view.meta) {
    currentStory = `${view.title} · ${view.meta}`;
  } else if (activity.detail) {
    currentStory =
      activity.storyId != null
        ? `${activity.title} · ${activity.storyId}`
        : `${activity.title} · ${activity.detail}`;
  } else if (currentPhase && fixAllCurrent) {
    currentStory = `${currentPhase} · ${fixAllCurrent}`;
  } else if (currentPhase) {
    currentStory = currentPhase;
  } else if (fixAllCurrent) {
    currentStory = fixAllCurrent;
  } else if (autoWatch) {
    currentStory = "AUTO · watching for work";
  } else if (autoRetry) {
    currentStory = "AUTO · retrying soon";
  } else if (lastDetail) {
    currentStory = lastDetail.length > 72 ? `${lastDetail.slice(0, 72)}…` : lastDetail;
  }

  const logTail =
    orchLines.slice(-12).join("\n") ||
    lines
      .slice(-8)
      .join("\n");

  return {
    completed: fixAllDone,
    total: fixAllTotal ?? totalStoriesFromLabel(label),
    currentStory,
    activityTitle: view.title,
    activityMeta: view.meta,
    activityDetail: view.detail,
    logTail
  };
}

export function parseProgressFromLogs(
  label: string,
  logText: string,
  actionId?: string
): JobProgress {
  if (
    actionId === "portfolio-orchestrator" ||
    actionId?.startsWith("fix-all:")
  ) {
    return parseOrchestratorProgress(label, logText);
  }

  const total = totalStoriesFromLabel(label);
  const doneCount = (logText.match(STORY_DONE_RE) ?? []).length;
  const starts = [...logText.matchAll(STORY_START_RE)];
  const inFlight = starts.length > doneCount;
  const currentStory = inFlight ? starts[starts.length - 1]![1] : undefined;
  const logTail = logText
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(-4)
    .join("\n");

  return {
    completed: doneCount,
    total,
    currentStory,
    logTail
  };
}

export type JobStreamHandlers = {
  onLog: (text: string, progress: JobProgress) => void;
  onDone: (result: JobStreamDone) => void;
};

/** Subscribe to server job log stream until done or error (falls back to polling). */
export function attachJobStream(
  jobId: string,
  label: string,
  handlers: JobStreamHandlers,
  actionId?: string
): () => void {
  let logText = "";
  let finished = false;
  let pollTimer: ReturnType<typeof window.setInterval> | undefined;
  let es: EventSource | undefined;

  const emitProgress = () => {
    handlers.onLog(logText, parseProgressFromLogs(label, logText, actionId));
  };

  const finishOnce = (result: JobStreamDone) => {
    if (finished) return;
    finished = true;
    if (pollTimer != null) window.clearInterval(pollTimer);
    es?.close();
    handlers.onDone(result);
  };

  const pollUntilDone = () => {
    if (pollTimer != null) return;
    pollTimer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (res.status === 404) {
          finishOnce({ status: "failed", exitCode: 1 });
          return;
        }
        if (!res.ok) return;
        const job = (await res.json()) as {
          status: string;
          exitCode: number | null;
          logs?: string;
          finalizing?: boolean;
        };
        if (job.logs && job.logs.length > logText.length) {
          logText = job.logs;
          emitProgress();
        }
        if (job.status !== "running" && !job.finalizing) {
          finishOnce({ status: job.status, exitCode: job.exitCode });
        }
      } catch {
        /* keep polling */
      }
    }, 1500);
  };

  es = new EventSource(`/api/jobs/${jobId}/stream`);
  es.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as { type: string; text?: string; status?: string; exitCode?: number | null };
    if (msg.type === "log" && msg.text) {
      logText += msg.text;
      emitProgress();
    }
    if (msg.type === "done") {
      finishOnce({
        status: msg.status ?? "failed",
        exitCode: msg.exitCode ?? 1,
        cursorQueued: (msg as { cursorQueued?: JobStreamDone["cursorQueued"] }).cursorQueued
      });
    }
  };
  es.onerror = () => {
    es?.close();
    pollUntilDone();
  };
  pollUntilDone();

  return () => {
    if (!finished) {
      finished = true;
      if (pollTimer != null) window.clearInterval(pollTimer);
      es?.close();
    }
  };
}

export async function killJob(jobId: string): Promise<boolean> {
  const res = await fetch(`/api/jobs/${jobId}/kill`, { method: "POST" });
  return res.ok;
}
