/**
 * Deterministic investigation brief for fixer agents — encodes HOW to triage
 * without reading code-v2.ts or contract.json in full.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildStructuredDiagnosis,
  formatStructuredDiagnosisForFixer,
} from "./fixer-pipeline-trace.mjs";

/** Per-screen hotspot overrides — encodes prior investigation + failed attempts. */
const SCREEN_HOTSPOT_OVERRIDES = {
  "screen_1:user-header": {
    antiPatterns: [
      "Do NOT stamp Hebrew TEXT as PNG raster — manifest TEXT must stay TEXT in Figma live.",
      "Do NOT force textAlignHorizontal LEFT in pinFigmaFlexCrossEndBareText measure phase for RTL bare text.",
      "Do NOT run pnpm build or verifyCommand — harness rebuilds + re-tests automatically.",
      "Do NOT Read test-report.json or code-v2.ts in full — use investigation brief snippets only.",
    ],
    editRouting: [
      {
        layer: "user-header band",
        name: "Hebrew label + email cluster",
        symbol: "pinFigmaFlexCrossEndBareText / createTextNode",
        check:
          "RTL Open Sans SemiBold TEXT: set textDirection before width measure; pin email to box right (align:end flex-column slot).",
      },
    ],
    priorProgress:
      "Hotspot user-header 3.78% — pinFigmaFlexCrossEndBareText textAlignHorizontal/reorder patches did NOT move metrics (5 attempts). Pivot: resolveFont Open Sans Hebrew SemiBold for RTL header TEXT; skip pin for direction:rtl bare labels.",
    rankedHypotheses: [
      "Open Sans Hebrew SemiBold not loaded — resolveFont falls back, Hebrew garbled + wrong measure width.",
      "Skip pinFigmaFlexCrossEndBareText for direction:rtl header labels — use createTextNode RIGHT + contract box only.",
      "Email align:end in flex-column: pin after font load, not during measure with LEFT.",
    ],
  },
  "screen_notification_avater:user-header": {
    antiPatterns: [
      "Do NOT stamp Hebrew TEXT as PNG raster (applyLiveHebrewTextRasters) — removed; manifest TEXT must stay TEXT.",
      "Do NOT add figmaReferenceAbsY in figmaReferenceRasterPosition — was raster-era hack.",
      "Do NOT change pinFigmaFlexCrossEndBareText to RIGHT/CENTER textAlignHorizontal — regressed.",
      "Do NOT run pnpm build or verifyCommand — harness rebuilds + re-tests automatically.",
      "Do NOT Read test-report.json — investigation brief in prompt is authoritative.",
    ],
    editRouting: [
      {
        layer: "fig-5",
        name: "Hebrew label (TEXT)",
        symbol: "createTextNode / figmaBareText",
        check:
          "Manifest TEXT Open Sans SemiBold RTL textAlignHorizontal RIGHT — load Open Sans Hebrew; skip pinFigmaFlexCrossEndBareText for direction:rtl bare text.",
      },
      {
        layer: "fig-6",
        name: "email align:right",
        symbol: "pinFigmaFlexCrossEndBareText",
        check: "text.x = layer.box.x + boxW - naturalW at ~892 — wrong px y=16.",
      },
      {
        layer: "fig-10",
        name: "avatar C",
        symbol: "applyFigmaNativeCenteredGlyphPin",
        check: "Call in figmaBareText path when isFigmaNativeEllipseSiblingLetter — ~2926.",
      },
    ],
    contractGrepIds: ["fig-5", "fig-6", "fig-10"],
    priorProgress:
      "Root cause fixed: Hebrew was wrongly PNG-rasterized in live test. Contract now has layer.text for fig-5. Importer must render RTL TEXT (Open Sans Hebrew).",
  },
};

