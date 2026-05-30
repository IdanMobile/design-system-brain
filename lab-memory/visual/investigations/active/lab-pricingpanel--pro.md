# lab-pricingpanel--pro

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

- [[render-html-computed-font-stack]] — CTA uses `computedStack: Arial` (already correct in artifact; mock passes)
- [[visual/investigations/active/lab-pricingpanel--starter]] — shared PricingPanel live Inter weight + inline price-row fixes (pro currently excluded from weight down-map)

## Artifacts

<!-- R2 URLs to compare PNGs and reports -->

## Investigation — lab-pricingpanel--pro / figma live

**Job ID:** n/a  
**Date:** 2026-05-24T12:17:30.118Z  
**Source:** fix all requested (automated)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.35% |
| Worst hotspot | 3.39% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.39% hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/regions/region-01-compare.png` |
| region-02 | 0.87% hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/regions/region-02-compare.png` |
| region-03 | 0.30% hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-pro/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-pro/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-pro/scene.json`

### Root cause

Live Figma centered h3 and `.lab-pricing-list` `p` glyphs because `blockFlowPinTop` required `parent.layout.display === "block"` while those nodes sit under flex-column `.lab-pricing` / `.lab-pricing-list`; they fell through to `isBlockTypoTightLineBox` → `applyLiveNativeTextBoxCenter` (region-01 ~5% hotspot).

### Recommended fix area

`packages/figma-importer-plugin/src/code-v2.ts` — `isLabPricingFlexColumnFlowText` + extend `blockFlowPinTop` (and tight-line-box fallback) for flex-column pricing parents.

## Investigation — 2026-05-30 (fix-all iter 2)

**Date:** 2026-05-30

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 5.36% hotspot — h3/list shifted down, price baseline | `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png` |

### Root cause

Same as above; prior attempt did not add `isLabPricingFlexColumnFlowText` to the renderer.

### Recommended fix area

`code-v2.ts` — `isLabPricingFlexColumnFlowText`, `blockFlowPinTop` parent check includes flex-column pricing flow.

### Artifacts

- `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`

### Cached

false — automated test record at 2026-05-24T12:17:30.118Z

<!-- vault-fingerprint: figmaLive|fail|1.352|3.385|0|fix all requested -->

## Investigation — lab-pricingpanel--pro / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:03:35.559Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.04% |
| Worst hotspot | 5.36% |
| Fail reason | global+hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 5.36% hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-pro/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-pro/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-pro/scene.json`

### Triage verdict (2026-05-30, attempt 3/5)

**Both sides show identical content but pixels differ** — not missing Figma content and not a Storybook/source bug; pixel (0%) and figma mock (0%) pass, so failure is isolated to **Figma Desktop live text rasterization** in the importer.

### Visual diff table

| Section | Storybook | Figma live | Δ | Stage |
| --- | --- | --- | --- | --- |
| Badge "MOST POPULAR" | Inter 700, ls 0.7, uppercase | Same content; glyph fringe in diff | ~1–2 px AA | importer font |
| Heading "Pro Plan" | Inter 700, 32px | Yellow/red fringe on glyph edges | AA + metrics | importer font |
| Price "$49" + "/month" | Inline flow; $49 weight 800, `/month` 500 | Heavy red ghost on "$49"; suffix horizontal/baseline offset | ~2–4 px | importer inline + weight |
| Feature list (3 lines) | Inter 400, 20px, gap 8 | Yellow outline on all lines; slightly tighter vertical rhythm vs Storybook | AA fringe + spacing | importer font |
| CTA "Upgrade now" | Arial Bold 700 (`computedStack`) | Minimal diff in full-card overlay | ~0 | OK (Arial path works) |
| Gradient card fill | `linear-gradient(165deg, #08203f, #0f3d78)` | Matches | 0 | OK |

**Hotspot region-01** (rect y:76–308, 5.36%): covers h3 + price row + feature list — excludes badge top and CTA bottom.

### Per-issue blocks

1. **Pro variant skips Inter weight down-mapping (primary)**
   - **Symptom:** region-01 (5.36%) — diffuse fringe on h3, list items; heavy red cluster on "$49"; Figma text appears bolder/thicker than Storybook in side-by-side compare.
   - **Ground truth:** Artifact weights — tag/h3 `700`, synthetic `$49` `800`, `/month` `500`, list `400`; all `computedStack: "Inter, Arial, sans-serif"`.
   - **Artifact:** Geometry/boxes correct (mock 0%); JSON has correct flex gaps (rowGap 16, list gap 8).
   - **Importer:** `liveLabPricingInterResolveWeight` returns early when `isLabPricingProVariant` detects `.pro` class — **pro keeps raw Inter weights** while starter gets 800→700, 700→600, 500→400 (comment: "starter only").
   - **Fix:** Remove or narrow the pro early-return; apply same down-mapping as starter for block typography (h3, price inline runs, list `p`); keep tag pill exempt if pill width sensitive.
   - **Verify:** region-01 hotspot ↓ toward starter baseline (~2%); global ↓ from 2.04%.

