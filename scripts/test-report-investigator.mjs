/**
 * Test-report investigator — automatic (harness) + agent (LLM) resolution on failed tests.
 * Output lives on test-report.json only until PASS → lab-memory archive.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import {
  loadTestReport,
  writeTestReportHtml,
  figmaScreenTestReportPath,
  storybookTestReportPath,
} from "./test-report-build.mjs";
import {
  enrichReportWithInvestigationBrief,
  formatInvestigationBriefForFixer,
  refreshBriefSnippetsFromAgent,
} from "./fixer-investigation-brief.mjs";
import { isFigmaEntryFixSuite } from "./figma-entry-fix.mjs";

/** Adapter/schema-only steps — no pixel compare, no agent investigator. */
export const STRUCTURAL_TEST_IDS = new Set(["manifestContract", "structural"]);

/** @param {string | undefined} testId */
export function isStructuralTestId(testId) {
  return testId != null && STRUCTURAL_TEST_IDS.has(testId);
}

/** @param {object | null | undefined} report */
export function shouldRunAgentInvestigator(report) {
  if (!report) return false;
  if (report.global?.status === "pass") return false;
  if (isStructuralTestId(report.failedTest?.testId)) return false;
  if (process.env.SKIP_AGENT_INVESTIGATOR === "1") return false;
  return true;
}

/**
 * Resolve test-report.json path for any suite / figma-entry step.
 * @param {string} repoRoot
 * @param {string} storyId
 * @param {string} suiteId
 */
export function resolveStoryTestReportPath(repoRoot, storyId, suiteId) {
  if (isFigmaEntryFixSuite(suiteId)) {
    return figmaScreenTestReportPath(repoRoot, storyId, suiteId);
  }
  const seg = String(storyId)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  const dirMap = {
    pixel: "pixel-diffs",
    figma: "figma-diffs",
    figmaLive: "figma-live-diffs",
    delivery: "delivery-diffs",
    logic: "logic-audit-diffs",
  };
  const suiteDir = dirMap[suiteId];
  if (!suiteDir) return null;
  return storybookTestReportPath(repoRoot, suiteDir, seg);
}

export const INVESTIGATOR_RESOLUTION_FILE = "investigator-resolution.json";

/**
 * Build automatic (harness) investigation block from enriched report fields.
 * @param {object} report
 */
export function buildAutomaticInvestigation(report) {
  return {
    source: "test-harness",
    ranAt: report.testedAt ?? new Date().toISOString(),
    structuredDiagnosis: report.structuredDiagnosis ?? null,
    pipelineTrace: report.pipelineTrace
      ? {
          hasBlocker: report.pipelineTrace.hasBlocker,
          effectiveFixer: report.pipelineTrace.effectiveFixer ?? null,
          kindMismatches: report.pipelineTrace.audit?.kindMismatches ?? [],
          adapterVsDisk: report.pipelineTrace.audit?.adapterVsDisk ?? [],
        }
      : null,
    investigationBrief: report.investigationBrief
      ? {
          hotspot: report.investigationBrief.hotspot,
          lookFor: report.investigationBrief.lookFor,
          editRouting: report.investigationBrief.editRouting ?? [],
          antiPatterns: report.investigationBrief.antiPatterns ?? [],
          rankedHypotheses: report.investigationBrief.rankedHypotheses ?? [],
        }
      : null,
  };
}

/**
 * Merge automatic + agent into unified investigator object + section text.
 * @param {object} report
 */