/** Hotspot band name → importer signals + code symbols (general algorithms). */
const HOTSPOT_KNOWLEDGE = {
  "user-header": {
    lookFor:
      "Hebrew TEXT (RTL, Open Sans SemiBold) mis-render vs original; email right-cluster in flex-column align:end; avatar initial off-center over ellipse.",
    symbols: [
      "createTextNode",
      "pinFigmaFlexCrossEndBareText",
      "applyFigmaNativeCenteredGlyphPin",
      "reaffirmTreeBoxPositions",
    ],
    layerSignals: ["figmaNodeType:TEXT", "align:right", "direction:rtl"],
    hypotheses: [
      "Hebrew header is manifest TEXT (not raster): createTextNode + RTL direction + Open Sans Hebrew font family.",
      "Email in flex-column align:end full-width slot: pinFigmaFlexCrossEndBareText — natural width, pin to box right edge.",
      "Avatar letter over ELLIPSE: applyFigmaNativeCenteredGlyphPin — NONE box + CENTER/MIDDLE.",
    ],
  },
  "phone-row": {
    lookFor: "Flip frame clip or mirrored vector; phone icon scaleX=-1 with overflow hidden.",
    symbols: ["isFigmaFlipFrame", "shouldClipContent", "reaffirmChildBoxPositions"],
    layerSignals: ["figmaRelativeTransform", "scaleX"],
    hypotheses: ["Flip frame: disable clip on scaleX=-1 frames so mirrored vector paints."],
  },
  "pagination-footer": {
    lookFor: "Pagination chevrons/labels mispositioned; GROUP absolute coords vs flex row.",
    symbols: ["reaffirmChildBoxPositions", "rebaseGroupChildren", "createFrameNode"],
    layerSignals: ["GROUP", "chevron", "pagination"],
    hypotheses: [
      "GROUP children need rebase to parent flex row — check manifestContract GROUP absolute coords.",
      "Chevron vectors may need flip-frame clip disabled if scaleX=-1.",
    ],
  },
};

const CODE_V2 = "packages/figma-importer-plugin/src/code-v2.ts";
const SCENE_HTML = "packages/pixel-test/src/scene-to-html.ts";
const MAX_SNIPPET_LINES = 45;

/** @param {string[]} flags */
function layerSignalScore(flags = []) {
  let score = 0;
  for (const f of flags) {
    if (/raster|absX|absY|align:/.test(f)) score += 10;
    if (f === "TEXT") score += 3;
  }
  return score;
}

/**
 * Extract one function body by symbol name (build-time only — not agent Read).
 * @param {string} repoRoot
 * @param {string} relPath
 * @param {string} symbol
 */
function extractFunctionSnippet(repoRoot, relPath, symbol) {
  if (!repoRoot || !relPath || !existsSync(join(repoRoot, relPath))) return null;
  const lines = readFileSync(join(repoRoot, relPath), "utf8").split("\n");
  const fnRe = new RegExp(`^(async\\s+)?function\\s+${symbol}\\s*\\(`);
  const startIdx = lines.findIndex((l) => fnRe.test(l));
  if (startIdx < 0) return null;
  let depth = 0;
  let started = false;
  const out = [];
  for (let i = startIdx; i < lines.length && out.length < MAX_SNIPPET_LINES; i++) {
    const line = lines[i];
    out.push(`${i + 1}:${line}`);
    for (const ch of line) {
      if (ch === "{") {
        depth += 1;
        started = true;
      } else if (ch === "}") depth -= 1;
    }
    if (started && depth <= 0) break;
  }
  return { symbol, lineCount: out.length, text: out.join("\n") };
}

/**
 * @param {string} repoRoot
 * @param {string} relPath
 * @param {string} symbol
 */
function extractCallSiteSnippet(repoRoot, relPath, symbol) {
  if (!repoRoot || !relPath || !existsSync(join(repoRoot, relPath))) return null;
  const abs = join(repoRoot, relPath);
  const r = spawnSync("grep", ["-n", "-B", "2", "-A", "4", symbol, abs], {
    encoding: "utf8",
    maxBuffer: 32 * 1024,
  });
  if (r.status !== 0 || !r.stdout?.trim()) return null;
  const callLines = r.stdout
    .trim()
    .split("\n")
    .filter((l) => !/^function\s/.test(l.replace(/^\d+[-:]/, "")))
    .slice(0, 8);
  return { symbol: `${symbol} (call sites)`, lineCount: callLines.length, text: callLines.join("\n") };
}

/**
 * @param {string} repoRoot
 * @param {string} relPath
 * @param {string[]} symbols
 */
function extractCodeSnippets(repoRoot, relPath, symbols) {
  if (!repoRoot || !relPath) return [];
  const snippets = [];
  for (const sym of symbols.slice(0, 4)) {
    const fn = extractFunctionSnippet(repoRoot, relPath, sym);
    if (fn) snippets.push(fn);
    const call = extractCallSiteSnippet(repoRoot, relPath, sym);
    if (call) snippets.push(call);
  }
  return snippets;
}

