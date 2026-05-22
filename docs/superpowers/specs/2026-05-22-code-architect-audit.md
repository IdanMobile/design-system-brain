# Code Architect Audit — 2026-05-22

## Executive summary

The visual pipeline is structurally sound (Universal JSON hub → extract → dual HTML replay paths → Figma renderer → sequential test gates), but **~8.8k lines of parallel render logic** across `render-html.ts`, `scene-to-html.ts`, and `code-v2.ts` create high drift risk. **Documentation and regression policy mislabel the pixel step** as `scene-to-html` when step 1 actually uses `render-html.ts`. Locally, **Investigator-before-fix (DECISION 4A) is prompt-only**, not a hard gate. The Figma live relay binds to localhost with **no authentication** — acceptable for dev, not for multi-tenant workers without isolation.

Active phase: ROADMAP §1.2 — pixel/mock green (48/48), live 23 pass / 24 fail / 1 warn (`.cursor/agent-context.auto.md`).

---

## Critical

### C1 — Pixel vs mock render path misdocumented across brain files

Step 1 (`pixel-test.ts`) renders artifacts via **`render-html.ts`** (JSON → HTML). Step 2 (`figma-test.ts`) renders via **`code-v2.ts` → mock tree → `scene-to-html.ts`**.

**Evidence (actual hot path):**

```7:7:packages/pixel-test/src/pixel-test.ts
 *   3. Render the artifact JSON back to HTML via render-html.
```

```32:32:packages/pixel-test/src/pixel-test.ts
import { renderToBodyMarkup } from "./render-html.ts";
```

```174:174:packages/pixel-test/src/pixel-test.ts
    const rendered = renderToBodyMarkup(doc);
```

```6:8:packages/pixel-test/src/scene-to-html.ts
 * v2 schema pixel tests (`pixel-test.ts`) use `render-html.ts` — apply pixel-schema
 * fixes in `render-html.ts` (not here). Keep mock-only behavior here in sync when
 * figma-test needs it too.
```

```8:10:packages/pixel-test/src/figma-test.ts
 *   2. Install the figma mock; dynamically import `code-v2.ts`.
 *   4. Serialize the recorded tree to HTML/SVG (scene-to-html.ts).
```

Multiple authoritative sources incorrectly name `scene-to-html.ts` as the pixel renderer:

| Source | Claim | Evidence |
| --- | --- | --- |
| `docs/ROADMAP.md` §Four tests | Step 1 proves "Schema / extractor / `scene-to-html`" | Line 12 |
| `docs/ROADMAP.md` Related files | Lists `scene-to-html.ts` as "HTML reconstructor" | Line 534 |
| `scripts/architecture-console.mjs` PIPELINE | Pixel step files: `scene-to-html.ts` only | Lines 26–30 |
| `scripts/architecture-console.mjs` KEY_BRAIN_FILES | "Pixel HTML renderer" → `scene-to-html.ts` | Lines 118–120 |
| `packages/contract/src/test-portfolio.ts` | pixel fail → "Fix schema / scene-to-html" | Line 142 |
| `scripts/test-console-agent-bridge.mjs` | Pixel fix prompts → `scene-to-html.ts` | Lines 327, 365, 387, 792 |
| `.cursor/skills/project-orchestrator/SKILL.md` | Pixel failures → `scene-to-html` / extract | Line 71 |

**Impact:** Agents fix the wrong file for pixel failures; Tier C may not run when `render-html.ts` changes. Test-console inbox prompts explicitly say "fix scene-to-html" for pixel suite jobs.

### C2 — Figma live relay has no trust boundary

`scripts/figma-live-relay.mjs` listens on `ws://localhost:3456` with:

- No auth token or origin check (lines 25–40)
- First WebSocket claiming `{ type: "register", role: "plugin" }` becomes the plugin (lines 36–40)
- Any client can send `render-export` with arbitrary JSON strings forwarded to Figma (lines 52–88)

```36:40:scripts/figma-live-relay.mjs
    if (msg.type === "register" && msg.role === "plugin") {
      pluginWs = ws;
      send(ws, { type: "registered", role: "plugin" });
      console.log("[figma-live-relay] Figma plugin connected");
```

