---
name: figma-renderer-until-pass
description: >-
  "run until pass" — full loop (mock then live until green). "make fixes after
  live test" (or continue live / fix after live) — skip mock; use existing
  figma-live-diffs report, fix code-v2.ts, re-run live after user replies ready.
  Agent runs all pnpm/infra; human only for Figma Desktop plugin UI (reload/open). Console
  inbox messages: fix immediately — never ask for approval to start.
---

# Run until pass

## Test console **Fix all** (orchestrated loop)

**Fix all** in the dashboard runs `scripts/test-console-fix-all-iterate.mjs` (not one open-ended agent). Per story (worst first), up to **5** cycles by default (`TEST_CONSOLE_FIX_ALL_MAX_TRIES`):

1. Cursor agent fix (this story only)
2. Plugin build (figma / figma live / delivery)
3. Re-run that story’s golden (`figma:iterate --story`, etc.)
4. Stop when status is **pass**, or after max tries

Terminal tab: `run-fix-all`. Do not rely on a single mega-prompt for the whole suite.

---

## Console-triggered (CLI or pasted prompt)

If the work started from **`pnpm test:console:cursor agent`**, **Gemini CLI**, **Antigravity**, or a **pasted test-console message**, treat it as an explicit command:

- **Do not ask for approval** — start fixing in the same turn.
- **Lab memory:** read `lab-memory/visual/patterns/` + `visual/investigations/active/<storyId>.md`; append `templates/investigation.md` before code edits (see `.cursor/rules/lab-memory.mdc`).
- Read compare PNG → edit → build → re-test without "Should I proceed?"
- Only block for **ready** after a live plugin rebuild (one line, not a permission gate).

## Which phrase?

| User says | Start here |
|-----------|------------|
| **run until pass** | Phase 1 mock → Phase 2 live (full flow) |
| **make fixes after live test** / **continue live** / **fix after live** | Phase 2 only — skip mock (see below) |

**Guing Figma-entry screens** (test console Figma tab, `screen_*` ids): use **`figma-screen-until-pass`** — Manifest → Contract → Figma live → Storybook → 4-way pipeline.

---

## If the user says **"make fixes after live test"** (or continue live / fix after live)

You already have a live report — **do not start Phase 1 mock.**

1. `pnpm figma:live-iterate:status` — read `figma-live-diffs/report.json` (no re-test yet).
2. If no report: send Figma handoff → wait for **ready** → `pnpm figma:live-iterate`.
3. Fix worst story from hotspots → build plugin → user reloads → **ready** → `pnpm figma:live-iterate --story <id>` → full `pnpm figma:live-iterate`.
4. Repeat until `pnpm figma:live-iterate --strict` exits 0.

Only ask the user for **ready** (Figma plugin connected) before re-running live after a build. If they say they already have the plugin open and connected, treat that as **ready**.

---

## If the user says **"run until pass"**

Do **everything** below. Do not ask for permission to start. Do not explain the plan first — start Phase 1 immediately.

The **only** times you may wait on the user (see `.cursor/rules/human-only-when-necessary.mdc`):

1. **`pnpm infra:health`** shows `figma_plugin_not_connected` after you ran **`pnpm infra:ensure`** — one line: open Figma → Development → Universal JSON Importer Lab until bridge connected.
2. **After plugin rebuild** — run live test yourself first; only if bridge/export fails → one line: reload plugin in Figma, reply **`ready`**.

Never ask the user to run Storybook, relay, tests, or `pnpm` commands. Those are **your** job.

Also load [investigate-figma-mismatch](../investigate-figma-mismatch/SKILL.md) and [reference.md](./reference.md).

---

## One-line goal

```text
pnpm figma:iterate --strict        → 0   (mock golden)
pnpm figma:live-iterate --strict   → 0   (real Figma golden)
```

12 stories each. **WARN = not done** unless the user explicitly accepts WARN.

---

## Phase 1 — Mock (start here, no user input)

```
- [ ] curl -sf http://127.0.0.1:6107/index.json || pnpm storybook:serve (background)
- [ ] LOOP:
      pnpm figma:iterate
      all PASS? → Phase 2
      else: worst FAIL/WARN from figma-diffs → read region-01-compare.png
            → fix code-v2.ts or extract.ts (see classification)
            → pnpm --filter @lab/figma-importer-plugin build
            → pnpm figma:iterate --story <id> → pnpm figma:iterate
```

**Do not ask the user between mock iterations.**

### Mock evidence

