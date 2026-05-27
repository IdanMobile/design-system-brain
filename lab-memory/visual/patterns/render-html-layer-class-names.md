# Replay Storybook class names on layers

## Symptom

Pixel fail: large flat color regions (e.g. green terminal text black on dark bg) while Storybook shows correct theme colors from CSS classes.

## Rule

`layerClassNames()` must include semantic classes from the source (e.g. `lab-retro-terminal-ascii`, component chrome classes) so replay CSS matches Storybook. Do not rely on inline color alone when the story uses class-based theme rules.

## Fix area

- Primary: `packages/pixel-test/src/render-html.ts` (`layerClassNames`, text color gating)
- Also check: `packages/extractor-playwright/src/extract.ts` if classes missing on nodes

## Stories

- lab-retroterminalscreen--default
