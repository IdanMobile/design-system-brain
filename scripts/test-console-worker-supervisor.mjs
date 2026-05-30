/**
 * Worker supervisor — observe fix agents, detect loops / wrong direction, steer next attempt.
 * Persists runs under .test-console/worker-runs/ and orchestrator-state.json.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isInvestigationComplete } from "./lab-memory-vault.mjs";
import { isStepPassing, loadStoryStepCellsFromDisk } from "./step-gate.mjs";

/** @typedef {'investigator' | 'fixer' | 'verify'} JobPhase */
export const JOB_PHASES = ["investigator", "fixer", "verify"];

export const SHARED_ADAPTER_PREFIXES = [
  "packages/figma-importer-plugin/src/code-v2.ts",
  "packages/pixel-test/src/render-html.ts",
  "packages/pixel-test/src/scene-to-html.ts",
  "packages/contract/",
  "packages/extractor-playwright/"
];

export const WORKER_MODES = [
  "continue",
  "investigate_first",
  "narrow_scope",
  "wrong_step",
  "tier_c_required",
  "orchestrator_review"
];

/** Paths that must not count as fix progress (vault, rules, prompts). */
export const NON_PRODUCTIVE_PREFIXES = [
  "lab-memory/",
  ".cursor/",
  ".agents/",
  ".test-console/",
  "docs/",
  "upload_to_cloud/"
];

/** @typedef {'ON_TRACK' | 'STUCK_LOOP' | 'WORSE_METRICS' | 'NO_EDIT' | 'NO_ADAPTER_EDIT' | 'WRONG_DIRECTION' | 'WRONG_STEP' | 'SHARED_ADAPTER' | 'REGION_ONLY_FAIL'} SupervisorVerdict */

/**
 * @param {string} rel
 * @returns {boolean}
 */
export function isNonProductivePath(rel) {
  return NON_PRODUCTIVE_PREFIXES.some((p) => rel === p || rel.startsWith(p));
}

/**
 * Files that can move visual test metrics for this step.
 * @param {string} mode
 * @param {string[]} filesChanged
 * @returns {string[]}
 */
export function adapterFilesForMode(mode, filesChanged) {
  return filesChanged.filter((f) => {
    if (isNonProductivePath(f)) return false;
    if (mode === "pixel") {
      return (
        f.includes("render-html") ||
        f.includes("extract.ts") ||
        f.startsWith("packages/contract/")
      );
    }
    if (mode === "emulator" || mode === "live") {
      return f.includes("code-v2.ts") || f.includes("extract.ts");
    }
    if (mode === "delivery") {
      return f.includes("@lab/ui") || f.includes("packages/ui/");
    }
    return !isNonProductivePath(f);
  });
}

/**
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function listWorkingTreeFiles(repoRoot) {
  const opts = { cwd: repoRoot, encoding: "utf8", stdio: "pipe" };
  const parts = [];
  for (const args of [
    ["diff", "--name-only"],
    ["diff", "--name-only", "--cached"],
    ["ls-files", "--others", "--exclude-standard"]
  ]) {
    const r = spawnSync("git", args, opts);
    if (r.status === 0 && r.stdout) {
      parts.push(...r.stdout.split("\n").map((l) => l.trim()).filter(Boolean));
    }
  }
  return [...new Set(parts)];
}

/**
 * @param {string} repoRoot
 * @returns {Record<string, string | null>}
 */
export function snapshotWorkspace(repoRoot) {
  /** @type {Record<string, string | null>} */
  const hashes = {};
  for (const rel of listWorkingTreeFiles(repoRoot)) {
    const abs = join(repoRoot, rel);
    if (!existsSync(abs)) {
      hashes[rel] = null;
      continue;
    }
    try {
      const buf = readFileSync(abs);
      hashes[rel] = createHash("sha256").update(buf).digest("hex").slice(0, 16);
    } catch {
      hashes[rel] = null;
    }
  }
  return hashes;
}

