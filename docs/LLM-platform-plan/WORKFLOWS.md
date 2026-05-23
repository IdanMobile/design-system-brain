# Workflows — step chains by activity

**Version:** 0.1.0 · 2026-05-22

When [`AGENTS.md`](./AGENTS.md) routes you here, follow the matching workflow **in order**. Do not skip steps unless the user explicitly narrows scope.

---

## W0 — Default: “look in LLM-platform-plan”

1. Read [`AGENTS.md`](./AGENTS.md) — confirm side-project mode and active phase.
2. Read [`GUIDELINES.md`](./GUIDELINES.md).
3. Read active section in [`PHASES.md`](./PHASES.md) (current P*).
4. Report: phase, focus, out-of-scope, recommended next action.
5. If user gave a specific task, continue with the matching workflow below.

**Output:** Brief orientations + one concrete next step.

---

## W1 — Plan next platform work

1. [`AGENTS.md`](./AGENTS.md) → [`PHASES.md`](./PHASES.md) (current + next P*).
2. [`RISKS-AND-GATES.md`](./RISKS-AND-GATES.md) — check go/no-go for current phase.
3. [`HUMAN-PREP.md`](./HUMAN-PREP.md) — list human dependencies.
4. Produce ordered backlog (3–7 items) with exit criteria per item.

**Output:** Prioritized task list aligned to active phase.

**Do not:** Pull tasks from lab ROADMAP.

---

## W2 — Design or extend IR schema (P0)

1. [`GUIDELINES.md`](./GUIDELINES.md) §3 (IR first).
2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — IR stack section.
3. [`PHASES.md`](./PHASES.md) — P0 exit criteria.
4. Draft schema changes (UniversalLayer extensions, SemanticGraph, BehaviorSpec, DesignerLock).
5. Define JSON Schema / TypeScript types and validation rules.
6. Document migration and versioning strategy.

**Output:** Schema spec + validation rules + example document.

---

## W3 — Design ingress adapter

1. [`GUIDELINES.md`](./GUIDELINES.md) §3, §8.
2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — ingress section.
3. [`PHASES.md`](./PHASES.md) — confirm phase allows this ingress (P1+ for DOM; P3+ for Figma; P4 for image).
4. Specify: input format, normalization steps, IR mapping, failure modes, confidence scores.
5. Define pixel/schema gates for acceptance ([`RISKS-AND-GATES.md`](./RISKS-AND-GATES.md)).
6. [`HUMAN-PREP.md`](./HUMAN-PREP.md) — human steps (paired files, review queue).
7. If ML: [`MODEL-STRATEGY.md`](./MODEL-STRATEGY.md) — which model role.

**Output:** Ingress adapter spec (not lab implementation unless user asks).

---

## W4 — Design egress lowerer / codegen

1. [`GUIDELINES.md`](./GUIDELINES.md) §2, §5, §6, §7.
2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — egress section.
3. [`PHASES.md`](./PHASES.md) — P1 (one pair), P5 (multi-platform).
4. Specify: IR inputs (visual + semantic + behavior), emitter AST, platform templates.
5. Define CI gates (pixel or platform golden).
6. Immutable UI policy for app-facing output.

**Output:** Egress spec + test plan + example emitted API surface.

---

## W5 — Pick or train a model

1. [`GUIDELINES.md`](./GUIDELINES.md) §4.
2. [`MODEL-STRATEGY.md`](./MODEL-STRATEGY.md) — model fleet table; match role to task.
3. [`DATA-PIPELINE.md`](./DATA-PIPELINE.md) — data requirements and volume.
4. [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md) — GPU/hosting for train vs inference.
5. [`RISKS-AND-GATES.md`](./RISKS-AND-GATES.md) — G4 if replacing deterministic renderer.

**Output:** Model choice rationale + train/eval plan + infra estimate.

**Do not:** Propose training a general LLM from scratch without explicit user approval.

---

## W6 — Set up infrastructure / hosting

1. [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md).
2. [`RISKS-AND-GATES.md`](./RISKS-AND-GATES.md) — security, live Figma constraints.
3. [`HUMAN-PREP.md`](./HUMAN-PREP.md) — ops roles.
4. Produce environment diagram + cost tier + CI layout.

**Output:** Infra checklist and architecture notes.

---

## W7 — Image / sketch ingress (P4)

1. [`GUIDELINES.md`](./GUIDELINES.md) §8.
2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — vision ingress path.
3. [`MODEL-STRATEGY.md`](./MODEL-STRATEGY.md) — layout vision model.
4. [`HUMAN-PREP.md`](./HUMAN-PREP.md) — review queue UX.
5. Draft IR → confirm → lock → egress pipeline.
6. Define confidence thresholds for auto vs human confirm.

**Output:** Image ingress workflow + gate definitions.

---

## W8 — Update platform documentation

1. Read [`AGENTS.md`](./AGENTS.md) — maintain consistency.
2. Edit target doc under `docs/LLM-platform-plan/`.
3. If phase/focus changed: update AGENTS Active phase, PHASES, MANIFEST.yaml.
4. Cross-check [`GUIDELINES.md`](./GUIDELINES.md) for contradictions.

**Output:** Updated doc(s) + list of related files synced.

---

## W9 — Reference lab patterns (optional)

1. [`APPENDIX-LAB-REFERENCE.md`](./APPENDIX-LAB-REFERENCE.md) only.
2. Extract reusable patterns (UniversalLayer shape, pixel CI concept).
3. Explicitly label what is **not** portable to the platform repo.

**Output:** Pattern notes — do not merge lab ROADMAP into platform PHASES.

---

## Override: user wants lab work instead

When user says “ignore platform plan”, “fix the lab”, “run until pass”, etc.:

1. Exit side-project mode.
2. Follow storybook-to-figma-lab rules (`docs/ROADMAP.md`, lab skills).
3. Do not apply LLM-platform-plan guidelines to that work.