- Report: `figma-diffs/report.html`
- Crops: `figma-diffs/<story>/regions/region-01-compare.png` (Storybook | Rendered)
- **Not** `diff.png` for visual judgment

### Classification

| Signal | Edit |
|--------|------|
| `pnpm test:pixel:golden` fails same story | `packages/extractor-playwright/src/extract.ts` |
| Only mock fails | `packages/figma-importer-plugin/src/code-v2.ts` |
| No story-id hacks | General rules only |

---

## Phase 2 — Live (continue after live test)

Use this section when the user says **make fixes after live test**, **continue live**, **fix after live**, or already ran `pnpm test:figma:live:golden` and wants iteration — **skip Phase 1**.

```
- [ ] figma-live-diffs/report.json exists?
      NO  → if user has not run live yet: send Figma handoff, wait for ready,
            then pnpm figma:live-iterate (golden)
      YES → pnpm figma:live-iterate:status (read failures, do NOT re-test yet)
- [ ] LOOP (live only):
      all PASS? → DONE
      else: fix from figma-live-diffs (worst FAIL/WARN)
            → build plugin
            → reload plugin + wait for **ready**
            → pnpm figma:live-iterate --story <id> → pnpm figma:live-iterate
```

**Do not** re-run mock (`figma:iterate`) unless a fix might affect extraction — then one `pnpm figma:iterate --story <id>` spot-check is enough.

---

## Phase 2 — Live (after full "run until pass" mock phase)

When mock is green enough to validate real Figma, **stop and send this to the user** (do not run live yet):

```markdown
## Run until pass — Figma needed (reply **ready**)

Mock tests are done. I need **Figma Desktop** for the real export check.

1. `pnpm figma:relay` — I'll start this if it isn't running.
2. `pnpm storybook:serve` — should already be up.
3. Figma Desktop → any file.
4. Plugins → Development → **Universal JSON Importer Lab**  
   (manifest: `packages/figma-importer-plugin/manifest.json`)
5. Leave the plugin open until it says: **Live test bridge: connected**.

No manual import — the test renders each story automatically.

Reply **ready** when connected.
```

**Wait for user reply.** Then:

```
- [ ] pnpm figma:relay (background if needed)
- [ ] pnpm figma:live-iterate   # golden live
- [ ] LOOP:
      all PASS? → DONE (report both gates)
      else: worst from figma-live-diffs → region-01-compare.png
            (storybook.png vs figma.png — NOT rendered.png)
            → fix code-v2.ts
            → pnpm --filter @lab/figma-importer-plugin build
            → tell user: reload plugin, reply **ready**
            → pnpm figma:live-iterate --story <id>
            → pnpm figma:live-iterate
```

---

## Pick next story

`pnpm figma:iterate --status` or `pnpm figma:live-iterate:status`

Order: `error` → `fail` (highest %) → `warn` (highest %).

---

## Stop conditions (only reasons to ask besides Figma ready)

1. Same story **3 live tries** with &lt;0.1% improvement.
2. Cannot start Storybook or relay in this environment.
3. User said stop.
4. Needs design/schema decision you cannot infer from screenshots.

---

## Regression guard

- If mock OK but live bad → Figma-specific fix in `code-v2.ts`, not `scene-to-html.ts` only.
- If a fix regresses another story → revert or generalize.
- Log each fix: `<story> [mock|live] — <cause> — <file>`.

---

## Commands

| Command | Use |
|---------|-----|
| `pnpm figma:iterate` | Mock golden + status |
| `pnpm figma:iterate --story <id>` | Mock one story |
| `pnpm figma:iterate --strict` | Mock done gate |
| `pnpm figma:relay` | Live relay |
| `pnpm figma:live-iterate` | Live golden + status |
| `pnpm figma:live-iterate --story <id>` | Live one story |
| `pnpm figma:live-iterate --strict` | Live done gate |
| `pnpm test:pixel:golden` | Schema check when unsure |

---

## When finished

```markdown
## Run until pass — complete

**Mock:** `pnpm figma:iterate --strict` → exit 0  
**Live:** `pnpm figma:live-iterate --strict` → exit 0  

### Fixes
1. …

Reports: figma-diffs/report.html · figma-live-diffs/report.html
```

If not finished: counts, next story, hotspot path, and whether you're **waiting for ready**.

---

## Copy-paste prompt (optional)

User can also paste:

```text
run until pass — follow .cursor/skills/figma-renderer-until-pass/SKILL.md
```
