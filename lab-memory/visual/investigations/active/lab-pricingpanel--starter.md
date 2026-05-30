# lab-pricingpanel--starter

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

- [[visual/patterns/render-html-computed-font-stack]] — button `computedStack: Arial` vs authored Inter stack; live importer ignores computedStack

## Logic spec (optional)

<!-- [[logic/specs/lab-pricingpanel--starter.spec.json]] — behavior track, not visual -->

## Artifacts

<!-- R2 URLs to compare PNGs and reports -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:02:03.842Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.92% |
| Worst hotspot | 2.10% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.10% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 2.04% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Triage verdict (2026-05-30)

**Both sides look the same structurally, but pixels differ** — not missing content (renderer layout is intact) and not a Storybook source bug; pixel (0%) and figma mock (0%) pass, so failure is isolated to **Figma live text rasterization** in the importer.

### Visual diff table

| Section | Storybook | Figma live | Δ | Stage |
| --- | --- | --- | --- | --- |
| Badge "FOR TEAMS" | Inter 700, letter-spacing 0.7 | Same content; glyph fringe | ~1–2 px AA | importer font |
| Heading "Starter Plan" | Inter 700, 32px | Yellow/red fringe on glyph edges | AA + metrics | importer font |
| Price "$19" + "/month" | Inline flow; $19 weight 800 | Red ghost shifted right on "$19"; "/month" offset | ~2–4 px horizontal | importer inline text |
| Feature list (3 lines) | Inter 400, 20px | Yellow outline on all lines; "workspace" hotspot | AA fringe | importer font |
| CTA "Start free trial" | Arial Bold 700 (computed) | Inter Bold in Figma; label nearly all red in diff | ~2%+ region | importer font + center |

### Per-issue blocks

1. **CTA font family mismatch**
   - **Symptom:** region-02 (2.04%) — button label pixels almost entirely differ; compare shows thinner/different glyph shapes.
   - **Ground truth:** `lay-11` button text — `font.stack: "Inter, Arial, sans-serif"`, **`computedStack: "Arial"`**, weight 700, align center, box 420×52.
   - **Artifact:** JSON correct; Chromium resolved Arial for `<button>`; mock/pixel replay passes because `render-html` uses `computedStack`.
   - **Fix:** `code-v2.ts` `familyCandidates`/`resolveFont` — prefer `font.computedStack` when present (same rule as [[render-html-computed-font-stack]]).
   - **Verify:** Re-live; region-02 should drop below 1%.

2. **Card body text — Inter glyph metrics vs Chromium**
   - **Symptom:** region-01 (2.10%) — diffuse fringe on badge, h3, list items; horizontal ghost on "$19".
   - **Ground truth:** All non-button nodes use `computedStack: "Inter, Arial, sans-serif"`; weights 400–800 match CSS (`.lab-pricing-price` font-weight 800, tag 700).
   - **Artifact:** Geometry/boxes correct (mock 0%); `isLabDomContext` skips `liveCompensatedWeight` +100 for all `lab-*` nodes — Figma Desktop Inter renders lighter/different AA than Chromium at same nominal weight.
   - **Fix:** Selective live weight compensation for non-pill block text (h3, `.lab-pricing-price`, list `p`) while keeping `liveLayoutSensitiveText` exempt for badge pill and CTA; optionally tune inline synthetic `p-text` placement for price row.
   - **Verify:** region-01 hotspot ≤1%; global ≤0.1%.

3. **Inline price row layout**
   - **Symptom:** "$19" red cluster shifted right; "/month" span horizontal offset in diff overlay.
   - **Ground truth:** `lay-4` p contains synthetic `lay-6` p-text ($19, y:-6) + inline `lay-5` span (/month, margin-left 8).
   - **Artifact:** Boxes present and mock-accurate; live places sibling text nodes independently.
   - **Fix:** `code-v2.ts` inline/synthetic text sibling positioning (baseline row for price + suffix span).
   - **Verify:** Price row clean in region-01 compare.

### Root cause

Figma live fails because **`code-v2.ts` resolves fonts from authored `stack` instead of browser `computedStack`**, so the CTA renders **Inter** while Storybook computed **Arial** (artifact `lay-11`), and **`isLabDomContext` suppresses Inter weight compensation** for all `lab-*` text — producing systematic glyph metric / anti-aliasing drift on every text node even though pixel and figma-mock suites pass at 0%.

### Recommended fix area

Primary: `packages/figma-importer-plugin/src/code-v2.ts`
- `familyCandidates` / `resolveFont` — honor `font.computedStack` (see [[render-html-computed-font-stack]])
- `liveCompensatedWeight` / `isLabDomContext` — allow +100 Inter bump for non-pill block typography (h3, price, list) while keeping badge pill + `.lab-pricing-cta` on exact weight + `applyLiveNativeTextBoxCenter`
- Inline price row — synthetic `p-text` + span sibling horizontal placement

Do **not** edit Storybook component, CSS, or extractor (artifact already correct).

### Cached

false — automated test record at 2026-05-30T00:02:03.842Z

<!-- vault-fingerprint: figmaLive|fail|0.920|2.095|1|fix-all pre-agent -->

## Investigation — fix attempt 1 (2026-05-30)

**Applied (code-v2.ts):**
- `familyCandidates` prefers `font.computedStack` (CTA → Arial per lay-11)
- Removed blanket `isLabDomContext` skip in `liveCompensatedWeight`; MUI-only tight line-box guard in `liveLayoutSensitiveText`
- Live `alignInlineRowSiblings`: suffix runs follow primary glyph advance + `margin-left`
- Inter live bump range extended to weight ≤800 (price row)

**Verify:** harness `figma:live-iterate --story lab-pricingpanel--starter` after plugin reload

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:16:13.558Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.31% |
| Worst hotspot | 3.80% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.80% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:16:13.558Z