Plugin `manifest.json` restricts network to localhost relay in dev (lines 8–14) — good boundary for the plugin UI, but the relay itself accepts any local client.

**Impact:** On a shared Mac worker (`upload_to_cloud/DECISIONS.md`), any local process could hijack the relay or inject oversized payloads. Acceptable for single-developer localhost; **must harden before Phase 3+ cloud workers** (token pairing, payload limits, single-plugin lock).

---

## High

### H1 — Triple parallel render implementations (~8.8k LOC)

| File | Lines | Role |
| --- | ---: | --- |
| `packages/extractor-playwright/src/extract.ts` | 1,407 | DOM → Universal JSON |
| `packages/pixel-test/src/render-html.ts` | 1,944 | JSON → HTML (pixel step) |
| `packages/pixel-test/src/scene-to-html.ts` | 2,625 | Mock Figma tree → HTML (figma mock replay) |
| `packages/figma-importer-plugin/src/code-v2.ts` | 2,799 | JSON → Figma nodes (mock + live) |

`code-v2.ts` contains dozens of MUI/Lab heuristics with explicit cross-references to `scene-to-html` fast paths (e.g. lines 490, 756, 1443, 1552, 2023). `scene-to-html.ts` duplicates component-specific `tryRender*` blocks; `render-html.ts` has parallel `isMui*` helpers. **No shared rendering kernel** — fixes must be applied in 2–3 places for parity.

### H2 — `SHARED_ADAPTER_PREFIXES` incomplete vs ROADMAP

```12:17:scripts/test-console-worker-supervisor.mjs
export const SHARED_ADAPTER_PREFIXES = [
  "packages/figma-importer-plugin/src/code-v2.ts",
  "packages/pixel-test/src/scene-to-html.ts",
  "packages/contract/",
  "packages/extractor-playwright/"
];
```

Missing:

- `packages/pixel-test/src/render-html.ts` — primary pixel-step adapter (~1.9k LOC)
- Explicit `packages/extractor-playwright/src/extract.ts` (covered by directory prefix but not distinguished from other extractor files)

ROADMAP §1.4 lists `extract.ts` and `scene-to-html.ts` but omits `render-html.ts` (lines 127, 533). `regression-tiers.mjs` re-exports the same list (lines 14–18). Tier C auto-trigger on shared edits can **miss pixel-only regressions**.

### H3 — Investigator gate (DECISION 4A) is soft locally

`upload_to_cloud/DECISIONS.md` **4A**: every fix pipeline starts with Investigator `complete`; cloud API will 409 fixer assign without it.

Locally:

- `test-console-agent-bridge.mjs` injects "investigate first" via prompts and supervisor `investigate_first` mode (line 454)
- No event bus, no blocking assign, no separate investigator agent process
- Batch fix-all writes investigation report files then launches agent immediately (`test-console-fix-all-iterate.mjs` lines 344–365, 408–411)

**Impact:** Aligns with current single-chat Cursor workflow but **diverges from cloud design**; migrating to cloud without local hard gates risks behavior regression.

### H4 — Step gate logic duplicated with drift risk

Three implementations:

| Location | Notes |
| --- | --- |
| `packages/contract/src/test-portfolio.ts` | Canonical; includes **`logic`** in `TEST_STEP_ORDER` (lines 40–45) |
| `scripts/step-gate.mjs` | Mirror for `.mjs` scripts; **`logic` step absent** from `TEST_STEP_ORDER` (line 7) |
| `packages/pixel-test/src/step-gate.ts` | Thin wrapper importing contract |

Portfolio orchestrator (`test-console-portfolio-orchestrator.mjs`) imports **`scripts/step-gate.mjs`** (line 26), so logic-audit gating may not propagate to fix-all/orchestrator paths the same way as the TypeScript portfolio merge. Note: `step-gate.mjs` maps `logic:golden` → `logic` in suite dirs (line 51) but excludes `logic` from sequential gate order.

### H5 — Batch fix-all + shared adapter = blast radius