/**
 * @param {Record<string, string | null>} before
 * @param {Record<string, string | null>} after
 * @returns {string[]}
 */
export function diffWorkspaceSnapshots(before, after) {
  const changed = [];
  const all = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const f of all) {
    if (before[f] !== after[f]) changed.push(f);
  }
  return changed.sort();
}

/**
 * @param {string[]} files
 * @returns {boolean}
 */
export function touchedSharedAdapter(files) {
  return files.some((f) => SHARED_ADAPTER_PREFIXES.some((p) => f === p || f.startsWith(p)));
}

/**
 * @param {string} suiteId
 * @param {string} mode
 * @param {string[]} filesChanged
 * @returns {string | null}
 */
export function classifyWrongFiles(suiteId, mode, filesChanged) {
  if (!filesChanged.length) return null;

  const has = (substr) => filesChanged.some((f) => f.includes(substr));

  if (mode === "pixel") {
    if (has("code-v2.ts") && !has("render-html") && !has("extract")) {
      return "Supervisor: pixel step — prefer render-html.ts / extract.ts; code-v2.ts is for Figma import, not schema HTML replay.";
    }
    if (has("scene-to-html") && !has("render-html") && !has("extract")) {
      return "Supervisor: pixel golden uses render-html.ts (v2 schema), not scene-to-html.ts (mock/Figma emulator only).";
    }
  }

  if (mode === "emulator" || suiteId === "figma") {
    if (
      filesChanged.every(
        (f) =>
          f.includes("@lab/ui") ||
          f.includes("packages/ui/") ||
          f.includes("developer-playground")
      )
    ) {
      return "Supervisor: figma mock step — edit code-v2.ts (plugin renderer), not @lab/ui / playground.";
    }
    if (has("scene-to-html") && !has("code-v2")) {
      return "Supervisor: mock fail with scene-to-html-only edit — mock compares Figma renderer output; fix code-v2.ts unless pixel also fails.";
    }
  }

  if (mode === "live" || suiteId === "figmaLive") {
    if (has("scene-to-html") || has("extract")) {
      return "Supervisor: live step — fix code-v2.ts / plugin import; extraction/HTML is upstream.";
    }
  }

  if (suiteId === "delivery") {
    if (has("code-v2.ts") && !has("@lab/ui")) {
      return "Supervisor: delivery step — fix @lab/ui / playground component; code-v2 alone won't fix sb↔dev leg.";
    }
  }

  return null;
}

/**
 * @param {object} input
 * @param {string} input.suiteId
 * @param {string} input.mode
 * @param {string} input.storyId
 * @param {number} input.attempt
 * @param {object} input.beforeAttempt
 * @param {object} input.afterTest
 * @param {number} input.agentExitCode
 * @param {boolean} input.pluginBuildFailed
 * @param {string[]} input.filesChanged
 * @param {object[]} input.priorRuns
 * @param {string} input.repoRoot
 * @returns {{
 *   verdict: SupervisorVerdict,
 *   verdicts: SupervisorVerdict[],
 *   nextWorkerMode: string,
 *   interventionLines: string[],
 *   tierCRequired: boolean
 * }}
 */