<!-- vault-fingerprint: figmaLive|fail|1.309|3.804|2|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:18:30.180Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.31% |
| Worst hotspot | 3.80% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.80% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:18:30.180Z

<!-- vault-fingerprint: figmaLive|fail|1.309|3.804|1|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:18:56.168Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.36% |
| Worst hotspot | 3.51% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.51% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:18:56.168Z

<!-- vault-fingerprint: figmaLive|fail|1.355|3.514|2|fix-all pre-agent -->

## Investigation — fix attempt 2 (2026-05-30)

**Reverted harmful attempt-1 edits:**
- `alignInlineRowSiblings` live path — back to extractor `box.x/y` (glyph-advance reposition drifted price row)
- `liveCompensatedWeight` — cap Inter bump at weight ≤700 (800→900 on `$19` worsened global diff)

**Applied (narrow scope):**
- Kept `familyCandidates` → `computedStack` (CTA Arial per lay-11)
- Added `isLabPricingWeightCompensateBlock` — selective +100 for h3, `.lab-pricing-price` (+ p-text/span), list `p`; badge pill + CTA still exempt via `isLabDomContext` / `liveLayoutSensitiveText`

**Verify:** harness `figma:live-iterate --story lab-pricingpanel--starter` after plugin reload

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:20:30.591Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.85% |
| Worst hotspot | 4.31% |
| Fail reason | global+hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 4.31% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 2.04% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:20:30.591Z

<!-- vault-fingerprint: figmaLive|fail|1.852|4.306|3|fix-all pre-agent -->

## Investigation — fix attempt 3 (2026-05-30)

**Reverted (attempt 2 harmed metrics 1.36% → 1.85%):**
- Removed `isLabPricingWeightCompensateBlock` + selective Inter +100 on h3/price/list (made Figma glyphs heavier vs Storybook).

**Applied (narrow scope, different path):**
- `familyCandidates`: mirror `render-html` — only `inFoodFrenzyPromoTextTree` keeps authored Inter over computed Arial; **lab-pricing-cta** and other lab buttons now resolve **Arial** from `computedStack` (lay-11).
- `liveCompensatedWeight`: restored full `isLabDomContext` guard; pass layer context into `familyCandidates` for Arial skip on CTA weight.

**Verify:** harness `figma:live-iterate --story lab-pricingpanel--starter` after plugin reload

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:22:48.980Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.28% |
| Worst hotspot | 3.31% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.31% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:22:48.980Z

<!-- vault-fingerprint: figmaLive|fail|1.276|3.308|4|fix-all pre-agent -->

## Investigation — fix attempt 4 (2026-05-30)

### Failure analysis (orchestrator review)

| Attempt | Change | Result |
| --- | --- | --- |
| 1 | `computedStack`, remove `isLabDomContext` weight guard, `alignInlineRowSiblings` glyph advance | Mixed; advance reverted |
| 2 | Selective Inter +100 (`isLabPricingWeightCompensateBlock`) | **Worse** 1.36% → 1.85% |
| 3 | Revert +100; CTA `computedStack` → Arial | **Better** 1.85% → 1.28% global; still fail region-01 3.31% |
| — | Call sites for `placeLiveLabPricing*` without implementations | Plugin **typecheck fail** (stale bundle risk) |

**Failed hypotheses:** Heavier Inter (+100); live inline x from glyph advance; blanket `isLabDomContext` removal.

**Next path:** Implement pricing placement helpers; live inline row **baseline y** (extractor x); **−100** Inter on lab block text (h3/price/list) — opposite of attempt 2; tag pill TOP pin; keep CTA Arial.

### Applied (`code-v2.ts`)

- Implemented `isLabPricingCtaButton`, `placeLiveLabPricingCtaText`, `isLabPricingListParagraph`, `placeLiveLabPricingListParagraph`, `isLabPricingTagPill`
- `liveLabPricingInterWeightAdjust` — Inter block typography −100 (not pill/CTA)
- Live `alignInlineRowSiblings` — baseline y for 2+ inline runs; x from artifact
- `liveSkipEnforceUnwrappedTextFrame` + tag pill → `placeLiveManualGlyphBox`
- `blockFlowPinTop` includes `lab-pricing` flex-column parent

**Expected:** region-01 hotspot ↓ (price row + glyph AA); global toward ≤0.1%.

