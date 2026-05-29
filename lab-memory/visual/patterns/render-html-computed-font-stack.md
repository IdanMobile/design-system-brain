# render-html: use computed font stack

## Symptom

Text renders with authored `"Roboto Mono", monospace` while Storybook computed face is `monospace` (common on `<pre>`) — box art misaligns, ~2%+ pixel drift on screen stories.

## Root cause

Extractor `stack` reflects authored/walked-up families; UA rules (e.g. `<pre>` → monospace) differ from `stack`.

## Fix

1. Extractor records `font.computedStack` from `getComputedStyle(measureEl).fontFamily`.
2. `render-html` `textFontCss()` uses `computedStack` when `whiteSpace` is `pre*`; otherwise `computedStack || stack`.
3. Do **not** force `line-height: normal` on `h1–h6` / `strong` globally — use snapped px from artifact (recovered 6 marginal stories to pass; food `h3` may still need per-story tuning).

Dedicated `<pre class="lab-retro-terminal-ascii">` uses `whiteSpace: pre` → `monospace` computed face automatically.

## Files

- `packages/contract/src/v2.ts` — `FontSpec.computedStack`
- `packages/extractor-playwright/src/extract.ts` — `buildTextSpec`
- `packages/pixel-test/src/render-html.ts` — `textFontCss`

## Verification

Re-extract story, confirm `artifact.v2.json` has `computedStack` on text nodes, then pixel golden.
