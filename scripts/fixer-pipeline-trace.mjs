/**
 * Pipeline root-cause trace — manifest → contract → live import.
 * Lets fixers "trace back" when contract kind ≠ manifest kind or post-adapter mutation occurred.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import {
  manifestToContract,
  validateContractNodeKindFidelity,
  referencePngPathFor,
} from "./figma-manifest-to-contract.mjs";
import { FIXER_ALLOWLIST } from "./fixer-routing.mjs";

export const VS_FIGMA_LIVE_PIPELINE = [
  {
    id: "manifest",
    label: "Figma manifest export",
    artifact: "artifacts/figma-screens/<screen>.manifest.json",
    role: "Ground truth — node.type (TEXT, VECTOR, ELLIPSE, …). Images only via IMAGE fills / imageHash.",
  },
  {
    id: "manifestToContract",
    label: "manifestToContract adapter",
    script: "scripts/figma-manifest-to-contract.mjs",
    role: "Must preserve manifest node kinds — TEXT stays layer.text, no PNG stamping.",
  },
  {
    id: "contractOnDisk",
    label: "Contract on disk",
    artifact: "artifacts/figma-screens/<screen>.contract.json",
    role: "Must match adapter output. If kinds differ from manifest → fix adapter or remove post-adapter mutator.",
  },
  {
    id: "liveTestHarness",
    label: "Live test harness",
    script: "scripts/figma-screen-test.mjs",
    role: "Runs adapter + sends contract to Figma. Must NOT call applyLiveHebrewTextRasters / applyStorybookReferenceRasters on vsFigmaLive.",
  },
  {
    id: "contractToFigma",
    label: "Figma live importer",
    script: "packages/figma-importer-plugin/src/code-v2.ts",
    role: "Renders contract as Figma nodes — only when contract kinds are correct.",
  },
  {
    id: "compare",
    label: "Pixel compare",
    role: "original PNG vs figmaLive PNG",
  },
];

const PIPELINE_ENRICHMENT_FIXER = "pipeline-enrichment";

/** @param {object} layer @param {object[]} acc */
function walkContractLayers(layer, acc) {
  if (!layer) return acc;
  acc.push(layer);
  for (const c of layer.children ?? []) walkContractLayers(c, acc);
  return acc;
}

/** @param {object} a @param {object} b */
function rectsOverlap(a, b) {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  return a.x < bx2 && ax2 > b.x && a.y < by2 && ay2 > b.y;
}

/** @param {object} node @param {Record<string, object>} acc */
function indexManifestById(node, acc = {}) {
  if (node?.id != null) acc[String(node.id)] = node;
  for (const c of node.children ?? []) indexManifestById(c, acc);
  return acc;
}

function normalizeManifestRoot(raw) {
  if (raw?.schemaVersion === "figma-manifest-1.0" && raw.root) return raw.root;
  if (raw?.type && raw.id != null) return raw;
  return null;
}

/**
 * Per-layer manifest vs contract kind audit (hotspot bbox optional).
 * @param {string} manifestPath
 * @param {string} contractPath
 * @param {{ x: number, y: number, width: number, height: number } | null} [hotspotBbox]
 */