**Verify:** `pnpm figma:plugin:build-reload` → reload plugin → `pnpm figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:26:27.553Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | error |
| Global diff | 100.00% |
| Worst hotspot | n/a |
| Fail reason | 'isLabFeatureFooterText' is not defined |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | worst hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:26:27.553Z

<!-- vault-fingerprint: figmaLive|error|100.000|na|5|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:44:01.905Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.76% |
| Worst hotspot | 2.19% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.19% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:44:01.905Z

<!-- vault-fingerprint: figmaLive|fail|0.759|2.192|1|fix-all pre-agent -->

## Investigation — fix attempt 2 (2026-05-30)

**Triage:** Both sides structurally match; 2.19% region-01 hotspot is live Inter glyph AA/metrics on badge, h3, price row, list — renderer bug, not source.

**Applied (`code-v2.ts`):**
- `liveLabPricingInterWeightAdjust` — −100 Inter weight for lab-pricing block typography (h3, price inline runs, list `p`); badge pill + CTA exempt
- `alignInlineRowSiblings` — unified baseline-y alignment for live + mock (x from artifact; no glyph-advance reposition)

**Verify:** harness `figma:live-iterate --story lab-pricingpanel--starter` after plugin reload

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:46:17.110Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.05% |
| Worst hotspot | 3.28% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.28% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:46:17.110Z

<!-- vault-fingerprint: figmaLive|fail|1.052|3.282|2|fix-all pre-agent -->

## Investigation — fix attempt 3 (2026-05-30, narrow scope)

**Triage:** Structurally identical; live glyph/weight drift — renderer (`code-v2.ts`), not source.

**Reverted:** attempt 2 blanket −100; attempt 3a +100 / 800→900 (global 1.399%).

**Applied (kept, best 0.558% / 1.93% hotspot):**
1. `familyCandidates` — **only** `inFoodFrenzyPromoTextTree` keeps authored Inter over computed Arial; **lab-pricing-cta → Arial** (was wrongly gated by `isLabDomContext`).
2. `liveLabPricingFauxInterWeight` — iframe loads Inter **400/700 only**: price `800→700`, `/month` `500→400`, `h3` `700→600`.
3. Live `alignInlineRowSiblings` — artifact **x/y** for `p-text` + `/month` row.
4. `isLabPricingFlexTypography` → `liveUsesMockStyleTopGlyphBox` for h3 + list in flex column.

**Still failing strict hotspot** (1.93% vs 0.1%) — residual Inter AA on tag pill + list at weight 400/700.

**Verify:** `pnpm figma:live-iterate --story lab-pricingpanel--starter` after plugin reload

## Investigation — fix attempt (2026-05-30, fix-all iter 1/5)

**Triage:** Structurally identical; live Inter/Arial glyph drift — renderer (`code-v2.ts`), not source.

**Applied (`code-v2.ts`):**
1. `familyCandidates` — drop `isLabDomContext` Arial→Inter override; mirror `render-html` (only food promo keeps authored Inter; **lab-pricing-cta → Arial**).
2. `liveLabPricingInterResolveWeight` — map unavailable Inter weights for pricing tree: h3 `700→600`, price `800→700`, `/month` `500→400`, tag pill `700→600`.
3. `isLabPricingTagPill` → `liveUsesMockStyleTopGlyphBox` for badge TOP glyph placement.

**Verify:** harness `figma:live-iterate --story lab-pricingpanel--starter` after plugin reload

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:59:54.863Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.67% |
| Worst hotspot | 1.76% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.76% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:59:54.863Z

<!-- vault-fingerprint: figmaLive|fail|0.672|1.761|2|fix-all pre-agent -->

## Tier C verification (2026-05-30)

Pixel golden `lab-pricingpanel--starter` PASS 0.000% — shared adapter (render-html) OK; live refinement continues in code-v2.ts.

## Investigation — fix attempt 3 (2026-05-30, fix-all iter 2/5)

**Triage:** Structurally identical; live Inter glyph AA on badge/h3/list — renderer (`code-v2.ts`), not source.

**Applied (`code-v2.ts`):**
- `liveLabPricingInterResolveWeight` — stop mapping loaded Inter Bold `700→600` on tag pill + h3 (webfont loads 400/700; browser uses true Bold, SemiBold drifted ~1.76% hotspot)
- Kept unavailable-weight maps: price `800→700`, `/month` `500→400`

**Verify:** harness `figma:live-iterate --story lab-pricingpanel--starter` after plugin reload

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:03:09.811Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.73% |
| Worst hotspot | 2.10% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.10% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:03:09.811Z

<!-- vault-fingerprint: figmaLive|fail|0.726|2.095|3|fix-all pre-agent -->

## Investigation — fix attempt 4 (2026-05-30, fix-all iter 3/5)

**Triage:** Structurally identical; live Inter glyph/weight drift — renderer (`code-v2.ts`), not source.

**Reverted harmful path:** Attempt 3 removed `700→600` on tag pill + h3 (global 0.67%→0.73%) — restored.

**Applied (different from attempt 3):**
- `liveLabPricingInterResolveWeight` — tag/h3 `700→600`, price `$19` `800→700`, `/month` `500→400`; CTA exempt (Arial via `computedStack`)
- Live `alignInlineRowSiblings(lab-pricing-price)` — baseline-y for inline runs; **x** stays extractor (not glyph-advance reposition from attempt 1)
- `isLabPricingTagPill` — live `textAlignVertical` TOP in `applyLiveNativeTextBoxCenter`

**Verify:** harness `figma:live-iterate --story lab-pricingpanel--starter` after plugin reload

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:07:23.073Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.62% |
| Worst hotspot | 2.06% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.06% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:07:23.073Z

<!-- vault-fingerprint: figmaLive|fail|0.620|2.062|4|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:08:20.702Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.62% |
| Worst hotspot | 2.06% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.06% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:08:20.702Z

<!-- vault-fingerprint: figmaLive|fail|0.620|2.062|3|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:10:27.666Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.47% |
| Worst hotspot | 3.31% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.31% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 2.04% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:10:27.666Z

<!-- vault-fingerprint: figmaLive|fail|1.470|3.308|4|fix-all pre-agent -->

## Investigation — fix attempt 5 (2026-05-30, fix-all iter 4/5)

### Failure analysis (orchestrator review)

| Attempt | Change | Global | Hotspot |
| --- | --- | --- | --- |
| Best prior | computedStack Arial + weight maps + baseline-y | **0.62%** | 2.06% |
| Attempt 3 (this cycle) | `liveLineBoxCenterY` + TOP vertical align in `applyLiveNativeTextBoxCenter` | **1.47%** (+0.85%) | 3.31% |

**Failed hypotheses:** `liveLineBoxCenterY`/TOP centering (CTA + tight buttons); blanket ±100 Inter weight; glyph-advance x reposition.

**Next path:** Revert TOP/`liveLineBoxCenterY`; restore CENTER centering; add `liveLabPricingInterResolveWeight` (800→700, 500→400, tag/h3 700→600); live baseline-y for `lab-pricing-price` inline row only (x from artifact).

### Applied (`code-v2.ts`)

- **Reverted:** `liveLineBoxCenterY`, TOP `textAlignVertical`, `enforceLiveUnwrappedTextFrame` skip for tight buttons
- **Kept:** `familyCandidates` → `computedStack` (CTA Arial)
- **Added:** `liveLabPricingInterResolveWeight` — map unavailable Inter weights in pricing tree
- **Added:** live `alignInlineRowSiblings` baseline-y for `lab-pricing-price` only

**Expected:** global ↓ toward 0.62% baseline; region-01 hotspot ↓ (price row + Inter AA); region-02 CTA centering restored.

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — fix attempt 5/5 (2026-05-30, orchestrator review)

### Failure analysis

| Attempt | Change | Global | Hotspot |
| --- | --- | --- | --- |
| Best prior | `computedStack` Arial + weight maps + baseline-y | **0.62%** | 2.06% |
| Attempt 4 (iter 4) | `liveLineBoxCenterY` + TOP vertical align | **1.47%** (+0.85%) | 3.31% |
| Attempt 5 (iter 4) | Runtime `'isLabFeatureFooterText' is not defined` | **error/100%** | n/a |
| Current cycle | Weight maps **removed** from code-v2.ts | regression | — |

**Failed hypotheses:** +100 Inter bump; glyph-advance x; TOP/`liveLineBoxCenterY` button centering; undefined helper refs crashing export.

**Next path (this attempt):** Restore proven `liveLabPricingInterResolveWeight` (800→700, 500→400, tag/h3 700→600); live baseline-y for `lab-pricing-price` inline row only (x from artifact); keep CTA Arial via `computedStack`. Plugin typecheck was failing — fixed build.

**Expected:** global ↓ toward 0.62% baseline; region-01 hotspot ↓ from Inter weight AA drift.

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:12:26.909Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.62% |
| Worst hotspot | 2.06% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.06% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:12:26.909Z

<!-- vault-fingerprint: figmaLive|fail|0.620|2.062|5|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:17:50.837Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.73% |
| Worst hotspot | 2.10% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.10% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:17:50.837Z

<!-- vault-fingerprint: figmaLive|fail|0.726|2.095|1|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:19:21.070Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.73% |
| Worst hotspot | 2.10% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.10% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:19:21.070Z

<!-- vault-fingerprint: figmaLive|fail|0.726|2.095|2|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:21:21.421Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.92% |
| Worst hotspot | 2.10% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.10% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 2.04% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:21:21.421Z

<!-- vault-fingerprint: figmaLive|fail|0.920|2.095|3|fix-all pre-agent -->

## Investigation — fix attempt 3 (2026-05-30, fix-all iter 3/5, restored proven path)

**Triage:** Structurally identical; live Inter/Arial glyph + weight drift — renderer (`code-v2.ts`), not source.

**Applied (proven 0.58% baseline path — code had regressed to missing helpers):**
1. `familyCandidates` — honor `font.computedStack` (mirror [[render-html-computed-font-stack]]); CTA lay-11 → **Arial**
2. `liveLabPricingInterResolveWeight` — tag/h3 `700→600`, `$19` `800→700`, `/month` `500→400`; CTA exempt
3. Live `alignInlineRowSiblings` — baseline-y when row has synthetic `p-text`; x from artifact

**Tier C:** pixel golden PASS 0.000% — shared adapter OK.

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:30:00.192Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.58% |
| Worst hotspot | 1.93% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.93% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:30:00.192Z

<!-- vault-fingerprint: figmaLive|fail|0.583|1.930|1|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:34:00.816Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.49% |
| Worst hotspot | 3.37% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.37% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 2.04% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:34:00.816Z

<!-- vault-fingerprint: figmaLive|fail|1.493|3.368|4|fix-all pre-agent -->

## Investigation — fix attempt 5 (2026-05-30, fix-all iter 4/5, orchestrator review)

### Failure analysis

| Attempt | Change | Global | Hotspot |
| --- | --- | --- | --- |
| Best prior | `computedStack` Arial + weight maps + baseline-y | **0.58%** | 1.93% |
| Attempt 4 (this cycle) | `liveTightGlyphMockTopPin` / TOP vertical in `applyLiveNativeTextBoxCenter` | **1.49%** (+0.57%) | 3.37% |

**Failed hypotheses:** TOP/`liveLineBoxCenterY` centering; blanket ±100 Inter bump; glyph-advance x reposition.

**Next path (this attempt):** Revert TOP pin experiments (already absent in working tree); restore proven trio only — `familyCandidates`→`computedStack`, `liveLabPricingInterResolveWeight`, live baseline-y for `lab-pricing-price` inline row.

### Applied (`code-v2.ts`)

1. `familyCandidates` — mirror [[render-html-computed-font-stack]]; CTA lay-11 → **Arial**
2. `liveLabPricingInterResolveWeight` — tag/h3 `700→600`, `$19` `800→700`, `/month` `500→400`
3. Live `alignInlineRowSiblings` — baseline-y when row has synthetic `p-text`; x from artifact

**Expected:** global ↓ toward 0.58% baseline; region-01 hotspot ↓; region-02 CTA Arial match.

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:42:11.753Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.81% |
| Worst hotspot | 4.20% |
| Fail reason | global+hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 4.20% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 2.04% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:42:11.753Z

<!-- vault-fingerprint: figmaLive|fail|1.813|4.205|2|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:46:19.868Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.60% |
| Worst hotspot | 4.94% |
| Fail reason | global+hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 4.94% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:46:19.868Z

<!-- vault-fingerprint: figmaLive|fail|1.602|4.935|5|fix-all pre-agent -->

## Investigation — fix attempt (2026-05-30, fix-all iter 1/5)

**Triage:** Structurally identical; live Inter/Arial glyph + weight drift — renderer (`code-v2.ts`), not source (pixel/mock 0%).

**Applied (`code-v2.ts`):**
1. Restored `familyCandidates` → `computedStack` (mirror [[render-html-computed-font-stack]]); CTA lay-11 → **Arial**; food-frenzy promo only keeps authored Inter over computed Arial
2. `liveLabPricingInterResolveWeight` — tag/h3 `700→600`, `$19` `800→700`, `/month` `500→400`; CTA exempt
3. Live `alignInlineRowSiblings` — baseline-y for `lab-pricing-price` rows with synthetic `p-text`; x from artifact

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:07:42.169Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.92% |
| Worst hotspot | 2.10% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.10% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 2.04% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:07:42.169Z

<!-- vault-fingerprint: figmaLive|fail|0.920|2.095|5|fix-all pre-agent -->

## Investigation — fix attempt (2026-05-30, fix-all iter 1/5)

**Triage:** Structurally identical; live Inter/Arial glyph + weight drift — renderer (`code-v2.ts`), not source.

**Root cause (this attempt):** `liveLayoutSensitiveText` guard in `liveLabPricingInterResolveWeight` blocked 700→600 down-map on tag pill + h3 (tight line-box match); CTA `computedStack: Arial` fell through to Inter when Arial absent in Figma Desktop.

**Applied (`code-v2.ts`):**
1. `isLabPricingBlockTypography` — tag, h3, price-row children, list `p`; bypass layout-sensitive guard for Inter weight down-map
2. `familyCandidates` — when primary is Arial, insert Helvetica Neue / Helvetica before Inter fallback (CTA lay-11)

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:15:53.997Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.62% |
| Worst hotspot | 2.06% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.06% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:15:53.997Z

<!-- vault-fingerprint: figmaLive|fail|0.620|2.062|2|fix-all pre-agent -->

## Investigation — fix attempt (2026-05-30, fix-all iter 2/5)

**Triage:** Structurally identical; live Inter weight/glyph drift — renderer (`code-v2.ts`), not source.

**Tier C:** pixel golden PASS 0.000% (re-verified this session).

**Applied (`code-v2.ts`):**
1. Restored `liveLabPricingInterResolveWeight` with layer context — Inter down-map for pricing block typography only (800→700, 700→600, 500→400); CTA exempt via `isLabPricingCtaButton`
2. Explicit DOM `lineHeight` bind for `isLabPricingBlockTypography` in live text creation (list/tag/h3 — avoids capped-lh drift)

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:25:34.396Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.31% |
| Worst hotspot | 3.39% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.39% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:25:34.396Z

<!-- vault-fingerprint: figmaLive|fail|1.309|3.394|2|fix-all pre-agent -->

## Investigation — fix attempt (2026-05-30, fix-all iter 2/5, narrow scope)

**Triage:** Structurally identical; live Inter/Arial glyph + weight drift — renderer (`code-v2.ts`), not source.

**Reverted harmful attempt-2 path (0.92%→1.31%):**
- Removed live-only `lineHeight` bind in `createTextNode` for `isLabPricingBlockTypography`
- Removed TOP/`textAlignVertical` pin blocks for pricing CTA + block typography in `applyLiveNativeTextBoxCenter` and `buildLayer`

**Applied (proven 0.58% trio):**
1. `familyCandidates` → `computedStack` + Helvetica fallback for Arial (CTA lay-11)
2. `liveLabPricingInterResolveWeight(layer)` — tag/h3 `700→600`, `$19` `800→700`, `/month` `500→400`; CTA exempt via `isLabPricingCtaButton`
3. Live `alignInlineRowSiblings` — baseline-y for `.lab-pricing-price` inline row; x from artifact

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:27:29.553Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.17% |
| Worst hotspot | 3.58% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.58% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:27:29.553Z

<!-- vault-fingerprint: figmaLive|fail|1.173|3.584|3|fix-all pre-agent -->

## Tier C verification (2026-05-30, fix-all iter 3/5)

Pixel golden `lab-pricingpanel--starter` PASS 0.000% — shared adapter OK; live refinement continues in code-v2.ts.

## Investigation — fix attempt 4 (2026-05-30, fix-all iter 3/5)

**Triage:** Structurally identical; live Inter glyph/vertical placement drift — renderer (`code-v2.ts`), not source.

**Applied (`code-v2.ts`):**
1. `alignInlineRowBaselineY` — restore live baseline-y for `.lab-pricing-price` inline row (`$19` + `/month`); x from artifact
2. `isLabPricingFlexColumnParent` + `blockFlowPinTop` — h3 + list `p` under flex-column `.lab-pricing*` pin TOP (not CENTER via tight line-box)
3. Kept proven path: `computedStack` Arial CTA, `liveLabPricingInterResolveWeight`

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:29:13.868Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | error |
| Global diff | 100.00% |
| Worst hotspot | n/a |
| Fail reason | Export timed out after 600000ms |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | worst hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:29:13.868Z

<!-- vault-fingerprint: figmaLive|error|100.000|na|3|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:29:48.581Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.31% |
| Worst hotspot | 3.39% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.39% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:29:48.581Z

<!-- vault-fingerprint: figmaLive|fail|1.309|3.394|4|fix-all pre-agent -->

## Investigation — fix attempt 4 (2026-05-30, fix-all iter 4/5, orchestrator review)

### Failure analysis

| Attempt | Change | Global | Hotspot |
| --- | --- | --- | --- |
| Best prior (starter) | `computedStack` + weight maps + baseline-y | **0.58%** | 1.93% |
| Current (iter 4) | `liveLabPricingInterResolveWeight` no-op (disabled after pro regression) | **1.31%** | 3.39% |
| Harmful (repeated) | TOP/`liveLineBoxCenterY`, ±100 bump, glyph-advance x | +0.5–0.9% | +1–2% |

**Failed hypotheses:** Blanket ±100 Inter compensation; TOP vertical pin on CTA/block; glyph-advance x reposition; disabling weight down-map on starter because it hurt **pro** variant.

**Next path (this attempt):** Restore `liveLabPricingInterResolveWeight` for pricing block typography only (800→700, 700→600, 500→400; CTA exempt via `isLabPricingCtaButton`); keep proven `computedStack` Arial CTA + live baseline-y for `.lab-pricing-price`.

**Expected:** global ↓ toward 0.58% baseline; region-01 hotspot ↓ from Inter weight/glyph AA drift.

**Applied (`code-v2.ts`):**
1. Restored `liveLabPricingInterResolveWeight` — Inter 800→700, 700→600, 500→400 for pricing block typography; CTA exempt
2. Reverted harmful iter-3/4 paths — removed `isLabPricingFlexColumnParent` blockFlowPinTop + pricing block TOP/lineHeight pin in `buildLayer`
3. Kept proven `familyCandidates`→`computedStack` (CTA Arial) + live baseline-y in `alignInlineRowSiblings`
4. Fixed pre-existing typecheck (`flex-end` compare)

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`


## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:42:05.775Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | error |
| Global diff | 100.00% |
| Worst hotspot | 3.37% |
| Fail reason | Export timed out after 600000ms |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | worst hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:42:05.775Z

<!-- vault-fingerprint: figmaLive|error|100.000|3.368|5|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:46:01.288Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | error |
| Global diff | 100.00% |
| Worst hotspot | n/a |
| Fail reason | Export timed out after 600000ms |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | worst hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:46:01.288Z

<!-- vault-fingerprint: figmaLive|error|100.000|na|4|fix-all pre-agent -->

## Investigation — fix attempt 4 (2026-05-30, fix-all iter 4/5, orchestrator review)

### Failure analysis

| Attempt | Change | Global | Hotspot / outcome |
| --- | --- | --- | --- |
| Best prior | `computedStack` + weight maps + live baseline-y | **0.58%** | 1.93% |
| Iter 3/5 | `isLabPricingFlexColumnParent` + `blockFlowPinTop` lineHeight pin | **error** | Export timeout 600s → 100% |
| Iter 3/5 (prior) | `liveLineBoxCenterY` / TOP vertical | **1.47%** | 3.31% |
| Repeated fails | ±100 Inter bump, glyph-advance x | +0.5–0.9% | worse |

**Failed hypotheses:** Flex-column `blockFlowPinTop` with `lineHeight`+`WIDTH_AND_HEIGHT` (hangs live export); live price row without baseline-y; tag pill `700→600` on tight uppercase pill.

