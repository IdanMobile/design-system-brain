# Element approval — redesign of the logic-approval flow

**Status:** approved (conversation), pending implementation plan
**Author:** human + agent brainstorm
**Date:** 2026-05-25
**Supersedes:** `2026-05-25-logic-approval-flow-design.md` (v1, shipped same day)

## Why

The v1 flow shipped earlier today exposed a spec editor with three tables (props / events / behaviours), TypeScript prop types, source dropdowns, and auto-named events like `onConnectWithGoogleClicked`. It was **developer-shaped**, not designer-shaped. The designer's feedback after using it was:

> "It's a bit of a hassle and too much work and understanding for the designer. Maybe give them an option to select a component, like the desired layer, and write in plain text what it's supposed to do."

The redesign reframes the spec as **a list of layers with plain-English descriptions**, with the AI doing the translation work the designer shouldn't have to.

## Goal

A designer who can't read code should be able to:

1. Open a story in the showcase.
2. Click any visible layer in the rendered preview.
3. Type one sentence in plain English describing what that layer should do.
4. See the AI translate that sentence into two outputs side-by-side:
   - **Runtime behaviour** (what should happen) — for the next agent that implements the component, and as documentation for human reviewers.
   - **Developer API** (props/events to expose) — for the developer who wires the implementation.
5. Hit Approve. Move to the next layer. Story is green when every layer is approved.

Every interactive element is **pre-suggested** by a local heuristic before the designer touches anything. The designer accepts, edits, or asks for an LLM polish via an opt-in ✨ button.

## Mental model

```
Click layer in preview  →  Describe in plain English  →  AI translates  →  Approve
       ↑                              ↑                       ↑              ↓
   data-lab-id            "click to reveal input"     Heuristic / LLM    Spec disk
```

## Spec shape

One JSON file per story at `lab-memory/specs/<storyId>.spec.json`. Same path as v1, **incompatible inner schema** (see Migration).

```json
{
  "storyId": "lab-navigationbars--top-navigation",
  "schemaVersion": 2,
  "intent": "Top navigation bar with brand, primary nav, and account actions.",
  "status": "proposed",
  "approvedAt": null,
  "approvedBy": null,
  "specVersion": 1,
  "elements": [
    {
      "id": "el-search-button",
      "selector": "[data-lab-id=\"el-search-button\"]",
      "displayName": "Search button",
      "description": "click to reveal a search input",
      "source": "designer",
      "aiSuggestion": "icon-only button — likely opens search",
      "aiExtracted": {
        "behaviour": "On click: reveal a search input",
        "devApi": [
          { "name": "onSearchTextChanged", "signature": "(value: string) => void" }
        ],
        "extractedBy": "heuristic",
        "extractedAt": "2026-05-25T01:45:00Z"
      },
      "status": "approved",
      "approvedAt": "2026-05-25T01:45:30Z"
    },
    {
      "id": "el-get-started",
      "selector": "[data-lab-id=\"el-get-started\"]",
      "displayName": "Get started button",
      "description": "",
      "source": "ai",
      "aiSuggestion": "starts onboarding flow",
      "aiExtracted": null,
      "status": "proposed"
    }
  ]
}
```

Field semantics:

| Field | Owner | Notes |
|---|---|---|
| `intent` | Designer | One sentence story-level summary. Optional. |
| `elements[].id` | System | Stable hash of `text + role + tag`. Survives re-orders. DOM index is appended only as a tie-breaker (`el-reset-2`) when the hash would otherwise collide within the story. |
| `elements[].selector` | System | Always `[data-lab-id="<id>"]`. The audit stamps these at probe time. |
| `elements[].displayName` | Designer | Defaults from text content or role. Editable. |
| `elements[].description` | Designer | Plain English. Empty = use `aiSuggestion`. |
| `elements[].source` | System | `"ai"` until the designer types, then `"designer"`. |
| `elements[].aiSuggestion` | Heuristic at load | One short sentence proposed automatically. |
| `elements[].aiExtracted` | Heuristic on blur / ✨ on click | The two cards (behaviour, devApi). Recomputed any time description changes; cached so the audit can compare across runs. |
| `elements[].status` | Designer | `proposed` → `approved` via showcase Approve button. |

## Element lifecycle