export function auditManifestContractKinds(manifestPath, contractPath, hotspotBbox = null) {
  if (!manifestPath || !contractPath || !existsSync(manifestPath) || !existsSync(contractPath)) {
    return { kindMismatches: [], manifestVsDisk: [], adapterVsDisk: [] };
  }

  const manifestRaw = JSON.parse(readFileSync(manifestPath, "utf8"));
  const manifestRoot = normalizeManifestRoot(manifestRaw);
  const contractDoc = JSON.parse(readFileSync(contractPath, "utf8"));
  if (!manifestRoot || !contractDoc?.root) {
    return { kindMismatches: [], manifestVsDisk: [], adapterVsDisk: [] };
  }

  const byId = indexManifestById(manifestRoot);
  const allLayers = walkContractLayers(contractDoc.root, []);
  const inHotspot = hotspotBbox
    ? allLayers.filter((l) => l.box && rectsOverlap(l.box, hotspotBbox))
    : allLayers;

  /** @type {object[]} */
  const kindMismatches = [];

  for (const layer of inHotspot) {
    const figmaId = layer.source?.id;
    if (!figmaId) continue;
    const manifestNode = byId[String(figmaId)];
    if (!manifestNode) continue;

    const nodeType = manifestNode.type;
    const ds = layer.source?.dataset ?? {};
    const name = manifestNode.name ?? layer.name ?? figmaId;

    if (nodeType === "TEXT") {
      const issues = [];
      if (!layer.text) issues.push("contract missing layer.text");
      if (layer.image?.dataUrl) issues.push("contract has layer.image PNG");
      if (ds.figmaReferenceRaster)
        issues.push(`figmaReferenceRaster:${ds.figmaReferenceRaster} on manifest TEXT`);
      if (issues.length) {
        kindMismatches.push({
          layerId: layer.id,
          figmaId,
          name,
          manifestType: "TEXT",
          manifestSnippet: (manifestNode.characters ?? "").slice(0, 40),
          contractSignals: issues,
          severity: "blocker",
          recommendedStep: "manifestToContract or liveTestHarness",
        });
      }
    }

    if (
      ["VECTOR", "STAR", "POLYGON", "LINE", "BOOLEAN_OPERATION"].includes(nodeType) &&
      !layer.vector &&
      !layer.image?.dataUrl
    ) {
      kindMismatches.push({
        layerId: layer.id,
        figmaId,
        name,
        manifestType: nodeType,
        contractSignals: ["missing layer.vector"],
        severity: "blocker",
        recommendedStep: "manifestToContract",
      });
    }
  }

  const manifestVsDisk = validateContractNodeKindFidelity(manifestRoot, contractDoc.root).map(
    (msg) => ({ source: "manifest-vs-disk", message: msg })
  );

  let adapterVsDisk = [];
  try {
    let refBuf;
    const refPath = referencePngPathFor(manifestPath);
    if (existsSync(refPath)) refBuf = readFileSync(refPath);
    const clean = manifestToContract(manifestRaw, { referencePngBuffer: refBuf });
    adapterVsDisk = diffContractKinds(clean.root, contractDoc.root, inHotspot);
  } catch {
    /* optional */
  }

  return { kindMismatches, manifestVsDisk, adapterVsDisk };
}

/**
 * Compare clean adapter output vs on-disk contract (detects post-adapter PNG stamping, etc.).
 * @param {object} cleanRoot
 * @param {object} diskRoot
 * @param {object[]} [scopeLayers]
 */
function diffContractKinds(cleanRoot, diskRoot, scopeLayers) {
  const cleanById = new Map();
  for (const l of walkContractLayers(cleanRoot, [])) {
    if (l.source?.id) cleanById.set(String(l.source.id), l);
  }
  const diskLayers = scopeLayers?.length
    ? scopeLayers
    : walkContractLayers(diskRoot, []);

  /** @type {object[]} */
  const out = [];
  for (const disk of diskLayers) {
    const figmaId = disk.source?.id;
    if (!figmaId) continue;
    const clean = cleanById.get(String(figmaId));
    if (!clean) continue;

    const cleanText = Boolean(clean.text);
    const diskText = Boolean(disk.text);
    const cleanImage = Boolean(clean.image?.dataUrl);
    const diskImage = Boolean(disk.image?.dataUrl);
    const diskRaster = disk.source?.dataset?.figmaReferenceRaster;

    if (cleanText && !diskText && diskImage) {
      out.push({
        source: "adapter-vs-disk",
        layerId: disk.id,
        figmaId,
        name: disk.name,
        message: `Adapter produced TEXT; on-disk contract has IMAGE raster${diskRaster ? ` (${diskRaster})` : ""} — post-adapter mutator (e.g. applyLiveHebrewTextRasters in figma-screen-test.mjs)`,
        recommendedStep: "liveTestHarness",
      });
    } else if (!cleanText && diskText && cleanImage) {
      out.push({
        source: "adapter-vs-disk",
        layerId: disk.id,
        figmaId,
        name: disk.name,
        message: "Adapter produced IMAGE; on-disk contract has TEXT — stale or hand-edited contract",
        recommendedStep: "manifestToContract",
      });
    }
  }
  return out;
}