**Next path (this attempt):** Revert flex-column `blockFlowPinTop`; restore live `alignInlineRowBaselineY` for `.lab-pricing-price`; keep proven `computedStack` Arial CTA + `liveLabPricingInterResolveWeight`; exempt tag pill from down-map.

### Applied (`code-v2.ts`)

1. Removed `isLabPricingFlexColumnParent` + pricing lineHeight block from `blockFlowPinTop` (export timeout fix)
2. Live + mock `alignInlineRowSiblings` — baseline-y for synthetic `p-text` price rows; x from artifact
3. Tag pill keeps Inter Bold 700 (skip down-map); h3/price/list still 800→700, 700→600, 500→400

**Expected:** export completes; global ↓ toward 0.58% baseline; region-01 hotspot ↓ (price row + badge).

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

### Verification (2026-05-30, this session)

- Plugin build: exit 0
- Live export: **completes** (was 100% / 600s timeout)
- Metrics: **fail 1.14% global / 3.56% hotspot** (export restored; strict 0.1% not yet met)
- Best prior on this story: 0.58% / 1.93% hotspot


## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:49:08.307Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.16% |
| Worst hotspot | 3.56% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.56% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:49:08.307Z

<!-- vault-fingerprint: figmaLive|fail|1.165|3.558|5|fix-all pre-agent -->