2. **Inline price row baseline alignment**
   - **Symptom:** "$49" red ghost + "/month" shifted closer to "9" on Figma side in compare PNG.
   - **Ground truth:** `lay-4` `.lab-pricing-price` contains synthetic `lay-6` p-text ($49, box y:-6, lh 58) + inline `lay-5` span (/month, margin-left 8, lh 18).
   - **Artifact:** Boxes present and mock-accurate; live places sibling text nodes with independent vertical metrics when Inter renders heavier.
   - **Fix:** `code-v2.ts` — ensure live `alignInlineRowBaselineY` runs for `lab-pricing-price` on pro (same as starter); x stays from artifact, baseline-y from primary ($49) lineHeight.
   - **Verify:** Price row clean in region-01 compare.

3. **Block list vertical rhythm**
   - **Symptom:** Compare shows Figma feature list slightly more compressed vertically vs Storybook (gap between price block and first feature).
   - **Ground truth:** Root flex rowGap 16 between h3, price p, list div; list internal gap 8.
   - **Artifact:** Positions match DOM (`lay-7` y:202, `lay-4` y:128).
   - **Fix:** Secondary — likely cascades from heavier Inter glyphs inflating/shrinking perceived line boxes; resolve after weight down-map before adding layout hacks.
   - **Verify:** List spacing matches after weight fix.

### Root cause

Figma live fails because **`isLabPricingProVariant` bypasses `liveLabPricingInterResolveWeight`** in `code-v2.ts`, so pro renders Inter at raw CSS weights (800/700/500/400) while Figma Desktop rasterizes Inter **heavier/wider than Chromium** at the same nominal weight — producing systematic glyph metric and anti-aliasing drift on h3, price row, and feature list even though pixel and figma-mock suites pass at 0% with correct artifact geometry. CTA is already correct (Arial via `computedStack`).

### Recommended fix area

Primary: `packages/figma-importer-plugin/src/code-v2.ts`
- **`liveLabPricingInterResolveWeight`** — remove or narrow `isLabPricingProVariant` early return; apply starter-proven down-map (800→700, 700→600, 500→400) for h3, `.lab-pricing-price` inline runs, list `p`; keep tag pill + CTA exempt
- **`alignInlineRowBaselineY`** / `alignInlineRowSiblings` — confirm live baseline-y for `lab-pricing-price` row on pro (x from artifact)
- Do **not** edit Storybook component, CSS, or extractor (artifact already correct)

See [[visual/investigations/active/lab-pricingpanel--starter]] for proven fix chain and failed hypotheses to avoid (+100 Inter bump, TOP/`liveLineBoxCenterY`, glyph-advance x reposition).

### Cached

false — automated test record at 2026-05-30T03:03:35.559Z

<!-- vault-fingerprint: figmaLive|fail|2.039|5.357|3|fix-all pre-agent -->

## Investigation — 2026-05-30 (fix-all iter 3, narrow scope)

**Date:** 2026-05-30  
**Fix attempt:** 3

### Triage verdict

Both sides show identical content; pixels differ from Figma Desktop Inter rasterizing heavier than Chromium — **renderer bug** (`liveLabPricingInterResolveWeight` pro bypass), not Storybook source.

### Changes (attempt 3)

1. **Reverted** attempt-2 harm: `isLabPricingFlexColumnFlowText` + flex-column `blockFlowPinTop` (caused 100% global / export timeout).
2. **Applied** pro Inter down-map: removed `isLabPricingProVariant` early return in `liveLabPricingInterResolveWeight` (800→700, 700→600, 500→400); tag pill + CTA still exempt.
3. **Kept** proven paths: `computedStack` Arial CTA, live `alignInlineRowBaselineY` for `.lab-pricing-price` inline row.

### Verify

Harness re-runs `figma:live-iterate --story lab-pricingpanel--pro` after plugin reload.

## Investigation — lab-pricingpanel--pro / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:06:27.735Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.07% |
| Worst hotspot | 4.52% |
| Fail reason | global+hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 4.52% hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-pro/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-pro/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-pro/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:06:27.735Z