export function buildInvestigatorSection(report) {
  const automatic = report.investigator?.automatic ?? buildAutomaticInvestigation(report);
  const agent = report.investigator?.agent ?? null;
  const sectionText = formatInvestigatorSectionText({ automatic, agent, report });
  return {
    schemaVersion: "1.0",
    automatic,
    agent,
    sectionText,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * When agent investigator names a known micro-fix, emit copy-paste StrReplace block
 * so fixer applies edit without Reading code-v2.ts (watchdog + hallucination guard).
 * @param {object} report
 */
export function buildAgentExplicitPatch(report) {
  const agent = report.investigator?.agent;
  if (agent?.status !== "complete") return "";
  const blob = [agent.primaryEdit, agent.resolution, agent.recommendedFixArea, agent.visualNotes]
    .filter(Boolean)
    .join(" ");
  if (!/pinFigmaFlexCrossEndBareText/i.test(blob)) return "";

  // Agent asked for textDirection reorder or explicitly rejected the hardcoded align:end patch.
  if (
    /move.*textDirection|textDirection block.*before|stale harness StrReplace|Do NOT apply the stale/i.test(
      blob
    ) ||
    /before line 887|before textAlignHorizontal/i.test(blob)
  ) {
    return "";
  }

  // Hardcoded patch only applies to align:end RIGHT in the non-RTL placedW branch (~909).
  if (!/909|align.*end.*placedW|textAlignHorizontal.*RIGHT/i.test(blob)) return "";

  // Skip when snippets show align:end RIGHT is already in code (no-op / wrong fix).
  const snippetBlob =
    report.investigationBrief?.codeSnippets?.join("\n") ??
    report.investigationText ??
    "";
  if (/align === "right" \|\| align === "end"/.test(snippetBlob)) return "";

  return [
    "",
    "── EXACT StrReplace (mandatory first action — do NOT Read code-v2.ts) ──",
    "File: packages/figma-importer-plugin/src/code-v2.ts",
    "",
    "old_string:",
    "  const placedW = Math.min(naturalW, boxW);",
    '  text.textAutoResize = "NONE";',
    '  text.textAlignHorizontal = "LEFT";',
    "  text.resize(placedW, Math.max(boxH, naturalH));",
    "",
    "new_string:",
    "  const placedW = Math.min(naturalW, boxW);",
    '  text.textAutoResize = "NONE";',
    "  text.textAlignHorizontal =",
    '    align === "right" || align === "end" ? "RIGHT" : "LEFT";',
    "  text.resize(placedW, Math.max(boxH, naturalH));",
    "",
    "Apply ONLY this edit, then STOP — harness rebuilds plugin + re-tests.",
  ].join("\n");
}

/**
 * ONE-edit block for fixer prompts — agent resolution wins over automatic routing.
 * @param {object} report
 */
export function formatFixerActionBlock(report) {
  const agent = report.investigator?.agent;
  const brief = report.investigationBrief;
  const lines = ["── Fixer action (ONE edit — start here) ──"];

  if (agent?.status === "complete") {
    lines.push("⚠ PREFER AGENT over automatic when they conflict — agent validated compare PNG + greps.");
    if (agent.primaryEdit) lines.push(`Primary edit: ${agent.primaryEdit}`);
    else if (agent.recommendedFixArea) lines.push(`Primary edit: ${agent.recommendedFixArea}`);
    if (agent.resolution) lines.push(`Do this: ${agent.resolution}`);
    if (agent.visualNotes) lines.push(`Visual check: ${agent.visualNotes}`);
    const patch = buildAgentExplicitPatch(report);
    if (patch) lines.push(patch);
    lines.push(
      "Secondary (only if primary test still fails): see ranked hypotheses in investigation brief below."
    );
  } else if (brief?.editRouting?.[0]) {
    const r = brief.editRouting[0];
    lines.push(`Primary edit: ${r.symbol} — ${r.check}`);
    if (brief.rankedHypotheses?.[1]) {
      lines.push(`Secondary: ${brief.rankedHypotheses[1]}`);
    }
  } else {
    lines.push("Follow investigation brief below — one symbol edit only.");
  }

  lines.push(
    "Do NOT re-investigate — use pre-extracted snippets below.",
    "FORBIDDEN: Read code-v2.ts or contract.json in full.",
    "STOP after edit — harness rebuilds plugin + re-tests."
  );
  return lines.join("\n");
}

/**
 * @param {{ automatic: object, agent: object | null, report: object }} opts
 */
export function formatInvestigatorSectionText({ automatic, agent, report }) {
  const lines = [
    "── Investigator (automatic + agent — fixer reads this before editing) ──",
    "",
  ];

  if (agent?.status === "complete") {
    lines.push("▸ Fixer action (ONE edit — start here)");
    if (agent.refinesAutomatic !== false) {
      lines.push("  ⚠ PREFER AGENT over automatic when they conflict.");
    }
    if (agent.primaryEdit) lines.push(`  Primary: ${agent.primaryEdit}`);
    else if (agent.recommendedFixArea) lines.push(`  Primary: ${agent.recommendedFixArea}`);
    if (agent.resolution) lines.push(`  Do: ${agent.resolution}`);
    lines.push("");
  }

  lines.push("▸ Automatic (test harness)");
  const sd = automatic.structuredDiagnosis;
  if (sd) {
    lines.push(
      `  Root cause layer: ${sd.rootCauseLayer}`,
      `  Pipeline kinds OK: ${sd.pipelineKindOk ? "yes" : "NO"}`,
      `  Fix surface: ${sd.mandatoryFixSurface}`
    );
    for (const c of sd.conclusions ?? []) lines.push(`  · ${c}`);
    if (agent?.status !== "complete") {
      for (const r of sd.editRouting ?? []) {
        lines.push(`  · ${r.layer} ${r.name}: ${r.symbol} — ${r.check}`);
      }
    } else {
      lines.push("  (Edit routing deferred — use agent primary edit above.)");
    }
  } else if (automatic.investigationBrief) {
    lines.push(`  Hotspot: ${automatic.investigationBrief.hotspot}`);
    lines.push(`  Look for: ${automatic.investigationBrief.lookFor}`);
    for (const h of automatic.investigationBrief.rankedHypotheses ?? []) {
      lines.push(`  · ${h}`);
    }
  }
  if (automatic.pipelineTrace?.hasBlocker) {
    lines.push("  Pipeline BLOCKER — fix upstream before importer.");
  }

  lines.push("", "▸ Agent analysis");
  if (agent?.status === "complete") {
    if (agent.rootCause) lines.push(`  Root cause: ${agent.rootCause}`);
    if (agent.recommendedFixArea && !agent.primaryEdit) {
      lines.push(`  Recommended fix: ${agent.recommendedFixArea}`);
    }
    if (agent.visualNotes) lines.push(`  Visual: ${agent.visualNotes}`);
    if (agent.refinesAutomatic !== false) {
      lines.push("  Agent refines automatic — trust agent resolution over harness editRouting.");
    }
  } else if (agent?.status === "skipped") {
    lines.push(`  Skipped: ${agent.reason ?? "structural test or no report"}`);
  } else {
    lines.push("  Pending — agent investigator not run yet.");
  }

  const primary = report.mismatches?.[0];
  if (primary?.images?.compareSideBySide) {
    lines.push("", `Compare crop: ${primary.images.compareSideBySide}`);
  }
  if (report.images?.original && report.images?.target) {
    lines.push(`Full compare: ${report.images.original} vs ${report.images.target}`);
  }
  return lines.join("\n");
}

/**
 * Merge agent resolution JSON from disk into report (survives test-report refresh).
 * @param {object} report
 * @param {string} reportPath
 */
export function mergeAgentResolutionFromDisk(report, reportPath) {
  if (!reportPath) return report;
  const agentFromDisk = readAgentResolutionFile(reportPath);
  if (!agentFromDisk) return report;
  return {
    ...report,
    investigator: {
      ...(report.investigator ?? {}),
      agent: agentFromDisk,
    },
  };
}

/**
 * Attach investigator section and refresh investigationText for fixer prompts.
 * @param {object} report
 */
export function enrichReportWithInvestigatorSection(report) {
  const investigator = buildInvestigatorSection(report);
  const briefText = report.investigationBrief
    ? formatInvestigationBriefForFixer({
        ...report.investigationBrief,
        editRouting:
          report.structuredDiagnosis?.editRouting?.length > 0
            ? report.structuredDiagnosis.editRouting
            : report.investigationBrief.editRouting,
      })
    : "";
  const investigationText = [
    formatFixerActionBlock({ ...report, investigator }),
    investigator.sectionText,
    report.pipelineText,
    briefText,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { ...report, investigator, investigationText };
}

/**
 * @param {string} reportPath
 * @returns {object | null}
 */
export function readAgentResolutionFile(reportPath) {
  const resolutionPath = join(dirname(reportPath), INVESTIGATOR_RESOLUTION_FILE);
  if (!existsSync(resolutionPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(resolutionPath, "utf8"));
    return {
      status: "complete",
      rootCause: String(raw.rootCause ?? "").trim(),
      primaryEdit: String(raw.primaryEdit ?? "").trim() || undefined,
      recommendedFixArea: String(raw.recommendedFixArea ?? raw.recommendedFix ?? "").trim(),
      resolution: String(raw.resolution ?? "").trim(),
      visualNotes: String(raw.visualNotes ?? raw.visual ?? "").trim(),
      refinesAutomatic: raw.refinesAutomatic !== false,
      ranAt: raw.ranAt ?? new Date().toISOString(),
    };
  } catch {
    return { status: "error", reason: "invalid investigator-resolution.json" };
  }
}

/**
 * Persist report + HTML after investigator merge.
 * @param {string} reportPath
 * @param {object} report
 * @param {string} repoRoot
 */
export function persistInvestigatorReport(reportPath, report, repoRoot) {
  const enriched = enrichReportWithInvestigatorSection(report);
  const payload = { ...enriched, testReportPath: reportPath };
  writeFileSync(reportPath, JSON.stringify(payload, null, 2));
  writeTestReportHtml(payload, reportPath, repoRoot);
  return payload;
}

/**
 * Ensure automatic investigation is on report; optionally merge agent resolution from disk.
 * @param {string} repoRoot
 * @param {string} reportPath
 */
export function ensureAutomaticInvestigationOnReport(repoRoot, reportPath) {
  if (!reportPath || !existsSync(reportPath)) return null;
  let report = loadTestReport(reportPath);
  if (!report) return null;
  if (report.global?.status === "pass") return report;

  if (!report.structuredDiagnosis && !report.investigationBrief) {
    report = enrichReportWithInvestigationBrief(report, report.ctx ?? {}, repoRoot);
  }

  report = mergeAgentResolutionFromDisk(report, reportPath);
  if (report.investigator?.agent?.status === "complete") {
    const refreshedBrief = refreshBriefSnippetsFromAgent(
      report.investigationBrief,
      repoRoot,
      report.investigator.agent
    );
    if (refreshedBrief !== report.investigationBrief) {
      report = { ...report, investigationBrief: refreshedBrief };
    }
  }
  return persistInvestigatorReport(reportPath, report, repoRoot);
}

/**
 * Build agent investigator prompt — writes investigator-resolution.json only (no lab-memory).
 * @param {object} report
 * @param {string} repoRoot
 * @param {object} [story]
 */
export function buildAgentInvestigatorPrompt(report, repoRoot, story = {}, attempt = 1) {
  const reportPath = report.testReportPath ?? "";
  const resolutionPath = reportPath
    ? join(dirname(reportPath), INVESTIGATOR_RESOLUTION_FILE)
    : INVESTIGATOR_RESOLUTION_FILE;
  const reportRel = reportPath && repoRoot ? relative(repoRoot, reportPath).replace(/\\/g, "/") : reportPath;
  const primary = report.mismatches?.[0];
  const ft = report.failedTest ?? {};
  const allow = (ft.allowlist ?? []).slice(0, 3).join(", ") || "(see test-report failedTest.allowlist)";
  const hotspot =
    primary?.evidence?.message?.replace(/^Hotspot band:\s*/i, "") ??
    report.investigationBrief?.hotspot ??
    null;
  const attemptNote =
    attempt > 1
      ? [
          "",
          `── Prior fix attempts (${attempt - 1}) did NOT green this step ──`,
          "Do NOT repeat the same pinFigmaFlexCrossEndBareText textAlignHorizontal patch if metrics were flat.",
          "Validate compare PNG again; if user-header unchanged, consider pagination-footer / phone-row or font-load path.",
          "State explicitly in resolution if prior hypothesis was wrong.",
        ]
      : [];

  return [
    "Investigator-only — do NOT edit source code. Do NOT write lab-memory.",
    "",
    `Item: ${report.itemId} · failed test: ${ft.label ?? ft.testId}`,
    hotspot ? `Hotspot: ${hotspot} (worst region)` : "",
    `Test report: ${reportRel}`,
    ...attemptNote,
    "",
    "Your job: compare images + read automatic investigation below; write ONE resolution file for the fixer.",
    "",
    "Steps (≤5 min):",
    "1. Read test-report.json — automatic investigation is in `investigator.automatic` and `structuredDiagnosis`.",
    "2. Open compare PNGs — full frame + region crop (side-by-side original vs target).",
    primary?.images?.compareSideBySide
      ? `   Region crop: ${primary.images.compareSideBySide}`
      : "",
    report.images?.original ? `   Original: ${report.images.original}` : "",
    report.images?.target ? `   Target: ${report.images.target}` : "",
    report.images?.diff ? `   Diff: ${report.images.diff}` : "",
    "3. Validate or refine automatic diagnosis — grep allowlisted symbols only if needed.",
    `   Allowlisted: ${allow}`,
    "4. Do NOT Read code-v2.ts or contract.json in full.",
    "",
    "── Automatic investigation (from test — validate this) ──",
    report.investigator?.sectionText ?? report.investigationText?.split("── Investigation brief")[0] ?? "",
    "",
    `Write ONLY this file: ${resolutionPath}`,
    "Schema:",
    JSON.stringify(
      {
        rootCause: "one sentence",
        primaryEdit: "file.ts — symbolName — one-line change (fixer starts here)",
        recommendedFixArea: "path/to/file.ts — symbolName",
        resolution: "2-5 sentences for fixer — exact edit, line refs, do NOT re-read full file",
        visualNotes: "what differs in compare PNG (geometry, text, color)",
        refinesAutomatic: true,
        ranAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "",
    "Then STOP. Harness dispatches fixer with your resolution merged into test-report.",
    story.paths?.comparePng ? `Compare folder: ${story.paths.comparePng}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Clear prior agent resolution before a fresh investigator run.
 * @param {string} reportPath
 */
export function clearAgentResolutionFile(reportPath) {
  const resolutionPath = join(dirname(reportPath), INVESTIGATOR_RESOLUTION_FILE);
  if (existsSync(resolutionPath)) unlinkSync(resolutionPath);
}

/**
 * Run agent investigator phase: managed agent → merge resolution → rewrite test-report.
 * @param {object} opts
 */
export async function runAgentInvestigatorPhase(opts) {
  const {
    repoRoot,
    reportPath,
    storyMeta,
    suiteId,
    attempt,
    appendLog,
    runManagedAgent,
    normalizeAgentResult,
    jobId,
    killFlagPath,
    buildPrompt,
  } = opts;

  let report = ensureAutomaticInvestigationOnReport(repoRoot, reportPath);
  if (!report) {
    await appendLog?.("[investigator] no test-report — skip agent\n");
    return null;
  }
  if (!shouldRunAgentInvestigator(report)) {
    const reason = isStructuralTestId(report.failedTest?.testId)
      ? "structural test"
      : "pass or disabled";
    report = persistInvestigatorReport(reportPath, {
      ...report,
      investigator: {
        ...buildInvestigatorSection(report),
        agent: { status: "skipped", reason, ranAt: new Date().toISOString() },
      },
    }, repoRoot);
    await appendLog?.(`[investigator] agent skipped (${reason})\n`);
    return report;
  }

  clearAgentResolutionFile(reportPath);
  const prompt = buildPrompt
    ? buildPrompt(report, repoRoot, storyMeta)
    : buildAgentInvestigatorPrompt(report, repoRoot, storyMeta);

  await appendLog?.(
    `[investigator] agent run — ${storyMeta?.storyId ?? report.itemId} / ${suiteId} attempt ${attempt}\n`
  );

  const agentResult = normalizeAgentResult(
    await runManagedAgent({
      parentJobId: jobId,
      tag: `${report.itemId}:investigate-${attempt}`,
      prompt,
      appendLog,
      killFlagPath,
      investigateFirst: true,
      investigateOnly: true,
      workspaceRoot: repoRoot,
    })
  );

  const agentResolution = readAgentResolutionFile(reportPath);
  const agent = agentResolution ?? {
    status: agentResult.exitCode === 0 ? "incomplete" : "error",
    reason:
      agentResult.watchdogTripped
        ? `watchdog: ${agentResult.watchdogReason ?? "timeout"}`
        : `agent exit ${agentResult.exitCode ?? 1}`,
    ranAt: new Date().toISOString(),
  };

  report = persistInvestigatorReport(reportPath, {
    ...report,
    investigator: {
      automatic: buildAutomaticInvestigation(report),
      agent,
    },
  }, repoRoot);

  await appendLog?.(
    `[investigator] agent ${agent.status}${agent.rootCause ? ` — ${agent.rootCause.slice(0, 80)}` : ""}\n`
  );
  return report;
}

/**
 * On PASS: archive how we detected the issue to lab-memory (patterns hint only).
 * @param {object} opts
 */
export function archiveDetectionToLabMemoryOnPass(opts) {
  const { repoRoot, storyId, suiteId, report, attempt } = opts;
  if (!report?.investigator) return { ok: false, reason: "no investigator on report" };

  const vaultDir = join(repoRoot, "lab-memory", "visual", "investigations", "archive");
  mkdirSync(vaultDir, { recursive: true });

  const sd = report.investigator.automatic?.structuredDiagnosis;
  const agent = report.investigator.agent;
  const slug = `${storyId}-${suiteId}`.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const archivePath = join(vaultDir, `${slug}-pass-${attempt ?? 0}.md`);
  if (existsSync(archivePath)) return { ok: true, skipped: true, path: archivePath };

  const body = [
    `# Detection archive — ${storyId} / ${suiteId}`,
    "",
    `**Passed attempt:** ${attempt ?? "—"}`,
    `**Date:** ${new Date().toISOString()}`,
    "",
    "## How we detected it",
    "",
    "### Automatic (harness)",
    sd?.rootCauseLayer ? `- Root cause layer: ${sd.rootCauseLayer}` : "",
    ...(sd?.conclusions ?? []).map((c) => `- ${c}`),
    "",
    "### Agent",
    agent?.rootCause ? `- Root cause: ${agent.rootCause}` : "",
    agent?.resolution ? `- Resolution: ${agent.resolution}` : "",
    agent?.recommendedFixArea ? `- Fix area: ${agent.recommendedFixArea}` : "",
    "",
    "Reusable pattern: if similar hotspot, check same layer/symbols first.",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  appendFileSync(archivePath, body, "utf8");
  return { ok: true, path: archivePath };
}
