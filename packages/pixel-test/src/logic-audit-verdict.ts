/**
 * Per-element verdict computation for the v2 logic audit.
 *
 * Pure functions, no I/O. Called by `logic-audit.ts` after the DOM probe
 * + heuristic extractor have run.
 *
 * See `docs/superpowers/specs/2026-05-25-element-approval-redesign-design.md`
 * for the verdict rubric.
 */

import type { ElementSpec, StorySpec } from "../../contract/src/spec-types.ts";

export type ElementVerdict =
  | "pass"             // observed + spec approved
  | "needs-approval"   // observed + spec proposed
  | "new-element"      // observed + not in spec
  | "regression"       // approved element no longer observed
  | "drift";           // observed id matched but text changed materially

export type StoryRollupVerdict =
  | "pass"
  | "needs-approval"
  | "regression"
  | "drift"
  | "new-element";

export interface ObservedElement {
  labId: string;
  displayName: string;
  tag: string;
  role: string;
  text: string;
}

export interface ElementVerdictRow {
  labId: string;
  displayName: string;
  verdict: ElementVerdict;
  reason: string;
}

export interface StoryAuditDecision {
  storyVerdict: StoryRollupVerdict;
  storyReason: string;
  perElement: ElementVerdictRow[];
}

const RANK: Record<StoryRollupVerdict, number> = {
  pass: 0,
  "needs-approval": 1,
  "new-element": 2,
  drift: 3,
  regression: 4
};

function worse(a: StoryRollupVerdict, b: StoryRollupVerdict): StoryRollupVerdict {
  return RANK[a] >= RANK[b] ? a : b;
}

export function computeStoryDecision({
  spec,
  observed
}: {
  spec: StorySpec;
  observed: ObservedElement[];
}): StoryAuditDecision {
  // Static story
  if (spec.elements.length === 0 && observed.length === 0) {
    if (spec.status === "approved") {
      return {
        storyVerdict: "pass",
        storyReason: "approved as static (no interactive elements)",
        perElement: []
      };
    }
    return {
      storyVerdict: "needs-approval",
      storyReason: "no interactive elements observed — approve as static",
      perElement: []
    };
  }

  const specById = new Map(spec.elements.map((e) => [e.id, e]));
  const observedById = new Map(observed.map((o) => [o.labId, o]));
  const rows: ElementVerdictRow[] = [];

  // Observed elements
  for (const obs of observed) {
    const fromSpec = specById.get(obs.labId);
    if (!fromSpec) {
      rows.push({
        labId: obs.labId,
        displayName: obs.displayName,
        verdict: "new-element",
        reason: "observed but not in spec yet"
      });
      continue;
    }
    if (fromSpec.status === "approved") {
      // Drift: same id but the visible text changed enough that the AI suggestion
      // is now stale. Heuristic: displayName diff (ignoring case + whitespace).
      const old = (fromSpec.displayName || "").trim().toLowerCase();
      const next = (obs.displayName || "").trim().toLowerCase();
      if (old && next && old !== next) {
        rows.push({
          labId: obs.labId,
          displayName: obs.displayName,
          verdict: "drift",
          reason: `displayName drifted: "${fromSpec.displayName}" → "${obs.displayName}"`
        });
        continue;
      }
      rows.push({
        labId: obs.labId,
        displayName: obs.displayName,
        verdict: "pass",
        reason: "approved"
      });
      continue;
    }
    rows.push({
      labId: obs.labId,
      displayName: obs.displayName,
      verdict: "needs-approval",
      reason: "proposed — approve in showcase"
    });
  }

  // Approved spec elements that are no longer observed → regression
  for (const e of spec.elements) {
    if (observedById.has(e.id)) continue;
    if (e.status === "approved") {
      rows.push({
        labId: e.id,
        displayName: e.displayName,
        verdict: "regression",
        reason: "approved element no longer observed"
      });
    }
  }

  // Rollup = worst verdict, with summary reason
  if (rows.length === 0) {
    // Spec had elements but none observed — every approved one is a regression
    return {
      storyVerdict: spec.elements.some((e) => e.status === "approved")
        ? "regression"
        : "needs-approval",
      storyReason: "no interactive elements observed in DOM",
      perElement: rows
    };
  }

  let worst: StoryRollupVerdict = "pass";
  for (const r of rows) worst = worse(worst, r.verdict);

  const counts = countVerdicts(rows);
  const summary = `${counts.pass}/${rows.length} pass, ${counts["needs-approval"]} need approval, ${counts["new-element"]} new, ${counts.drift} drift, ${counts.regression} regression`;

  return { storyVerdict: worst, storyReason: summary, perElement: rows };
}

function countVerdicts(rows: ElementVerdictRow[]): Record<ElementVerdict, number> {
  const out: Record<ElementVerdict, number> = {
    pass: 0,
    "needs-approval": 0,
    "new-element": 0,
    regression: 0,
    drift: 0
  };
  for (const r of rows) out[r.verdict] += 1;
  return out;
}

/**
 * Merge an observed element with an existing ElementSpec (if any), preserving
 * designer-edited fields (description, source=designer, status, approvedAt)
 * while letting the audit refresh AI-owned fields (aiSuggestion, aiExtracted)
 * and the latest displayName.
 */
export function mergeElementSpec({
  existing,
  observed,
  aiSuggestion,
  aiExtracted
}: {
  existing: ElementSpec | undefined;
  observed: ObservedElement;
  aiSuggestion: string;
  aiExtracted: ElementSpec["aiExtracted"];
}): ElementSpec {
  if (!existing) {
    return {
      id: observed.labId,
      selector: `[data-lab-id="${observed.labId}"]`,
      displayName: observed.displayName,
      description: "",
      source: "ai",
      aiSuggestion,
      aiExtracted,
      status: "proposed",
      approvedAt: null
    };
  }
  return {
    ...existing,
    selector: `[data-lab-id="${observed.labId}"]`,
    displayName: observed.displayName || existing.displayName,
    aiSuggestion,
    aiExtracted
  };
}