/**
 * Build pipeline trace + effective fixer routing for test-report / investigation brief.
 * @param {object} opts
 */
export function buildPipelineTrace(opts) {
  const {
    repoRoot,
    itemId,
    testId,
    manifestPath,
    contractPath,
    primaryMismatch,
    failedTest,
  } = opts;

  const bbox = primaryMismatch?.bbox ?? null;
  const audit =
    manifestPath && contractPath
      ? auditManifestContractKinds(manifestPath, contractPath, bbox)
      : { kindMismatches: [], manifestVsDisk: [], adapterVsDisk: [] };

  const pipeline =
    testId === "vsFigmaLive" || testId === "figmaLive"
      ? VS_FIGMA_LIVE_PIPELINE.map((s) => ({
          ...s,
          artifact: s.artifact?.replace("<screen>", itemId ?? "<screen>"),
        }))
      : [];

  const hasBlocker =
    audit.kindMismatches.length > 0 ||
    audit.manifestVsDisk.length > 0 ||
    audit.adapterVsDisk.length > 0;

  const upstreamStep =
    audit.adapterVsDisk[0]?.recommendedStep ??
    audit.kindMismatches[0]?.recommendedStep ??
    "manifestToContract";

  /** @type {object | null} */
  let effectiveFixer = null;
  if (hasBlocker && failedTest) {
    const usePipelineEnrichment =
      upstreamStep === "liveTestHarness" || audit.adapterVsDisk.length > 0;
    effectiveFixer = {
      primaryFixer: usePipelineEnrichment
        ? PIPELINE_ENRICHMENT_FIXER
        : "manifest-to-contract",
      reason: usePipelineEnrichment
        ? "Contract on disk ≠ clean adapter output — fix live test harness / post-adapter mutator before code-v2."
        : "Manifest node kind ≠ contract — fix manifest→contract adapter first.",
      allowlist: usePipelineEnrichment
        ? FIXER_ALLOWLIST[PIPELINE_ENRICHMENT_FIXER].allow
        : FIXER_ALLOWLIST["manifest-to-contract"].allow,
      forbidden: usePipelineEnrichment
        ? [
            ...FIXER_ALLOWLIST[PIPELINE_ENRICHMENT_FIXER].forbidden,
            "packages/figma-importer-plugin/src/code-v2.ts (wrong step — fix pipeline first)",
          ]
        : FIXER_ALLOWLIST["manifest-to-contract"].forbidden,
      fixerChain: usePipelineEnrichment
        ? ["manifest-to-contract", PIPELINE_ENRICHMENT_FIXER, "contract-to-figma"]
        : ["manifest-to-contract", "contract-to-figma"],
      traceBackRequired: true,
      upstreamStep,
    };
  }

  const traceBackMethod = [
    "0. TRACE BACK (mandatory when pipelineTrace shows kind mismatch):",
    "   a. Grep manifest TEXT nodes in hotspot: grep -n '\"type\": \"TEXT\"' <manifest>",
    "   b. Grep same figma ids in contract: grep -n '<figma-id>' <contract>",
    "   c. If manifest TEXT but contract has layer.image / figmaReferenceRaster → fix pipeline step (NOT code-v2).",
    "   d. Re-run manifest test, then live test — only then tune importer.",
  ];

  return {
    schemaVersion: "1.0",
    pipeline,
    audit,
    hasBlocker,
    effectiveFixer,
    traceBackMethod,
    manifestRel:
      manifestPath && repoRoot ? relative(repoRoot, manifestPath).replace(/\\/g, "/") : manifestPath,
    contractRel:
      contractPath && repoRoot ? relative(repoRoot, contractPath).replace(/\\/g, "/") : contractPath,
  };
}

