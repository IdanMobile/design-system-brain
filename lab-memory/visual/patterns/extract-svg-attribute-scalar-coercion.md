# extract: SVG attribute scalar coercion

## Symptom

Pixel fail on screens with inline SVG (e.g. `lab-neon-arcade-ship`): Storybook shows full shapes; rendered shows only sub-shapes whose attrs are pure numbers (e.g. yellow `rect`), polygons missing.

## Root cause

`extractor-playwright` `svgShape()` coerced any attribute matching `/^-?\d/` through `parseFloat`. `points="60,8 95,72 …"` became `points: 60`.

## Fix

Only coerce attrs that are **pure scalars**: `/^-?\d+(\.\d+)?$/`. Keep `points`, `d`, `viewBox`, `transform`, etc. as strings.

## Files

- `packages/extractor-playwright/src/extract.ts` — `svgShape` attribute loop

## Verification

```bash
pnpm --filter @lab/pixel-test run test:golden -- --stories lab-neonarcadescreen--default
```

Expect ship polygons in `artifact.v2.json` and global diff ≤0.1%.