| State | How it got there | Audit verdict |
|---|---|---|
| `source: "ai"`, `status: "proposed"` | Heuristic guess at audit / showcase load | needs-approval |
| `source: "designer"`, `status: "proposed"` | Designer typed but didn't Approve | needs-approval (draft) |
| `status: "approved"` + element present in DOM | Designer clicked Approve | pass |
| `status: "approved"` + element missing from DOM | Audit re-ran after a code change that removed the element | regression |
| `status: "proposed"`, newly added to spec by audit (`source: "ai"`) | A new control appeared since last approval | new-element (drift) |

The audit **does not** treat AI suggestions as approved. Designer has to click Approve, period. AI is there to make that one click trivial.

## Click-in-preview UX

### Selection mechanism

- Showcase mounts each story card in **logic-approval mode** when `?view=showcase` is loaded.
- An invisible `ElementOverlay` layer mounts above the rendered preview. Pointer events go to the overlay; the rendered component still paints normally underneath.
- Overlay maintains `selectedElementId` state and a `hoveredElementId`.
- **Hover** → 1px dashed light-blue outline + cursor `pointer` + floating tag showing the `displayName`.
- **Click** → 2px solid blue outline + glow + side panel slides to element view. Selection persists until the designer clicks elsewhere or hits Esc.
- **Esc / click outside any interactive layer** → deselect, panel returns to story view.
- **Cmd/Ctrl+click in preview** → opens `?story=<id>` in a new tab (escape hatch for debugging).

### What counts as a selectable layer

The same set the audit probes today (`ROOT_AND_DESCENDANT_INTERACTIVE`):
`<button>`, `<a[href]>`, `<input>`, `<textarea>`, `<select>`, `[role=button|tab|switch|checkbox|menuitem|option]`, `[tabindex>=0]`, `<summary>`.

Plus a new "soft" category: elements with `data-figma-component` that contain **no descendant interactive control**. These render with a faint amber dot ("AI suggests this might be interactive — describe what it does"). Charts, decorative cards, etc.

### The side panel — three states

| State | When | Contents |
|---|---|---|
| **Story view** | nothing selected | `intent` textarea + `All elements (N)` list with status icons. Click any row to select. |
| **Element view** | one element selected | `displayName` (editable) → `What should this do?` textarea → AI Translation cards → `Approve` / `Save draft` / `Reset to AI suggestion` / `✨ Improve with AI` |
| **Drift view** | story has new + approved elements both | Two element-views stacked: the approved one (read-only) on top, the new proposed one below. Designer picks `Keep both`, `Replace`, or `Discard new`. |

### Description → cards flow

1. Designer types in the textarea, or accepts the heuristic `aiSuggestion` by clicking into the field (it pre-fills).
2. On **blur** (300ms debounce), the local heuristic re-extracts the behaviour + devApi cards. No network. Instant.
3. **✨ Improve with AI** is opt-in: clicking it dispatches an LLM round-trip. Loading shimmer on the cards. On success, cards update, `aiExtracted.extractedBy: "llm"`. On failure, falls back to heuristic with a small "AI unreachable" banner. Original description never changes.
4. **Approve** writes the spec to disk and flips status to `approved`. Cards become read-only. Element row in `All elements` goes green.

### Stories with no interactive elements

`lab-loadingstates--card-skeleton` and similar: the panel shows "No interactive elements detected. Approve story as static." with one big button. Click, done.

## Heuristic extraction rules

Pure rules, no I/O, fully unit-tested. Lives at `packages/pixel-test/src/spec-extract-heuristic.ts`.

### Evaluation model

Rules are matched in declared order; each rule contributes to either the behaviour sentence, the devApi list, or both. A single description like *"click to reveal a search input"* matches multiple rules — they **compose** rather than overriding:

- `click` → adds verb to behaviour ("On click")
- `reveal + input` → adds object to behaviour ("reveal a search input")
- `input` → adds `on<Field>Changed` to devApi

Composed behaviour: `On click: reveal a search input`. Composed devApi: `[onSearchClicked, onSearchTextChanged]`.

### Rule table

| Trigger | Contributes to behaviour | Contributes to devApi |
|---|---|---|
| `click` / `tap` / `press` | verb: "On click" | `on<Display>Clicked: () => void` |
| `hover` / `mouse over` | verb: "On hover" | `onMouseEnter: () => void`, `onMouseLeave: () => void` |
| `select` / `pick` + `option` / `item` | verb: "On selection" | `on<Object>Selected: (id: string) => void` |
| `submit` / `send` + `form` | verb: "On submit" | `onSubmit: () => Promise<void>` (promise return signals loading) |
| `type` / `enter` + text-input element | verb: "On type" | `on<Field>Changed: (value: string) => void` |
| `show` / `reveal` / `open` + object | object: "show \<object\>" | none |
| `navigate` / `go to` / `route` | object: "navigate to \<dest\>" | `href?: string` |
| `loading` / `spinner` / `wait` | (no behaviour) | `isLoading?: boolean` |
| Just one word ("button", "link", "card") | verb: "Click triggers action", confidence: low | `on<Display>Clicked: () => void` |
| Empty description, element is interactive | "Clicking does something — please describe" | (no card, suggest ✨) |