/**
 * @param {object | null} trace
 * @returns {string}
 */
export function formatPipelineTraceForFixer(trace) {
  if (!trace) return "";
  const lines = [
    "── Pipeline trace (trace back to root — do NOT skip) ──",
    "",
    "Pipeline steps (vsFigmaLive):",
  ];
  for (const s of trace.pipeline ?? []) {
    lines.push(`  · ${s.label}: ${s.role}`);
    if (s.script) lines.push(`    script: ${s.script}`);
    if (s.artifact) lines.push(`    artifact: ${s.artifact}`);
  }
  lines.push("", ...trace.traceBackMethod);

  if (trace.audit?.kindMismatches?.length) {
    lines.push("", "Kind mismatches (manifest TEXT/VECTOR vs contract — BLOCKER):");
    for (const m of trace.audit.kindMismatches) {
      lines.push(
        `  · ${m.layerId} "${m.name}" manifest=${m.manifestType}` +
          (m.manifestSnippet ? ` "${m.manifestSnippet}"` : "") +
          ` → ${m.contractSignals.join("; ")}` +
          ` [fix: ${m.recommendedStep}]`
      );
    }
  }
  if (trace.audit?.adapterVsDisk?.length) {
    lines.push("", "Post-adapter mutations (clean manifestToContract ≠ contract on disk):");
    for (const m of trace.audit.adapterVsDisk) {
      lines.push(`  · ${m.layerId} "${m.name}": ${m.message} [fix: ${m.recommendedStep}]`);
    }
  }
  if (trace.audit?.manifestVsDisk?.length) {
    lines.push("", "Manifest vs disk validation:");
    for (const m of trace.audit.manifestVsDisk) {
      lines.push(`  · ${m.message}`);
    }
  }

  if (trace.effectiveFixer) {
    const ef = trace.effectiveFixer;
    lines.push(
      "",
      "── Effective fixer (upstream — overrides default contract-to-figma) ──",
      `Reason: ${ef.reason}`,
      `Primary fixer: ${ef.primaryFixer}`,
      `Chain: ${ef.fixerChain.join(" → ")}`,
      "Allowlisted edits:",
      ...ef.allowlist.map((p) => `  · ${p}`),
      "Do NOT edit code-v2.ts until pipeline kinds match manifest."
    );
  }

  if (trace.manifestRel && trace.contractRel) {
    lines.push(
      "",
      "Grep manifest vs contract (hotspot layers):",
      `  grep -n '"type": "TEXT"' ${trace.manifestRel}`,
      `  grep -n 'figmaReferenceRaster\\|"type": "TEXT"' ${trace.contractRel}`
    );
  }

  return lines.join("\n");
}

/**
 * Machine-readable diagnosis — what chat agents were inferring manually.
 * Consumed by investigator prompt, fixer brief, and supervisor.
 * @param {object} opts
 */
