/**
 * Agent inbox for test console ↔ Cursor AI.
 * Imported by test-console-server.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { skillFollowLines as preambleSkillFollowLines, SKILLS, workflowPreamble } from "./agent-workflow-preamble.mjs";
import {
  formatLabMemoryFixHintBlock,
  loadLabMemoryFixHint,
  loadLabMemoryContext,
  formatLabMemoryContextBlock,
  PIXEL_RENDER_HTML_PATH,
  recordStoryFailureInVault
} from "./lab-memory-vault.mjs";
import {
  buildBatchInvestigationPayload,
  writeBatchInvestigationReport,
  writeStoryBatchReport
} from "./fix-all-batch-report.mjs";
import {
  buildFigmaEntryFixPromptLines,
  figmaEntryFixMode,
  figmaEntryRerunCommand,
  figmaEntryStoryFromStep,
  findFigmaEntryFailingScreens,
  isFigmaEntryFixSuite
} from "./figma-entry-fix.mjs";
import {
  fixPromptFromTestReport,
  loadTestReport,
  figmaScreenTestReportPath
} from "./test-report-build.mjs";

/** @type {Array<{ resolve: (msg: object) => void, timer: ReturnType<typeof setTimeout> }>} */
const waiters = [];

export const SKILL_UNTIL_PASS = SKILLS.untilPass;
export const SKILL_INVESTIGATE = SKILLS.investigate;
export const SKILL_ORCHESTRATOR = SKILLS.orchestrator;

/** Lines included in every Fix / run-until-pass agent prompt (automatic role chain). */
export function skillFollowLines(mode = "emulator", ctx = {}) {
  return preambleSkillFollowLines(mode, ctx);
}

/**
 * Source-vs-renderer triage block. Forces the agent to decide WHICH side of
 * the comparison owns the bug BEFORE diving into renderer code.
 *
 * Real example this prevents: ProductCard storybook.png was missing the
 * picsum.photos image (flaky external network in the extractor), figma.png
 * had the image (artifact embeds base64). Diff = 10%+. Agent assumed
 * "Figma is wrong" and read code-v2.ts 5 times in a row. The fix was in the
 * Storybook source (replace picsum with local fixture), not the renderer.
 */
export function sourceVsRendererTriageLines(mode, worst) {
  const renderedLabel = mode === "pixel" ? "Rendered" : "Figma";
  const rendererBugTarget =
    mode === "pixel"
      ? `${renderedLabel} missing content that Storybook has  → schema replay bug (${PIXEL_RENDER_HTML_PATH} or extract.ts) ✅`
      : `${renderedLabel} missing content that Storybook has  → renderer bug (code-v2.ts / scene-to-html.ts) ✅`;
  const hardLimit =
    mode === "pixel"
      ? `Hard limit: do NOT Read ${PIXEL_RENDER_HTML_PATH}, extract.ts, or code-v2.ts in full before completing Step 3. Use Grep for specific symbols if needed.`
      : "Hard limit: do NOT Read code-v2.ts, extract.ts, or figma-live-test.ts in full before completing Step 3. Use Grep for specific symbols if needed.";
  return [
    "── Triage BEFORE editing renderer code ──",
    `Step 1: open the compare PNG and Storybook + ${renderedLabel} PNGs side-by-side.`,
    `Step 2: which side is wrong?`,
    `  • ${rendererBugTarget}`,
    `  • ${renderedLabel} has content that Storybook is missing  → SOURCE bug (Storybook story, component, asset path, flaky network image). DO NOT edit code-v2.ts.`,
    `  • Both look the same but pixels differ  → tolerance, anti-aliasing, font, or sub-pixel layout — usually a small fix in the component or a tolerance config.`,
    `Step 3: state your answer (one sentence) before any Read on a renderer file.`,
    hardLimit,
    ""
  ];
}

/** Map fix-all mode to vault suite id. @param {'live' | 'emulator' | 'pixel'} mode @param {string} [suiteId] */
function vaultSuiteIdForMode(mode, suiteId) {
  if (suiteId === "figmaLive" || suiteId === "figma" || suiteId === "pixel" || suiteId === "delivery") {
    return suiteId;
  }
  if (mode === "live") return "figmaLive";
  if (mode === "pixel") return "pixel";
  return "figma";
}

/** @param {string} repoRoot @param {string} storyId @param {'live' | 'emulator' | 'pixel'} mode @param {string} [suiteId] */
function labMemoryHintLines(repoRoot, storyId, mode, suiteId) {
  if (!storyId) return [];
  const vaultSuite = vaultSuiteIdForMode(mode, suiteId);
  const ctx = loadLabMemoryContext(repoRoot, storyId, vaultSuite, mode);
  return formatLabMemoryContextBlock(ctx, mode);
}

/** @param {'live' | 'emulator' | 'pixel'} mode */
function pixelFixInstructionLine(mode) {
  return mode === "pixel"
    ? `Pixel (schema) — fix ${PIXEL_RENDER_HTML_PATH} (and packages/extractor-playwright/src/extract.ts only if extraction is wrong). scene-to-html.ts is mock/Figma emulator only.`
    : null;
}