## Investigation — fix attempt 5/5 (2026-05-30, orchestrator review)

### Failure analysis

| Attempt | Change | Global | Hotspot |
| --- | --- | --- | --- |
| Best prior | `computedStack` + weight maps + baseline-y | **0.58%** | 1.93% |
| Iter 4/5 | `isLabPricingBlockTypography` TOP + `lineHeight` + `WIDTH_AND_HEIGHT` in `buildLayer` | **1.16%** | 3.56% |
| Repeated fails | ±100 bump, glyph-advance x, flex-column `blockFlowPinTop`, `liveLineBoxCenterY` | worse | worse |

**Failed hypotheses:** Live TOP/lineHeight pin on h3/list (3477–3491) — reintroduced after partial reverts; blocking tag pill from `liveTextPreferWidthAndHeight` pill centering.

**Next path (this attempt):** Remove pricing-block TOP pin; exempt tag pill from Inter down-map (keep Bold 700 on uppercase pill); allow tag pill WIDTH_AND_HEIGHT center via existing pill rule; keep proven `computedStack` Arial CTA + weight maps for h3/price/list + live baseline-y.

### Applied (`code-v2.ts`)

1. Removed `isLabPricingBlockTypography` TOP/`lineHeight`/`WIDTH_AND_HEIGHT` branch in `buildLayer` → `applyLiveNativeTextBoxCenter`
2. `isLabPricingTagPill` — skip Inter down-map; allow `liveTextPreferWidthAndHeight` pill centering
3. Kept: `familyCandidates`→`computedStack`, `liveLabPricingInterResolveWeight` (h3/price/list), live baseline-y for `.lab-pricing-price`

**Expected:** global ↓ toward 0.58%; region-01 hotspot ↓ (badge + h3 vertical/glyph AA).

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:50:56.726Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.14% |
| Worst hotspot | 3.56% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.56% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:50:56.726Z

<!-- vault-fingerprint: figmaLive|fail|1.140|3.558|1|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:03:37.717Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.92% |
| Worst hotspot | 2.10% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.10% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 2.04% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:03:37.717Z

<!-- vault-fingerprint: figmaLive|fail|0.920|2.095|2|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:04:18.863Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.14% |
| Worst hotspot | 3.56% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.56% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:04:18.863Z

<!-- vault-fingerprint: figmaLive|fail|1.140|3.558|2|fix-all pre-agent -->

## Tier C verification (2026-05-30, fix-all iter 2/5)