<!-- vault-fingerprint: figmaLive|fail|2.068|4.518|4|fix-all pre-agent -->

## Investigation — lab-pricingpanel--pro / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:08:36.059Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.10% |
| Worst hotspot | 4.17% |
| Fail reason | global+hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 4.17% hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-pro/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-pro/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-pro/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:08:36.059Z

<!-- vault-fingerprint: figmaLive|fail|2.100|4.171|5|fix-all pre-agent -->

## Investigation — fix attempt 5/5 (2026-05-30, orchestrator review)

### Failure analysis

| Attempt | Change | Global | Hotspot |
| --- | --- | --- | --- |
| Prior (3–4) | Remove `isLabPricingProVariant` bypass; `liveLabPricingInterResolveWeight` for pro | **2.10%** (unchanged) | 4.17% |
| Harmful (repeated) | `isLabPricingFlexColumnFlowText` + `blockFlowPinTop` | **100%** timeout | n/a |
| Harmful (repeated) | ±100 Inter bump; glyph-advance x; TOP/`lineHeight` pin in `buildLayer` | worse | worse |

**Failed hypotheses:** Pro-only weight bypass (already removed; no metric movement); flex-column TOP pin; re-applying weight down-map alone.

**Root cause (this attempt):** `applyLiveNativeTextBoxCenter` NONE branch applies **manual `(innerH - text.height)/2` y offset on top of `textAlignVertical: CENTER`** for pricing h3 + list tight line boxes; when Figma Inter glyph height exceeds Chromium, the double center shifts region-01 text vertically (weight maps alone cannot fix).

**Next path:** `isLabPricingTightBlockTypography` — NONE branch `y = pad.top` for h3 + list `p` only; keep `liveLabPricingInterResolveWeight`, tag pill WIDTH_AND_HEIGHT, price-row `alignInlineRowBaselineY`.

**Expected:** global ↓ from 2.10%; region-01 hotspot ↓ from 4.17% (h3 + feature list vertical alignment).

**Applied (`code-v2.ts`):**
1. `isLabPricingTightBlockTypography` — h3 + list `p`; excludes tag pill + price inline runs
2. `applyLiveNativeTextBoxCenter` NONE branch — `y = pad.top` for tight pricing block typography (native CENTER only)

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--pro`

## Investigation — lab-pricingpanel--pro / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:16:07.148Z  
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
| region-01 | worst hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-pro/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-pro/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-pro/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:16:07.148Z

<!-- vault-fingerprint: figmaLive|error|100.000|na|3|fix-all pre-agent -->

## Investigation — lab-pricingpanel--pro / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:27:50.373Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.10% |
| Worst hotspot | 4.17% |
| Fail reason | global+hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 4.17% hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-pro/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-pro/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-pro/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:27:50.373Z

<!-- vault-fingerprint: figmaLive|fail|2.100|4.171|1|fix-all pre-agent -->

## Investigation — lab-pricingpanel--pro / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:28:45.804Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.10% |
| Worst hotspot | 4.17% |
| Fail reason | global+hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 4.17% hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-pro/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-pro/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-pro/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:28:45.804Z

<!-- vault-fingerprint: figmaLive|fail|2.100|4.171|4|fix-all pre-agent -->

## Investigation — fix attempt 5/5 (2026-05-30, orchestrator review)

### Failure analysis

| Attempt | Change | Global | Hotspot |
| --- | --- | --- | --- |
| Prior (3–4) | Remove `isLabPricingProVariant` bypass; `liveLabPricingInterResolveWeight` for pro | **2.10%** (unchanged) | 4.17% |
| Harmful (repeated) | `isLabPricingFlexColumnFlowText` + `blockFlowPinTop` | **100%** timeout | n/a |
| Harmful (repeated) | ±100 Inter bump; glyph-advance x; TOP/`lineHeight` pin in `buildLayer` | worse | worse |

**Failed hypotheses:** Pro-only weight bypass (already removed; no metric movement); flex-column TOP pin; re-applying weight down-map alone.

**Root cause (this attempt):** `applyLiveNativeTextBoxCenter` NONE branch applies manual `(innerH - text.height)/2` y offset on top of `textAlignVertical: CENTER` for pricing h3 + list tight line boxes; Figma Inter glyph height ≠ Chromium → vertical drift in region-01.

**Next path:** `isLabPricingTightBlockTypography` — NONE branch `y = pad.top` for h3 + list `p`; keep weight maps + price-row baseline-y.

**Expected:** global ↓ from 2.10%; region-01 hotspot ↓ from 4.17%.

**Applied (`code-v2.ts`):**
1. `isLabPricingTightBlockTypography` — h3 + list `p`; excludes tag pill + price inline runs
2. `applyLiveNativeTextBoxCenter` NONE — `y = pad.top` for tight pricing block typography

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--pro`

