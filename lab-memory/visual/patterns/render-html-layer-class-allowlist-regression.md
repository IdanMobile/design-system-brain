# render-html: layer-class allowlist regressions

## Symptom

Adding semantic `lab-*` (or `Mui*` / `css-*`) classes to `layerClassNames()` **increases** pixel diff (e.g. meeting 0.34% → 2.6%, retro root flex 2.16% → 5.6%, MUI workspace 0.92% → 10%).

## Root cause

Replay still uses **absolute box geometry** from the artifact for most screen stories. Storybook `.lab-*` / MUI Emotion rules add **second** layout/paint (padding, flex, gradients, shadows) on top of inline `paintToBaseCss()` output → double application or conflicting placement.

## Rule

- **Do not** add root shell classes (`lab-retro-terminal`, `lab-meeting-home-earlier-card` + skip fill) without a flex/absolute audit.
- **Do not** replay `css-*` Emotion hashes — they bind to Storybook DOM order; replay body markup does not match.
- **Safe:** leaf/theme classes already paired with `usesStorybookCssPaintShell()` (glow, promo, checkout) or nodes with **no** conflicting inline padding/border in artifact.
- **Prefer:** fix inline gradient/font/border in `paintToBaseCss` / `textToHtml` over broad class allowlists on flex parents.

## Fix area

`packages/pixel-test/src/render-html.ts` — `layerClassNames`, `usesFlexFlowLayout`, `usesStorybookCssPaintShell`

## Stories

- lab-retroterminalscreen--default
- lab-meetinghomepage--default
- lab-muiworkspacescreen--default
- lab-foodfrenzyscreen--default (deal-card class alone is neutral)