`<Display>` is the PascalCased `displayName` with punctuation stripped. `<Object>` and `<Field>` come from noun extraction over the description; if no noun is identifiable, fall back to `<Display>`.

### Determinism

For the same `(description, displayName, tag, role)` input the heuristic always returns byte-identical output. This matters because the audit caches `aiExtracted` and compares across runs to detect description-only drift.

## ✨ AI dispatch

### Endpoint

```
POST /api/specs/extract
body: {
  storyId, elementId,
  displayName, description,
  tag, role, ariaLabel, text,
  storyIntent,
  nearbyElements: [{ tag, role, text }]
}
response: {
  behaviour: string,
  devApi: [{ name: string, signature: string }],
  extractedBy: "llm",
  rationale?: string
}
```

Mounted on `pnpm playground:serve` alongside the existing `/api/specs` routes.

### Server (`scripts/specs-llm.mjs`)

1. Read `LAB_LLM_API_KEY` from `.env`. Absent → respond `503 { error: "configure LAB_LLM_API_KEY" }`. UI shows: *"AI polish unavailable. Add `LAB_LLM_API_KEY=sk-...` (OpenAI) or `=sk-ant-...` (Anthropic) to `.env`."* The heuristic still runs; nothing is broken.
2. Prefix-detect the key (`sk-ant-` → Anthropic, otherwise OpenAI). Single ad-hoc fetch, JSON-mode (OpenAI) or system-prompted JSON (Anthropic).
3. 5-second timeout; rate-limit 30/min per server instance.
4. Strict JSON-schema response validation; on parse failure retry once with temperature 0; on second failure return 502 and let UI fall back.

### LLM prompt (single round-trip)

```
You are translating a designer's plain-English description of a UI element
into (a) a one-sentence runtime behaviour and (b) a list of developer prop
signatures the implementer will need.

STORY INTENT: <intent>
ELEMENT: <displayName> (<tag>, role=<role>, text="<text>")
NEARBY ELEMENTS: <list, max 6>
DESIGNER DESCRIPTION: "<description>"

Reply with JSON, no prose:
{ "behaviour": string, "devApi": [{ "name": string, "signature": string }] }

Rules:
- Names in camelCase, start with `on` for events.
- Signature in TypeScript only, e.g. "(value: string) => void".
- AT MOST 3 devApi entries.
- If description is too vague, behaviour = "needs more detail", devApi = [].
```

### Why not Cursor CLI

Cursor CLI agent spin-up is ~10-30s per call. For an interactive per-element ✨ button, that's UX-hostile. Direct chat-completion is ~1-2s. Cursor CLI stays the home for big tasks (fix-all, audit dispatch); per-element extraction is too small to warrant it.

### Pre-suggestions on load

Heuristic only. The showcase loads with every element already showing a heuristic suggestion. No LLM call on load — that would be 5-30 calls per page view, expensive and slow. The ✨ button is the only LLM entry point.

### Showcase-load behaviour when `elements[]` is empty

After `pnpm specs:bootstrap-v2` writes fresh empty specs, the very first `pnpm test:logic:audit:all` run populates each `elements[]` from the DOM probe + heuristic. If a designer opens the showcase **before** that audit run, the story card shows the rendered preview plus a banner: *"Elements not detected yet. Run `pnpm test:logic:audit:all` to discover this story's interactive layers."* The Approve button is disabled until elements exist.

Rationale: keeps the showcase a pure read-write client of the spec file. Element discovery lives in the audit pipeline (one source of truth) instead of duplicating DOM-probe logic in the browser.

## Audit verdicts

### Per-element

| Spec → Observed | Verdict |
|---|---|
| Approved + still present | **pass** |
| Approved + missing from DOM | **regression** |
| Proposed (any source) | **needs-approval** |
| Not in spec, but observed | **new-element** → spec gains `{source: "ai", status: "proposed"}` entry |
| In spec, observed, ID changed (selector hash drift) | **drift** — flagged for re-link |

### Story rollup

Story verdict = worst element verdict, with this ordering (worst first):
`regression` > `drift` > `needs-approval` (incl. `new-element`) > `pass`.

