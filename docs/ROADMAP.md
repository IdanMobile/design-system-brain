# Roadmap — Design system platform

**North star:** A maintained React package (`@lab/ui` → published design system) where app developers only pass **data, state, and callbacks** — e.g. `ds.list({ isLoading, isEmpty, data, onItemAction, … })` — while visuals stay **pixel-aligned** with Figma and Storybook.

**Hub:** UniversalLayer JSON v1 (contract). **Ingress (today):** Storybook DOM. **Ingress (later):** Figma. **Egress:** Figma (editable), React (`@lab/ui`), Storybook (fixtures).

**Four tests per story (sequential):**

| Step | ID | Command (golden) | Proves |
| --- | --- | --- | --- |
| 0 | extract | `pnpm extract:all` | Artifacts fresh |
| 1 | pixel | `pnpm test:pixel:golden` | Schema / extractor / `scene-to-html` |
| 2 | figma | `pnpm figma:iterate:strict` | Mock renderer `code-v2.ts` |
| 3 | figmaLive | `pnpm figma:live-iterate --strict` | Real Figma export |
| 4 | delivery | `pnpm test:delivery:golden` | **Always 3-way:** Storybook (designer) · `@lab/ui` · Figma mock — every story, including page-scale composites (see [delivery-principles.md](./delivery-principles.md)) |

**Phase 2 adds a fifth step (per component, not per frozen story variant):**

| Step | ID | Command (planned) | Proves |
| --- | --- | --- | --- |
| 5 | behavior | `pnpm test:behavior:golden` | Playwright matrix from signed-off spec (after logic audit) |

**Step 5a (new):** `pnpm test:logic:audit` — probe Delivery showcase; see `docs/semantic/logic-audit-workflow.md`.

Portfolio matrix today: `test-portfolio/report.html` (46 stories × 4 steps). Behavior column joins after Phase 2.0 spec + demo exist for a component.

---

## Baseline (2026-05-21)

| Suite | Status | Notes |
| --- | --- | --- |
| Pixel golden | 46/46 pass | Step 1 largely green |
| Figma mock | 46/46 pass | Step 2 green |
| Figma live golden | 1 pass, 13 fail | **Main blocker** |
| Delivery golden | 11/11 pass | Step 4 on subset only |
| `@lab/ui` | Hand-written | Demo data in components; not `ds.*` API yet |
| Figma → JSON | Not built | JSON → Figma only |

---

## How to use this doc