export function buildStructuredDiagnosis(opts) {
  const { trace, report, brief } = opts;
  const testId = report?.failedTest?.testId ?? "";
  const isLive = testId === "vsFigmaLive" || testId === "figmaLive";
  const pipelineKindOk = !trace?.hasBlocker;
  /** @type {string[]} */
  const conclusions = [];
  /** @type {object[]} */
  const hotspotLayers = [];

  /** @type {string} */
  let rootCauseLayer = "unknown";

  if (trace?.hasBlocker) {
    const upstream =
      trace.effectiveFixer?.upstreamStep ??
      trace.audit?.kindMismatches?.[0]?.recommendedStep ??
      "manifestToContract";
    rootCauseLayer =
      upstream === "liveTestHarness" || trace.audit?.adapterVsDisk?.length
        ? "pipeline-enrichment"
        : "manifest-to-contract";

    for (const m of trace.audit?.kindMismatches ?? []) {
      conclusions.push(
        `BLOCKER: manifest ${m.manifestType} "${m.name}" (${m.layerId}) → ${m.contractSignals.join("; ")} — fix ${m.recommendedStep}, NOT code-v2.`
      );
      hotspotLayers.push({
        layerId: m.layerId,
        name: m.name,
        manifestType: m.manifestType,
        contractKind: "raster/missing-text",
        recommendedSymbol: null,
        fixStep: m.recommendedStep,
      });
    }
    for (const m of trace.audit?.adapterVsDisk ?? []) {
      conclusions.push(`BLOCKER: post-adapter mutation on ${m.layerId} — ${m.message}`);
      if (!hotspotLayers.some((h) => h.layerId === m.layerId)) {
        hotspotLayers.push({
          layerId: m.layerId,
          name: m.name,
          manifestType: "TEXT",
          contractKind: "IMAGE on disk",
          recommendedSymbol: null,
          fixStep: m.recommendedStep ?? "liveTestHarness",
        });
      }
    }
    for (const m of trace.audit?.manifestVsDisk ?? []) {
      conclusions.push(`BLOCKER: ${m.message}`);
    }
  } else if (isLive) {
    rootCauseLayer = "contract-to-figma";
    conclusions.push(
      "Pipeline kind fidelity OK — manifest TEXT nodes have layer.text in contract (no figmaReferenceRaster)."
    );
    conclusions.push(
      "Remaining pixel diff is importer rendering (RTL TEXT, font load, geometry pin) — edit code-v2.ts symbols in editRouting only."
    );

    const staticRouting = brief?.editRouting ?? [];
    for (const r of staticRouting) {
      hotspotLayers.push({
        layerId: r.layer,
        name: r.name,
        manifestType: "TEXT",
        contractKind: "layer.text",
        recommendedSymbol: r.symbol,
        fixStep: "contractToFigma",
        check: r.check,
      });
    }
    for (const l of brief?.contractLayers ?? []) {
      if (hotspotLayers.some((h) => h.layerId === l.id)) continue;
      const hasTextSignal =
        l.flags?.some((f) => /TEXT|align:|rtl/i.test(f)) ||
        /label|email|avatar|text/i.test(l.name ?? "");
      if (!hasTextSignal) continue;
      hotspotLayers.push({
        layerId: l.id,
        name: l.name,
        manifestType: "TEXT",
        contractKind: l.flags?.includes("raster:text") ? "IMAGE (wrong)" : "layer.text",
        recommendedSymbol: "createTextNode / reaffirmTreeBoxPositions",
        fixStep: "contractToFigma",
      });
    }
  } else if (testId === "manifestContract") {
    rootCauseLayer = "manifest-to-contract";
    conclusions.push("Manifest → contract adapter failed kind fidelity or schema validation.");
  }

  const mandatoryFixSurface =
    trace?.effectiveFixer?.primaryFixer ?? report?.failedTest?.primaryFixer ?? "contract-to-figma";

  const investigatorRequired =
    Boolean(trace?.hasBlocker) ||
    isLive ||
    testId === "manifestContract";

  const editRouting =
    brief?.editRouting?.length > 0
      ? brief.editRouting
      : hotspotLayers
          .filter((h) => h.recommendedSymbol && h.fixStep === "contractToFigma")
          .map((h) => ({
            layer: h.layerId,
            name: h.name ?? h.layerId,
            symbol: h.recommendedSymbol,
            check: h.check ?? `Fix ${h.layerId} in allowlisted importer symbol.`,
          }));

  return {
    schemaVersion: "1.0",
    pipelineKindOk,
    rootCauseLayer,
    mandatoryFixSurface,
    conclusions,
    hotspotLayers,
    editRouting,
    investigatorRequired,
    forbidCodeV2UntilPipelineOk: Boolean(trace?.hasBlocker),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * @param {object | null} diagnosis
 * @returns {string}
 */
export function formatStructuredDiagnosisForFixer(diagnosis) {
  if (!diagnosis) return "";
  const lines = [
    "── Structured diagnosis (from Test — AUTHORITATIVE root-cause layer) ──",
    "",
    `Root cause layer: ${diagnosis.rootCauseLayer}`,
    `Pipeline kinds OK: ${diagnosis.pipelineKindOk ? "yes" : "NO — fix pipeline before importer"}`,
    `Mandatory fix surface: ${diagnosis.mandatoryFixSurface}`,
  ];
  if (diagnosis.forbidCodeV2UntilPipelineOk) {
    lines.push("FORBIDDEN: packages/figma-importer-plugin/src/code-v2.ts until pipeline kinds match manifest.");
  }
  if (diagnosis.conclusions?.length) {
    lines.push("", "Conclusions:");
    for (const c of diagnosis.conclusions) lines.push(`  · ${c}`);
  }
  if (diagnosis.editRouting?.length) {
    lines.push("", "Edit routing (from diagnosis):");
    for (const r of diagnosis.editRouting) {
      lines.push(`  · ${r.layer} ${r.name}: ${r.symbol} — ${r.check}`);
    }
  }
  if (diagnosis.hotspotLayers?.length) {
    lines.push("", "Hotspot layers:");
    for (const h of diagnosis.hotspotLayers) {
      lines.push(
        `  · ${h.layerId} manifest=${h.manifestType} contract=${h.contractKind}` +
          (h.recommendedSymbol ? ` → ${h.recommendedSymbol}` : ` [fix ${h.fixStep}]`)
      );
    }
  }
  return lines.join("\n");
}

/**
 * Apply pipeline trace to test report — sets effectiveFixer on failedTest when needed.
 * @param {object} report
 * @param {object} ctx
 * @param {string} [repoRoot]
 */
export function enrichReportWithPipelineTrace(report, ctx, repoRoot) {
  const primary = report.mismatches?.[0];
  if (!primary || !report.failedTest) return report;

  const trace = buildPipelineTrace({
    repoRoot: repoRoot ?? ctx.repoRoot,
    itemId: report.itemId,
    testId: report.failedTest.testId,
    manifestPath: ctx.manifestPath,
    contractPath: ctx.contractPath,
    primaryMismatch: primary,
    failedTest: report.failedTest,
  });

  const pipelineText = formatPipelineTraceForFixer(trace);
  const briefOnlyText = report.investigationText ?? "";

  let failedTest = report.failedTest;
  if (trace.effectiveFixer) {
    failedTest = {
      ...report.failedTest,
      defaultPrimaryFixer: report.failedTest.primaryFixer,
      defaultAllowlist: report.failedTest.allowlist,
      primaryFixer: trace.effectiveFixer.primaryFixer,
      allowlist: trace.effectiveFixer.allowlist,
      forbidden: [
        ...(report.failedTest.forbidden ?? []),
        ...trace.effectiveFixer.forbidden.filter(
          (f) => !(report.failedTest.forbidden ?? []).includes(f)
        ),
      ],
      fixerChain: trace.effectiveFixer.fixerChain,
    };
  }

  return {
    ...report,
    failedTest,
    pipelineTrace: trace,
    pipelineText,
    investigationText: briefOnlyText,
  };
}

/**
 * Extra allowlist paths for agent watchdog (comma-separated in env).
 * @param {object} report
 * @returns {string[]}
 */
export function effectiveFixerAllowlist(report) {
  const ef = report?.pipelineTrace?.effectiveFixer;
  if (ef?.allowlist?.length) return ef.allowlist;
  return report?.failedTest?.allowlist ?? [];
}
