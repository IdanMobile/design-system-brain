# Logic approval flow — design

**Status:** approved (conversation), pending implementation plan
**Author:** human + agent brainstorm
**Date:** 2026-05-25

## Why

Today, every story's behaviour spec (props, events, what-happens-on-click) is hand-authored in `packages/contract/src/component-specs.ts`. The human reviewed the result and rejected the pattern: **the audit should recognise what each component does and propose it; a human approves before anything becomes part of the component's documented API.** Hand-authoring is brittle, doesn't scale to new components, and isn't agnostic.

The replacement is a hybrid loop: **audit infers → human approves → spec becomes the source of truth for that story.**

## Goal

- Eliminate hand-authored component specs.
- For every story, the audit produces a **proposed spec** automatically from existing signals in the codebase.
- Specs are not "real" until a human approves them in the showcase.
- After approval, subsequent audit runs detect **drift** (the DOM changed, new control appeared, label changed) and bounce the story back to "needs re-approval."
- The audit's pass criteria become **approval-gated**: a story isn't green in logic-audit until its spec is approved AND every approved behaviour was observed at runtime.

## Lifecycle

A story moves through five gates, left-to-right. Each gate must be green before the next becomes meaningful.

```
Pixel  →  Figma mock  →  Figma live  →  Delivery 3-way  →  Logic approval  →  Approved
(auto, by tests)                                            (you, in showcase)
```

The first four are existing automated tests. The fifth is new and is the only one that requires a human. Once approved, the story is fully green; subsequent runs detect drift and may demote the story back to amber.

## Spec model

One JSON file per story at `lab-memory/specs/<storyId>.spec.json`. Git-tracked. Hand-editable (escape hatch); the canonical edit path is the showcase UI.

```json
{
  "storyId": "lab-loginpage--default",
  "component": "LoginPage",
  "status": "approved",
  "approvedAt": "2026-05-25T01:30:00Z",
  "approvedBy": "showcase",
  "specVersion": 1,
  "intent": "Email/password sign-in with Google + GitHub SSO. On submit, validates email format then transitions through 'signing in...' to 'signed in'.",
  "props": [
    { "name": "email",    "type": "string", "default": "\"team@lab.dev\"" },
    { "name": "password", "type": "string", "default": "\"password123\"" },
    { "name": "subtitle", "type": "string", "default": "\"Sign in and continue where you left off.\"" }
  ],
  "events": [
    { "name": "onEmailChanged",        "trigger": "user types in email input" },
    { "name": "onPasswordChanged",     "trigger": "user types in password input" },
    { "name": "onLoginClicked",        "trigger": "click Login button" },
    { "name": "onGoogleSignInClicked", "trigger": "click Continue with Google" },
    { "name": "onGithubSignInClicked", "trigger": "click Continue with GitHub" }
  ],
  "behaviours": [
    { "id": "submit-flow",  "label": "Submit transitions through signing-in → signed-in", "source": "component" },
    { "id": "press-toggle", "label": "Buttons toggle pressed on click",                    "source": "baseline" }
  ]
}
```

**Statuses:**
- `proposed` — never reviewed, or just bootstrapped. Audit fails the story.
- `approved` — human has approved this exact spec. Audit passes iff every behaviour is observed.
- `drifted` — audit found controls/behaviours not in the approved spec since approval. Audit warns, awaits re-approval.

## Inference engine

Lives at `packages/pixel-test/src/spec-inference.ts`. Takes a story, returns a `ProposedSpec` shaped like the JSON above (minus `status` / `approvedAt`). Combines three signals already in the repo:

| Signal | Source | Fills |
|---|---|---|
| Props (names + types) | TypeScript prop types of the rendered component, parsed with the TS compiler API | `props[].name`, `props[].type` |
| Defaults | Storybook story `args` (read from the story module) | `props[].default` (string preview) |
| Events | DOM walk: `<button>`, `<input>`, `<a[href]>`, `[role="button"]`, etc. | `events[]` with auto-named callbacks |
| Behaviours | DOM walk + baseline runtime stamps (`data-pressed-source="baseline"`) | `behaviours[]` with `source` |

**Auto-naming rule for events:**