- Work **top to bottom** within a phase; do not skip **Validation** subsections.
- A phase is **done** only when its final validation passes.
- After any change to shared files (`code-v2.ts`, `scene-to-html.ts`, `extract.ts`, contract), run **regression tier** listed in [Regression policy](#regression-policy).

---

## Phase 1 — Trust the visual pipeline

**Goal:** Believe pixels before building product APIs. Storybook-led; sequential gates enforced in tooling.

### 1.1 Infrastructure always-on

- [ ] Document “dev session” checklist in README (Storybook :6107, relay :3456, plugin open).
- [ ] `pnpm storybook:build && pnpm storybook:serve` — Storybook reachable.
- [ ] `pnpm extract:all` — `artifacts/stories.index.json` matches story registry.

**Validation 1.1**

```bash
curl -sf http://127.0.0.1:6107 >/dev/null && echo "storybook ok"
test -f artifacts/stories.index.json && echo "artifacts ok"
```

---

### 1.2 Green Figma live golden (P0)

Fix worst stories first (portfolio order):

1. `lab-button--compact` (~65% — structural)
2. Chart family (`lab-analyticscharts--*`)
3. Remaining live failures in `figma-live-diffs/report.html`

Per story loop (see `.cursor/skills/figma-renderer-until-pass`):

- [ ] Read `figma-live-diffs/<story>/regions/region-01-compare.png`
- [ ] Fix root cause in `packages/figma-importer-plugin/src/code-v2.ts` (systematic-debugging)
- [ ] `pnpm --filter @lab/figma-importer-plugin build`
- [ ] Reload plugin in Figma → reply `ready`
- [ ] `pnpm figma:live-iterate --story <storyId>`
- [ ] Re-check earlier steps for **same story** (pixel + mock) — see 1.3

**Validation 1.2 (phase gate)**

```bash
pnpm storybook:serve          # terminal 1
pnpm figma:relay              # terminal 2
# Figma plugin connected
pnpm figma:live-iterate --strict
# exit 0 · figma-live-diffs/report.html → Fail: 0, Warn: 0
```

---

### 1.3 Sequential test gates (orchestration)

**Goal:** Step N does not run until steps `1..N-1` pass for that story; after a fix at step N, re-run `1..N` for that story + regression tiers.

- [x] Add `canRunStep(storyId, stepId)` in `packages/contract` (reads portfolio / per-story results).
- [x] Wire gate into:
  - [x] `scripts/figma-live-iterate.mjs` (skip story if pixel/mock not pass)
  - [x] `scripts/figma-iterate.mjs`
  - [x] `packages/pixel-test` delivery runner (skip if figma mock not pass for story)
- [x] Update `scripts/test-console-fix-all-iterate.mjs`:
  - [x] After fix at step N, run tests for steps `1..N` for **that story** (not only step N).
  - [x] On shared-file change, run **Tier C** (below) before marking story done.
- [x] Test console UI: show “blocked — step 2 not pass” on gated actions.
- [x] Deprecate or relabel `tests:parallel` as “refresh reports only” (not for fix verification).

**Validation 1.3**

- Pick story `lab-button--primary`: force fail step 2 in portfolio → step 3 action refuses to run with clear message.
- Fix step 2 → run step 3 → confirm step 1–2 re-executed in logs.
- `pnpm test:portfolio:refresh` — matrix reflects blocked/skipped states.

---

### 1.4 Regression policy (implement + document)

| Tier | When | Commands |
| --- | --- | --- |
| **A** | Every story fix at step N | `--story <id>` for steps `1..N` |
| **B** | Touch component family (button, charts, …) | All `lab-button--*` (or filter in contract) steps `1..N` |
| **C** | Touch `code-v2.ts`, `scene-to-html.ts`, `extract.ts`, contract | Full golden: `pnpm test:pixel:golden`, `pnpm figma:iterate:strict`, live strict if N≥3 |

- [x] Add `pnpm test:regression` script (Tier C bundle).
- [x] Agent prompts (`test-console-agent-bridge.mjs`): require Tier C after shared-file edits.

**Validation 1.4**

- Introduce intentional 1px mock regression on `lab-button--secondary` while fixing `lab-button--compact` → Tier C fails before merge.

---

### 1.5 AI visual assessment (fail/warn only)

**Scope:** Worst region compare (`region-01-compare.png`) per failing story; optional “deep assess” later.

- [ ] Define `aiAssessment` schema on `StoryResultRecord` (`packages/pixel-test/src/report-portfolio.ts`).
- [ ] Add `packages/pixel-test/src/visual-assess.ts` (vision call behind `VISUAL_AI_ASSESS=1`, cache by PNG hash).
- [ ] Hook after `writeDiffRegionArtifacts` in figma / figma-live / pixel / delivery runners (fail/warn only).
- [ ] Render “AI notes” in suite `report.html`.
- [ ] Inject assessment into `buildFixAllStoryPrompt` / cursor inbox.
- [ ] Test console: optional “Re-assess with AI” button.

**Validation 1.5**

- Run one known-fail live story with `VISUAL_AI_ASSESS=1` → `by-story/.../result.json` contains `aiAssessment` with ≥1 mismatch category.
- Dispatch fix agent → prompt includes assessment text.
- Re-run without PNG change → cache hit (no second API call).

---

### 1.6 Expand delivery + pixel strictness

- [ ] Run `pnpm test:delivery:golden` on full `GOLDEN_SET` (or full portfolio).
- [ ] Clear pixel WARN on golden set (or document accepted WARN cap per component).
- [ ] All golden stories: steps 1–4 pass in `test-portfolio/report.html`.
- [ ] **No permanent `storybookOnly`:** every Storybook story has a matching `@lab/ui` export (wrapped composite or `ds.*`). Pilot gap: [`mui--showcase`](./delivery-principles.md) → `MUIShowcase` in package; remove skip from delivery.

**Validation 1.6 (Phase 1 complete)**

```bash
pnpm test:pixel:golden
pnpm figma:iterate:strict
pnpm figma:live-iterate --strict
pnpm test:delivery:golden
pnpm test:portfolio:refresh
# Portfolio: golden stories all green across 4 steps; exit codes 0
```

**Phase 1 exit criteria:** Live strict green on golden set; sequential gates enforced; regression script exists; AI assessment on failures; delivery golden on agreed story set.

---

## Phase 2 — Semantic layer + developer API

**Goal:** Developers use **behavior props only**; visuals owned by design system. Pilot: List (`ContentListBoard`).

**Principle:** Mock timers, polling, and fake APIs live in **developer-playground** (consumer app), never inside `@lab/ui`. The package is prop-driven only (`ds.list({ isLoading, items, onItemAction, … })`).

### 2.0 Logic audit — test first (“logic creator” discovery)

**Principle:** Design-system wrappers (MUI, future page imports) often **already implement** interaction logic. Audit the **Delivery showcase** before writing specs.

- [ ] `pnpm test:logic:audit` — Playwright probes `?story=` on :6108 (see `docs/semantic/logic-audit-workflow.md`).
- [ ] Output: `logic-audit-diffs/report.html` — per control: `ds_builtin` vs `static_shell` vs `readonly`.
- [ ] Gate: run after step 4 delivery **pass** for that story.

**Validation 2.0**

```bash
pnpm playground:serve
pnpm test:logic:audit -- --all
# report.html lists gaps per story; MUI showcase should show ds_builtin (tabs, switch, …)
```

---

### 2.1 Behavioral spec — document gaps only

Per component (grouped by `data-figma-component`), produce a spec **from audit gaps** — not from scratch.

- [ ] Template: `docs/semantic/<Component>.md` + typed schema in `packages/contract/src/semantic/`.
- [ ] **DS-provided** section — behaviors audit marked `ds_builtin` (no duplicate API).
- [ ] **Developer API** section — only `static_shell` / missing callbacks (`isLoading`, `onItemAction`, …).
- [ ] Interaction matrix — formal tests for gaps + regression on DS behavior.
- [ ] Pilot: refine [ContentListBoard.md](./semantic/ContentListBoard.md) using audit output.

**Validation 2.1**

- Audit gap list mapped to spec rows for ContentListBoard.
- Typecheck: `pnpm build`.

---

### 2.2 Contract: semantic components

- [ ] Add `packages/contract/src/semantic/` — component IDs, variant keys, prop schemas (from 2.0 specs).
- [ ] Pilot: `List` / `ContentListBoard` — `data`, `isLoading`, `isEmpty`, `onItemAction`, `onDataChanged`, etc.
- [ ] Optional `source` provenance on Universal document (storybook | figma | code).
- [ ] Export from `packages/contract/src/index.ts`.

**Validation 2.1**

- Typecheck: `pnpm build` (all packages).
- JSON artifact for list story validates against semantic + universal schemas.

---

### 2.2 Refactor `@lab/ui` pilot

- [ ] `ContentListBoard` — remove hardcoded `rows`; render from `data` prop.
- [ ] Loading / empty states driven by props.
- [ ] Export `ds.list` (or `List`) from package index; keep `data-figma-component` marker.
- [ ] Storybook stories: `loading`, `empty`, `populated` variants (frozen props for pixel/delivery).

**Validation 2.2**

```bash
pnpm test:delivery:golden -- --stories lab-contentlistboard--default,lab-contentlistboard--compact,lab-contentlistboard--highlighted
# exit 0 — visual parity on frozen variants
```

---

### 2.3 Playground as real consumer (`ds.*` only)

- [ ] Playground imports **`import { ds } from "@lab/ui"`** only — never raw `ContentListBoard`, `Button`, etc. (see `docs/semantic/README.md`).
- [ ] **Catalog = delivery-passed:** showcase/demo includes only components whose visual variants pass portfolio steps 1–4; read from portfolio or `DEV_GOLDEN_SET` + pass status.
- [ ] Per-component demo route: `?demo=list` (interactive) vs frozen `?story=` (delivery pixel tests).
- [ ] Demo layer: mock data providers, control panel (toggle loading/empty/error), optional auto-rotate scenarios.
- [ ] All interactions wired to real callbacks + `window.__labTestEvents` for behavior tests.

**Validation 2.3**

```bash
pnpm playground:build && pnpm playground:serve
# Manual: ?view=showcase lists delivery-passed ds.* entries only
# Manual: ?demo=list — click rows, toggle states, see callbacks fire
```

---

### 2.4 Behavior test harness (Playwright interaction suite)

**Goal:** Automated proof that every row in the 2.0 **interaction matrix** works — not pixel comparison.

- [ ] New runner: `packages/pixel-test/src/behavior-test.ts` (or `packages/behavior-test/`).
- [ ] Output: `behavior-diffs/by-component/<id>/result.json` + `behavior-diffs/report.html`.
- [ ] Each component test file driven by its semantic spec / interaction matrix:
  - Navigate playground demo URL
  - Assert initial render (roles, labels, disabled state)
  - Click / type / keyboard — every actionable control
  - Assert DOM updates + callback side effects (via `window.__labTestEvents` or similar test hook)
  - Cover spec states: loading → populated, empty, error+retry, disabled
- [ ] Gate: `canRunStep(component, "behavior")` requires delivery pass for that component’s visual variants **and** 2.0 spec present.
- [ ] Portfolio + test console: fifth column **Behavior**; `pnpm test:behavior:golden`.
- [ ] Does **not** replace delivery — delivery stays frozen-prop pixels; behavior proves runtime API.

**Validation 2.4**

```bash
pnpm playground:serve   # terminal 1
pnpm test:behavior:golden -- --component ContentListBoard
# exit 0 · report lists every matrix row as pass
# Introduce broken onItemAction → behavior test fails with named matrix row
```

---

### 2.5 Delivery as the “DS ship gate”

- [ ] Document: no component released until steps 1–4 pass for all its **visual variants** **and** step 5 pass for its **behavior spec**.
- [ ] Add second pilot component (e.g. `Button`) with real props (disabled, loading, icon slots) — after list is green end-to-end.

**Validation 2.5 (Phase 2 complete)**

- Two components with semantic props; delivery golden pass for all variants; behavior golden pass for both.
- Storybook + Figma mock + live pass for those variants (sequential gate).

---

## Phase 3 — Figma as entry point

**Goal:** Design-led teams; round-trip before codegen.

### 3.1 Figma round-trip (lossless in Figma)

- [ ] Plugin command: export selection → Universal JSON v1.
- [ ] Test: JSON → import → export PNG vs original component PNG (new harness or manual golden).
- [ ] Document limits (components, effects not in contract).

**Validation 3.1**

- Round-trip test on 3 library components: visual ≤ tolerance vs design capture.

---

### 3.2 Figma → JSON extractor

- [ ] Read tree: geometry, text, fills, layout (mirror Playwright rules).
- [ ] Write same `artifacts/` layout as Playwright extractor.
- [ ] Portfolio: mark stories with `source: figma` when applicable.

**Validation 3.2**

- Same story extracted from Figma vs Storybook: structural diff report (allowed deltas documented).

---

### 3.3 Hybrid workflow docs

- [ ] “Design-first” runbook: Figma → JSON → import library + `pnpm extract` parity check.
- [ ] “Dev-first” runbook: existing Storybook path.

**Validation 3.3 (Phase 3 complete)**

- One component onboarded from Figma-only entry, ends with steps 1–4 pass.

---

## Phase 4 — Maintained design system package

**Goal:** Scale without per-component frontend rebuild cost.

### 4.1 Package productization

- [ ] Rename / publish strategy for `@lab/ui` (private npm or monorepo consumer).
- [ ] `ds` namespace, tree-shakeable exports, CSS tokens entry.
- [ ] Versioning tied to contract `schemaVersion` + golden pass tag.

### 4.2 Codegen vs validated hand-off (choose per component)

- [ ] **Default:** Hand-implemented React validated by golden tests on every PR.
- [ ] **Optional:** Layout codegen from Universal JSON where mapping is 1:1.
- [ ] Never codegen business logic — only presentation.

### 4.3 CI pipeline

- [ ] CI: Tier C on PR touching shared adapters.
- [ ] CI: mock strict always; live strict on nightly or label `run-live`.
- [ ] Block merge if portfolio regression on golden set.

**Validation 4.4 (Phase 4 / project MVP)**

- External app imports package; implements one screen with `ds.list` + `ds.button` only.
- Designer Figma library matches imported JSON; live + delivery green on release tag.

---

## Cross-cutting backlog

### Docs & specs

- [ ] `docs/superpowers/specs/2026-05-21-universal-platform-design.md` (D + bidirectional ingress)
- [ ] `docs/superpowers/specs/2026-05-21-sequential-test-gates-design.md`
- [ ] `docs/superpowers/specs/2026-05-21-visual-ai-assessment-design.md`

### Fast path tips (parallel safe work)

| While blocked on… | Can parallelize |
| --- | --- |
| Live Figma (human plugin reload) | Pixel WARN cleanup, contract semantic types (2.1), AI assess scaffolding (1.5) |
| Plugin build | Unit tests for pure helpers in `code-v2` / `scene-to-html` (future) |
| One story live fix | Other stories’ mock/pixel only if no shared code change |

### Agent iteration playbook (skills)

| Role | Skill |
| --- | --- |
| **Supervisor (orchestrator)** | [.cursor/skills/project-orchestrator/SKILL.md](../.cursor/skills/project-orchestrator/SKILL.md) — north star, review, verify, dispatch workers/subagents |
| **Executor (roadmap)** | [.cursor/skills/roadmap-iteration/SKILL.md](../.cursor/skills/roadmap-iteration/SKILL.md) — run a specific ROADMAP § with validation |

**Triggers:** "orchestrate", "project status", "what's next", "is phase X done?" → **project-orchestrator** first. "Fix live", "ROADMAP §1.2" → orchestrator pre-flight, then worker skills.

**Automatic (no trigger needed):** `.cursor/rules/automatic-workflows.mdc` (`alwaysApply: true`) runs the role chain on every fix / test / adapter edit. Console prompts embed `scripts/agent-workflow-preamble.mjs`. Session hook refreshes `.cursor/agent-context.auto.md` (`pnpm orchestrator:context`).

| Cursor rule | Role |
| --- | --- |
| `automatic-workflows.mdc` | Always-on activity → skill chain |
| `test-console-autonomous.mdc` | Console fix + 5-step chain |
| `project-orchestrator.mdc` | Optional explicit supervisor turn |

#### Lab skills (this repo — keep updated)

| Skill | Path | Use when |
| --- | --- | --- |
| **roadmap-iteration** | `.cursor/skills/roadmap-iteration/SKILL.md` | Starting roadmap work; maps phase → skills → validation |
| **figma-renderer-until-pass** | `.cursor/skills/figma-renderer-until-pass/SKILL.md` | `run until pass`, `make fixes after live test`, console fix-all |
| **investigate-figma-mismatch** | `.cursor/skills/investigate-figma-mismatch/SKILL.md` | Compare PNG + artifact JSON before editing |
| **listen-to-test-console** | `.cursor/skills/listen-to-test-console/SKILL.md` | Open dashboard, `pnpm test:console:cursor agent` |

Refs: `figma-renderer-until-pass/reference.md`, `investigate-figma-mismatch/reference.md`.

**Always-on rule:** `.cursor/rules/test-console-autonomous.mdc` (autonomous fix, no chat listen).

#### Superpowers plugin (Cursor marketplace)

Enabled in `.cursor/settings.json` (`superpowers.enabled`). Update plugin: `/add-plugin superpowers` or `/plugin-update superpowers`.

| Superpowers skill | ROADMAP phases | Role |
| --- | --- | --- |
| `using-superpowers` | All | Invoke skills before acting |
| `systematic-debugging` | 1.2, 1.5, 3.x | Root cause **before** code changes |
| `verification-before-completion` | Every **Validation** block | Run commands; no “should be fixed” |
| `test-driven-development` | 1.5 harness, 2.x, 4.x | Tests before implementation |
| `writing-plans` / `executing-plans` | 1.2 sweep, 2.x pilot | Multi-step execution |
| `brainstorming` / `writing-plans` | Specs in `docs/superpowers/specs/` | Platform design only |
| `dispatching-parallel-agents` | 1.2 (careful) | Only unrelated stories, no shared-file edits |
| `requesting-code-review` / `code-reviewer` | After big renderer refactors | |
| `finishing-a-development-branch` | End of each phase gate | Merge / PR / cleanup |

Do **not** use deprecated Superpowers slash commands (`/brainstorm`); name the skill in chat instead.

#### Phase → skill → prompt (quick map)

| ROADMAP section | Load (order) | Example user / agent prompt |
| --- | --- | --- |
| **1.2** Live golden | `roadmap-iteration` → `systematic-debugging` → `investigate-figma-mismatch` → `figma-renderer-until-pass` | `make fixes after live test` |
| **1.3** Gates | `writing-plans` (implement) → `verification-before-completion` | “Implement sequential gates per ROADMAP §1.3” |
| **1.4** Regression | `figma-renderer-until-pass` + Tier C commands | “After code-v2 change run pnpm test:regression” |
| **1.5** AI assess | `test-driven-development` + `investigate-figma-mismatch` | “Wire visual assess; fix using aiAssessment in prompt” |
| **1.6** Delivery | `figma-renderer-until-pass` → `verification-before-completion` | `pnpm test:delivery:golden` |
| **2.x** Semantic API | `brainstorming` (spec) → `executing-plans` → `test-driven-development` | “Phase 2.2 List pilot per ROADMAP” |
| **3.x** Figma ingress | `brainstorming` → `writing-plans` | Design spec first |
| **4.x** CI / publish | `verification-before-completion` → `finishing-a-development-branch` | |

#### Precise iteration loop (one failing story)

```text
roadmap-iteration          → phase 1.2 + Validation 1.2
systematic-debugging       → no fix until root cause
investigate-figma-mismatch → compare PNG + artifact.v2.json
[edit code-v2 | scene-to-html | extract]
pnpm --filter @lab/figma-importer-plugin build   # if code-v2
user: ready                                    # live only
pnpm figma:live-iterate --story <id>
Tier A: pnpm test:regression -- --tier a --story <id> --suite figmaLive
Tier C: pnpm test:regression
verification-before-completion
```

#### Skill maintenance (update when ROADMAP items land)

- [ ] **1.3** — `figma-renderer-until-pass`: sequential steps 1..N after fix; gate before live
- [ ] **1.4** — `figma-renderer-until-pass` + `roadmap-iteration`: document `pnpm test:regression`
- [ ] **1.5** — `investigate-figma-mismatch` + `figma-renderer-until-pass`: read `aiAssessment` from `result.json`
- [ ] **1.5** — `test-console-agent-bridge.mjs`: inject AI notes into fix prompts
- [ ] **2.x** — Add `.cursor/skills/semantic-delivery/SKILL.md` (props-only API, delivery gate)
- [ ] **Phase 1 done** — `figma-renderer-until-pass/reference.md`: golden story list + strict thresholds
- [ ] **Superpowers** — `/plugin-update superpowers` after Cursor upgrades
- [x] **Orchestrator** — `.cursor/skills/project-orchestrator/` + `project-orchestrator.mdc` rule

#### Figma official plugin vs lab

| | Lab pixel loop | Figma MCP plugin |
| --- | --- | --- |
| Purpose | Storybook ↔ JSON ↔ importer tests | Edit/query Figma files via MCP |
| Skills | `figma-renderer-until-pass`, `investigate-figma-mismatch` | `figma-use`, `figma-generate-design`, … |
| When | ROADMAP Phase 1–2 | Phase 3+ design-file work |

---


## Suggested execution order (fastest to value)

```text
Week A   1.2 Live golden (worst stories) + 1.1 infra
Week B   1.3 Sequential gates + 1.4 Regression script
Week C   1.5 AI assessment + 1.6 Delivery full golden  → Phase 1 gate
Week D–E 2.1–2.3 List semantic API + delivery           → Phase 2 gate
Week F+  3.x Figma ingress (after Phase 1 green)
         4.x CI + publish (after Phase 2 pilot)
```

---

## Command cheat sheet

```bash
# Phase 1 gates
pnpm storybook:serve
pnpm figma:relay
pnpm extract:all
pnpm test:pixel:golden
pnpm figma:iterate:strict
pnpm figma:live-iterate --strict
pnpm test:delivery:golden
pnpm test:portfolio:refresh

# Single story (sequential discipline)
pnpm figma:live-iterate --story lab-button--compact

# Fix loop
pnpm test:console:dev
# or: pnpm test:console:cursor agent
```

---

## Related files

| Area | Path |
| --- | --- |
| Portfolio steps | `packages/contract/src/test-portfolio.ts` |
| Fix-all loop | `scripts/test-console-fix-all-iterate.mjs` |
| Agent prompts | `scripts/test-console-agent-bridge.mjs` |
| Universal contract | `packages/contract/src/v2.ts` |
| Figma renderer | `packages/figma-importer-plugin/src/code-v2.ts` |
| HTML reconstructor | `packages/pixel-test/src/scene-to-html.ts` |
| Dev package | `packages/ui/` |
