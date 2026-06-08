/**
 * Schema v2 — element-shaped specs for the logic approval flow.
 *
 * See `docs/superpowers/specs/2026-05-25-element-approval-redesign-design.md`
 * for the full model. One JSON file per story at
 * `lab-memory/logic/specs/<storyId>.spec.json`.
 */

import type { BehaviorPresetId } from "./behavior-presets";

export type SpecStatus = "proposed" | "approved";
export type ElementSource = "ai" | "designer";

/** TypeScript signature for a single developer prop or event. */
export interface DevApiEntry {
  name: string;
  signature: string;
}

/** Cards rendered next to the designer's description. */
export interface AiExtracted {
  behaviour: string;
  devApi: DevApiEntry[];
  extractedBy: "heuristic" | "llm";
  extractedAt: string;
}

export interface ElementSpec {
  /** Stable hash of `text + role + tag`; tie-breaker suffix when duplicated. */
  id: string;
  /** Always `[data-lab-id="<id>"]`. */
  selector: string;
  displayName: string;
  description: string;
  /** Static preset used in the showcase editor, or `custom` for free-form text. */
  behaviorPreset?: BehaviorPresetId | null;
  source: ElementSource;
  aiSuggestion: string;
  aiExtracted: AiExtracted | null;
  status: SpecStatus;
  approvedAt: string | null;
}

export interface StorySpec {
  storyId: string;
  schemaVersion: 2;
  intent: string;
  status: SpecStatus;
  approvedAt: string | null;
  approvedBy: string | null;
  specVersion: number;
  elements: ElementSpec[];
}

export const SPEC_SCHEMA_VERSION = 2 as const;