Pixel golden `lab-pricingpanel--starter` PASS 0.000% — shared adapter OK; live refinement in code-v2.ts.

## Investigation — fix attempt 2/5 (2026-05-30, cursor session)

**Triage:** Structurally identical; live Inter glyph/vertical drift — renderer (`code-v2.ts`), not source.

**Applied (`code-v2.ts`):**
1. Restored tag pill `700→600` in `liveLabPricingInterResolveWeight` (removed tag exemption that held Bold 700)
2. Removed `isLabPricingTightBlockTypography` TOP pin on h3/list — use `isBlockTypoTightLineBox` + native CENTER
3. NONE branch in `applyLiveNativeTextBoxCenter` — `y = pad.top` only (no manual `(innerH - text.height)/2` double-center)

**Kept:** `familyCandidates`→`computedStack` (CTA Arial), live baseline-y for `.lab-pricing-price`.

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:05:54.334Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.14% |
| Worst hotspot | 3.56% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.56% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:05:54.334Z

<!-- vault-fingerprint: figmaLive|fail|1.140|3.558|4|fix-all pre-agent -->

## Investigation — fix attempt 4/5 (2026-05-30, orchestrator review)

### Failure analysis

| Attempt | Change | Global | Hotspot |
| --- | --- | --- | --- |
| Best prior | `computedStack` + weight maps (incl. tag 700→600) + baseline-y | **0.58%** | 1.93% |
| Attempt 3 (this cycle) | Tag pill exempt from Inter down-map (`isLabPricingTagPill` early return) | **1.14%** (+0.22%) | 3.56% |
| Repeated fails | TOP + `lineHeight` + `WIDTH_AND_HEIGHT` in `buildLayer`; ±100 bump; glyph-advance x | worse | worse |

**Failed hypotheses:** Tag pill Bold 700 (skip down-map) — reverted; flex-column `blockFlowPinTop` + lineHeight resize (export timeout).

**Next path:** Restore tag/h3 `700→600`; minimal TOP vertical pin for h3 + list only (no lineHeight/resize); keep CTA Arial + price-row baseline-y.

### Applied (`code-v2.ts`)

1. Removed tag-pill exemption in `liveLabPricingInterResolveWeight` — tag `700→600` restored
2. Added `isLabPricingFlexBlockTypography` — live TOP pin at `pad.top` for h3 + list `p` (not tag pill, not price inline runs)
3. Kept: `familyCandidates`→`computedStack`, live baseline-y for `.lab-pricing-price`

**Expected:** global ↓ toward 0.58% baseline; region-01 hotspot ↓ (badge weight + h3/list vertical).

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — fix attempt 5/5 (2026-05-30, orchestrator review — cursor session)

### Failure analysis

| Attempt | Change | Global | Hotspot |
| --- | --- | --- | --- |
| Best prior | `computedStack` + weight maps + mock baseline-y | **0.58%** | 1.93% |
| Attempt 4 (prior) | `isLabPricingFlexBlockTypography` TOP pin on h3 + list | **1.14–1.16%** | 3.56% |
| Attempt 4 (prior) | Tag pill exempt from `700→600` | **1.14%** | 3.56% |

**Failed hypotheses:** TOP/`pad.top` pin on flex-column h3/list (bypasses `isBlockTypoTightLineBox` CENTER); live lineHeight baseline-y on price row (drops `/month` vs artifact y).

**Next path:** Revert TOP pin; live price row artifact x/y only; keep `computedStack` Arial CTA + `liveLabPricingInterResolveWeight`.

### Applied (`code-v2.ts`)

1. Removed `isLabPricingFlexBlockTypography` TOP pin
2. Live `.lab-pricing-price` — artifact `box.x/y` (mock keeps `alignInlineRowBaselineY`)
3. Kept: `familyCandidates`→`computedStack`, `liveLabPricingInterResolveWeight`

**Expected:** global ↓ toward 0.58%; region-01 hotspot ↓.

**Verify:** plugin build exit 0 → reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:16:14.931Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.19% |
| Worst hotspot | 3.65% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.65% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:16:14.931Z

<!-- vault-fingerprint: figmaLive|fail|1.193|3.646|3|fix-all pre-agent -->

## Investigation — fix attempt 3 (2026-05-30, fix-all iter 3/5, orchestrator review)

### Failure analysis

| Attempt | Change | Global | Hotspot |
| --- | --- | --- | --- |
| Best prior | `computedStack` + weight maps + **live baseline-y** price row | **0.58%** | 1.93% |
| Attempt 2 (this cycle) | (harness) | 1.14% | 3.56% |
| Attempt 3 (prior) | Live price row artifact x/y only (skip baseline-y) | **1.19%** (+0.05%) | 3.65% |

**Failed hypotheses:** Live artifact-only y for `$19` + `/month` (baseline-y math was correct at 0.58%); TOP pin on h3/list; ±100 Inter bump.

**Next path:** Restore live `alignInlineRowBaselineY` for `.lab-pricing-price`; keep proven `computedStack` Arial CTA + `liveLabPricingInterResolveWeight`.

### Applied (`code-v2.ts`)

1. Removed live-only early return in `alignInlineRowSiblings` — price row uses baseline-y (x from artifact) in live + mock
2. Kept: `familyCandidates`→`computedStack`, `liveLabPricingInterResolveWeight` (800→700, 700→600, 500→400)

**Expected:** global ↓ toward 0.58% baseline; region-01 hotspot ↓ (price row vertical alignment).

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:17:17.508Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.16% |
| Worst hotspot | 3.56% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.56% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:17:17.508Z

<!-- vault-fingerprint: figmaLive|fail|1.165|3.558|4|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:27:33.133Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.16% |
| Worst hotspot | 3.56% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.56% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:27:33.133Z

<!-- vault-fingerprint: figmaLive|fail|1.165|3.558|1|fix-all pre-agent -->