export function evaluateAttempt(input) {
  const {
    suiteId,
    mode,
    storyId,
    attempt,
    beforeAttempt,
    afterTest,
    agentExitCode,
    pluginBuildFailed,
    filesChanged,
    priorRuns,
    repoRoot
  } = input;

  /** @type {SupervisorVerdict[]} */
  const verdicts = [];
  /** @type {string[]} */
  const interventionLines = [];
  let nextWorkerMode = "continue";
  let tierCRequired = false;

  const globalTol = 0.1;
  const regionTol = 0.1;
  const globalOk = afterTest.percent <= globalTol;
  const regionFail =
    afterTest.maxRegionPercent != null && afterTest.maxRegionPercent > regionTol;

  if (globalOk && regionFail && afterTest.status !== "pass") {
    verdicts.push("REGION_ONLY_FAIL");
    if (nextWorkerMode === "continue") nextWorkerMode = "investigate_first";
    interventionLines.push(
      `Supervisor: global diff ${afterTest.percent.toFixed(2)}% is within ${globalTol}% but worst hotspot is ${(afterTest.maxRegionPercent ?? 0).toFixed(2)}% (needs ≤ ${regionTol}% for strict pass). Compare region-01 PNG — may be tolerance/subpixel, not a renderer bug.`
    );
  }

  const hotspotSame =
    (afterTest.maxRegionPercent ?? null) != null &&
    (beforeAttempt.maxRegionPercent ?? null) != null &&
    Math.abs((afterTest.maxRegionPercent ?? 0) - (beforeAttempt.maxRegionPercent ?? 0)) <= 0.001;
  const globalSame = Math.abs(afterTest.percent - beforeAttempt.percent) <= 0.001;

  const adapterFiles = adapterFilesForMode(mode, filesChanged);
  const onlyNonProductive =
    filesChanged.length > 0 && adapterFiles.length === 0 && !pluginBuildFailed;

  if (filesChanged.length === 0 && agentExitCode === 0 && !pluginBuildFailed) {
    verdicts.push("NO_EDIT");
    nextWorkerMode = "investigate_first";
    interventionLines.push(
      "Supervisor: last attempt changed zero tracked files. Investigate ONLY first — open compare PNG + artifact JSON, write a short diagnosis (no code yet)."
    );
  } else if (onlyNonProductive && globalSame && (hotspotSame || afterTest.maxRegionPercent == null)) {
    verdicts.push("NO_ADAPTER_EDIT");
    nextWorkerMode = "narrow_scope";
    interventionLines.push(
      mode === "pixel"
        ? `Supervisor: edits were only vault/rules/prompts — pixel needs ${SHARED_ADAPTER_PREFIXES.find((p) => p.includes("render-html")) ?? "render-html.ts"} or extract.ts. Do NOT reorganize lab-memory during fix-all.`
        : "Supervisor: edits did not touch the adapter for this step — change renderer/extract paths named in the prompt, not docs or lab-memory."
    );
  }

  if (afterTest.percent > beforeAttempt.percent + 0.01) {
    verdicts.push("WORSE_METRICS");
    nextWorkerMode = "narrow_scope";
    interventionLines.push(
      `Supervisor: global diff worsened by ${(afterTest.percent - beforeAttempt.percent).toFixed(2)}% — revert harmful edits; do not repeat the same approach.`
    );
  }

  if (attempt >= 2 && globalSame && hotspotSame) {
    verdicts.push("STUCK_LOOP");
    if (nextWorkerMode === "continue") nextWorkerMode = "investigate_first";
    interventionLines.push(
      "Supervisor: metrics unchanged across attempts — stop guessing; use investigate-figma-mismatch on compare PNG + artifact before editing."
    );
  }

  if (priorRuns.length >= 1) {
    const prev = priorRuns[priorRuns.length - 1];
    const prevAfter = prev.afterTest ?? prev.metrics?.afterTest;
    if (prevAfter && globalSame && Math.abs((prevAfter.percent ?? 0) - afterTest.percent) <= 0.001) {
      if (!verdicts.includes("STUCK_LOOP")) {
        verdicts.push("STUCK_LOOP");
        if (nextWorkerMode === "continue") nextWorkerMode = "investigate_first";
        interventionLines.push(
          "Supervisor: two consecutive attempts with no metric movement — switch to investigate-first."
        );
      }
    }
  }

  const ineffectiveVerdicts = new Set([
    "STUCK_LOOP",
    "NO_ADAPTER_EDIT",
    "NO_EDIT",
    "WRONG_DIRECTION",
    "WORSE_METRICS"
  ]);
  const ineffectivePriorCount = priorRuns.filter((run) =>
    ineffectiveVerdicts.has(run.evaluation?.verdict ?? run.verdict)
  ).length;
  if (attempt >= 3 && ineffectivePriorCount >= 2 && afterTest.status !== "pass") {
    nextWorkerMode = "orchestrator_review";
    interventionLines.push(
      "Supervisor: ORCHESTRATOR REVIEW required — repeated fixer attempts did not resolve this item. Stop retrying the same prompt; summarize failed hypotheses, compare artifacts, and update the next fixer instruction before another code-edit attempt."
    );
  }

  if (onlyNonProductive && mode === "pixel" && !verdicts.includes("NO_ADAPTER_EDIT")) {
    verdicts.push("WRONG_DIRECTION");
    if (nextWorkerMode === "continue") nextWorkerMode = "narrow_scope";
    interventionLines.push(
      "Supervisor: pixel fix-all must edit render-html.ts or extract.ts — lab-memory/README moves do not change the diff %."
    );
  }

  const wrongFileMsg = classifyWrongFiles(suiteId, mode, adapterFiles.length ? adapterFiles : filesChanged);
  if (wrongFileMsg) {
    verdicts.push("WRONG_DIRECTION");
    nextWorkerMode = "narrow_scope";
    interventionLines.push(wrongFileMsg);
  }

  if (touchedSharedAdapter(filesChanged)) {
    verdicts.push("SHARED_ADAPTER");
    tierCRequired = true;
    interventionLines.push(
      "Supervisor: shared adapter file(s) touched — Tier C regression required before marking this story done."
    );
  }

  if (suiteId === "figmaLive" && repoRoot) {
    const cells = loadStoryStepCellsFromDisk(repoRoot, storyId, readFileSync, existsSync, join);
    const mockStatus = cells.figma?.status ?? "not_tested";
    if (!isStepPassing(mockStatus)) {
      verdicts.push("WRONG_STEP");
      nextWorkerMode = "wrong_step";
      interventionLines.push(
        `Supervisor: figma mock is ${mockStatus} for this story — fix mock before live (sequential gate).`
      );
    }
  }

  if (agentExitCode !== 0) {
    interventionLines.push(
      `Supervisor: agent CLI exited ${agentExitCode} — finish edits and verify plugin build before relying on test results.`
    );
  }

  if (pluginBuildFailed) {
    interventionLines.push("Supervisor: plugin build failed — fix compile errors before renderer tweaks.");
  }

  /** @type {SupervisorVerdict} */
  const primaryVerdict =
    verdicts.includes("WRONG_STEP")
      ? "WRONG_STEP"
      : verdicts.includes("WORSE_METRICS")
        ? "WORSE_METRICS"
        : verdicts.includes("REGION_ONLY_FAIL")
          ? "REGION_ONLY_FAIL"
          : verdicts.includes("STUCK_LOOP")
          ? "STUCK_LOOP"
          : verdicts.includes("NO_ADAPTER_EDIT")
            ? "NO_ADAPTER_EDIT"
            : verdicts.includes("WRONG_DIRECTION")
              ? "WRONG_DIRECTION"
              : verdicts.includes("NO_EDIT")
                ? "NO_EDIT"
                : verdicts.includes("SHARED_ADAPTER")
                ? "SHARED_ADAPTER"
                : "ON_TRACK";

  if (primaryVerdict === "ON_TRACK" && afterTest.status !== "pass") {
    nextWorkerMode = "continue";
  }

  if (tierCRequired && nextWorkerMode === "continue") {
    nextWorkerMode = "tier_c_required";
  }

  return {
    verdict: primaryVerdict,
    verdicts,
    nextWorkerMode,
    interventionLines,
    tierCRequired
  };
}