Story is `pass` only when every element is `approved` and `present`.

### Static stories (empty `elements[]`)

A story with zero interactive elements is a separate path. The story-level `status` field handles it:

| Story `status` | `elements[]` length | Verdict |
|---|---|---|
| `approved` | 0 | **pass** (designer signed off: "this story is intentionally static") |
| `proposed` | 0 | **needs-approval** (designer hasn't confirmed it's static yet) |
| any | > 0 | rollup of per-element verdicts (above) |

The "Approve story as static" button in the panel sets story `status: "approved"` directly; nothing else needs to happen.

### Audit CLI output

```
▶ lab-navigationbars--top-navigation … △ NEEDS-APPROVAL · 3/5 elements approved
  ◯ Search button       → click to reveal a search input
  ◯ Get started button  → (AI: starts onboarding flow)
  ✓ Components link
  ✓ Tokens link
  ✓ Templates link

▶ lab-loginpage--default … ✓ PASS · 5/5 elements approved

▶ lab-button--primary … ✗ REGRESSION · approved element gone
  ✗ Primary button (was "Primary" — element no longer in DOM)
```

### HTML report (`logic-audit-diffs/report.html`)

Each story row expands to a nested per-element table: `displayName | description | behaviour | devApi | status`. Verdict color of the story = its rollup.

## Migration

The v1 spec shape (`events[]` / `behaviours[]` / `props[]`) is **incompatible** with v2 (`elements[]`). The 48 bulk-approvals from this session were synthetic (the audit observed names, we accepted them) — not real designer approval.

**Migration script:** `pnpm specs:bootstrap-v2`

1. Copy every `lab-memory/specs/*.spec.json` to `lab-memory/specs-legacy/<storyId>.spec.json` (git-tracked archive, never read by tools).
2. Delete the original files.
3. For each `DEV_STORY`, write a fresh `lab-memory/specs/<storyId>.spec.json` with `schemaVersion: 2`, empty `intent`, empty `elements[]`, `status: "proposed"`. The audit populates `elements[]` on first run.
4. Print summary: *"55 specs migrated; legacy archived to lab-memory/specs-legacy/. Run `pnpm test:logic:audit:all` to populate elements, then review in the showcase."*

After migration: every story is amber until the designer goes through it. With ✨ available, ~30s per story; ~25 min for 48 stories total.

The legacy archive stays in git for reference but is never read by tooling. Hand-cleanup possible after a few weeks once the new specs settle.

## File / module layout

```
packages/contract/src/
  spec-types.ts                  REPLACE — new ElementSpec/StorySpecV2 shape (schemaVersion: 2)

packages/pixel-test/src/
  spec-store.ts                  KEEP (schema-agnostic JSON I/O)
  spec-extract-heuristic.ts      NEW — pure rules table → {behaviour, devApi}
  spec-extract-heuristic.test.ts NEW
  logic-audit.ts                 REWRITE verdict logic, keep probe machinery
  spec-event-namer.ts            DELETE
  spec-prop-parser.ts            DELETE
  spec-inference.ts              DELETE

scripts/
  specs-bootstrap-v2.mjs         NEW — archive legacy, write fresh v2 files
  specs-server.mjs               KEEP (same /api/specs routes, new JSON inside)
  specs-llm.mjs                  NEW — POST /api/specs/extract, OpenAI/Anthropic
  specs-llm.test.mjs             NEW
  specs-bootstrap.mjs            DELETE
  specs-accept-drift.mjs         DELETE

packages/developer-playground/src/
  ElementOverlay.tsx             NEW — click-in-preview layer
  ElementPanel.tsx               NEW — side panel (story view + element view + drift view)
  spec-extract-client.ts         NEW — calls /api/specs/extract
  Showcase.tsx                   MODIFY — wire ElementOverlay + ElementPanel per card
  SpecEditor.tsx                 DELETE
  SpecPreview.tsx                DELETE

packages/ui/src/
  behaviour-baseline.ts          DELETE — no more auto-wiring; designer text is the source
  index.ts                       MODIFY — drop baseline export and side-effect import
```

## Edge cases