/** Parse importer symbol names from agent investigator resolution text. */
export function parseSymbolsFromAgentResolution(agent) {
  if (!agent) return [];
  const blob = [agent.primaryEdit, agent.recommendedFixArea, agent.resolution]
    .filter(Boolean)
    .join(" ");
  const found = blob.match(/\b(?:pinFigma|reaffirm)[A-Za-z]+\b/g) ?? [];
  return [...new Set(found)];
}

/**
 * After agent investigator completes, inject pre-extracted snippets so fixer
 * never needs to Read code-v2.ts (watchdog kills that before first edit).
 * @param {object | null | undefined} brief
 * @param {string} repoRoot
 * @param {object | null | undefined} agent
 */
export function refreshBriefSnippetsFromAgent(brief, repoRoot, agent) {
  if (!brief || !repoRoot || agent?.status !== "complete") return brief;
  const symbols = parseSymbolsFromAgentResolution(agent);
  if (!symbols.length) return brief;
  const allowFile = brief.allowFile ?? "packages/figma-importer-plugin/src/code-v2.ts";
  const codeSnippets = extractCodeSnippets(repoRoot, allowFile, symbols);
  return {
    ...brief,
    codeSymbols: symbols,
    codeSnippets: codeSnippets.length ? codeSnippets : brief.codeSnippets,
  };
}

/**
 * @param {string} repoRoot
 * @param {string} relPath
 * @param {string} pattern
 */
function preRunGrep(repoRoot, relPath, pattern) {
  if (!repoRoot || !relPath || !existsSync(join(repoRoot, relPath))) return "";
  const abs = join(repoRoot, relPath);
  const r = spawnSync("grep", ["-n", pattern, abs], {
    encoding: "utf8",
    maxBuffer: 48 * 1024,
  });
  if (r.status !== 0 || !r.stdout?.trim()) return "";
  return r.stdout
    .trim()
    .split("\n")
    .slice(0, 16)
    .join("\n");
}

/** @param {{ x: number, y: number, width: number, height: number }} a @param {{ x: number, y: number, width: number, height: number }} b */
function rectsOverlap(a, b) {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  return a.x < bx2 && ax2 > b.x && a.y < by2 && ay2 > b.y;
}

/** @param {object} layer @param {object[]} acc */
function walkContractLayers(layer, acc) {
  if (!layer) return acc;
  acc.push(layer);
  for (const c of layer.children ?? []) walkContractLayers(c, acc);
  return acc;
}

/**
 * @param {string} contractPath
 * @param {{ x: number, y: number, width: number, height: number }} bbox
 */
function contractLayersInBbox(contractPath, bbox) {
  if (!contractPath || !existsSync(contractPath)) return [];
  try {
    const root = JSON.parse(readFileSync(contractPath, "utf8")).root;
    const all = walkContractLayers(root, []);
    return all
      .filter((l) => l.box && rectsOverlap(l.box, bbox))
      .slice(0, 8)
      .map((l) => {
        const ds = l.source?.dataset ?? {};
        const flags = [
          ds.figmaReferenceRaster ? `raster:${ds.figmaReferenceRaster}` : null,
          ds.figmaReferenceAbsX != null ? `absX=${ds.figmaReferenceAbsX}` : null,
          ds.figmaReferenceAbsY != null ? `absY=${ds.figmaReferenceAbsY}` : null,
          ds.figmaNodeType ? ds.figmaNodeType : null,
        ].filter(Boolean);
        const textAlign = l.text?.align ? `align:${l.text.align}` : null;
        return {
          id: l.id,
          name: l.name,
          box: l.box,
          flags: [...flags, textAlign].filter(Boolean),
        };
      });
  } catch {
    return [];
  }
}

/**
 * @param {object} opts
 * @returns {object | null}
 */
