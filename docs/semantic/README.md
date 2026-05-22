# Semantic / behavioral specs (“logic creator”)

See **[logic-audit-workflow.md](./logic-audit-workflow.md)** for the test-first pipeline.

## Flow (revised)

1. **Logic audit** (`pnpm test:logic:audit`) on Delivery showcase — what works vs gaps  
2. **Logic creator spec** per component — document **missing** developer API only (+ DS-provided behavior)  
3. **Behavior golden** — formal Playwright matrix from signed-off spec  

## What a spec covers

| Layer | In scope | Out of scope |
| --- | --- | --- |
| **Developer API** | Data props, state flags, callbacks, controlled fields | CSS, spacing, colors, typography tokens |
| **Interaction matrix** | User action → DOM change → callback | Pixel diff tolerances |
| **DS-provided** | Behavior audit marked `ds_builtin` — note “MUI Tabs”, not reinvent | — |
| **Edge cases** | loading+empty, error+retry, disabled mid-action | Figma import quirks |

Specs: `docs/semantic/<Component>.md`. Types: `packages/contract/src/semantic/`.

Pilot template: [ContentListBoard.md](./ContentListBoard.md) — refine after audit.

## Delivery showcase

Logic and behavior tests run against the **Delivery showcase** (`:6108`), not Storybook.

| Route | Purpose |
| --- | --- |
| `?story=<id>` | Frozen render — logic audit + delivery pixel tests |
| `?demo=<component>` | Interactive demo with mock data (after spec) |
| `?view=showcase` | Full catalog |