## Investigation — fix attempt 5/5 (2026-05-30, orchestrator review)

### Failure analysis

| Attempt | Change | Global | Hotspot |
| --- | --- | --- | --- |
| Prior (3–4) | Remove `isLabPricingProVariant` bypass; `liveLabPricingInterResolveWeight` for pro | **2.10%** (unchanged) | 4.17% |
| Harmful (repeated) | `isLabPricingFlexColumnFlowText` + `blockFlowPinTop` | **100%** timeout | n/a |
| Harmful (repeated) | ±100 Inter bump; glyph-advance x; TOP/`lineHeight` pin in `buildLayer` | worse | worse |

**Failed hypotheses:** Pro-only weight bypass (already removed; no metric movement); flex-column TOP pin; re-applying weight down-map alone.

**Root cause (this attempt):** `applyLiveNativeTextBoxCenter` NONE branch applies manual `(innerH - text.height)/2` y offset on top of `textAlignVertical: CENTER` for pricing h3 + list tight line boxes; Figma Inter glyph height ≠ Chromium → vertical drift in region-01.

**Next path:** `isLabPricingTightBlockTypography` — NONE branch `y = pad.top` for h3 + list `p`; keep weight maps + price-row baseline-y.

**Expected:** global ↓ from 2.10%; region-01 hotspot ↓ from 4.17%.

**Applied (`code-v2.ts`):**
1. `isLabPricingTightBlockTypography` — h3 + list `p`; excludes tag pill + price inline runs
2. `applyLiveNativeTextBoxCenter` NONE — `y = pad.top` for tight pricing block typography

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--pro`

## Investigation — lab-pricingpanel--pro / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:34:23.689Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.10% |
| Worst hotspot | 4.17% |
| Fail reason | global+hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 4.17% hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-pro/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-pro/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-pro/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:34:23.689Z

<!-- vault-fingerprint: figmaLive|fail|2.100|4.171|2|fix-all pre-agent -->

## Investigation — fix attempt 2/5 (2026-05-30, narrow scope)

### Triage verdict

Both sides show identical content; pixels differ from Figma Desktop Inter rasterization + text box vertical alignment — **renderer bug** in `code-v2.ts`, not Storybook source.

### Root cause

Prior `isLabPricingTightBlockTypography` fix set `y = pad.top` but left `textAlignVertical: CENTER` in the NONE branch of `applyLiveNativeTextBoxCenter`, so Figma still vertically re-centered glyphs inside the fixed line box (double-center on h3 + list `p` in region-01).

### Applied (`code-v2.ts`)

1. `applyLiveNativeTextBoxCenter` NONE branch — `pinTop` sets both `textAlignVertical: TOP` and `y = pad.top` for `isLabPricingTightBlockTypography` (h3 + list `p`)
2. `liveLabPricingInterResolveWeight` — exempt tag pill from Inter down-map (keep Bold 700 on uppercase pill)

### Verify

Reload plugin → harness `figma:live-iterate --story lab-pricingpanel--pro`

## Investigation — lab-pricingpanel--pro / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:36:22.740Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.07% |
| Worst hotspot | 4.52% |
| Fail reason | global+hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 4.52% hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-pro/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-pro/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-pro/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:36:22.740Z

<!-- vault-fingerprint: figmaLive|fail|2.068|4.518|3|fix-all pre-agent -->

## Investigation — fix attempt 3/5 (2026-05-30, cursor session)

**Tier C:** pixel golden `lab-pricingpanel--pro` PASS 0.000% — shared adapter OK.

**Triage:** Both sides identical content; Figma Inter rasterizes heavier — renderer bug (`code-v2.ts`), not source.

**Root cause (this attempt):** Attempt 2 forced `textAlignVertical: TOP` via `isLabPricingTightBlockTypography` in `effectiveVerticalPin`, worsening hotspot 4.17%→4.52%; proven starter path uses native CENTER with `y = pad.top` only (no manual center offset).

**Applied (`code-v2.ts`):**
1. Removed `isLabPricingTightBlockTypography` from `effectiveVerticalPin` (restore CENTER for h3 + list)
2. NONE branch — `y = pad.top` for tight pricing block typography; skip `(innerH - text.height)/2` double-center
3. Kept: weight maps, tag pill TOP/WH exempt, live baseline-y for `.lab-pricing-price`

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--pro`

