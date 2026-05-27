# Storybook load timeout (infra)

## Symptom

Harness `error` with `page.goto: Timeout … networkidle`, often many stories at once; global diff 100% with empty or stale PNGs.

## Rule

This is **infrastructure overload**, not a renderer bug. Lower parallel workers / set `STORYBOOK_PARALLEL` ≤ 12, ensure Storybook is up (`pnpm storybook:serve`), re-run golden. Do not edit `code-v2.ts` or `render-html.ts` until a visual fail reproduces at modest concurrency.

## Fix area

- Primary: run settings / infra — **no adapter edit**
- Verify: `pnpm infra:health`

## Stories

- (any story during overloaded Test all)