```
button text "Login"             → onLoginClicked
button text "Continue with Google" → onGoogleSignInClicked
input[type=email]                → onEmailChanged
input[type=password]             → onPasswordChanged
button with only an icon         → onAction<N>Clicked  (flagged for human rename)
```

Pascal-case the label, strip punctuation, append `Clicked` / `Changed` / `Toggled` by role. Collisions (`onContinueClicked` × 2) get `_2`, `_3` suffixes and are flagged.

## Approval UX in the showcase

The dev playground showcase already shows each story with its spec on the right. The right-side panel grows three states:

| State | Badge | Panel mode |
|---|---|---|
| Proposed (never reviewed) | `△ NEEDS APPROVAL` (amber) | Editable, [Approve] / [Reset] buttons |
| Approved | `✓ APPROVED` (green) | Read-only by default, [Edit] toggle |
| Drift (new findings since approval) | `⚠ DRIFT — RE-REVIEW` (red) | Side-by-side approved vs proposed delta, [Accept changes] / [Reject changes] |

**The panel** (top to bottom):

1. **JSX preview** — auto-rendered from `props` + `events`. Read-only; updates live as user edits.
2. **Intent** — free-text field. Captures domain context the audit can't see ("validates email before submit", "shows toast on error"). Persists into `spec.intent`.
3. **Props table** — `name | type | default` rows. Editable name + default. [Add row] / [Remove].
4. **Events table** — `name | trigger description` rows. Editable name + trigger. [Add row] / [Remove].
5. **Behaviours list** — same as today, but with `source` badge (Component / Baseline). Editable label, [Add] / [Remove].
6. **Footer actions** — [Approve] / [Reset to proposal] / [Cancel].

**Save path:** the showcase POSTs the spec JSON to a local endpoint on `pnpm playground:serve` (a Node server that already runs when the user is in dev mode). The server writes `lab-memory/specs/<storyId>.spec.json`. The static playground build does NOT include the editor — it's a dev-mode-only feature, gated by detecting the server endpoint at load time.

## Server endpoint

Add to `scripts/serve-playground.mjs` (existing dev server):

- `GET  /api/specs/:storyId` — return the current spec JSON, or 404 if absent
- `PUT  /api/specs/:storyId` — write the spec JSON; validates shape; bumps `specVersion`; sets `approvedAt` if `status === "approved"`
- `GET  /api/specs/proposed/:storyId` — return a freshly-inferred proposed spec for this story (calls the inference engine on demand)

All endpoints are local-only (no auth needed; the server is bound to 127.0.0.1).

## Audit pass criteria

Today the logic-audit considers a story green if no `static_shell` findings remain. New criteria:

| Spec status + observation | Audit verdict |
|---|---|
| Spec missing or `status: "proposed"` | **needs-approval** (amber) — visit showcase to approve |
| `approved` and every approved behaviour observed | **pass** (green) |
| `approved` but one or more approved behaviours not observed | **regression** (red) — approved behaviour no longer works; fix the component |
| `approved` plus extra observed controls not in the spec | **drift** (amber) — new control found; re-approve in showcase |
| `drifted` (set by previous audit) | **drift** (amber) — still awaiting re-approval |

Drift detection runs every audit. The audit run that detects drift writes the proposed delta to a sidecar file (`lab-memory/specs/<storyId>.proposed.json`) so the showcase can show the diff without re-running inference.

## Baseline runtime

`packages/ui/src/behaviour-baseline.ts` (built in the previous turn) stays as-is. It continues to apply pressed-toggle to unmanaged buttons. What changes is **attribution**: a baseline-applied behaviour only counts toward audit-pass if the approved spec contains a matching `behaviours[]` entry with `source: "baseline"`. Otherwise it's drift.

## What gets deleted / replaced

| File | Fate |
|---|---|
| `packages/contract/src/component-specs.ts` | **Deleted** after migration. Becomes the seed for `lab-memory/specs/*.spec.json` (status `proposed`). |
| `packages/contract/src/index.ts` (export `COMPONENT_SPECS`) | Removed. |
| `packages/developer-playground/src/Showcase.tsx` spec panel | Replaced — now reads from `lab-memory/specs/*.spec.json` instead of importing the TS file. |

## One-shot bootstrap

A migration script `scripts/specs-bootstrap.mjs`:

1. For each `DevComponentName` in `component-specs.ts`, read the hand-authored `ComponentSpec`.
2. For each story id mapped to that component, write `lab-memory/specs/<storyId>.spec.json` with:
   - `status: "proposed"` (NOT approved — gate must be human)
   - All fields seeded from the hand-authored spec
3. Delete `component-specs.ts` after every story has a sidecar file.
4. Print a summary: `48 stories now have proposed specs. Visit the showcase to approve.`

The user goes through the showcase once and either:
- approves a story as-is (the seed was good enough), or
- edits + approves (the seed needs adjustment), or
- triggers a re-inference and approves the fresh proposal.

## File / module layout

```
lab-memory/
  specs/
    lab-loginpage--default.spec.json        (approved spec)
    lab-loginpage--default.proposed.json    (drift delta, only when drift detected)
    ...

packages/pixel-test/src/
  spec-inference.ts          (NEW — inference engine)
  spec-store.ts              (NEW — read/write/diff spec files)
  logic-audit.ts             (MODIFIED — read spec, gate pass on approval, detect drift)

packages/developer-playground/src/
  Showcase.tsx               (MODIFIED — load specs from server, render badges)
  SpecEditor.tsx             (NEW — the editable panel)
  spec-api.ts                (NEW — thin client for the dev server endpoints)

scripts/
  serve-playground.mjs       (MODIFIED — add /api/specs routes)
  specs-bootstrap.mjs        (NEW — one-shot migration from component-specs.ts)
```

## Edge cases

| Case | Behaviour |
|---|---|
| Story has no interactive elements (e.g. `LoadingStates`) | Inference returns empty `events` / `behaviours`. Spec still needs human approval — "this really has no interactive behaviour, on purpose" is itself an assertion worth confirming. The approval click is one-tap; not auto-approved. |
| Same component, multiple stories (e.g. 7 Button variants) | Each story gets its own spec file. UI offers "Apply this spec to all variants of `Button`" as a batch convenience. |
| New story added to Storybook | Audit run produces `<storyId>.spec.json` with `status: "proposed"`. Showcase shows it as amber. |
| Story renamed | Old spec file orphaned (kept in git history); new file created on next audit. Manual cleanup. |
| Component renamed/deleted | Same — orphan. Manual cleanup. |
| Spec file edited manually outside the showcase | Audit treats it as authoritative (last-write-wins). |
| Two browser tabs editing the same spec | Last write wins; we surface a warning if `specVersion` on PUT doesn't match the version on GET. |
| Static playground build (no dev server) | Showcase shows specs read-only with a banner: "Run `pnpm playground:serve` to enable approval." |

## Out of scope (for v1)

- Per-event TypeScript callback signatures (`onEmailChanged: (value: string) => void`). v1 stores only the name + trigger description. Generating real TS types from the approved spec is a follow-up.
- Auto-applying approved events into component source code. The approved spec describes the **contract**; the component still has to implement it (or the baseline runtime fills in for generic ones).
- Multi-user / concurrent approval. Single-user local tool; no auth, no merge UI.
- Approval through CLI / test-console (you chose showcase as the venue).

## Testing strategy

| Layer | Test |
|---|---|
| `spec-inference.ts` | Unit tests — feed sample DOM + TS source, assert proposed spec shape |
| `spec-store.ts` | Unit tests — read / write / version-bump / diff round-trips |
| `serve-playground.mjs` PUT endpoint | Integration test — POST a spec, verify file written, malformed payload rejected |
| Showcase editor | Manual smoke — approve one story end-to-end, verify file written, badge flips |
| Audit drift detection | Integration test — approve a spec, mutate the component, re-run audit, assert `drifted` |

## Open questions (for the implementation plan)

1. **TS prop type parsing**: use the TS compiler API (`ts.createProgram`) or a lightweight regex? Compiler API is more correct but heavier. Recommendation: compiler API, cached per file mtime.
2. **DOM walk for inference vs audit walk**: should they share the same Playwright session? Recommendation: yes — run inference as a final phase of the audit run, write `.proposed.json` if drift, then write the audit verdict.
3. **Where does the `intent` text get used?** v1: shown in showcase only. v2: feed into Figma plugin's component descriptions, or include in the delivery README per component.

These don't block the design but should be answered when planning the implementation phases.