| Case | Behaviour |
|---|---|
| Story has zero interactive elements (e.g. `LoadingStates`) | Panel shows "No interactive elements. Approve story as static." Single big button. |
| Same display name on multiple buttons in one story (e.g. 3 "Reset" buttons in a filter panel) | IDs differentiate via DOM index suffix: `el-reset-1`, `el-reset-2`. UI shows position hint ("Reset · top-right"). |
| Element re-ordered between renders | Hash is stable on `text + role` so re-order doesn't break the link; only edits to the visible text would. Text edit → element treated as "removed + new" → drift view. |
| LLM returns invalid JSON | Retry once at temperature 0. Second failure → fall back to heuristic + banner. |
| `LAB_LLM_API_KEY` missing | ✨ button disabled with tooltip. Everything else works. |
| Designer edits an approved element's description | Status flips back to `proposed`. Re-approve required. |
| New element appears (designer added a button to the component) | Audit creates `source: "ai", status: "proposed"` entry. Story flips to amber. |
| Approved element disappears | `regression` verdict; story fails. |
| Two designers approve in parallel tabs | Server bumps `specVersion`; PUT with mismatched version warns. (Same as v1.) |
| Spec file edited manually outside the showcase | Audit treats as authoritative (last-write-wins). |
| Static playground build (no dev server) | Showcase shows specs read-only with a banner: "Run `pnpm playground:serve` to enable approval." |

## Out of scope (v1)

- **Runtime behaviour interpreter** — the `aiExtracted.behaviour` card is documentation only. The live preview still runs the component's current code. A future phase could ingest the approved spec and generate component code that implements the behaviour, but that's a separate beast.
- **Multi-element selection** — designer can only select one layer at a time.
- **Batch approval** — no "approve all elements in this story" shortcut. Each click matters.
- **Component-level rollups** — every story is approved independently, even when 7 Button variants share the same underlying component.
- **Hand-authored ComponentSpec TS files** — deleted in v1; not coming back.
- **Concurrent multi-user approval** — single-user local tool.
- **Approval via CLI / test-console** — showcase is the only venue.

## Implementation phasing

Four phases, each ships standalone.

| Phase | Ships | Why this order |
|---|---|---|
| **1. Data model + migration** | New `spec-types.ts` (schemaVersion: 2), `spec-store.ts` round-trips the new shape, `specs-bootstrap-v2.mjs` archives + writes empty specs, audit reads new shape with rudimentary verdict ("story has elements / doesn't"). | Foundation. New files on disk; old UI broken (intentional — drives the next phase). |
| **2. Heuristic engine + per-element verdicts** | `spec-extract-heuristic.ts` + tests, `logic-audit.ts` per-element verdict logic, audit populates `elements[]` on first run, new CLI + HTML report. Old UI still broken. | Audit becomes useful before UI lands. CI signal first, designer flow second. |
| **3. Click-in-preview UX** | `ElementOverlay.tsx`, `ElementPanel.tsx`, replaces `SpecEditor.tsx`. Per-element approve roundtrip. Story view + element view; drift view stub. | The visible win. Designer can now use the system. |
| **4. ✨ AI polish** | `scripts/specs-llm.mjs`, `/api/specs/extract`, ✨ button + loading states + error fallback. | Optional power-up. Heuristics already work; LLM is the cherry. |

After Phase 4: the user's full vision (click + plain English + AI translation + designer/dev outputs) is live and the audit gates on real designer approval.

## Testing strategy

| Layer | Test |
|---|---|
| `spec-extract-heuristic.ts` | Unit — table-driven: input description + element context → expected behaviour + devApi shape. ~30 cases covering every rule + edge ("empty", "one word", "ambiguous"). |
| `spec-store.ts` v2 round-trip | Unit — write/read/list/diff with schemaVersion: 2 specs. |
| `specs-bootstrap-v2.mjs` | Integration — temp vault with v1 specs, run script, assert legacy archive + fresh v2 files. |
| `specs-server.mjs` | Integration — PUT v2 spec, GET, verify shape. (Reused from v1.) |
| `specs-llm.mjs` | Integration — mocked fetch; assert prompt shape, JSON parse, retry, key-missing fallback. |
| `logic-audit.ts` per-element verdicts | Integration — small DOM fixture, varied spec states, assert per-element + story rollup. |
| `ElementOverlay` selection | Manual smoke — click on each interactive element in the LoginPage story, verify side panel updates. |
| End-to-end | Manual — bootstrap-v2, run audit, open showcase, approve one element, re-run audit, verify pass. Then mutate the component to remove the element, re-run audit, verify regression. |

## Open question for implementation planning

**LLM key handling in CI.** If a teammate runs `pnpm test:logic:audit:all` in CI without `LAB_LLM_API_KEY`, the audit must not require it (heuristic-only). The showcase ✨ button is the only place where the key is needed. CI never calls `/api/specs/extract`. Document this clearly in the README addition.
