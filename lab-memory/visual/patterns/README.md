# Patterns

**Primary visual-track asset** — reusable adapter rules discovered across stories.

## When to add

After a fix reaches **PASS** and the change is a **general rule** (not a story-id hack):

1. Copy `templates/pattern.md` → `visual/patterns/<short-slug>.md`
2. Fill **Symptom**, **Rule**, **Fix area**, **Stories**
3. Link from investigations: `[[visual/patterns/<short-slug]]`

## When not to add

- Infra-only failures (use [[visual/patterns/infra-storybook-timeout]] or re-run tests)
- Storybook source/content fixes (flaky asset, wrong story props)
- One-off offsets with no general condition

## Index

| Pattern | Fix area |
| --- | --- |
| [[render-html-button-appearance]] | `render-html.ts` buttons |
| [[render-html-pre-whitespace]] | `render-html.ts` text / pre |
| [[render-html-layer-class-names]] | `render-html.ts` CSS classes |
| [[render-html-layer-class-allowlist-regression]] | `render-html.ts` — when classes hurt |
| [[render-html-computed-font-stack]] | `render-html.ts` + extractor `computedStack` |
| [[extract-svg-attribute-scalar-coercion]] | `extract.ts` SVG attrs |
| [[figma-guing-screen-roundtrip]] | Guing manifest entry — adapter, live, bake, 4-way |
| [[infra-storybook-timeout]] | No code — concurrency / Storybook |