export function buildInvestigationBrief(opts) {
  const {
    repoRoot,
    itemId,
    testId,
    contractPath,
    manifestPath,
    failedTest,
    primaryMismatch,
    global = {},
  } = opts;

  if (!primaryMismatch || !failedTest) return null;

  const hotspotName =
    primaryMismatch.evidence?.message?.replace(/^Hotspot band:\s*/i, "") ??
    primaryMismatch.evidence?.message?.replace(/^Hotspot:\s*/i, "") ??
    "hotspot";

  const knowledge = HOTSPOT_KNOWLEDGE[hotspotName] ?? null;
  const screenOverride =
    SCREEN_HOTSPOT_OVERRIDES[`${itemId}:${hotspotName}`] ?? null;
  const bbox = primaryMismatch.bbox ?? { x: 0, y: 0, width: 0, height: 0 };
  const contractLayers = contractLayersInBbox(contractPath, bbox)
    .sort((a, b) => layerSignalScore(b.flags) - layerSignalScore(a.flags))
    .slice(0, 8);

  const primaryFixer = failedTest.primaryFixer ?? "contract-to-figma";
  const isUpstream =
    primaryFixer === "manifest-to-contract" || primaryFixer === "pipeline-enrichment";

  const allowFile = isUpstream
    ? primaryFixer === "pipeline-enrichment"
      ? "scripts/figma-screen-test.mjs"
      : "scripts/figma-manifest-to-contract.mjs"
    : primaryFixer === "contract-to-figma"
      ? CODE_V2
      : failedTest.allowlist?.[0] ?? CODE_V2;

  const contractRel =
    contractPath && repoRoot
      ? relative(repoRoot, contractPath).replace(/\\/g, "/")
      : contractPath;

  const signalLayerIds =
    screenOverride?.contractGrepIds ??
    contractLayers
      .filter((l) => layerSignalScore(l.flags) > 0)
      .map((l) => l.id)
      .slice(0, 4);
  const grepLines = [
    `grep -n '${(knowledge?.symbols ?? ["pinFigma", "figmaReference"]).join("\\|")}' ${allowFile}`,
  ];
  if (contractRel && signalLayerIds.length) {
    grepLines.push(`grep -n '${signalLayerIds.join("\\|")}' ${contractRel}`);
  }
  const manifestRel =
    manifestPath && repoRoot
      ? relative(repoRoot, manifestPath).replace(/\\/g, "/")
      : null;
  if (manifestRel && signalLayerIds.length) {
    grepLines.push(`grep -n '"type": "TEXT"' ${manifestRel} | head -20`);
  }

  const microFix = global.percent != null && global.percent < 2;

  const codeSnippets = repoRoot
    ? extractCodeSnippets(repoRoot, allowFile, knowledge?.symbols ?? ["reaffirmChildBoxPositions"])
    : [];

  const contractGrepOutput =
    repoRoot && contractRel && signalLayerIds.length
      ? preRunGrep(repoRoot, contractRel, signalLayerIds.join("\\|"))
      : "";

  const method = isUpstream
    ? [
        "0. TRACE BACK: Read pipelineTrace in prompt — manifest TEXT must match contract layer.text (no PNG raster).",
        "1. VISUAL (≤1 min): Compare crop — note which element differs.",
        "2. MANIFEST vs CONTRACT (≤2 min): Run grep lines below on manifest + contract — find kind mismatch.",
        "3. EDIT (≤2 min): ONE change in allowlisted pipeline script — NOT code-v2 until kinds match.",
        "4. STOP: Harness re-tests manifest + live — do NOT run verifyCommand yourself.",
      ]
    : [
        "0. TRACE BACK: If contract layer has figmaReferenceRaster but manifest says TEXT → stop; fix pipeline first.",
        "1. VISUAL (≤1 min): Open compareSideBySide crop ONLY — identify which element differs.",
        "2. MANIFEST grep (≤1 min): Confirm node type for hotspot layers — TEXT stays TEXT.",
        "3. CODE (≤1 min): Use pre-extracted snippets below — NEVER Read code-v2.ts in full.",
        "4. EDIT (≤2 min): ONE change in the named symbol/function.",
        "5. STOP: Harness rebuilds plugin + re-tests.",
      ];

  return {
    schemaVersion: "1.0",
    method,
    forbiddenReads: [
      "packages/figma-importer-plugin/src/code-v2.ts (full file Read)",
      "artifacts/**/*.contract.json (full file Read)",
      ".agents/skills/**",
      "lab-memory/**",
      "scripts/test-console-*",
      "scripts/figma-screen-test.mjs",
    ],
    hotspot: hotspotName,
    lookFor: knowledge?.lookFor ?? "Compare crop vs original — note geometry vs color vs missing pixels.",
    contractLayers,
    rankedHypotheses: knowledge?.hypotheses ?? [
      "Layout pin/position in allowlisted adapter for nodes in hotspot bbox.",
      "Text auto-resize / alignment mismatch vs contract box.",
    ],
    grepCommands: grepLines,
    contractGrepOutput,
    codeSymbols: knowledge?.symbols ?? ["reaffirmChildBoxPositions"],
    codeSnippets,
    editRouting: screenOverride?.editRouting ?? [],
    antiPatterns: screenOverride?.antiPatterns ?? [],
    allowFile,
    compareCrop: primaryMismatch.images?.compareSideBySide ?? null,
    priorProgress: screenOverride?.priorProgress ?? null,
    microFix: microFix
      ? `Global ${global.percent?.toFixed(3)}% — one surgical pin/fill fix; do not refactor.`
      : null,
  };
}

