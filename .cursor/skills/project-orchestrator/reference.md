# Project orchestrator — reference

Companion to [SKILL.md](./SKILL.md). Detailed behavior, completion definitions, and dispatch rules.

---

## Architecture (mental model)

```text
                    ┌─────────────────────┐
                    │  Universal JSON v1   │  packages/contract/src/v2.ts
                    │  (hub)               │
                    └──────────┬──────────┘
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
    extractor-playwright   code-v2 (Figma)    @lab/ui (React)
    scene-to-html (test)   plugin import      developer-playground
           ▲                   ▲
           │                   │
    Storybook (fixture)    Figma Desktop (live test)
    ingress TODAY          ingress PHASE 3
```

**End-state API (Phase 2+):** Developers call semantic components only — `ds.list({ isLoading, isEmpty, data, onItemAction, … })`. Universal JSON is **internal**; not the public API.

---

## How things should behave

### Extraction

- Source of truth at capture: **browser DOM** (`getBoundingClientRect`, `getComputedStyle`).
- Output: `artifacts/<Component>/<Variant>.json`, `schemaVersion: "1.0"`.
- Warnings in `report.unsupportedCss` / `report.warnings` — not silent drops.
- **No screenshot fallback** as final representation (`.cursor/rules.md`).

### Figma import (`code-v2.ts`)

- Real nodes: FRAME, TEXT, VECTOR, etc. — editable, not flattened screenshots.
- Auto-layout where contract layout maps; absolute geometry preserved.
- Fonts loaded before text nodes.
- Live test uses **real** `exportAsync` — mock green + live red = Figma API issue, not "good enough."

### Pixel / schema test (step 1)

- Storybook DOM vs HTML from Universal JSON via `scene-to-html.ts`.
- Proves extractor + contract + reconstructor — **not** Figma.

### Delivery (step 4)

- Three-way: Storybook vs `@lab/ui` playground vs Figma **mock**.
- Proves the **shippable React package** matches design pipeline.

### Test console

- Fixes via **terminal**: `pnpm test:console:cursor agent` — not chat polling.
- Fix-all: one story at a time, rebuild plugin when needed, re-test that story.
- Agent acts **immediately** on inbox / `run until pass` (workspace rule).

---

## Verdict definitions

| Verdict | Meaning | Orchestrator action |
| --- | --- | --- |
| **ON_TRACK** | Active phase work proceeding; known failures scoped | Dispatch next worker item |
| **BLOCKED** | Infra missing (Storybook, relay, plugin) or wrong phase order | Fix setup; do not dispatch live fix |
| **REGRESSION** | Earlier step failed after later step passed, or Tier C failed | Stop feature work; revert or fix regression first |
| **PHASE_COMPLETE** | ROADMAP Validation block passed | Advance phase; update skill maintenance checklist |

---

## Completion criteria (detailed)

### Phase 1 — Trust the visual pipeline

| Item | Done when |
| --- | --- |
| 1.1 Infra | Storybook :6107 up; artifacts index exists |
| 1.2 Live | `pnpm figma:live-iterate --strict` → exit **0**; report Fail 0, Warn 0 on golden set |
| 1.3 Gates | Code refuses step N if step N-1 not pass for story; fix-all re-runs 1..N |
| 1.4 Regression | `pnpm test:regression` (or documented Tier C commands) exists and documented |
| 1.5 AI assess | Fail/warn writes `aiAssessment`; fix prompt includes it |
| 1.6 Delivery | `pnpm test:delivery:golden` on agreed full set; portfolio 4 columns green for golden stories |

### Phase 2 — Semantic API

| Item | Done when |
| --- | --- |
| 2.1 Contract | `List` semantic types exported from `@lab/contract` |
| 2.2 UI | `ContentListBoard` uses real props; no hardcoded demo rows |
| 2.3 Gate | Delivery pass for all list variants; steps 1–3 pass for same variants |

### Phase 3 — Figma ingress

| Item | Done when |
| --- | --- |
| 3.1 | Round-trip PNG within tolerance for 3 pilot components |
| 3.2 | Figma extract produces same artifact layout as Playwright |
| 3.3 | One component onboarded design-first with 4-step pass |

### Phase 4 — Product

| Item | Done when |
| --- | --- |
| 4.x | External app uses `ds.*`; CI blocks golden regression; release tag green |

---

## Skill routing (full)

### Lab skills (project)

