/**
 * Figma screen portfolio — Guing manifest entry-point track for the test console.
 *
 * Per-step results:
 *   figma-screen-diffs/by-screen/<screenId>/<stepId>/result.json
 * Step artifacts:
 *   figma-screen-diffs/<screenId>/contractFigma/reference.png | rendered.png | diff.png
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIGMA_ENTRY_STEPS,
  FIGMA_ENTRY_STEP_ORDER,
  canRunFigmaEntryStep,
  recommendFigmaEntryActionForRow
} from "./figma-entry-portfolio-config.mjs";
import { testReportViewUrls } from "./test-report-build.mjs";

export const FIGMA_SCREENS_DIR = "artifacts/figma-screens";
export const FIGMA_SCREEN_DIFFS_DIR = "figma-screen-diffs";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @deprecated use FIGMA_ENTRY_STEPS */
export const FIGMA_SCREEN_STEPS = FIGMA_ENTRY_STEPS;

export function safeScreenSegment(screenId) {
  return String(screenId)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function screenStepResultPath(repoRoot, screenId, stepId) {
  return join(
    repoRoot,
    FIGMA_SCREEN_DIFFS_DIR,
    "by-screen",
    safeScreenSegment(screenId),
    stepId,
    "result.json"
  );
}

/** Legacy single-file result (Contract → Figma before per-step dirs). */
export function legacyScreenResultPath(repoRoot, screenId) {
  return join(
    repoRoot,
    FIGMA_SCREEN_DIFFS_DIR,
    "by-screen",
    safeScreenSegment(screenId),
    "result.json"
  );
}

/** @param {string} repoRoot */
export function discoverFigmaScreens(repoRoot) {
  const screensDir = join(repoRoot, FIGMA_SCREENS_DIR);
  if (!existsSync(screensDir)) return [];

  const manifests = readdirSync(screensDir).filter(
    (f) => f.endsWith(".manifest.json") || f.endsWith("-manifest.json")
  );

  return manifests
    .map((f) => {
      const manifestPath = join(screensDir, f);
      const base = manifestPath
        .replace(/\.manifest\.json$/, "")
        .replace(/-manifest\.json$/, "");
      const screenId = basename(base);
      return {
        screenId,
        label: screenId,
        manifestPath,
        pngPath: `${base}.png`,
        contractPath: `${base}.contract.json`
      };
    })
    .sort((a, b) => a.screenId.localeCompare(b.screenId));
}

/** @param {string} repoRoot @param {string} screenId @param {string} stepId */
export function readScreenStepResult(repoRoot, screenId, stepId) {
  const path = screenStepResultPath(repoRoot, screenId, stepId);
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
  }
  if (stepId === "contractFigma") {
    const legacy = legacyScreenResultPath(repoRoot, screenId);
    if (existsSync(legacy)) {
      try {
        return JSON.parse(readFileSync(legacy, "utf8"));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** @deprecated use readScreenStepResult(repo, screenId, 'contractFigma') */
export function readScreenResult(repoRoot, screenId) {
  return readScreenStepResult(repoRoot, screenId, "contractFigma");
}

/** @param {string} repoRoot @param {string} screenId @param {string} stepId @param {object} result */
export function writeScreenStepResult(repoRoot, screenId, stepId, result) {
  const path = screenStepResultPath(repoRoot, screenId, stepId);
  mkdirSync(resolve(path, ".."), { recursive: true });
  const payload = {
    ...result,
    screenId,
    storyId: screenId,
    stepId,
    testedAt: result.testedAt ?? new Date().toISOString()
  };
  writeFileSync(path, JSON.stringify(payload, null, 2));
  return path;
}

/** @param {string} repoRoot @param {object} result */
export function writeScreenResult(repoRoot, result) {
  return writeScreenStepResult(repoRoot, result.screenId, "contractFigma", result);
}

function countLayers(node) {
  if (!node || typeof node !== "object") return 0;
  let n = 1;
  for (const child of node.children ?? []) {
    n += countLayers(child);
  }
  return n;
}

function attachTestReportUrls(rec) {
  if (!rec?.testReportPath) return {};
  return testReportViewUrls(REPO_ROOT, rec.testReportPath);
}

function buildManifestContractCell(rec, hasManifest) {
  if (!hasManifest) {
    return {
      status: "not_tested",
      canRun: false,
      blockedBy: "manifest",
      blockedReason: "Missing manifest JSON in artifacts/figma-screens/",
      action: "Add manifest from Guing plugin export"
    };
  }
  const status = rec?.status ?? "not_tested";
  return {
    status,
    percent: status !== "not_tested" ? rec?.percent : undefined,
    testedAt: status !== "not_tested" ? rec?.testedAt ?? null : null,
    canRun: true,
    blockedBy: null,
    blockedReason: null,
    action: recommendFigmaEntryActionForRow("manifestContract", status, {}, {
      percent: rec?.percent,
      error: rec?.error
    }),
    compareUrl:
      status !== "not_tested" && rec?.contractPath
        ? toRepoPath(rec.contractPath)
        : null,
    ...attachTestReportUrls(rec)
  };
}

function buildPixelStepCell(stepId, rec, gate, hasReferencePng, screenId, pngPath) {
  if (!gate.ok) {
    return {
      status: "not_tested",
      canRun: false,
      blockedBy: gate.blockedBy,
      blockedReason: gate.reason,
      action: gate.reason
    };
  }
  if (!hasReferencePng && stepId !== "logic") {
    return {
      status: "not_tested",
      canRun: false,
      blockedBy: "reference",
      blockedReason: `Missing reference PNG — add ${basename(pngPath)} beside manifest`,
      action: recommendFigmaEntryActionForRow(stepId, "not_tested", {})
    };
  }
  const status = rec?.status ?? "not_tested";
  const tested = status !== "not_tested";
  return {
    status,
    percent: tested ? rec?.percent : undefined,
    maxRegionPercent: tested ? rec?.maxRegionPercent : undefined,
    testedAt: tested ? rec?.testedAt ?? null : null,
    canRun: hasReferencePng || stepId === "logic",
    blockedBy: null,
    blockedReason: null,
    action: recommendFigmaEntryActionForRow(stepId, status, {}, {
      percent: rec?.percent,
      error: rec?.error
    }),
    compareUrl: tested && rec?.diffPng ? toRepoPath(rec.diffPng) : null,
    ...attachTestReportUrls(rec)
  };
}

function toRepoPath(absPath) {
  if (!absPath || typeof absPath !== "string") return null;
  const normalized = absPath.replace(/\\/g, "/");
  const repo = REPO_ROOT.replace(/\\/g, "/");
  if (normalized.startsWith(repo)) {
    return `/repo/${normalized.slice(repo.length).replace(/^\//, "")}`;
  }
  const idx = normalized.indexOf(FIGMA_SCREEN_DIFFS_DIR);
  if (idx >= 0) return `/repo/${normalized.slice(idx)}`;
  return null;
}

function buildStubCell(stepId, gate, message) {
  if (!gate.ok) {
    return {
      status: "not_tested",
      canRun: false,
      blockedBy: gate.blockedBy,
      blockedReason: gate.reason,
      action: gate.reason
    };
  }
  return {
    status: "not_tested",
    canRun: false,
    blockedBy: stepId,
    blockedReason: message,
    action: message
  };
}

/** @param {string} repoRoot */
export function mergeFigmaScreenReport(repoRoot) {
  const screens = discoverFigmaScreens(repoRoot);
  const results = screens.map(({ screenId }) => {
    const rec = readScreenStepResult(repoRoot, screenId, "contractFigma");
    if (rec) return rec;
    return {
      screenId,
      storyId: screenId,
      status: "not_tested",
      percent: 0
    };
  });

  const reportPath = join(repoRoot, FIGMA_SCREEN_DIFFS_DIR, "report.json");
  let generatedAt = new Date().toISOString();
  let tolerance = 0.5;
  if (existsSync(reportPath)) {
    try {
      const prev = JSON.parse(readFileSync(reportPath, "utf8"));
      if (prev.generatedAt) generatedAt = prev.generatedAt;
      if (prev.tolerance != null) tolerance = prev.tolerance;
    } catch {
      /* ok */
    }
  }

  const payload = {
    generatedAt,
    tolerance,
    suite: "figmaScreen",
    pipeline: "figmaEntry",
    results
  };
  mkdirSync(join(repoRoot, FIGMA_SCREEN_DIFFS_DIR), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(payload, null, 2));

  const portfolioPath = join(repoRoot, FIGMA_SCREEN_DIFFS_DIR, "portfolio.json");
  writeFileSync(
    portfolioPath,
    JSON.stringify(
      {
        generatedAt,
        storyCount: screens.length,
        source: "figma",
        steps: FIGMA_ENTRY_STEPS,
        stepIds: FIGMA_ENTRY_STEP_ORDER,
        screens: screens.map((s) => s.screenId)
      },
      null,
      2
    )
  );

  return payload;
}

/** @param {string} repoRoot */
export function buildFigmaScreenPortfolioState(repoRoot) {
  mergeFigmaScreenReport(repoRoot);
  const screens = discoverFigmaScreens(repoRoot);
  const portfolioPath = join(repoRoot, FIGMA_SCREEN_DIFFS_DIR, "portfolio.json");
  let generatedAt = null;
  if (existsSync(portfolioPath)) {
    try {
      generatedAt = JSON.parse(readFileSync(portfolioPath, "utf8")).generatedAt ?? null;
    } catch {
      /* ok */
    }
  }

  const rows = screens.map(({ screenId, manifestPath, pngPath, contractPath }) => {
    const hasManifest = existsSync(manifestPath);
    const hasReferencePng = existsSync(pngPath);

    const manifestRec = readScreenStepResult(repoRoot, screenId, "manifestContract");
    const figmaRec = readScreenStepResult(repoRoot, screenId, "contractFigma");
    const storybookRec = readScreenStepResult(repoRoot, screenId, "storybook");
    const fourWayRec = readScreenStepResult(repoRoot, screenId, "fourWay");
    const logicRec = readScreenStepResult(repoRoot, screenId, "logic");

    const cellsRaw = {
      manifestContract: buildManifestContractCell(manifestRec, hasManifest),
      contractFigma: null,
      storybook: null,
      fourWay: null,
      logic: null
    };

    const cellsForGate = { manifestContract: { status: cellsRaw.manifestContract.status } };

    const gateFigma = canRunFigmaEntryStep("contractFigma", cellsForGate);
    cellsRaw.contractFigma = buildPixelStepCell(
      "contractFigma",
      figmaRec,
      gateFigma,
      hasReferencePng,
      screenId,
      pngPath
    );
    cellsForGate.contractFigma = { status: cellsRaw.contractFigma.status };

    const gateStorybook = canRunFigmaEntryStep("storybook", cellsForGate);
    cellsRaw.storybook = buildPixelStepCell(
      "storybook",
      storybookRec,
      gateStorybook,
      hasReferencePng,
      screenId,
      pngPath
    );
    cellsForGate.storybook = { status: cellsRaw.storybook.status };

    const gateFourWay = canRunFigmaEntryStep("fourWay", cellsForGate);
    cellsRaw.fourWay = buildPixelStepCell(
      "fourWay",
      fourWayRec,
      gateFourWay,
      hasReferencePng,
      screenId,
      pngPath
    );
    if (fourWayRec?.reportHtml) {
      cellsRaw.fourWay.compareUrl = toRepoPath(fourWayRec.reportHtml);
    }
    cellsForGate.fourWay = { status: cellsRaw.fourWay.status };

    const gateLogic = canRunFigmaEntryStep("logic", cellsForGate);
    cellsRaw.logic = logicRec
      ? buildPixelStepCell("logic", logicRec, gateLogic, hasReferencePng, screenId, pngPath)
      : buildStubCell(
          "logic",
          gateLogic,
          "Coming soon — logic audit after 4-way pass"
        );

    if (cellsRaw.manifestContract.status === "not_tested" && hasManifest && manifestRec?.layerCount != null) {
      cellsRaw.manifestContract.percent = manifestRec.layerCount;
    }

    return { storyId: screenId, cells: cellsRaw };
  });

  return {
    generatedAt,
    storyCount: screens.length,
    source: "figma",
    itemLabel: "Screen",
    steps: FIGMA_ENTRY_STEPS,
    stepIds: FIGMA_ENTRY_STEP_ORDER,
    rows,
    htmlUrl: "/repo/figma-screen-diffs/report.html"
  };
}

export { countLayers };
