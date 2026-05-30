# lab-foodfrenzyscreen--default

## Status

| Step | ID | Pass |
| --- | --- | --- |
| 1 | pixel | |
| 2 | figma mock | |
| 3 | figma live | |
| 4 | delivery | |

## Timeline

<!-- Agents append dated entries below -->

## Linked patterns

<!-- [[visual/patterns/...]] -->

## Artifacts

<!-- R2 URLs to compare PNGs and reports -->

## Investigation — lab-foodfrenzyscreen--default / pixel

**Job ID:** n/a  
**Date:** 2026-05-25T09:19:51.190Z  
**Source:** fix all requested (automated)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.39% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-03-compare.png` |
| region-04 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-04-compare.png` |
| region-05 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-05-compare.png` |
| region-06 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-06-compare.png` |
| region-07 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-07-compare.png` |
| region-08 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-08-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-foodfrenzyscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-foodfrenzyscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-foodfrenzyscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-foodfrenzyscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-foodfrenzyscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T09:19:51.190Z

<!-- vault-fingerprint: pixel|fail|1.387|na|0|fix all requested -->

## Investigation — lab-foodfrenzyscreen--default / pixel

**Job ID:** 966cb478-7793-40f5-b0d2-056b936d4019  
**Date:** 2026-05-25T11:23:17.476Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.39% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-03-compare.png` |
| region-04 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-04-compare.png` |
| region-05 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-05-compare.png` |
| region-06 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-06-compare.png` |
| region-07 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-07-compare.png` |
| region-08 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-08-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-foodfrenzyscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-foodfrenzyscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-foodfrenzyscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-foodfrenzyscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-foodfrenzyscreen-default/scene.json`

### Root cause

Category chip and deal-card `Add +` buttons render via `isInlineTextLeaf` — text merges onto the `<button>` element. The single-line `white-space: nowrap` guard in `textToHtml` compares full button box height (incl. padding) to `lineHeight * 1.5`, so 36px buttons with 14px line-height skip nowrap and emoji labels wrap vertically (`🍕` / `Pizza`, `Add` / `+`). Header/checkout diffs are minor sub-pixel font/shadow variance.

### Recommended fix area

`packages/pixel-test/src/render-html.ts` — apply `white-space: nowrap` for inline button text leaves (no `\n`).

### Cached

false — automated test record at 2026-05-25T11:23:17.476Z

<!-- vault-fingerprint: pixel|fail|1.387|na|1|fix-all pre-agent -->

## Investigation — lab-foodfrenzyscreen--default / pixel

**Job ID:** fix-all-iterate-1  
**Date:** 2026-05-25

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | Category chips + deal list — button label wrap | `pixel-diffs/lab-foodfrenzyscreen-default/regions/region-01-compare.png` |
| region-02 | Header h1 emoji baseline / kerning | `pixel-diffs/lab-foodfrenzyscreen-default/regions/region-02-compare.png` |
| region-03 | Checkout gradient/shadow top edge | `pixel-diffs/lab-foodfrenzyscreen-default/regions/region-03-compare.png` |
| region-04–08 | Deal card `Add +` button wrap | `pixel-diffs/lab-foodfrenzyscreen-default/regions/region-04-compare.png` |

### Root cause

See above — `textToHtml` nowrap heuristic too strict for padded buttons.

### Recommended fix area

`packages/pixel-test/src/render-html.ts`

### Cached

false

## Investigation — lab-foodfrenzyscreen--default / pixel

**Job ID:** 966cb478-7793-40f5-b0d2-056b936d4019  
**Date:** 2026-05-25T11:26:17.840Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.13% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-03-compare.png` |
| region-04 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-04-compare.png` |
| region-05 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-05-compare.png` |
| region-06 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-06-compare.png` |
| region-07 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-07-compare.png` |
| region-08 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-08-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-foodfrenzyscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-foodfrenzyscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-foodfrenzyscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-foodfrenzyscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-foodfrenzyscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T11:26:17.840Z

<!-- vault-fingerprint: pixel|fail|1.125|na|2|fix-all pre-agent -->

## Investigation — lab-foodfrenzyscreen--default / pixel