| Skill | Path | Orchestrator assigns when |
| --- | --- | --- |
| **project-orchestrator** | `.cursor/skills/project-orchestrator/` | Status, review, dispatch (this skill) |
| **roadmap-iteration** | `.cursor/skills/roadmap-iteration/` | Map ROADMAP § → commands + skills |
| **figma-renderer-until-pass** | `.cursor/skills/figma-renderer-until-pass/` | Any mock/live pixel fix loop |
| **investigate-figma-mismatch** | `.cursor/skills/investigate-figma-mismatch/` | Before first edit on visual bug |
| **listen-to-test-console** | `.cursor/skills/listen-to-test-console/` | Console open, cursor agent CLI |

### Superpowers (plugin)

| Skill | Assign when |
| --- | --- |
| `using-superpowers` | Worker unsure which process to follow |
| `systematic-debugging` | Any bug; **before** fix |
| `verification-before-completion` | Worker claims done |
| `test-driven-development` | New harness, semantic types, unit tests |
| `writing-plans` / `executing-plans` | Multi-file ROADMAP section |
| `brainstorming` | New platform/contract scope only |
| `dispatching-parallel-agents` | ≥2 stories, zero shared-file overlap |
| `requesting-code-review` / `code-reviewer` | Large adapter refactor |
| `finishing-a-development-branch` | Phase gate met |

### Figma marketplace plugin (not lab loop)

Use `figma-use` + MCP for **design file** operations in Phase 3+. Do not assign for Phase 1.2 live pixel fixes.

---

## Subagent launch matrix

| Task type | `subagent_type` | Prompt must include |
| --- | --- | --- |
| Audit portfolio + reports | `explore` | Read-only; return verdict + worst 5 stories |
| Implement ROADMAP § | `generalPurpose` | Section id, validation commands, worker skill path |
| Run validation bundle | `shell` | Exact pnpm commands; report exit codes |
| Fix one live story | `generalPurpose` | `make fixes after live test`, story id, compare path |
| Code review renderer | `code-reviewer` | Phase 1 scope, rules.md quality bar |

**Never parallelize** fix agents when change targets: `code-v2.ts`, `scene-to-html.ts`, `extract.ts`, `packages/contract/`.

---

## Regression tiers (orchestrator enforces)

| Tier | Scope | Commands |
| --- | --- | --- |
| **A** | Same story, fix at step N | Re-run steps 1..N with `--story <id>` |
| **B** | Component family | All `lab-<component>--*` for steps 1..N |
| **C** | Shared adapter | `pnpm test:pixel:golden`, `pnpm figma:iterate:strict`, `pnpm figma:live-iterate --strict` if N≥3 |

Orchestrator runs Tier C checklist after any worker session that touched shared files.

---

## Priority queue (default 2026-05-21)

Until Phase 1 gate passes, orchestrator always prioritizes:

1. `lab-button--compact` (live ~65% — structural)
2. Other live fails in `figma-live-diffs/report.html` by worst hotspot
3. Pixel fail/warn on golden (`lab-button--danger`, etc.) before expanding delivery
4. ROADMAP engineering (1.3–1.5) in parallel only when not blocking 1.2

---

## Skill maintenance (orchestrator tracks)

When ROADMAP checkboxes complete, orchestrator should verify same PR updates:

| ROADMAP | Update |
| --- | --- |
| 1.3 | `figma-renderer-until-pass`, `project-orchestrator` reference |
| 1.4 | `roadmap-iteration`, `package.json` `test:regression` |
| 1.5 | `investigate-figma-mismatch`, `test-console-agent-bridge.mjs` |
| 2.x | New `semantic-delivery` skill |
| Phase 1 done | `reference.md` golden list in figma-renderer-until-pass |

---

## Orchestrator review log (optional artifact)

Workers can append to `.test-console/orchestrator-log.json` (future). Until then, orchestrator reports in chat use the **Orchestrator report** template from SKILL.md.

Suggested fields for manual log:

```json
{
  "at": "ISO-8601",
  "verdict": "ON_TRACK",
  "phase": "1.2",
  "dispatch": "figma-renderer-until-pass",
  "storyId": "lab-button--compact",
  "validation": { "figmaLiveStrict": "pending" }
}
```

---

## Trigger phrases (user)

| Phrase | Mode |
| --- | --- |
| orchestrate / project status / what's next | Orient |
| is phase 1 done? / review last fix | Post-flight |
| dispatch fix for &lt;story&gt; | Dispatch |
| run until pass | Pre-flight → assign figma-renderer-until-pass |
| open test console | listen-to-test-console (orchestrator confirms infra after) |
