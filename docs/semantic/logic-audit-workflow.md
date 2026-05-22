# Logic creator workflow — test first, spec gaps

Phase **2.0** discovers behavior by **auditing the Delivery showcase**, not by guessing APIs upfront.

## Why test first

Many delivery surfaces wrap a **design-system library** (MUI showcase, future page imports). Those libraries already ship interaction logic — tabs switch, switches toggle, sliders move. Our lab components may be **visual shells** until we add `ds.*` props.

Running logic tests first answers:

| Question | Audit tells you |
| --- | --- |
| What already works? | `ds_builtin` — click → visible state change |
| What is inert markup? | `static_shell` — button/control with no reaction |
| What is display-only? | `readonly` — inputs that must not mutate |
| What spec do we still need? | Gap list → input to `docs/semantic/<Component>.md` |

## Pipeline order

```
Step 4  Delivery (visual)     Storybook · Delivery showcase · Figma  — PASS first
Step 5a Logic audit (new)     Playwright probe ?story= on :6108
Step 5b Logic creator spec    Document only what audit marked as gaps + required dev API
Step 5c Behavior golden       Formal matrix tests from signed-off spec
```

**Do not** write the full interaction matrix before **5a**. The pilot [ContentListBoard.md](./ContentListBoard.md) is a template — refine it using audit output.

## Commands

```bash
pnpm playground:serve          # Delivery showcase :6108
pnpm test:logic:audit          # smoke stories (QUICK_SMOKE)
pnpm test:logic:audit -- --all # every story in contract registry
pnpm test:logic:audit:record   # all stories + one WebM per story (by-story/*/interaction.webm)
```

Report: `logic-audit-diffs/report.html` (embeds per-story videos when recorded)

Probes use **real Playwright pointer events** (hover → click → menu pick), not programmatic `element.click()`.

Per-story video: `logic-audit-diffs/by-story/<story>/interaction.webm`

**Fix gaps in `packages/ui`** — add handlers, state, and props so controls respond. Re-run `pnpm test:logic:audit:record`.

Per story: `logic-audit-diffs/by-story/<story>/result.json`

## Result statuses

| Status | Meaning |
| --- | --- |
| **pass** | All probed controls show DS behavior or are readonly |
| **gap** | One or more controls are static shells — spec + API work needed |
| **error** | Story failed to load in Delivery showcase |

## After audit

1. Group gaps by `data-figma-component` (not every story variant needs its own spec).
2. For **ds_builtin** items: document as “provided by DS — developer passes data only”.
3. For **static_shell** items: add rows to semantic spec (`onItemAction`, `isLoading`, …).
4. Implement `ds.*` + demo routes → run formal behavior golden (Phase 2.4).

## Delivery showcase policy

The Vite app on **:6108** is the **Delivery showcase** — what developers run. Logic audit always targets:

`http://127.0.0.1:6108/?story=<story-id>`

Not Storybook directly. Visual delivery must pass before logic audit is meaningful.