export function initAgentBridge(repoRoot) {
  const dir = join(repoRoot, ".test-console");
  const inboxPath = join(dir, "agent-inbox.json");
  const pendingPath = join(dir, "pending-for-cursor.json");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  function loadInbox() {
    if (!existsSync(inboxPath)) return [];
    try {
      return JSON.parse(readFileSync(inboxPath, "utf8"));
    } catch {
      return [];
    }
  }

  function saveInbox(messages) {
    writeFileSync(inboxPath, JSON.stringify(messages.slice(-50), null, 2));
  }

  function notifyWaiters() {
    const unread = loadInbox().filter((m) => !m.read);
    if (!unread.length) return;
    const msg = unread[unread.length - 1];
    for (const w of waiters.splice(0)) {
      clearTimeout(w.timer);
      w.resolve(msg);
    }
  }

  function loadPending() {
    if (!existsSync(pendingPath)) return null;
    try {
      return JSON.parse(readFileSync(pendingPath, "utf8"));
    } catch {
      return null;
    }
  }

  function setPending(entry) {
    writeFileSync(pendingPath, JSON.stringify(entry, null, 2));
  }

  function clearPending(id) {
    const p = loadPending();
    if (!p || (id && p.id !== id)) return;
    writeFileSync(pendingPath, "null\n");
  }

  function pushMessage(partial) {
    const {
      chatDispatch = false,
      cliDispatched = partial.cliDispatched ?? false,
      skipPending = false,
      ...rest
    } = partial;
    const messages = loadInbox();
    const entry = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      read: false,
      consumedByChat: false,
      chatDispatch,
      cliDispatched,
      ...rest
    };
    messages.push(entry);
    saveInbox(messages);
    /** Pending file is for Terminal CLI only (`after-job`, `pnpm test:console:cursor agent`). */
    if (!skipPending && entry.cursorPrompt) {
      setPending(entry);
      notifyWaiters();
    }
    return entry;
  }

  /** Terminal-only fix prompts — never queue IDE chat (stop hook). */
  const TERMINAL_CLI = { chatDispatch: false, cliDispatched: true };

  function vaultRecordFailure(story, suiteId, suites, safeSegment, meta = {}) {
    if (!story || story.status === "pass") return null;
    try {
      const cfg = suites[suiteId];
      return recordStoryFailureInVault(repoRoot, story, suiteId, {
        jobId: meta.jobId,
        source: meta.source ?? "test-console",
        attempt: meta.attempt,
        cfg,
        safeSegment
      });
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  function vaultRecordFailingStories(stories, suiteId, suites, safeSegment, meta = {}) {
    for (const story of stories) {
      if (story.status !== "pass") vaultRecordFailure(story, suiteId, suites, safeSegment, meta);
    }
  }

  function findFailingStories(suiteId, suites, safeSegment) {
    if (isFigmaEntryFixSuite(suiteId)) {
      return findFigmaEntryFailingScreens(repoRoot, suiteId)
        .map(({ screenId }) => figmaEntryStoryFromStep(repoRoot, screenId, suiteId))
        .filter(Boolean);
    }
    const cfg = suites[suiteId];
    if (!cfg) return [];
    const reportPath = join(repoRoot, cfg.dir, "report.json");
    if (!existsSync(reportPath)) return [];
    const raw = JSON.parse(readFileSync(reportPath, "utf8"));
    const results = raw.results ?? [];
    const order = { error: 0, fail: 1, warn: 2, pass: 3 };
    return [...results]
      .filter((r) => r.status === "fail" || r.status === "error" || r.status === "warn")
      .sort((a, b) => {
        const s = (order[a.status] ?? 9) - (order[b.status] ?? 9);
        if (s !== 0) return s;
        return (b.percent ?? 0) - (a.percent ?? 0);
      })
      .map((row) => storyFromReportRow(row, row.storyId, suiteId, suites, safeSegment));
  }

  function findWorstStory(suiteId, suites, summarizeReport, safeSegment) {
    if (isFigmaEntryFixSuite(suiteId)) {
      const failing = findFigmaEntryFailingScreens(repoRoot, suiteId);
      const hit = failing[0];
      if (!hit) return null;
      return figmaEntryStoryFromStep(repoRoot, hit.screenId, suiteId);
    }
    const cfg = suites[suiteId];
    if (!cfg) return null;
    const reportPath = join(repoRoot, cfg.dir, "report.json");
    if (!existsSync(reportPath)) return null;
    const raw = JSON.parse(readFileSync(reportPath, "utf8"));
    const results = raw.results ?? [];
    const order = { error: 0, fail: 1, warn: 2, pass: 3 };
    const sorted = [...results].sort((a, b) => {
      const s = (order[a.status] ?? 9) - (order[b.status] ?? 9);
      if (s !== 0) return s;
      return (b.percent ?? 0) - (a.percent ?? 0);
    });
    const worst = sorted.find((r) => r.status !== "pass");
    if (!worst) return null;
    const dir = safeSegment(worst.storyId);
    const base = `${cfg.dir}/${dir}`;
    return {
      storyId: worst.storyId,
      status: worst.status,
      percent: worst.percent ?? 0,
      suiteId,
      suiteLabel: cfg.label,
      paths: {
        reportHtml: join(repoRoot, cfg.dir, "report.html"),
        comparePng: join(repoRoot, base, "regions/region-01-compare.png"),
        storybookPng: join(repoRoot, base, "storybook.png"),
        figmaPng: join(
          repoRoot,
          base,
          renderedImageFile(suiteId)
        )
      }
    };
  }

  function isSuiteStrictGreen(suiteId, suites) {
    const cfg = suites[suiteId];
    if (!cfg) return false;
    const reportPath = join(repoRoot, cfg.dir, "report.json");
    if (!existsSync(reportPath)) return false;
    const raw = JSON.parse(readFileSync(reportPath, "utf8"));
    const results = raw.results ?? [];
    return results.every((r) => r.status === "pass");
  }

  function rerunCommand(suiteId, storyId) {
    if (isFigmaEntryFixSuite(suiteId)) {
      return figmaEntryRerunCommand(suiteId, storyId);
    }
    if (suiteId === "figmaLive") {
      return `pnpm figma:live-iterate --story ${storyId}`;
    }
    if (suiteId === "figma") {
      return `pnpm figma:iterate --story ${storyId}`;
    }
    if (suiteId === "pixel") {
      return `pnpm test:pixel:golden`;
    }
    if (suiteId === "delivery") {
      return `pnpm test:delivery:golden`;
    }
    if (suiteId === "logic") {
      return `pnpm test:logic:audit:all`;
    }
    return "re-run the matching golden from the test console";
  }

  function renderedImageFile(suiteId) {
    if (suiteId === "figma" || suiteId === "pixel") return "rendered.png";
    return "figma.png";
  }

  function storyMetricsFromRow(row, suiteId) {
    if (suiteId === "delivery" && row.storybookVsFigma) {
      return {
        status: row.status ?? row.storybookVsFigma.status ?? "unknown",
        percent: row.storybookVsFigma.percent ?? row.percent ?? 0,
        maxRegionPercent:
          row.storybookVsFigma.maxRegionPercent ?? row.maxRegionPercent ?? null,
        error: row.error ?? row.storybookVsFigma.error ?? null
      };
    }
    return {
      status: row.status ?? "unknown",
      percent: row.percent ?? 0,
      maxRegionPercent: row.maxRegionPercent ?? null,
      error: row.error ?? null
    };
  }

  function storyFromReportRow(row, storyId, suiteId, suites, safeSegment) {
    const cfg = suites[suiteId];
    const relBase = `${cfg.dir}/${safeSegment(storyId)}`;
    const worstRegion = row.diffRegions?.[0];
    const compareRel = worstRegion?.compare ?? `regions/region-01-compare.png`;
    const metrics = storyMetricsFromRow(row, suiteId);
    const artifactPath =
      row.artifactPath ??
      (row.sceneJsonPath ? row.sceneJsonPath.replace(/scene\.json$/, "artifact.v2.json") : null);
    return {
      storyId,
      status: metrics.status,
      percent: metrics.percent,
      maxRegionPercent: metrics.maxRegionPercent,
      error: metrics.error,
      suiteId,
      suiteLabel: cfg.label,
      paths: {
        reportHtml: join(repoRoot, cfg.dir, "report.html"),
        comparePng: join(repoRoot, relBase, compareRel),
        storybookPng: join(repoRoot, relBase, "storybook.png"),
        figmaPng: join(repoRoot, relBase, renderedImageFile(suiteId)),
        diffPng: row.diffPng ?? join(repoRoot, relBase, "diff.png"),
        artifactPath: artifactPath ?? join(repoRoot, relBase, "artifact.v2.json"),
        sceneJsonPath: row.sceneJsonPath ?? join(repoRoot, relBase, "scene.json"),
        worstRegionCompare: worstRegion?.compare
          ? join(repoRoot, relBase, worstRegion.compare)
          : join(repoRoot, relBase, compareRel),
        testReportPath:
          row.testReportPath ??
          join(repoRoot, cfg.dir, "by-story", safeSegment(storyId), "test-report.json")
      }
    };
  }

  function formatFixAllRetryContext(retry, maxTries, story) {
    if (!retry || !retry.afterTest) return [];
    const lines = [
      "",
      "── Previous attempt did NOT reach PASS (read before changing code) ──",
      `Attempt ${retry.attempt}/${maxTries} completed without PASS.`
    ];
    const before = retry.beforeAttempt;
    const after = retry.afterTest;
    if (before) {
      lines.push(
        `Metrics before that fix: ${before.status} · ${before.percent.toFixed(2)}% global` +
          (before.maxRegionPercent != null
            ? ` · worst hotspot ${before.maxRegionPercent.toFixed(2)}%`
            : "")
      );
    }
    lines.push(
      `Metrics after automated golden test: ${after.status} · ${after.percent.toFixed(2)}% global` +
        (after.maxRegionPercent != null
          ? ` · worst hotspot ${after.maxRegionPercent.toFixed(2)}%`
          : "")
    );
    if (before && Math.abs(after.percent - before.percent) > 0.001) {
      const delta = after.percent - before.percent;
      lines.push(
        delta > 0
          ? `Global diff worsened by ${delta.toFixed(2)}% — do not repeat the same approach.`
          : `Global diff improved by ${Math.abs(delta).toFixed(2)}% but still not PASS — refine the fix, do not revert blindly.`
      );
    } else if (before) {
      lines.push(
        "Global diff barely moved — last change likely missed the root cause; use investigate skill on compare PNG + artifact JSON."
      );
    }
    if (story.tolerance != null) {
      const regionTol = story.regionTolerance ?? story.tolerance;
      lines.push(
        `PASS requires global ≤ ${story.tolerance}% and worst hotspot ≤ ${regionTol}% (both must pass for Figma-style suites).`
      );
    }
    if (after.error) lines.push(`Report error: ${after.error}`);
    if (retry.agentExitCode !== 0) {
      lines.push(`Agent CLI exited ${retry.agentExitCode} (may have stopped before finishing edits).`);
    }
    if (retry.pluginBuildFailed) {
      lines.push("Plugin build FAILED — fix compile errors first:");
      lines.push((retry.pluginBuildTail || "(no build output)").slice(-600));
    }
    if (retry.testExitCode != null && retry.testExitCode !== 0) {
      lines.push(`Story golden test exited ${retry.testExitCode}.`);
    }
    if (retry.testTail?.trim()) {
      lines.push("Last lines from golden test:");
      lines.push(retry.testTail.trim());
    }
    lines.push(
      "Compare PNG paths are unchanged but files were regenerated — open the compare image again."
    );
    if (story.paths?.worstRegionCompare) {
      lines.push(`Worst hotspot compare: ${story.paths.worstRegionCompare}`);
    }
    if (story.paths?.artifactPath) lines.push(`Artifact: ${story.paths.artifactPath}`);
    if (story.paths?.sceneJsonPath) lines.push(`Scene JSON: ${story.paths.sceneJsonPath}`);
    return lines;
  }

  function resolveStoryTestReport(story, suiteId) {
    const explicit = story.paths?.testReportPath ?? story.testReportPath;
    if (explicit) return loadTestReport(explicit);
    if (isFigmaEntryFixSuite(suiteId ?? story.stepId ?? story.suiteId)) {
      const stepId = story.stepId ?? story.suiteId;
      const p = figmaScreenTestReportPath(repoRoot, story.storyId, stepId);
      return loadTestReport(p);
    }
    const cfg = { pixel: "pixel-diffs", figma: "figma-diffs", figmaLive: "figma-live-diffs", delivery: "delivery-diffs" }[
      suiteId
    ];
    if (cfg) {
      const seg = story.storyId.replace(/[<>:"/\\|?*]/g, "-");
      return loadTestReport(join(repoRoot, cfg, "by-story", seg, "test-report.json"));
    }
    return null;
  }

  function buildCursorPrompt(worst, mode, extra = "") {
    const report = resolveStoryTestReport(worst, worst.suiteId ?? worst.stepId);
    if (report) {
      const entryMode =
        report.failedTest?.testId === "vsFigmaLive" || report.failedTest?.testId === "figmaLive"
          ? "live"
          : mode;
      return [
        fixPromptFromTestReport(report, extra),
        "",
        ...skillFollowLines(entryMode === "live" ? "live" : mode === "pixel" ? "pixel" : "emulator", {
          suiteId: worst.suiteId ?? worst.stepId,
          storyId: worst.storyId
        }),
        ...labMemoryHintLines(repoRoot, worst.storyId, mode, worst.suiteId)
      ].join("\n");
    }
    if (isFigmaEntryFixSuite(worst.suiteId ?? worst.stepId)) {
      const stepId = worst.stepId ?? worst.suiteId;
      const lines = buildFigmaEntryFixPromptLines(worst, stepId, extra);
      const entryMode = figmaEntryFixMode(stepId);
      return [
        ...lines.slice(0, 1),
        "",
        ...skillFollowLines(entryMode === "live" ? "live" : "emulator", {
          suiteId: stepId,
          storyId: worst.storyId
        }),
        ...lines.slice(1)
      ].join("\n");
    }
    const lines = [
      mode === "live"
        ? "make fixes after live test"
        : mode === "pixel"
          ? "run until pass"
          : "run until pass",
      "",
      `Worst story: ${worst.storyId} (${worst.percent.toFixed(2)}% global, ${worst.status}, ${worst.suiteLabel})${
        worst.maxRegionPercent != null
          ? ` · worst hotspot ${worst.maxRegionPercent.toFixed(2)}%`
          : ""
      }`,
      `Compare: ${worst.paths.comparePng}`,
      `Storybook: ${worst.paths.storybookPng}`,
      `${mode === "pixel" ? "Rendered" : "Figma"}: ${worst.paths.figmaPng}`,
      "",
      ...sourceVsRendererTriageLines(mode, worst),
      ...labMemoryHintLines(repoRoot, worst.storyId, mode, worst.suiteId),
      ...skillFollowLines(mode, { suiteId: worst.suiteId, storyId: worst.storyId }),
      mode === "live"
        ? "Live phase only. Fix now; after rebuild, one-line ask to reload plugin + reply ready before re-live."
        : (pixelFixInstructionLine(mode) ??
          "Emulator first until green, then live. Fix now without asking permission.")
    ];
    if (worst.storyId && worst.suiteId) {
      lines.push("", `After fix: ${rerunCommand(worst.suiteId, worst.storyId)}`);
    }
    if (extra) lines.push("", extra);
    return lines.join("\n");
  }

  function suiteGoldenCommand(suiteId) {
    if (isFigmaEntryFixSuite(suiteId)) {
      return `pnpm test:figma:screen (${suiteId} step — use per-screen --artifact from console)`;
    }
    if (suiteId === "figmaLive") return "pnpm figma:live-iterate";
    if (suiteId === "figma") return "pnpm figma:iterate";
    if (suiteId === "pixel") return "pnpm test:pixel:golden";
    if (suiteId === "delivery") return "pnpm test:delivery:golden";
    if (suiteId === "logic") return "pnpm test:logic:audit:all";
    return "re-run the matching golden from the test console";
  }

  function buildFixAllCursorPrompt(stories, mode, suiteId) {
    const suiteLabel = stories[0]?.suiteLabel ?? suiteId;
    const renderedLabel = mode === "pixel" ? "Rendered" : "Figma";
    const batchEnv = process.env.FIX_ALL_BATCH === "1" || process.env.FIX_ALL_BATCH === "true";
    const batchMode = batchEnv && stories.length > 1;
    const lines = [
      mode === "live" ? "make fixes after live test" : "run until pass",
      "",
      batchMode
        ? `Fix all BATCH — ${suiteLabel} (${stories.length} stories fail/warn)`
        : `Fix all SERIAL — ${suiteLabel} (${stories.length} stor${stories.length === 1 ? "y" : "ies"} fail/warn)`,
      "",
      batchMode
        ? "Harness builds investigation report → ONE agent session fixes ALL stories → re-tests each story."
        : "Orchestrator runs up to 5 fix→test cycles per story in separate agent tabs (worst-first). Do NOT fix all stories in one chat session.",
      "",
      ...skillFollowLines(mode, { fixAll: !batchMode, fixAllBatch: batchMode, suiteId }),
      mode === "live"
        ? "Live phase only. Fix now; after rebuild, one-line ask to reload plugin + reply ready before re-live."
        : (pixelFixInstructionLine(mode) ??
          "Emulator first until green, then live. Fix now without asking permission."),
      "",
      "Stories:"
    ];
    stories.forEach((story, index) => {
      const hotspot =
        story.maxRegionPercent != null ? ` · hotspot ${story.maxRegionPercent.toFixed(2)}%` : "";
      lines.push(
        "",
        `${index + 1}. ${story.storyId} (${story.percent.toFixed(2)}% global${hotspot}, ${story.status})`,
        `   Compare: ${story.paths.comparePng}`,
        `   Storybook: ${story.paths.storybookPng}`,
        `   ${renderedLabel}: ${story.paths.figmaPng}`
      );
      if (mode === "pixel") {
        const hint = loadLabMemoryFixHint(repoRoot, story.storyId, story.suiteId ?? "pixel");
        const summary = hint?.rootCause
          ?.split("\n")
          .map((l) => l.trim())
          .find(Boolean)
          ?.slice(0, 140);
        if (summary) lines.push(`   Lab memory: ${summary}${summary.length >= 140 ? "…" : ""}`);
      }
    });
    lines.push("", `After all fixes: ${suiteGoldenCommand(suiteId)}`);
    lines.push(
      "",
      batchMode
        ? "Fix ALL listed stories in one session (shared root cause). Rebuild plugin if code-v2.ts changed."
        : mode === "pixel"
          ? `Fix ${PIXEL_RENDER_HTML_PATH} immediately (no approval). Re-run pixel golden after all fixes.`
          : "Fix immediately (no approval). Rebuild plugin if you changed code-v2.ts."
    );
    return lines.join("\n");
  }

  function buildFixAllBatchPrompt(stories, reportPaths, mode, suiteId, batchAttempt, maxBatchTries, priorOutcome = null) {
    const suiteLabel = stories[0]?.suiteLabel ?? suiteId;
    const renderedLabel = mode === "pixel" ? "Rendered" : "Figma";
    const lines = [
      mode === "live" ? "make fixes after live test" : "run until pass",
      "",
      `Fix all BATCH — attempt ${batchAttempt}/${maxBatchTries} — ${suiteLabel}`,
      `Fix **all ${stories.length} stories** in this ONE agent session (not one-by-one).`,
      "",
      ...skillFollowLines(mode, { fixAllBatch: true, suiteId }),
      "",
      "── Investigation report (read first) ──",
      `Markdown: ${reportPaths.mdPath}`,
      `JSON: ${reportPaths.jsonPath}`,
      "",
      "Open the markdown report, then each story's compare PNG + artifact JSON.",
      "Find shared root cause across stories; implement one coordinated fix set.",
      "",
      "── Stories in this batch ──"
    ];
    stories.forEach((story, index) => {
      const hotspot =
        story.maxRegionPercent != null ? ` · hotspot ${story.maxRegionPercent.toFixed(2)}%` : "";
      lines.push(
        `${index + 1}. ${story.storyId} — ${story.status} · ${story.percent.toFixed(2)}% global${hotspot}`,
        `   Compare: ${story.paths.comparePng}`,
        `   ${renderedLabel}: ${story.paths.figmaPng}`,
        `   Artifact: ${story.paths.artifactPath ?? "(see report)"}`
      );
    });
    if (priorOutcome) {
      lines.push(
        "",
        "── Previous batch attempt did NOT green all stories ──",
        `Passed after re-test: ${priorOutcome.passedCount}/${priorOutcome.totalCount}`,
        `Still failing: ${priorOutcome.stillFailing.join(", ") || "(none)"}`
      );
      if (priorOutcome.filesChanged?.length) {
        lines.push(`Files changed last attempt: ${priorOutcome.filesChanged.join(", ")}`);
      }
      if (priorOutcome.watchdogTripped) {
        lines.push(
          "",
          `⚠️  PREVIOUS ATTEMPT KILLED BY WATCHDOG: ${priorOutcome.watchdogReason ?? "investigation paralysis"}`,
          "DO NOT repeat the read-everything investigation pattern this time.",
          "MANDATORY this attempt:",
          "  1. Read the investigation report MD (already aggregates all stories).",
          "  2. Read ≤3 region compare PNGs from the report's top failures.",
          mode === "pixel"
            ? `  3. Use Grep on ${PIXEL_RENDER_HTML_PATH} to locate ONE concrete symbol — DO NOT Read it in full.`
            : "  3. Use Grep on code-v2.ts to locate ONE concrete symbol — DO NOT Read code-v2.ts in full.",
          "  4. Land at least ONE code edit within 5 minutes.",
          "If you cannot diagnose with that budget, write 'BLOCKED: <one-line reason>' to the report and exit."
        );
      } else {
        lines.push("Adjust strategy — do not repeat the same ineffective edits.");
      }
    }
    lines.push(
      "",
      "── Investigation budget (HARD LIMITS — exceed = orchestrator watchdog kills the run) ──",
      mode === "pixel"
        ? `• READ ONCE (pixel): ${PIXEL_RENDER_HTML_PATH} (~2000 lines), extract.ts (~1400 lines). scene-to-html.ts is MOCK ONLY — not used by pixel golden.`
        : "• READ ONCE: code-v2.ts (3016 lines), extract.ts (1408 lines), scene-to-html.ts, figma-live-test.ts. Re-reading wastes 50k+ tokens and produces no progress.",
      "• After reading a big file once, use Grep/SemanticSearch to re-locate symbols — DO NOT call Read on the same path twice.",
      "• Read the investigation MD + 3-5 worst-story PNGs + 3-5 worst-story artifact.v2.json. Do not read every story's artifact — the report aggregates them.",
      "• First code edit MUST land within ~8 minutes of session start. If you cannot diagnose by then, write a 5-line BLOCKED note in the investigation MD and exit.",
      "• Total wall clock target: ≤ 20 minutes per batch attempt.",
      "",
      "Do NOT run golden tests yourself. Harness rebuilds plugin (if needed) and re-tests every story.",
      mode === "live"
        ? "After rebuild: one line to reload Figma plugin before live re-test."
        : "Rebuild plugin if you changed code-v2.ts."
    );
    return lines.join("\n");
  }

  function buildFixAllStoryPrompt(story, mode, suiteId, attempt, maxTries, retry = null, supervisor = null) {
    const harnessNote =
      mode === "pixel"
        ? "The harness will re-run pixel golden for this story after you finish."
        : mode === "live"
          ? "The harness will rebuild the plugin, then re-run live golden for this story."
          : "The harness will rebuild the plugin, then re-run figma:iterate for this story.";
    const workerMode = supervisor?.nextWorkerMode ?? "continue";
    const modeLines =
      workerMode === "investigate_first"
        ? [
            "",
            "── Supervisor mode: INVESTIGATE FIRST ──",
            "Read compare PNG + artifact JSON (≤3 region PNGs). Write diagnosis in lab-memory, then implement.",
            "You have ~14 minutes before the harness watchdog stops a no-edit session — do not read code-v2.ts in full.",
            "Land at least ONE targeted edit (extract.ts / render-html.ts for pixel) within 10 minutes."
          ]
        : workerMode === "narrow_scope"
          ? [
              "",
              "── Supervisor mode: NARROW SCOPE ──",
              "Prior attempt went the wrong direction — change ONLY what the supervisor names below."
            ]
          : workerMode === "wrong_step"
            ? [
                "",
                "── Supervisor mode: WRONG STEP ──",
                "Fix the earliest failing pipeline step for this story; do not optimize later steps yet."
              ]
            : workerMode === "tier_c_required"
              ? [
                  "",
                  "── Supervisor mode: TIER C VERIFICATION ──",
                  "A shared adapter (render-html.ts / extract.ts) was already edited in a prior attempt.",
                  "DO NOT re-read render-html.ts or re-investigate the issue.",
                  "ONLY run: pnpm --filter @lab/pixel-test test:golden -- --stories " +
                    (story?.storyId ?? "<storyId>"),
                  "If the test exits 0 (PASS or WARN acceptable), write a one-line note in lab-memory and stop.",
                  "If it fails, make ONE targeted fix to render-html.ts based on what was already changed — do not read the whole file."
                ]
              : workerMode === "orchestrator_review"
                ? [
                    "",
                    "── Supervisor mode: ORCHESTRATOR REVIEW ──",
                    "Previous fixer attempts failed to move the item. Do NOT repeat the same patch loop.",
                    "First write a concise failure analysis: failed hypotheses, files changed, unchanged metrics, and the next concrete fix area.",
                    "Only edit code if that analysis names one specific code path and one expected metric movement."
                  ]
              : [];
    const supervisorLines = supervisor?.interventionLines?.length
      ? [
          "",
          "── Worker supervisor ──",
          `Verdict: ${supervisor.verdict ?? "ON_TRACK"} · mode: ${workerMode}`,
          ...supervisor.interventionLines
        ]
      : [];
    /** @type {string[]} */
    const investigationLines = [];
    if (mode === "pixel" && attempt === 1) {
      const payload = buildBatchInvestigationPayload([story], {
        suiteId,
        suiteLabel: "Pixel (schema)",
        repoRoot,
        tolerance: story.tolerance ?? 0.1,
        regionTolerance: story.regionTolerance ?? 0.1
      });
      const reportPaths = writeStoryBatchReport(
        repoRoot,
        story.storyId,
        attempt,
        payload
      );
      investigationLines.push(
        "",
        "── Deterministic investigation brief (read this first) ──",
        `Markdown: ${reportPaths.mdPath}`,
        "Open compare PNG + artifact paths in the brief. Pre-extracted snippets are the only renderer reads allowed.",
        "MANDATORY: one edit in render-html.ts or extract.ts within 5 minutes — lab-memory/docs edits do not count."
      );
    }
    const extra = [
      `Fix-all iteration ${attempt}/${maxTries} — THIS STORY ONLY (${story.storyId}).`,
      ...investigationLines,
      ...(attempt > 1
        ? [
            "Prior attempt(s) on this story did not reach PASS — read the failure brief below before editing."
          ]
        : []),
      ...modeLines,
      ...supervisorLines,
      "Do not fix other stories in this agent session.",
      harnessNote,
      "Goal: PASS on the next automated test (global + hotspot tolerance). WARN/FAIL triggers another attempt.",
      "Do not run the full suite golden yourself — only edit code and rebuild plugin if you changed code-v2.ts.",
      ...formatFixAllRetryContext(retry, maxTries, story)
    ].join("\n");
    return buildCursorPrompt(story, mode, extra);
  }

  function buildInvestigatorOnlyPrompt(story, mode, suiteId, attempt, maxTries) {
    const vaultSuite = vaultSuiteIdForMode(mode, suiteId);
    const extra = [
      `Investigation-only — ${story.storyId} (attempt ${attempt}/${maxTries}).`,
      "",
      "## HARD GATE: fixer blocked until this pass completes",
      "Do NOT edit adapter code (render-html.ts, extract.ts, code-v2.ts, @lab/ui) in this session.",
      "Read compare PNG, artifact JSON, and linked lab-memory patterns.",
      "Append to lab-memory with ### Root cause and ### Recommended fix area filled (remove <!-- pending).",
      "The harness dispatches a separate fixer agent only after investigation is complete.",
      ...sourceVsRendererTriageLines(mode, story),
      ...labMemoryHintLines(repoRoot, story.storyId, mode, suiteId),
      "",
      `Read ${SKILL_INVESTIGATE} — diagnose ONLY (systematic-debugging before any edit).`,
      `Read ${SKILLS.labMemoryRule}`,
      "After diagnosis: append lab-memory/templates/investigation.md sections to the story note."
    ].join("\n");
    return buildCursorPrompt(story, mode, extra);
  }

  function enqueueSuiteFailure(suiteId, suites, summarizeReport, safeSegment, meta = {}) {
    const worst = findWorstStory(suiteId, suites, summarizeReport, safeSegment);
    if (!worst) return null;
    const mode = suiteId === "figmaLive" ? "live" : "emulator";
    const phase = meta.phase ?? mode;
    return pushMessage({
      type: "run_until_pass",
      phase,
      suiteId,
      storyId: worst.storyId,
      percent: worst.percent,
      status: worst.status,
      paths: worst.paths,
      cursorPrompt: buildCursorPrompt(
        worst,
        mode,
        meta.hint ??
          "Fix immediately (no approval). Rebuild plugin, re-run Run until pass or golden."
      ),
      cursorPhrase: mode === "live" ? "make fixes after live test" : "run until pass",
      ...TERMINAL_CLI,
      ...meta
    });
  }

  const LIVE_HANDOFF_PROMPT = [
    "run until pass — Phase 1 (emulator) is green.",
    "",
    "Before live golden:",
    "1. Test console → Start Figma relay",
    "2. Figma Desktop → Development → Universal JSON Importer Lab",
    "3. Wait for plugin bridge connected",
    "4. Cursor should start relay + fix without asking approval; only ask ready after plugin rebuild",
    "",
    ...skillFollowLines("live", {}),
    "Phase 2 (live) — operate immediately"
  ].join("\n");

  function buildPortfolioOrchestratorPrompt(storyCount) {
    const lines = [
      "Run until portfolio green at strict 0.1%. Do not ask me to continue. Only stop for Figma plugin reload/open.",
      "",
      `Portfolio orchestrator — golden path ALL (${storyCount} stories)`,
      "Sequential steps: pixel → figma emulator → figma live → delivery.",
      "",
      ...workflowPreamble("portfolio_golden", {}),
      "",
      "The Terminal harness runs fix→test loops per step. You fix one story at a time when dispatched.",
      "Read .cursor/agent-context.auto.md at session start.",
      "",
      `Read ${SKILLS.orchestrator} — you are the supervisor until PHASE_COMPLETE.`
    ];
    return lines.join("\n");
  }

  return {
    loadInbox,
    loadPending,
    clearPending,
    saveInbox,
    pushMessage,
    notifyWaiters,
    findFailingStories,
    consumeForChat(id) {
      const messages = loadInbox();
      for (const m of messages) {
        if (m.id === id) {
          m.read = true;
          m.consumedByChat = true;
        }
      }
      saveInbox(messages);
      clearPending(id);
      return messages.filter((m) => !m.consumedByChat && !m.read);
    },
    getPendingForChat() {
      return loadPending();
    },
    getStoryFromReport(suiteId, storyId, suites, safeSeg) {
      if (isFigmaEntryFixSuite(suiteId)) {
        const story = figmaEntryStoryFromStep(repoRoot, storyId, suiteId);
        if (!story) return null;
        return story;
      }
      const cfg = suites[suiteId];
      if (!cfg) return null;
      const reportPath = join(repoRoot, cfg.dir, "report.json");
      if (!existsSync(reportPath)) return null;
      const raw = JSON.parse(readFileSync(reportPath, "utf8"));
      const row = (raw.results ?? []).find((r) => r.storyId === storyId);
      if (!row) return null;
      const story = storyFromReportRow(row, storyId, suiteId, suites, safeSeg);
      story.tolerance = raw.tolerance;
      story.regionTolerance = raw.regionTolerance;
      return story;
    },
    buildFixAllStoryPrompt,
    buildInvestigatorOnlyPrompt,
    buildFixAllBatchPrompt,
    buildAgentContext(suites, summarizeReport, safeSegment) {
      const unread = loadInbox().filter((m) => !m.read);
      const pendingForCursor = loadPending();
      const worstLive = findWorstStory("figmaLive", suites, summarizeReport, safeSegment);
      const worstMock = findWorstStory("figma", suites, summarizeReport, safeSegment);
      const worst = worstLive?.status !== "pass" ? worstLive : worstMock;
      return {
        consoleUrl: "http://127.0.0.1:6110",
        apiUrl: "http://127.0.0.1:6111",
        unreadCount: unread.length,
        pendingForCursor,
        inbox: unread,
        worstStory: worst,
        suggestedPrompt: worst
          ? buildCursorPrompt(
              worst,
              worst.suiteId === "figmaLive" ? "live" : "emulator"
            )
          : "Open test console — no failing stories right now.",
        reports: Object.keys(suites).map(summarizeReport)
      };
    },
    isSuiteStrictGreen,
    enqueueSuiteFailure,
    enqueueLiveHandoff() {
      return pushMessage({
        type: "live_handoff",
        phase: "live",
        cursorPhrase: "run until pass",
        cursorPrompt: LIVE_HANDOFF_PROMPT,
        ...TERMINAL_CLI
      });
    },
    enqueueRunUntilPassComplete() {
      return pushMessage({
        type: "run_until_pass_complete",
        phase: "done",
        cursorPhrase: "run until pass",
        cursorPrompt:
          "Mock and live Figma golden are all PASS (strict). No renderer fixes needed.",
        skipPending: true
      });
    },
    enqueuePrerequisite(hint) {
      return pushMessage({
        type: "prerequisite",
        chatDispatch: false,
        skipPending: true,
        cursorPhrase: "open test console",
        cursorPrompt: hint
      });
    },
    enqueueActionStarted(actionId, job) {
      return pushMessage({
        type: "action_started",
        actionId,
        actionLabel: job.label,
        cursorPhrase: "run until pass",
        skipPending: true,
        cursorPrompt: `Test console started: ${job.label} (${actionId}). Terminal will dispatch Cursor CLI when the job finishes.`
      });
    },
    enqueueJobFinished(actionId, job, suites, summarizeReport, safeSegment) {
      if (actionId === "figma:run-until-pass") return null;

      const logTail = job.logs.join("").slice(-4000);
      const testSuiteMap = {
        "figma:golden": "figma",
        "figma:live:golden": "figmaLive",
        "pixel:golden": "pixel",
        "delivery:golden": "delivery",
        "logic:golden": "logic",
        "figma:screen:parity": "vsFigmaLive",
        "figma:screen:golden": "vsFigmaLive",
        "figma:screen:manifest": "manifestContract",
        "figma:screen:four-way": "vsFigmaLive",
        "figma:screen:logic": "logic"
      };
      const suiteId = testSuiteMap[actionId];

      if (suiteId) {
        if (job.status === "failed") {
          let worst = null;
          if (job.story) {
            worst = this.getStoryFromReport(suiteId, job.story, suites, safeSegment);
            if (!worst) {
              const cfg = suites[suiteId];
              const reportPath = join(repoRoot, cfg?.dir ?? "", "report.json");
              if (existsSync(reportPath)) {
                const raw = JSON.parse(readFileSync(reportPath, "utf8"));
                const row = (raw.results ?? []).find((r) => r.storyId === job.story);
                if (row) {
                  worst = storyFromReportRow(row, job.story, suiteId, suites, safeSegment);
                }
              }
            }
          }
          if (!worst) {
            worst = findWorstStory(suiteId, suites, summarizeReport, safeSegment);
          }
          const mode = isFigmaEntryFixSuite(suiteId)
            ? figmaEntryFixMode(suiteId) === "live"
              ? "live"
              : "figmaEntry"
            : suiteId === "figmaLive"
              ? "live"
              : suiteId === "pixel"
                ? "pixel"
                : "emulator";
          if (worst && worst.status !== "pass") {
            vaultRecordFailure(worst, suiteId, suites, safeSegment, {
              jobId: job.id,
              source: `test finished · ${actionId}`
            });
            return pushMessage({
              type: "test_finished",
              actionId,
              jobStatus: job.status,
              exitCode: job.exitCode,
              suiteId,
              storyId: worst.storyId,
              percent: worst.percent,
              status: worst.status,
              paths: worst.paths,
              logTail,
              cursorPrompt: buildCursorPrompt(worst, mode),
              cursorPhrase:
                mode === "live" ? "make fixes after live test" : "run until pass",
              ...TERMINAL_CLI
            });
          }
          return pushMessage({
            type: "test_finished",
            actionId,
            jobStatus: job.status,
            exitCode: job.exitCode,
            suiteId,
            logTail,
            cursorPhrase: "run until pass",
            cursorPrompt: [
              `Test run failed: ${actionId} (exit ${job.exitCode}).`,
              "",
              "Last output:",
              logTail || "(no log captured)",
              "",
              ...skillFollowLines(),
              "Diagnose and fix.",
              "Dispatch: pnpm test:console:cursor agent"
            ].join("\n"),
            ...TERMINAL_CLI
          });
        }
        if (job.status === "passed" && isSuiteStrictGreen(suiteId, suites)) {
          if (suiteId === "figma") return this.enqueueLiveHandoff();
          if (suiteId === "figmaLive") return this.enqueueRunUntilPassComplete();
        }
        return null;
      }

      if (job.status === "failed") {
        return pushMessage({
          type: "action_failed",
          actionId,
          actionLabel: job.label,
          exitCode: job.exitCode,
          logTail,
          cursorPhrase: "run until pass",
          cursorPrompt: [
            `Test console action failed: ${job.label ?? actionId} (exit ${job.exitCode}).`,
            "",
            "Last output:",
            logTail || "(no log captured)",
            "",
            "Fix the issue and re-run from the test console, then: pnpm test:console:cursor agent"
          ].join("\n"),
          ...TERMINAL_CLI
        });
      }

      return null;
    },
    requestFix(suiteId, storyId, suites, summarizeReport, safeSegment) {
      const targetSuite = suiteId ?? "figmaLive";
      let worst = null;
      if (storyId) {
        worst = this.getStoryFromReport(targetSuite, storyId, suites, safeSegment);
        if (!worst) {
          const reportPath = join(repoRoot, suites[targetSuite]?.dir ?? "", "report.json");
          if (existsSync(reportPath)) {
            const raw = JSON.parse(readFileSync(reportPath, "utf8"));
            const row = (raw.results ?? []).find((r) => r.storyId === storyId);
            if (row) worst = storyFromReportRow(row, storyId, targetSuite, suites, safeSegment);
          }
        }
      }
      if (!worst) {
        worst = findWorstStory(targetSuite, suites, summarizeReport, safeSegment);
      }
      if (!worst) {
        return pushMessage({
          type: "user_request",
          chatDispatch: false,
          cursorPrompt:
            "No failing story found. Open http://127.0.0.1:6110 and run a test, then: pnpm test:console:cursor agent",
          cursorPhrase: "open test console"
        });
      }
      const mode = isFigmaEntryFixSuite(targetSuite)
        ? figmaEntryFixMode(targetSuite) === "live"
          ? "live"
          : "figmaEntry"
        : targetSuite === "figmaLive"
          ? "live"
          : targetSuite === "pixel"
            ? "pixel"
            : "emulator";
      vaultRecordFailure(worst, targetSuite, suites, safeSegment, { source: "fix requested" });
      return pushMessage({
        type: "fix_requested",
        suiteId: targetSuite,
        storyId: worst.storyId,
        percent: worst.percent,
        status: worst.status,
        paths: worst.paths,
        rerunCommand: rerunCommand(targetSuite, worst.storyId),
        cursorPrompt: buildCursorPrompt(
          worst,
          mode,
          mode === "pixel"
            ? `Fix ${PIXEL_RENDER_HTML_PATH} immediately (no approval). Re-run pixel golden after fix.`
            : isFigmaEntryFixSuite(targetSuite)
              ? "Fix immediately (no approval). Rebuild plugin if code-v2.ts changed; rebuild Storybook after bake."
              : "Fix immediately (no approval). Rebuild plugin if you changed code-v2.ts."
        ),
        cursorPhrase: mode === "live" ? "make fixes after live test" : "run until pass",
        ...TERMINAL_CLI
      });
    },
    requestFixAll(suiteId, suites, summarizeReport, safeSegment) {
      const targetSuite = suiteId ?? "figmaLive";
      const stories = findFailingStories(targetSuite, suites, safeSegment);
      if (!stories.length) {
        return pushMessage({
          type: "user_request",
          chatDispatch: false,
          cursorPrompt:
            "No failing or warn stories found. Run tests from the test console first, then: pnpm test:console:cursor agent",
          cursorPhrase: "open test console"
        });
      }
      const mode = isFigmaEntryFixSuite(targetSuite)
        ? figmaEntryFixMode(targetSuite) === "live"
          ? "live"
          : "figmaEntry"
        : targetSuite === "figmaLive"
          ? "live"
          : targetSuite === "pixel"
            ? "pixel"
            : "emulator";
      const worst = stories[0];
      vaultRecordFailingStories(stories, targetSuite, suites, safeSegment, {
        source: "fix all requested"
      });
      return pushMessage({
        type: "fix_all_requested",
        suiteId: targetSuite,
        storyIds: stories.map((s) => s.storyId),
        storyCount: stories.length,
        percent: worst.percent,
        status: worst.status,
        paths: worst.paths,
        rerunCommand: suiteGoldenCommand(targetSuite),
        cursorPrompt: buildFixAllCursorPrompt(stories, mode, targetSuite),
        cursorPhrase: mode === "live" ? "make fixes after live test" : "run until pass",
        ...TERMINAL_CLI
      });
    },
    requestPortfolioOrchestrator(storyCount) {
      return pushMessage({
        type: "portfolio_orchestrator_requested",
        storyCount,
        cursorPrompt: buildPortfolioOrchestratorPrompt(storyCount),
        cursorPhrase: "run until pass",
        ...TERMINAL_CLI
      });
    },
    ackMessages(ids, forChat = false) {
      const messages = loadInbox();
      for (const m of messages) {
        if (ids.includes(m.id)) {
          m.read = true;
          if (forChat) m.consumedByChat = true;
        }
      }
      saveInbox(messages);
      if (forChat && ids.length) clearPending(ids[ids.length - 1]);
      return messages.filter((m) => !m.read);
    },
    waitForMessage(timeoutMs) {
      const unread = loadInbox().filter((m) => !m.read);
      if (unread.length) return Promise.resolve(unread[unread.length - 1]);
      return new Promise((resolve) => {
        const entry = {
          resolve,
          timer: setTimeout(() => resolve(null), timeoutMs)
        };
        waiters.push(entry);
      });
    }
  };
}