`test-console-fix-all-iterate.mjs` batch mode runs one agent session across many failing stories (lines 344–365). Mitigations exist (`sandbox-promote.mjs`, worktree option, serial fallback after 2 batch discards — lines 534–537), but **one coordinated edit to `code-v2.ts` still affects all 48 stories**.

Supervisor detects `SHARED_ADAPTER` and sets `tier_c_required`, but batch mode remains the default for multi-story failures — architecturally at odds with DECISIONS "no parallel fixes after shared adapter edits" (DECISIONS lines 20–21).

---

## Medium / consolidation

### M1 — Orchestrator role split (local vs cloud)

| Layer | Implementation | Status |
| --- | --- | --- |
| **Supervisor (orchestrator skill)** | Read-only orient, route workers, verdict | Cursor rules + skills |
| **Portfolio orchestrator** | `test-console-portfolio-orchestrator.mjs` — golden path sweep | Implemented |
| **Fix-all supervisor** | `test-console-fix-all-iterate.mjs` + `test-console-worker-supervisor.mjs` | Implemented |
| **Cloud orchestrator** | Workers AI + D1 + event bus per `upload_to_cloud/AGENT-PLATFORM.md` | **Not implemented** |
| **Agent protocol types** | Planned `packages/contract/src/agent-platform.ts` | **Missing** (glob confirms no file) |

Local orchestration is rich; cloud is spec-only. Risk: two divergent orchestration models unless `agent-platform.ts` becomes the shared contract soon.

### M2 — `architecture-console.mjs` pipeline map errors

Developer Agent page mislabels pixel step files and omits `render-html.ts`, `figma-mock.ts`, and `extract.ts` from the hot-path diagram:

```26:30:scripts/architecture-console.mjs
    id: "pixel",
    label: "Pixel renderer",
    command: "pnpm test:pixel:golden",
    files: ["packages/pixel-test/src/scene-to-html.ts"],
    proves: "JSON → HTML reference (step 1 gate)"
```

Feeds `.test-console/architecture-findings.json` display — can mislead operators.

### M3 — Test harness HTML injection

`pixel-test.ts`, `figma-test.ts`, and `dev-delivery-test.ts` set `document.body.innerHTML` with generated markup inside Playwright (e.g. `pixel-test.ts` line 206). Content comes from controlled extract/render pipeline (not user HTML), but pattern bypasses escaping at injection boundary. Low risk locally; document as **trusted-fixture-only**.

### M4 — `@lab/ui` parallel implementation

Delivery step proves 3-way parity but only **2/48** stories pass delivery today (`.cursor/agent-context.auto.md`). `@lab/ui` components are hand-written alongside Storybook fixtures — intentional for Phase 2, but creates a **fourth visual source** until `ds.*` API and full delivery golden coverage land.

### M5 — Duplicate agent-inbox entries

`.test-console/agent-inbox.json` contains many near-identical pixel fix prompts for `mui--showcase` — suggests console enqueue deduplication gap, not runtime bug.

### M6 — Positive patterns worth preserving

- `code.ts` thin entry delegating to `code-v2.ts` — clean plugin boundary
- `figma-mock.ts` records plugin API surface explicitly — good test seam
- Sequential `canRunStep` wired into iterate scripts and pixel-test harness
- Sandbox promote + worktree (`sandbox-promote.mjs`) — verifier separate from fixer
- Plugin `manifest.json` restricts network to localhost relay in dev (lines 8–14)
- No `.env` secrets in repo; no `eval`/`new Function` in source packages (dist/node_modules excluded)
- Unit tests for supervisor, sandbox, architecture-console

### M7 — Oversized files without module boundaries

All hot-path render files exceed 1.4k LOC with no extracted submodules (color parsing, MUI detectors, gradient math duplicated across files). Consolidation should extract **shared pure helpers** into `packages/contract` or new `packages/render-kernel` rather than further inline growth.

---

## Architecture map (actual hot path)

