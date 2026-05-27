# Button appearance reset with schema border

## Symptom

Pixel (schema) fail: Storybook shows transparent/glass buttons; rendered replay has solid white or native button chrome. Hotspots on footer CTAs and bordered buttons.

## Rule

Always emit `appearance: none` and `outline: none` on button layers. Only gate `background: transparent` and `border: none` when the schema has no border/fill — never skip appearance reset because a border exists.

## Fix area

- Primary: `packages/pixel-test/src/render-html.ts` (`paintToBaseCss` / button branch)
- Also check: `packages/extractor-playwright/src/extract.ts` if border/fill missing in JSON

## Stories

- lab-retroterminalscreen--default