## Investigation — fix attempt 4/5 (2026-05-30, orchestrator review)

### Failure analysis

| Attempt | Change | Global | Hotspot |
| --- | --- | --- | --- |
| 3–4 | Remove pro weight bypass; `liveLabPricingInterResolveWeight` | **2.07%** (unchanged) | 4.52% |
| 2–3 | `isLabPricingTightBlockTypography` TOP/NONE y=pad.top tweaks | unchanged / worse | 4.17%→4.52% |
| Harmful | `isLabPricingFlexColumnFlowText` + `blockFlowPinTop` | **100%** timeout | n/a |

**Failed hypotheses:** One-step Inter down-map alone; build-time TOP pin on NONE line boxes; re-removing pro bypass.

**Visual (region-01):** Figma Inter still renders heavier than Chromium on h3, `$49`, list lines despite down-map — vertical strut from NONE+CENTER during build.

**Next path (different from prior):** Post-build **WH+TOP @ pad.top** for flex-column pricing h3 + list `p` — mirror proven `alignAnalyticsChartsTightText` (not build-time `blockFlowPinTop`). Re-exempt tag pill from down-map (700 stays).

**Expected:** global ↓ from 2.07%; region-01 hotspot ↓ from 4.52%.

### Applied (`code-v2.ts`)

1. `isLiveLabPricingFlexColumnBlockText` — h3 under `.lab-pricing`, list `p` under `.lab-pricing-list`
2. `alignLabPricingFlexColumnText` — live post-build WH+TOP (after `reaffirmChildBoxPositions`)
3. `liveLabPricingInterResolveWeight` — tag pill exempt (700 unchanged)
4. `enforceLiveUnwrappedTextFrame` — skip pricing flex-column block text (post-build owns placement)

**Tier A:** pixel PASS 0.000%; figma mock PASS 0.000% (pro story).

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--pro`

## Investigation — lab-pricingpanel--pro / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:50:59.458Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


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
| region-01 | worst hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-pro/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-pro/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-pro/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:50:59.458Z

<!-- vault-fingerprint: figmaLive|error|100.000|na|2|fix-all pre-agent -->

## Investigation — lab-pricingpanel--pro / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:53:42.743Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.20% |
| Worst hotspot | 4.36% |
| Fail reason | global+hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 4.36% hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-pro/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-pro/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-pro/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:53:42.743Z

<!-- vault-fingerprint: figmaLive|fail|2.197|4.364|3|fix-all pre-agent -->

## Investigation — fix attempt 3/5 (2026-05-30, cursor session cont.)

**Tier C:** pixel golden `lab-pricingpanel--pro` PASS 0.000% — shared adapter OK.

**Applied (`code-v2.ts`):**
1. Unified Inter down-map — removed pro two-step map (800→600, 700→500); pro uses starter map (800→700, 700→600, 500→400)
2. Wired `alignLabPricingProBlockText` post-build (was defined but never called)
3. `enforceLiveUnwrappedTextFrame` — skip pro h3/list (post-build owns WH+TOP)

**Verify:** reload plugin → harness `figma:live-iterate --story lab-pricingpanel--pro`

## Investigation — lab-pricingpanel--pro / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T04:05:35.395Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.08% |
| Worst hotspot | 4.12% |
| Fail reason | global+hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 4.12% hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-pro/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-pro/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-pro/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T04:05:35.395Z

<!-- vault-fingerprint: figmaLive|fail|2.075|4.122|4|fix-all pre-agent -->

## Investigation — lab-pricingpanel--pro / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T04:07:02.990Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.08% |
| Worst hotspot | 4.12% |
| Fail reason | global+hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 4.12% hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-pro/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-pro/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-pro/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T04:07:02.990Z

<!-- vault-fingerprint: figmaLive|fail|2.075|4.122|1|fix-all pre-agent -->

## Investigation — lab-pricingpanel--pro / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T04:08:15.592Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.08% |
| Worst hotspot | 4.12% |
| Fail reason | global+hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 4.12% hotspot | `figma-live-diffs/lab-pricingpanel-pro/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-pricingpanel-pro/storybook.png`
- Figma PNG: `figma-live-diffs/lab-pricingpanel-pro/figma.png`
- Artifact JSON: `figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-pricingpanel-pro/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T04:08:15.592Z

<!-- vault-fingerprint: figmaLive|fail|2.075|4.122|2|fix-all pre-agent -->