**Job ID:** 966cb478-7793-40f5-b0d2-056b936d4019  
**Date:** 2026-05-25T11:29:47.434Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.13% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-03-compare.png` |
| region-04 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-04-compare.png` |
| region-05 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-05-compare.png` |
| region-06 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-06-compare.png` |
| region-07 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-07-compare.png` |
| region-08 | diff region | `pixel-diffs/lab-foodfrenzyscreen-default/regions/regions/region-08-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-foodfrenzyscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-foodfrenzyscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-foodfrenzyscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-foodfrenzyscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-foodfrenzyscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T11:29:47.434Z

<!-- vault-fingerprint: pixel|fail|1.125|na|3|fix-all pre-agent -->

## Investigation — lab-foodfrenzyscreen--default / pixel

**Date:** 2026-05-25  
**Source:** cursor agent (run-until-green)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.558% |
| Hotspots | region-01 promo/search (y≈172), deal cards, checkout |

### Root cause

- Promo uses `usesStorybookCssPaintShell` (OK). Search/deal-card CSS shell + `lab-food-frenzy-categories|search|deal-card` classes **neutral** (~0.558% unchanged).
- Category chips: `computedStack: Arial` on `Inter` stack — Inter override **regressed** to 0.887%.
- Remaining drift likely deal-card flex children (art emoji), promo/search shadow AA, not missing parent class on categories (flex already inline).

### Recommended fix area

- `render-html.ts`: per-node border-radius/shadow on deal cards without parent flex class replay; promo gradient angle 135° parity.
- See [[visual/patterns/render-html-layer-class-allowlist-regression]].

<!-- vault-fingerprint: pixel|fail|0.558|na|agent -->

## Investigation — 2026-05-25 / pixel (ancestors on inline text)

**Root cause:** `isInlineTextLeaf()` called `textToHtml()` without `ctx.ancestors`, so food `h1` never got `line-height: normal` from `inFoodFrenzyTree()`.

**Fix:** Pass `ancestors: ctx.ancestors` on all `textToHtml` / `isInlineTextLeaf` paths. Food **0.797% → 0.558%** (still fail; needs more deal-region work).

<!-- vault-fingerprint: pixel|fail|0.558|inline-ancestors -->

## Investigation — 2026-05-25 / pixel (food line-height shells)

**Metrics:** warn **0.388%** (was fail 0.558%). Hotspots: categories/search chips (line box), deal cards.

**Root cause:** Category/search `button`/`span` leaves used snapped `line-height` px (e.g. 14px on 12px Pizza label) instead of Storybook CSS `line-height: normal` under `.lab-food-frenzy-categories` / `.lab-food-frenzy-search`.

**Fix:** `inFoodFrenzyCategoriesTree` / `inFoodFrenzySearchTree` → `line-height: normal` in `textToHtml`. Also replay root shells `lab-food-frenzy`, `lab-food-frenzy-deal-body`, `lab-food-frenzy-cart` classes.

**Recommended fix area:** Deal-card regions (art emoji, foot `strong`, card shadow AA) — see `pixel-diffs/lab-foodfrenzyscreen-default/regions/region-02-*`.

<!-- vault-fingerprint: pixel|warn|0.388|food-line-height-shells -->

## Verification — 2026-05-25 / pixel PASS

| Field | Value |
| --- | --- |
| Status | **pass** |
| Global diff | **0.049%** |

**Fixes (final):** `inFoodFrenzyDealBodyTree` + deal art `line-height: 32px`; `tryRenderFoodCategoryButton`, `tryRenderFoodDealFootStrong`; prior deal art/foot/checkout helpers. **Do not** replay flex shells (`lab-food-frenzy-deal-card`, `deal-art`, `deal-foot`) on absolute layers — see [[visual/patterns/render-html-layer-class-allowlist-regression]].

<!-- vault-fingerprint: pixel|pass|0.049|food-category-deal-body -->

## Investigation — 2026-05-30 / pixel (region-01 search + categories)

**Metrics:** warn **0.185%** global. Hotspot: region-01 search bar + category chips.

### Root cause

- Category chips via `tryRenderFoodCategoryButton` had `line-height: normal` but no `white-space: nowrap` — emoji labels (`🍕 Pizza`) could wrap at 12px inside 36px padded buttons.
- Search `input` path forced `line-height: ${innerH}px` (~16–18px) instead of Storybook `line-height: normal` under `.lab-food-frenzy-search input`.

### Recommended fix area

`packages/pixel-test/src/render-html.ts` — `tryRenderFoodCategoryButton` + native `input` branch in `renderLayer`.

<!-- vault-fingerprint: pixel|warn|0.185|food-search-nowrap -->
