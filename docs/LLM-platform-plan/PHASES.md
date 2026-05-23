# Platform phases (P0–P6)

**Version:** 0.1.0 · 2026-05-22

**Active phase:** P0 — IR specification

These phases are **platform-only**. They are not tied to storybook-to-figma-lab ROADMAP sections.

---

## Timeline overview

```text
P0  IR specification                    — weeks 1–6
P1  Visual CI + one ingress/egress pair  — weeks 7–14
P2  Semantic + behavior API             — weeks 15–26
P3  Figma ingress + round-trip          — weeks 27–38
P4  ML data plane + image ingress       — weeks 39–54
P5  Multi-platform egress               — weeks 55–78
P6  Hosted product                      — year 2+
```

---

## P0 — IR specification *(active)*

**Goal:** Define the full hub schema before building adapters at scale.

| Task | Status |
| --- | --- |
| UniversalLayer visual schema (v1+) | Planned |
| SemanticGraph schema | Planned |
| BehaviorSpec schema | Planned |
| DesignerLock metadata | Planned |
| JSON Schema + validation tooling | Planned |
| Versioning and migration policy | Planned |
| Example documents (button, form, screen) | Planned |

**Exit criteria (P0 complete):**

- [ ] Published schema docs + JSON Schema files
- [ ] Validator CLI: `validate-ir document.json`
- [ ] 3 reference IR files (atom, composite, screen)
- [ ] GUIDELINES and ARCHITECTURE aligned with final schema

**Human prep:** Design + platform engineers review component taxonomy.

---

## P1 — Visual CI + one ingress/egress pair

**Goal:** Prove the compiler loop for one source and one target with automated pixel gates.

| Task | Notes |
| --- | --- |
| Choose pair (e.g. DOM → Figma or DOM → React DS) | Start narrow |
| Implement ingress adapter | Deterministic preferred |
| Implement egress lowerer | Template + rules |
| Pixel diff harness | Strict 0.1% default |
| DesignerLock on golden set | 10–20 screens |
| Regression policy | Shared-adapter tier |

**Exit criteria:**

- [ ] Golden set passes strict pixel CI on chosen pair
- [ ] IR validates against P0 schema
- [ ] Documented fix loop for failures

---

## P2 — Semantic + behavior API

**Goal:** Developers use props/callbacks only; behavior is tested.

| Task | Notes |
| --- | --- |
| SemanticGraph populated from ingress | Component detection |
| BehaviorSpec for pilot components | 5+ components |
| Typed DS API (`ds.*` or equivalent) | Platform repo |
| Behavior Playwright CI | From signed specs |
| Variants: loading, empty, error, filled | Separate IR/stories |

**Exit criteria:**

- [ ] 5 components with semantic + behavior CI green
- [ ] Sample app uses API — no hand layout in app code
- [ ] Human sign-off on behavior specs

---

## P3 — Figma ingress + round-trip

**Goal:** Figma-led workflows; IR is interchange format.

| Task | Notes |
| --- | --- |
| Figma node → UniversalLayer mapper | Frames, text, auto-layout |
| Paired golden set | Same screen in Figma + reference |
| Round-trip test | Figma → IR → Figma′ |
| Component → SemanticGraph | Variant detection |
| Aligner model (optional) | Paired training data |

**Exit criteria:**

- [ ] 20 paired round-trips within strict tolerance
- [ ] DesignerLock supports `authority: figma`

---

## P4 — ML data plane + image ingress

**Goal:** Log training data; image → draft IR with verification.

| Task | Notes |
| --- | --- |
| Trajectory logging | input, IR, output, reward |
| Fix corpus | failure → patch → outcome |
| Synthetic IR augmentation | Token/spacing variants |
| Image → draft UniversalLayer | Vision model |
| Renderer distillation | JSON → Figma DSL SFT |
| RLVR experiments (optional) | Pixel reward |

**Exit criteria:**

- [ ] Logging pipeline operational
- [ ] 10K+ labeled examples or synthetic equivalents
- [ ] Image ingress workflow with human confirm
- [ ] Specialist model ≥ baseline on held-out set (G4)

---

## P5 — Multi-platform egress

**Goal:** Same IR → React + one native target with platform golden CI.

| Task | Notes |
| --- | --- |
| React emitter v2 | Full SemanticGraph |
| Flutter emitter v1 | Platform templates |
| SwiftUI or Kotlin v1 | Second native optional |
| Platform golden harness | Per-target PNG diff |
| Token sync in IR | Single source |

**Exit criteria:**

- [ ] React + Flutter (or Swift) green on shared golden set
- [ ] Platform tolerance profiles documented in DesignerLock

---

## P6 — Hosted product

**Goal:** Managed ingress/egress, team workspaces, CI integration.

| Capability | Notes |
| --- | --- |
| Upload / connect design sources | Queue-based |
| IR vault | Versioned, auditable |
| Regen on design change | Webhooks → CI |
| Fix loop as a service | Agent + pixel gates |
| SSO, RBAC, on-prem option | Enterprise |

**Exit criteria:**

- [ ] One design team 4-week dogfood (G5)
- [ ] SLA for ingress jobs and CI runs documented

---

## Phase transitions

Update when advancing phase:

1. [`AGENTS.md`](./AGENTS.md) — Active phase table  
2. This file — checkboxes and status  
3. [`MANIFEST.yaml`](./MANIFEST.yaml) — `active.phase`  

Verify go/no-go gates in [`RISKS-AND-GATES.md`](./RISKS-AND-GATES.md) before declaring a phase complete.

---

## See also

- [`WORKFLOWS.md`](./WORKFLOWS.md) — W1 plan next  
- [`HUMAN-PREP.md`](./HUMAN-PREP.md) — per-phase human actions  
