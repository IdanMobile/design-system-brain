# Investigation — screen_1 / figma-entry roundtrip

**Story / screen:** `screen_1` (Guing manifest entry)  
**Date:** 2026-05-27

## Pipeline status (handoff)

| Step | Status | Notes |
| --- | --- | --- |
| Manifest → Contract | PASS | 449 layers |
| Contract → Figma | PASS | ~0.076% global; user-header / phone-row hotspots |
| Storybook | PASS | 0% vs original after original-PNG bake + rebuild |
| 4-way | PASS | original↔storybook/reactHtml 0%; original↔figma ~0.076% |
| Logic | PASS | 4 controls audited |

## Root causes (resolved or documented)

1. **Shell fill on TEXT** — avatar white box (`fillFigmaHeaderShells` skipped TEXT)
2. **GROUP absolute coords** — pagination chevrons mispositioned until rebase
3. **Flip frame clip** — phone icon missing under scaleX=-1 + overflow hidden
4. **Delivery bake** — Storybook must use original Guing PNG, not Figma live re-import
5. **Stale Storybook static** — served old assets until `storybook:build` + restart
6. **Hebrew rasters scope** — header-only; pagination broke when applied globally

## Recommended fix area (by symptom)

See [[visual/patterns/figma-guing-screen-roundtrip]].

## Artifacts

- Manifest: `artifacts/figma-screens/screen_1.manifest.json`
- Contract: `artifacts/figma-screens/screen_1.contract.json`
- Original: `artifacts/figma-screens/screen_1.png`
- Figma live: `figma-screen-diffs/screen_1/rendered.png`
- Four-way: `figma-screen-diffs/screen_1/fourWay/report.html`

## Test console

Figma tab Fix / Fix all wired via `scripts/figma-entry-fix.mjs` (2026-05-27).

## Cached

true — patterns generalized in vault + `figma-screen-until-pass` skill