/**
 * @param {string} repoRoot
 * @param {string} jobId
 * @param {string} storyId
 * @param {number} attempt
 * @param {object} payload
 */
export function writeWorkerRun(repoRoot, jobId, storyId, attempt, payload) {
  const dir = join(repoRoot, ".test-console", "worker-runs", jobId);
  mkdirSync(dir, { recursive: true });
  const safeStory = storyId.replace(/[<>:"/\\|?*]/g, "-");
  const path = join(dir, `${safeStory}-try-${attempt}.json`);
  writeFileSync(
    path,
    JSON.stringify({ storyId, attempt, jobId, recordedAt: new Date().toISOString(), ...payload }, null, 2)
  );
  return path;
}

/**
 * @param {string} repoRoot
 * @param {string} jobId
 * @param {string} storyId
 * @returns {object[]}
 */
export function loadPriorWorkerRuns(repoRoot, jobId, storyId) {
  const dir = join(repoRoot, ".test-console", "worker-runs", jobId);
  if (!existsSync(dir)) return [];
  const safeStory = storyId.replace(/[<>:"/\\|?*]/g, "-");
  const prefix = `${safeStory}-try-`;
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort()
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * @param {string} repoRoot
 * @param {object} state
 */
export function writeOrchestratorState(repoRoot, state) {
  const path = join(repoRoot, ".test-console", "orchestrator-state.json");
  mkdirSync(join(repoRoot, ".test-console"), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ updatedAt: new Date().toISOString(), ...state }, null, 2)
  );
  return path;
}

/**
 * @param {string} repoRoot
 * @returns {object | null}
 */
export function loadOrchestratorState(repoRoot) {
  const path = join(repoRoot, ".test-console", "orchestrator-state.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {object} supervisor
 * @returns {string[]}
 */
export function formatSupervisorIntervention(supervisor) {
  if (!supervisor?.interventionLines?.length) return [];
  return [
    "",
    "── Worker supervisor (read before editing) ──",
    `Verdict: ${supervisor.verdict} · next mode: ${supervisor.nextWorkerMode}`,
    ...supervisor.interventionLines
  ];
}

/**
 * @param {string} workerMode
 * @returns {string[]}
 */
/**
 * @param {string} repoRoot
 * @param {string} jobId
 * @param {string} storyId
 * @param {JobPhase} phase
 * @param {number} attempt
 */
export function structuredJobResultPath(repoRoot, jobId, storyId, phase, attempt) {
  const dir = join(repoRoot, ".test-console", "job-results", jobId);
  const safeStory = storyId.replace(/[<>:"/\\|?*]/g, "-");
  return join(dir, `${safeStory}-${phase}-try-${attempt}.json`);
}

/**
 * Persist structured agent job outcome (investigator / fixer / verify).
 * @param {string} repoRoot
 * @param {string} jobId
 * @param {string} storyId
 * @param {JobPhase} phase
 * @param {number} attempt
 * @param {object} payload
 */
export function writeStructuredJobResult(repoRoot, jobId, storyId, phase, attempt, payload) {
  const path = structuredJobResultPath(repoRoot, jobId, storyId, phase, attempt);
  mkdirSync(join(repoRoot, ".test-console", "job-results", jobId), { recursive: true });
  const body = {
    jobId,
    storyId,
    phase,
    attempt,
    recordedAt: new Date().toISOString(),
    ...payload
  };
  writeFileSync(path, JSON.stringify(body, null, 2));
  return path;
}

/**
 * @param {string} repoRoot
 * @param {string} jobId
 * @param {string} storyId
 * @returns {object[]}
 */
export function loadStructuredJobResults(repoRoot, jobId, storyId) {
  const dir = join(repoRoot, ".test-console", "job-results", jobId);
  if (!existsSync(dir)) return [];
  const safeStory = storyId.replace(/[<>:"/\\|?*]/g, "-");
  const prefix = `${safeStory}-`;
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort()
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Hard gate: no fixer until investigator complete (cached lab-memory or fresh diagnosis).
 * @param {string} repoRoot
 * @param {string} storyId
 * @param {string} suiteId
 * @param {{ skipGate?: boolean }} [options]
 * @returns {{ allowed: boolean, reason: string }}
 */
export function investigatorGateAllowsFixer(repoRoot, storyId, suiteId, options = {}) {
  if (options.skipGate || process.env.FIX_ALL_SKIP_INVESTIGATOR_GATE === "1") {
    return { allowed: true, reason: "gate_skipped" };
  }
  if (isInvestigationComplete(repoRoot, storyId, suiteId)) {
    return { allowed: true, reason: "cached_investigation" };
  }
  return { allowed: false, reason: "investigator_required" };
}

export function workerModeInstructions(workerMode) {
  switch (workerMode) {
    case "investigate_first":
      return [
        "",
        "── Supervisor mode: INVESTIGATE FIRST ──",
        "This attempt: read compare PNG, artifact JSON, and scene JSON. Write a 3–5 line diagnosis.",
        "Implement the fix only if root cause is clear; otherwise stop after diagnosis (harness will retry)."
      ];
    case "narrow_scope":
      return [
        "",
        "── Supervisor mode: NARROW SCOPE ──",
        "Last attempt went the wrong direction. Change ONLY the files and layer the supervisor named.",
        "Do not refactor unrelated code."
      ];
    case "wrong_step":
      return [
        "",
        "── Supervisor mode: WRONG STEP ──",
        "Stop live/delivery work on this story until prior pipeline steps pass.",
        "If you edit code, target the earliest failing step only."
      ];
    case "tier_c_required":
      return [
        "",
        "── Supervisor mode: TIER C AFTER PASS ──",
        "Shared adapter was touched. After this story passes, run Tier C strict goldens before moving on."
      ];
    case "orchestrator_review":
      return [
        "",
        "── Supervisor mode: ORCHESTRATOR REVIEW ──",
        "Do not keep patching blindly. Summarize failed attempts, exact files changed, unchanged metrics, and the next concrete hypothesis.",
        "Update the investigation note / worker prompt with the corrected fix area before another fixer edits code."
      ];
    default:
      return [];
  }
}

const PARKED_STORIES_PATH = ".test-console/parked-stories.json";

export function parkedStoryKey(storyId, suiteId) {
  return `${storyId}|${suiteId}`;
}

export function loadParkedStories(repoRoot) {
  const path = join(repoRoot, PARKED_STORIES_PATH);
  if (!existsSync(path)) return { updatedAt: null, items: [] };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return { updatedAt: raw.updatedAt ?? null, items: raw.items ?? [] };
  } catch {
    return { updatedAt: null, items: [] };
  }
}

export function isStoryParked(repoRoot, storyId, suiteId) {
  const key = parkedStoryKey(storyId, suiteId);
  return loadParkedStories(repoRoot).items.some((i) => i.key === key);
}

export function parkExhaustedStory(repoRoot, storyId, suiteId, meta = {}) {
  const path = join(repoRoot, PARKED_STORIES_PATH);
  mkdirSync(join(repoRoot, ".test-console"), { recursive: true });
  const data = loadParkedStories(repoRoot);
  const key = parkedStoryKey(storyId, suiteId);
  const items = data.items.filter((i) => i.key !== key);
  items.push({
    key,
    storyId,
    suiteId,
    parkedAt: new Date().toISOString(),
    reason: meta.reason ?? "exhausted",
    metrics: meta.metrics ?? null
  });
  writeFileSync(path, JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 2));
}

export function clearParkedStory(repoRoot, storyId, suiteId) {
  const path = join(repoRoot, PARKED_STORIES_PATH);
  if (!existsSync(path)) return;
  const data = loadParkedStories(repoRoot);
  const key = parkedStoryKey(storyId, suiteId);
  const items = data.items.filter((i) => i.key !== key);
  writeFileSync(path, JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 2));
}

export function filterOutParkedStories(repoRoot, storyIds, suiteId) {
  return storyIds.filter((id) => !isStoryParked(repoRoot, id, suiteId));
}

/** Suites that edit shared code-v2.ts — must fix serially. */
export function suiteUsesSharedImporter(suiteId) {
  return (
    suiteId === "figmaLive" ||
    suiteId === "figma" ||
    suiteId === "delivery" ||
    suiteId === "vsFigmaLive" ||
    suiteId === "contractFigma" ||
    suiteId === "vsStorybook" ||
    suiteId === "vsReactHtml"
  );
}