/**
 * @param {object | null} brief
 * @returns {string}
 */
export function formatInvestigationBriefForFixer(brief) {
  if (!brief) return "";
  const lines = [
    "── Investigation brief (AUTHORITATIVE — follow method, skip skills) ──",
    "",
    "Method:",
    ...brief.method.map((s) => `  ${s}`),
    "",
    `Hotspot: ${brief.hotspot}`,
    `Look for: ${brief.lookFor}`,
  ];
  if (brief.microFix) lines.push(`Micro-fix: ${brief.microFix}`);
  if (brief.priorProgress) lines.push(`Prior progress: ${brief.priorProgress}`);
  if (brief.compareCrop) lines.push(`Compare crop: ${brief.compareCrop}`);
  if (brief.contractLayers?.length) {
    lines.push("", "Contract layers in hotspot (signal layers first):");
    for (const l of brief.contractLayers) {
      const box = l.box;
      lines.push(
        `  · ${l.id} "${l.name}" @ (${box.x},${box.y}) ${box.width}×${box.height}` +
          (l.flags?.length ? ` — ${l.flags.join(", ")}` : "")
      );
    }
  }
  if (brief.contractGrepOutput) {
    lines.push("", "Pre-run contract grep (do NOT Read contract.json):", brief.contractGrepOutput);
  }
  if (brief.editRouting?.length) {
    lines.push("", "Edit routing (layer → symbol → check):");
    for (const r of brief.editRouting) {
      lines.push(`  · ${r.layer} ${r.name}: ${r.symbol} — ${r.check}`);
    }
  }
  if (brief.antiPatterns?.length) {
    lines.push("", "Anti-patterns (prior attempts regressed — do NOT repeat):");
    for (const a of brief.antiPatterns) lines.push(`  · ${a}`);
  }
  lines.push("", "Ranked hypotheses:");
  for (const h of brief.rankedHypotheses ?? []) lines.push(`  · ${h}`);
  lines.push("", "Grep commands (run these — do NOT Read whole files):");
  for (const g of brief.grepCommands ?? []) lines.push(`  ${g}`);
  if (brief.codeSnippets?.length) {
    lines.push(
      "",
      "Pre-extracted code snippets (AUTHORITATIVE — do NOT Read code-v2.ts; edit using line numbers here):"
    );
    for (const s of brief.codeSnippets) {
      lines.push("", `--- ${s.symbol} (${s.lineCount} grep lines) ---`, s.text);
    }
  }
  lines.push("", `Allowlisted edit file: ${brief.allowFile}`);
  lines.push(`Code symbols: ${(brief.codeSymbols ?? []).join(", ")}`);
  lines.push("", "Forbidden reads:", ...brief.forbiddenReads.map((f) => `  · ${f}`));
  return lines.join("\n");
}

/**
 * @param {object} report
 * @param {object} ctx
 * @param {string} [repoRoot]
 */
export function enrichReportWithInvestigationBrief(report, ctx, repoRoot) {
  const primary = report.mismatches?.[0];
  if (!primary) return report;
  const brief = buildInvestigationBrief({
    repoRoot,
    itemId: report.itemId,
    testId: report.failedTest?.testId,
    contractPath: ctx.contractPath,
    manifestPath: ctx.manifestPath,
    failedTest: report.failedTest,
    primaryMismatch: primary,
    global: report.global,
  });
  if (!brief) return report;

  const structuredDiagnosis = buildStructuredDiagnosis({
    trace: report.pipelineTrace ?? null,
    report,
    brief,
  });
  const diagnosisText = formatStructuredDiagnosisForFixer(structuredDiagnosis);
  const briefText = formatInvestigationBriefForFixer({
    ...brief,
    editRouting:
      structuredDiagnosis.editRouting?.length > 0
        ? structuredDiagnosis.editRouting
        : brief.editRouting,
  });
  const investigationText = [diagnosisText, report.pipelineText, report.investigationText, briefText]
    .filter(Boolean)
    .join("\n\n");
  return {
    ...report,
    investigationBrief: brief,
    structuredDiagnosis,
    investigationText,
  };
}