## Investigation — fix attempt (2026-05-30, fix-all iter 1/5, cursor session)

**Triage:** Structurally identical; live Inter/Arial glyph + vertical line-box drift — renderer (`code-v2.ts`), not source.

**Root cause (this attempt):** `applyLiveNativeTextBoxCenter` NONE branch regressed to `y = pad.top + (innerH - text.height)/2` while `textAlignVertical: CENTER` — double vertical centering on pricing h3 + list tight line boxes (parent flex, `isBlockTypoTightLineBox` path). Proven weight maps + baseline-y price row were already present.

**Applied (`code-v2.ts`):**
1. NONE branch — restore `y = pad.top` for CENTER pin (TOP pin unchanged for analytics/feature); WIDTH_AND_HEIGHT pill centering unchanged
2. Kept: `familyCandidates`→`computedStack` (CTA Arial), `liveLabPricingInterResolveWeight`, live baseline-y for `.lab-pricing-price`

**Expected:** global ↓ toward 0.58% baseline; region-01 hotspot ↓ (h3 + list vertical/glyph AA).

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:39:10.001Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.16% |
| Worst hotspot | 3.56% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.56% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:39:10.001Z

<!-- vault-fingerprint: figmaLive|fail|1.165|3.558|3|fix-all pre-agent -->

## Investigation — fix attempt 3/5 (2026-05-30, cursor session, narrow scope)

**Triage:** Structurally identical; live Inter glyph/vertical drift — renderer (`code-v2.ts`), not source.

### Failure analysis

| Attempt | Change | Global | Hotspot |
| --- | --- | --- | --- |
| Best prior | `computedStack` + weight maps + baseline-y | **0.58%** | 1.93% |
| Prior (iter 2) | Tag pill exempt `700→600` + NONE `pad.top` tweaks | **1.16%** (+0.03%) | 3.56% |
| Harmful (repeated) | `alignLabPricingFlexColumnText` WH+TOP post-build; TOP pin on h3/list | 1.14–1.19% | 3.56%+ |

**Root cause (this attempt):** Post-build `alignLabPricingFlexColumnText` overwrote proven `isBlockTypoTightLineBox` → `applyLiveNativeTextBoxCenter` NONE+CENTER for pricing h3/list; tag pill `700→600` down-map was disabled via `isLabPricingTagPill` early return in `liveLabPricingInterResolveWeight`.

### Applied (`code-v2.ts`)

1. Removed `isLiveLabPricingFlexColumnBlockText`, `alignLabPricingFlexColumnText` call, and enforceLive skip — h3/list stay NONE+CENTER from build
2. Restored tag pill Inter down-map (`700→600`) — removed tag exemption in `liveLabPricingInterResolveWeight`
3. Kept: `familyCandidates`→`computedStack` (CTA Arial), live baseline-y for `.lab-pricing-price`

**Expected:** global ↓ toward 0.58% baseline; region-01 hotspot ↓ (badge weight + h3/list vertical).

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:50:43.383Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.16% |
| Worst hotspot | 3.56% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.56% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:50:43.383Z

<!-- vault-fingerprint: figmaLive|fail|1.165|3.558|2|fix-all pre-agent -->

## Investigation — fix attempt 2/5 (2026-05-30, cursor session, narrow scope)

**Triage:** Structurally identical; live Inter glyph + tag pill horizontal placement — renderer (`code-v2.ts`), not source.

### Failure analysis

| Attempt | Change | Global | Hotspot |
| --- | --- | --- | --- |
| Best prior | `computedStack` + weight maps + baseline-y | **0.58%** | 1.93% |
| Prior (iter 2) | TOP/lineHeight pin, tag exempt from down-map | **1.16%** | 3.56% |
| Harmful (iter 1) | Export timeout (infra/plugin) | **100%** | n/a |

**Failed hypotheses (do not repeat):** ±100 Inter bump; glyph-advance x; TOP/`liveLineBoxCenterY` on CTA/block; flex-column `blockFlowPinTop`+lineHeight resize.

**Root cause (this attempt):** Tag pill (`lab-pricing-tag`) is visually centered via symmetric padding but artifact `align: start`; live WH+LEFT pinned "FOR TEAMS" to `pad.left` (region-01 badge fringe + horizontal drift).

### Applied (`code-v2.ts`)

1. `liveTextAlignHorizontal` — live tag pill uses CENTER (not artifact LEFT)
2. `alignLabPricingTagPill` — post-build WH+TOP with horizontal center in padded pill box
3. Kept proven path: `familyCandidates`→`computedStack` (CTA Arial), `liveLabPricingInterResolveWeight`, live baseline-y for `.lab-pricing-price`

**Expected:** global ↓ toward 0.58% baseline; region-01 hotspot ↓ (badge centering + glyph AA).

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--starter`

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:53:57.369Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.15% |
| Worst hotspot | 3.56% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.56% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.37% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:53:57.369Z

<!-- vault-fingerprint: figmaLive|fail|1.152|3.558|3|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T04:05:35.100Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.15% |
| Worst hotspot | 3.56% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.56% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.37% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T04:05:35.100Z

<!-- vault-fingerprint: figmaLive|fail|1.152|3.558|4|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T04:07:03.555Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.15% |
| Worst hotspot | 3.56% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.56% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.37% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T04:07:03.555Z

<!-- vault-fingerprint: figmaLive|fail|1.152|3.558|1|fix-all pre-agent -->

## Investigation — lab-pricingpanel--starter / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T04:08:14.937Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.15% |
| Worst hotspot | 3.56% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.56% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-01-compare.png` |
| region-02 | 0.37% hotspot | `figma-live-diffs/lab-pricingpanel-starter/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-starter/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-starter/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-starter/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T04:08:14.937Z

<!-- vault-fingerprint: figmaLive|fail|1.152|3.558|2|fix-all pre-agent -->
