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

## vsFigmaLive investigation — 2026-05-30 (attempt 1/5)

**Job ID:** screen_1 / vsFigmaLive  
**Failed test:** Original → Figma live (0.071% global · worst region 0.570%)  
**Primary fixer:** contract-to-figma (`code-v2.ts`)

### Triage verdict (Step 3)

**Figma live is wrong on both hotspots:** region-01 shows garbled/reversed Hebrew username label where the original PNG is correct; region-02 is missing the phone handset icon beside the Hebrew labels while text renders fine.

### Compare regions

| Region | Hotspot | Storybook/Original | Figma live | Δ | Stage |
| --- | --- | --- | --- | --- | --- |
| region-01 | user-header | Hebrew label `שם משתמש:` readable, right-aligned | Same glyphs reversed/garbled (`:שמתשמ םש`) | typography/bidi | importer |
| region-02 | phone-row | Handset icon + Hebrew `משימה מקוונת` / `טלפון` | Icon absent; Hebrew text OK | missing vector | importer |

**Artifacts:** `figma-screen-diffs/by-screen/screen_1/vsFigmaLive/regions/region-01-compare.png`, `region-02-compare.png`

### Root cause

1. **user-header (region-01):** Contract node `fig-85` (`שם משתמש:`) is stamped by `applyLiveHebrewTextRasters` before live export (abs y≈16, `figmaReferenceRaster: "text"`, PNG crop in `layer.image`), but Figma live still shows live TEXT with broken bidi instead of the reference raster — importer likely recreates figma-native TEXT from `figmaNodeType: TEXT` / node name instead of honoring `layer.image`, or the raster rect is misaligned. Manifest text has `align: right`, `direction: rtl`, `Open Sans SemiBold`; without raster, live Figma shows classic RTL character reversal.
2. **phone-row (region-02):** Contract node `fig-315` is a flip frame (`figmaRelativeTransform` scaleX≈−1) at abs (1257, 802.5) wrapping phone vector `fig-316`; `overflow: hidden` on both axes. Per [[visual/patterns/figma-guing-screen-roundtrip]] §4, `isFigmaFlipFrame` should disable clip, but the mirrored handset vector is still absent in live export — flip transform and/or residual clipping in `code-v2.ts`.

### Recommended fix area

- **`packages/figma-importer-plugin/src/code-v2.ts`**
  - **Hebrew header raster:** When `layer.image` is present and `source.dataset.figmaReferenceRaster === "text"`, force `createImageNode` and skip figma-native TEXT recreation.
  - **RTL fallback (if raster skipped):** For figma-native Hebrew TEXT, ensure `textDirection: "RTL"` + `textAlignHorizontal: "RIGHT"` from contract `text.direction` / `text.align`.
  - **Flip-frame phone icon:** Ensure flip frames never clip children; verify `applyTransform` applies scaleX=−1 without pushing vector outside visible bounds (fig-315 / fig-316).
- **Do not edit:** Storybook, `@lab/ui`, extractor, or `render-html.ts` — contract JSON is correct; failure is contract→Figma live import.

### Cached

false — full triage run (investigation-only gate; fixer agent pending)

---

## Root causes (resolved or documented — prior)

1. **Shell fill on TEXT** — avatar white box (`fillFigmaHeaderShells` skipped TEXT)
2. **GROUP absolute coords** — pagination chevrons mispositioned until rebase
3. **Flip frame clip** — phone icon missing under scaleX=-1 + overflow hidden
4. **Delivery bake** — Storybook must use original Guing PNG, not Figma live re-import
5. **Stale Storybook static** — served old assets until `storybook:build` + restart
6. **Hebrew rasters scope** — header-only; pagination broke when applied globally

## Recommended fix area (by symptom — prior)

See [[visual/patterns/figma-guing-screen-roundtrip]].

## Artifacts

- Manifest: `artifacts/figma-screens/screen_1.manifest.json`
- Contract: `artifacts/figma-screens/screen_1.contract.json`
- Original: `artifacts/figma-screens/screen_1.png`
- Figma live: `figma-screen-diffs/screen_1/rendered.png`
- Four-way: `figma-screen-diffs/screen_1/fourWay/report.html`

## Test console

Figma tab Fix / Fix all wired via `scripts/figma-entry-fix.mjs` (2026-05-27).
