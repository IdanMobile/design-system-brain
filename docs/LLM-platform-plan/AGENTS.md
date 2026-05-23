# LLM Platform Plan — AI entry point

**Side project.** This folder is **not** the storybook-to-figma-lab roadmap. Do **not** follow `docs/ROADMAP.md`, test-console fix loops, or lab pixel/live gates unless the user **explicitly** overrides (e.g. “ignore platform plan, fix the lab”).

---

## Trigger phrase

When the user says **“look in LLM-platform-plan”** (or similar: “follow the platform plan”, “use LLM-platform-plan”, “side project plan”, “platform plan”):

1. **Enter side-project mode** — scope and rules come from this folder only.
2. Read **this file** fully, then [`GUIDELINES.md`](./GUIDELINES.md), then [`WORKFLOWS.md`](./WORKFLOWS.md).
3. Use **Active phase** (below) for scope and priorities.
4. Route to other docs **only** via the tables here — do not improvise or merge with the lab ROADMAP.
5. Report: active phase, relevant guidelines, workflow steps, and recommended next action.

---

## Active phase

| Field | Value |
| --- | --- |
| **Phase** | P0 — IR specification |
| **Focus** | UniversalLayer + SemanticGraph + DesignerLock schema |
| **Out of scope** | Lab live golden, test console, `code-v2.ts` fixes, delivery portfolio |

Update this table when the platform phase changes (also update [`PHASES.md`](./PHASES.md) and [`MANIFEST.yaml`](./MANIFEST.yaml)).

---

## Instruction priority

When documents conflict:

1. User’s explicit message in chat  
2. [`AGENTS.md`](./AGENTS.md) + [`GUIDELINES.md`](./GUIDELINES.md)  
3. [`WORKFLOWS.md`](./WORKFLOWS.md) (activity chain)  
4. [`PHASES.md`](./PHASES.md) for current P*  
5. Domain docs (ARCHITECTURE, MODEL-STRATEGY, INFRASTRUCTURE, …)  
6. [`APPENDIX-LAB-REFERENCE.md`](./APPENDIX-LAB-REFERENCE.md) — patterns only, **not** requirements  

---

## Document map

| File | Use when |
| --- | --- |
| [`EXEC-SUMMARY.md`](./EXEC-SUMMARY.md) | One-page orientation for humans or quick AI context |
| [`VISION.md`](./VISION.md) | North star, promises, non-goals, success metrics |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | IR stack, ingress/egress, system diagrams |
| [`PHASES.md`](./PHASES.md) | Platform phases P0–P6, exit criteria, timeline |
| [`GUIDELINES.md`](./GUIDELINES.md) | Non-negotiable rules — read before any decision |
| [`WORKFLOWS.md`](./WORKFLOWS.md) | Step chains by activity type |
| [`HUMAN-PREP.md`](./HUMAN-PREP.md) | Roles, checklists, human-only actions |
| [`MODEL-STRATEGY.md`](./MODEL-STRATEGY.md) | Model fleet, training, base model picks |
| [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md) | Hosting, GPU specs, CI, costs |
| [`DATA-PIPELINE.md`](./DATA-PIPELINE.md) | Logging, datasets, train/val split |
| [`RISKS-AND-GATES.md`](./RISKS-AND-GATES.md) | Go/no-go gates, technical risks |
| [`APPENDIX-LAB-REFERENCE.md`](./APPENDIX-LAB-REFERENCE.md) | Optional reference: storybook-to-figma-lab patterns |
| [`MANIFEST.yaml`](./MANIFEST.yaml) | Machine-readable index and triggers |

---

## Activity → read order

| User / activity | Read in order |
| --- | --- |
| **“look in LLM-platform-plan”** (general) | AGENTS → GUIDELINES → WORKFLOWS → PHASES (active P*) |
| Plan next step | AGENTS → PHASES → RISKS-AND-GATES |
| Design IR / schema | GUIDELINES → ARCHITECTURE → PHASES P0 |
| Design ingress adapter | GUIDELINES → ARCHITECTURE → WORKFLOWS § ingress → RISKS |
| Design egress / codegen | GUIDELINES → ARCHITECTURE → WORKFLOWS § egress |
| Pick or train a model | GUIDELINES → MODEL-STRATEGY → INFRASTRUCTURE |
| Set up infra / hosting | INFRASTRUCTURE → RISKS-AND-GATES → HUMAN-PREP |
| Image / sketch ingress | GUIDELINES → ARCHITECTURE → MODEL-STRATEGY → HUMAN-PREP |
| Multi-platform (Flutter, Swift) | ARCHITECTURE → PHASES P5 → GUIDELINES § native |
| What humans must do | HUMAN-PREP |
| Update platform docs | AGENTS → doc being edited → GUIDELINES (consistency check) |

Full workflow steps: [`WORKFLOWS.md`](./WORKFLOWS.md).

---

## Default agent behavior in side-project mode

- **Do:** Propose plans, schemas, architecture, doc updates under `docs/LLM-platform-plan/`.
- **Do:** Reference lab patterns via APPENDIX when useful — never as blockers.
- **Do not:** Start lab fix loops, run `pnpm test:*` for the lab, or edit `code-v2.ts` unless user explicitly asks.
- **Do not:** Conflate platform phase P* with lab ROADMAP §1.x.

---

## Version

| Field | Value |
| --- | --- |
| Plan version | 0.1.0 |
| Last updated | 2026-05-22 |