```text
Storybook DOM
    │
    ▼
extract.ts ──► UniversalDocumentV2 (contract/v2.ts)
    │
    ├─► render-html.ts ──► HTML ──► pixel-test (step 1)
    │
    └─► code-v2.ts ──► figma mock tree ──► scene-to-html.ts ──► HTML ──► figma-test (step 2)
              │
              └─► Figma Desktop (via relay :3456) ──► figma-live-test (step 3)

@lab/ui + developer-playground ──► dev-delivery-test (step 4)
logic-audit.ts ──► step 5 (partial)
```

---

## Orchestrator vs agent roles (current local wiring)

| Role | Enforced by | Can edit code? |
| --- | --- | --- |
| Orchestrator | Skills + portfolio orchestrator script | No (by convention) |
| Investigator | Prompt + supervisor `investigate_first` | No (by convention) |
| Fix worker | Cursor agent / fix-all dispatch | Yes |
| Verifier | Harness re-test + Tier A/B/C + sandbox promote | No |
| Code architect | This audit skill | **Read-only** |

Cloud plan adds hard API gates between Investigator → Fixer → Verifier → Git agent; local relies on Cursor rules and metrics-based sandbox discard.

---

## Regression policy assessment

| Tier | Wired | Gap |
| --- | --- | --- |
| A (steps 1..N per story) | fix-all-iterate, regression-tiers | OK |
| B (component family) | regression-tiers | OK |
| C (shared adapter) | regression-tiers, supervisor flag | **Missing `render-html.ts`**; ROADMAP omits it |
| Sandbox promote | sandbox-promote.mjs | OK for batch/serial |
| Sequential step gate | contract + harness | **logic step drift** in scripts mirror |

---

## Recommendations (ordered)

1. **Fix brain-file routing for pixel step** — Update ROADMAP, orchestrator skill, `recommendAction` (line 142), `architecture-console.mjs`, and fix-all prompts to name `render-html.ts` for step 1; keep `scene-to-html.ts` for step 2 replay only.
2. **Add `render-html.ts` to `SHARED_ADAPTER_PREFIXES` and ROADMAP §1.4** — Tier C must run on pixel-adapter edits.
3. **Extract shared render primitives** — Color/gradient/border/MUI detector helpers used by `render-html`, `scene-to-html`, and `code-v2` into a typed shared package; reduce triple maintenance.
4. **Harden relay before cloud workers** — Pairing token, plugin registration challenge, JSON size cap, single-plugin lock documented in runbook.
5. **Unify step gate** — Generate `scripts/step-gate.mjs` from contract or import compiled contract; include `logic` in script mirror.
6. **Local investigator hard gate (optional pre-cloud)** — Fix-all refuses agent dispatch until investigation report mtime/hash recorded in orchestrator state (lightweight 4A preview).
7. **Default serial for shared-adapter suites** — When fix-all target suite is `figma`/`figmaLive` and >1 story fails, default `FIX_ALL_SERIAL=1` instead of batch.
8. **Scaffold `packages/contract/src/agent-platform.ts`** — Align local orchestrator state with cloud job schema before Phase 1 control plane.
9. **Split oversized files incrementally** — Target modules: `color.ts`, `mui-heuristics.ts`, `svg-borders.ts` per renderer; add pure unit tests (ROADMAP fast-path tip).
10. **Re-run this audit after Phase 1 gate** — Re-evaluate triple-path consolidation when live strict is green and delivery golden expands.

---

## Machine-readable

See `.test-console/architecture-findings.json`

## Scope reviewed

- `docs/ROADMAP.md`, `upload_to_cloud/DECISIONS.md`, `upload_to_cloud/AGENT-PLATFORM.md`
- Pipeline: `extract.ts`, `contract/v2.ts`, `render-html.ts`, `scene-to-html.ts`, `code-v2.ts`, `figma-mock.ts`
- Orchestration: fix-all, portfolio orchestrator, worker supervisor, regression tiers, sandbox promote
- Security: relay, plugin manifest, secrets grep
- `.cursor/agent-context.auto.md` portfolio snapshot (2026-05-22)

**Verdict:** ON_TRACK for Phase 1.2 with **documentation/regression drift** and **render-path duplication** as the primary architectural debt — not blockers for continuing live fixes, but blockers for safe batch automation and cloud migration without items 1–5.
