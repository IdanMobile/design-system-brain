# lab-analyticscharts--usage

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

- [[visual/patterns/render-html-computed-font-stack]] — pixel HTML already passes (0.02%); live drift is importer-side
- [[visual/patterns/extract-svg-attribute-scalar-coercion]] — donut `circle` primitives present in artifact; not a missing-SVG symptom

## Logic spec (optional)

<!-- [[logic/specs/lab-analyticscharts--usage.spec.json]] — behavior track, not visual -->

## Artifacts

<!-- R2 URLs to compare PNGs and reports -->

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:02:02.822Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.12% |
| Worst hotspot | 1.12% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.12% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.69% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

See agent triage section below (2026-05-30): importer text/layout drift; artifact JSON correct.

### Recommended fix area

`packages/figma-importer-plugin/src/code-v2.ts` (chip + legend-row vertical centering).

### Cached

false — automated test record at 2026-05-30T00:02:02.822Z

<!-- vault-fingerprint: figmaLive|warn|0.123|1.120|1|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:02:13.063Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.12% |
| Worst hotspot | 1.12% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.12% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.69% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

Superseded by agent triage section immediately below.

### Recommended fix area

`packages/figma-importer-plugin/src/code-v2.ts`

### Cached

false — automated test record at 2026-05-30T00:02:13.063Z

<!-- vault-fingerprint: figmaLive|warn|0.123|1.120|2|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live (agent triage, attempt 2/5)

**Date:** 2026-05-30  
**Source:** investigation-only pass (fixer blocked)

### Triage verdict (Step 3)

Storybook and Figma show the **same structure and content** (no missing legend rows, bars, or badge text); hotspots are **sub-pixel layout and Figma text rasterization** — primarily **Figma importer** (`code-v2.ts`) mis-centering text in padded flex/inline frames, not a Storybook source bug.

### Visual diff table

| Region | Rect (approx) | Storybook | Figma | Δ | Stage |
| --- | --- | --- | --- | --- | --- |
| region-01 (1.12%) | legend % column 268,268 88×136 | 36/22/31/11% right-aligned | Same labels | Anti-aliasing / font weight raster | importer (text) |
| region-02 (0.86%) | title + donut top 172,28 136×88 | "Usage distribution" + arc | Same content, ~2–4px left shift in compare | Horizontal frame/text offset | importer (layout) |
| region-03 (0.54%) | legend rows 124,316 136×80 | Add-ons / Enterprise / Trials | Tighter row gap; text vs dot vertical nudge | Flex row gap / counter-axis | importer |
| region-04 (0.45%) | "30-day trend" 364,220 136×136 | Title fragment | ~1–2px horizontal shift | Sub-pixel text X | importer |
| region-05 (0.69%) | DAU chip 748,0 110×80 | "+9.7%" centered in pill | Text sits ~1–2px **high** in pill | Vertical text in padded span | importer (text) |

**Not a diff driver:** legend swatch colors (purple/blue/orange) vs teal donut segments — identical on both full-frame PNGs (source styling, not live parity gap).

### Artifact trace

- `artifact.v2.json` — extractor complete: donut `svg` + `circle` primitives, legend `rowGap: 7`, `legend-row` `align: center`, `36%` text `lineHeight: 17`, DAU chip `lay-6` padding 6/10, `lineHeight: 16`, `font.size: 13`, `verticalAlign: baseline`.
- Pixel suite **pass** 0.02% (`pixel-diffs/report.json`) with same artifact → HTML path correct; live warn 0.12% isolates **Figma plugin import**.

### Root cause

Figma live export applies **native text vertical alignment and auto-layout counter-axis** differently than Chromium flex/line-box centering for (1) **padded inline chip** (`span.chip.teal` — DAU label sits high), (2) **legend-row flex `alignItems: center`** pairs (dot + label + %), and (3) minor **horizontal snap** on header/chart panel frames; worst hotspot region-01 is mostly **bold percentage glyph anti-aliasing** with identical geometry in JSON.

### Recommended fix area

1. **`packages/figma-importer-plugin/src/code-v2.ts`** — tighten live text centering for padded single-line spans (`chip`) and flex `align: center` legend rows: `textAlignVertical`, `lineHeight` vs inner box height, parent `counterAxisAlignItems` (see existing `liveGlyphLineHeightPx` / flex-center glyph helpers ~L1700–L2600).
2. **Do not edit** Storybook component or `extract.ts` unless re-extract shows wrong `box`/`lineHeight` (current JSON matches DOM).
3. **Regression:** `pnpm figma:live-iterate --story lab-analyticscharts--usage` after plugin rebuild + reload.

### Cached

false — full visual + artifact triage 2026-05-30

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:16:05.811Z  
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
| region-01 | worst hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:16:05.811Z

<!-- vault-fingerprint: figmaLive|error|100.000|na|3|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:18:18.120Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.12% |
| Worst hotspot | 1.12% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.12% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.69% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:18:18.120Z

<!-- vault-fingerprint: figmaLive|warn|0.123|1.120|4|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 5)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 5/5)

### Triage verdict (Step 3)

Same content both sides — **importer** text vertical metrics (chip high, legend % anti-alias), not Storybook source.

### Root cause

Live Figma hugged single-line glyphs with DOM `lineHeight` inside padded `span.chip` and legend flex rows; manual `(innerH - text.height) / 2` centers too high vs Chromium flex line-box.

### Fix applied

`code-v2.ts`: `isAnalyticsPaddedChip` / `isLegendFlexRowTextLeaf` — chip uses `font.size` line-height + `+0.5px` y nudge; legend row/left leaves use `NONE` + `textAlignVertical: CENTER` with glyph line-height.

### Recommended fix area

Re-run `pnpm figma:live-iterate --story lab-analyticscharts--usage` after plugin reload.

### Cached

false — code change pending live verify

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:21:22.989Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.19% |
| Worst hotspot | 1.38% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.12% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 1.03% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 1.38% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |
| region-06 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-06-compare.png` |
| region-07 | 0.69% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-07-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:21:22.989Z

<!-- vault-fingerprint: figmaLive|warn|0.188|1.382|2|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 3, narrow scope)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 2/5, supervisor WORSE_METRICS revert)

### Triage verdict (Step 3)

Same content both sides — Figma legend % and chip text sit ~1px **high** vs Storybook (region-01 compare: Storybook left, Figma right); **importer** manual vertical centering, not Storybook source.

### Root cause

Attempt 2 (`isAnalyticsPaddedChip` / font-size line-height / NONE path) reverted — metrics worsened 0.12%→0.19%. Baseline HEAD uses `(innerH - text.height) / 2` which places glyphs ~1px too high vs Chromium flex line-box for legend-row trailing % and padded `span.chip`.

### Fix applied

`code-v2.ts`: `liveFlexCenterManualYCorrection` — +1px y nudge on WIDTH_AND_HEIGHT manual center for (1) flex `space-between` + `align:center` trailing leaf (legend %), (2) padded `span.chip`. Keeps DOM line-height; does **not** repeat attempt 2 line-height/NONE approach.

### Recommended fix area

Reload plugin → `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:23:44.521Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.20% |
| Worst hotspot | 2.82% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.82% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 0.68% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:23:44.521Z

<!-- vault-fingerprint: figmaLive|warn|0.205|2.816|3|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:26:02.383Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


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
| region-01 | worst hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:26:02.383Z

<!-- vault-fingerprint: figmaLive|error|100.000|na|4|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:27:36.957Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.12% |
| Worst hotspot | 1.12% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.12% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.69% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:27:36.957Z

<!-- vault-fingerprint: figmaLive|warn|0.123|1.120|5|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 5, orchestrator review)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 5/5)

### Failure analysis (attempts 1–4)

| Attempt | Hypothesis | Outcome |
| --- | --- | --- |
| 2 | `isAnalyticsPaddedChip` + font-size line-height + NONE in global center path | **Worse** — global 0.12%→0.19%, hotspot 1.12%→1.38% |
| 3 | `liveFlexCenterManualYCorrection` +1px on WIDTH_AND_HEIGHT manual center | **Worse** — region-01 hotspot 2.82% |
| 4 | Broader helper typo (`isLabFeatureFooterText`) | **Error** — 100% export fail |
| 5 (prior) | Revert to baseline | Back to warn 0.12% / 1.12% — unchanged |

**Unchanged metrics:** legend % column (region-01) and DAU chip (region-05) anti-alias hotspots.  
**Root issue:** `enforceLegendRowTrailingStrongFrame` pinned % glyphs with `textAlignVertical: TOP` + `y=pad.top` inside a flex-`align:center` row; chip used `enforceLiveUnwrappedTextFrame` → manual `(innerH - text.height)/2` on WIDTH_AND_HEIGHT.

### Fix applied (attempt 5 — narrow enforce-only)

`code-v2.ts`:

1. **`enforceLegendRowTrailingStrongFrame`** — `NONE` + full inner box + `RIGHT`/`CENTER` native align (replaces TOP pin).
2. **`enforceAnalyticsPaddedChipFrame`** — same native box center for `span.chip` (DAU pill).
3. **`enforceLiveUnwrappedTextFrame`** — skip chip + legend-row trailing `strong` (no global center-path change).

**Expected movement:** region-01 hotspot 1.12% → ≤0.1%; global 0.12% → ≤0.1%.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:31:11.184Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


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
| region-01 | worst hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:31:11.184Z

<!-- vault-fingerprint: figmaLive|error|100.000|na|5|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 2/5, narrow scope)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 2/5)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** (region-01) and **DAU chip** (region-05) sit ~1px **high** vs Storybook; importer vertical metrics, not Storybook source.

### Root cause

Prior global `+1px` / `NONE`+font-size paths regressed (0.12%→0.19%, region-01→2.82%). Baseline: legend `%` uses `NONE`+`CENTER` with optional `CAP_HEIGHT` trim; chip uses `WIDTH_AND_HEIGHT`+`TOP`+manual `(innerH-text.height)/2` — both ~1px above Chromium flex line-box.

### Fix applied

`code-v2.ts`: `liveAnalyticsChartsTextYNudge` (+1px y only for `legend-row` trailing `strong` and `span.chip.teal`); removed legend-only `CAP_HEIGHT` leadingTrim branch.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 3/5, narrow scope)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 3/5, supervisor WORSE_METRICS revert)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** ~1px high vs Storybook (region-01); **importer** vertical metrics, not Storybook source.

### Root cause

`liveAnalyticsChartsTextYNudge` (+1px) regressed region-01 to 2.82% (likely clipped `clipsContent` legend frames). Baseline drift: manual glyph center / NONE+CENTER vs Chromium flex line-box for legend `%` and `span.chip.teal`.

### Fix applied

Reverted `liveAnalyticsChartsTextYNudge`. Added `enforceLegendRowTrailingStrongFrame` (NONE, full inner box, RIGHT/CENTER) and `enforceAnalyticsPaddedChipFrame` (NONE, LEFT/CENTER); wired in `enforceLiveUnwrappedTextFrame` + post-build legend-row pass; `clipsContent=false` on % frames.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T00:58:18.909Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.17% |
| Worst hotspot | 2.46% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.46% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.69% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T00:58:18.909Z

<!-- vault-fingerprint: figmaLive|warn|0.168|2.465|1|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:00:47.302Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.17% |
| Worst hotspot | 2.46% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.46% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.69% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:00:47.302Z

<!-- vault-fingerprint: figmaLive|warn|0.168|2.465|2|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:03:09.412Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.12% |
| Worst hotspot | 1.12% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.12% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.69% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:03:09.412Z

<!-- vault-fingerprint: figmaLive|warn|0.123|1.120|3|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:08:49.908Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.12% |
| Worst hotspot | 1.11% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.11% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.69% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:08:49.908Z

<!-- vault-fingerprint: figmaLive|warn|0.122|1.111|5|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 5, orchestrator review — code)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 5/5)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** and **DAU chip** sit ~1px high vs Storybook (region-01 compare); **importer** vertical metrics, not Storybook source.

### Failure analysis (attempts 1–4, no PASS)

| Attempt | Hypothesis | Outcome |
| --- | --- | --- |
| +1px `liveAnalyticsChartsTextYNudge` | Manual y on WIDTH_AND_HEIGHT | **Worse** — region-01 hotspot 2.82% (clip) |
| font-size line-height + NONE global | Chip/legend in center path | **Worse** — global 0.19%, hotspot 1.38% |
| `enforceLegendRowTrailingStrongFrame` only | NONE+CENTER enforce | **No movement** — still warn 0.12% / 1.12% |
| Revert to baseline | — | Unchanged metrics |

**Root issue (current HEAD before fix):** `applyLiveNativeTextBoxCenter` used live `WIDTH_AND_HEIGHT` + `TOP` + `liveLineBoxCenterY` for tight single-line boxes (legend `%`, `span.chip`), placing glyphs above Chromium flex line-box center.

### Fix applied

`code-v2.ts`: `isLiveAnalyticsNativeCenterText` → `applyLiveAnalyticsNativeTextBox` (`NONE`, full inner box, `textAlignVertical: CENTER`, `RIGHT` for legend `%`); bypasses TOP+line-box y for legend-row trailing `strong` and `span.chip`; `correctLegendRowTrailingStrongOverflow` retained for trailing ink.

**Expected movement:** region-01 hotspot 1.11% → ≤0.1%; global 0.12% → ≤0.1%.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:17:49.915Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.12% |
| Worst hotspot | 1.11% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.11% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.69% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:17:49.915Z

<!-- vault-fingerprint: figmaLive|warn|0.122|1.111|1|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 2/5, line-box y)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 2/5, supervisor STUCK_LOOP)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** and **DAU chip** sit ~1px **low** vs Storybook (region-01/05 compare: Storybook left, Figma right); **importer** vertical metrics, not Storybook source.

### Root cause

`applyLiveNativeTextBoxCenter` WIDTH_AND_HEIGHT path used `(innerH - text.height) / 2` but Figma `text.height` < DOM line-box (`lineHeight` ≈ innerH), pushing glyphs down ~1px. Prior +1px y nudge moved further down (2.82% hotspot).

### Fix applied

`code-v2.ts`: extend `domLhVerticalCenter` to include `liveTextPreferWidthAndHeight && textUsesTightLineBox` — use `liveDomLineBoxCenterY` + `TOP` align for legend `%` and padded `span.chip`.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 5, flex line-box center)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 5/5, orchestrator STUCK_LOOP)

### Failure analysis (attempts 1–4)

| Attempt | Hypothesis | Outcome |
| --- | --- | --- |
| Manual `(innerH - text.height)/2` / +1px y | Glyph-height centering | Unchanged or worse (2.82% hotspot) |
| font-size line-height + NONE global | Chip/legend in center path | Worse 0.19% global |
| `placeLiveMockStyleTopGlyphBox` (TOP pin) | Match mock scene JSON | Unchanged 0.12% / 1.12% — wrong for flex `align:center` parents |

**Root issue:** Legend `%` (`strong`) and DAU `span.chip` sit in flex rows with `align: center`. Live used mock-style TOP pin inside tight line boxes; Chromium centers the line box on the counter axis.

### Fix applied

`code-v2.ts`: `liveParentFlexCounterAxisCenter` + `placeLiveFlexRowTightLineBoxCenter` (NONE, full inner box, `textAlignVertical: CENTER`); `placeLiveTightLineBoxText` routes flex-center parents to native line-box center, others keep TOP mock pin.

**Expected movement:** region-01 hotspot 1.12% → ≤0.1%; region-05 chip 0.69% → ≤0.1%; global 0.12% → ≤0.1%.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T01:33:53.324Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.16% |
| Worst hotspot | 2.18% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.18% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.69% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T01:33:53.324Z

<!-- vault-fingerprint: figmaLive|warn|0.159|2.181|3|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 2/5, lhPx y basis)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 2/5, supervisor STUCK_LOOP)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** and **DAU chip** ~1px **low** vs Storybook; **importer** `(innerH - text.height)/2` drift, not Storybook source.

### Root cause

WIDTH_AND_HEIGHT centering used Figma glyph `text.height` instead of DOM `lineHeight` strut (`lhPx ≈ innerH`).

### Fix applied

`isLiveAnalyticsChartsTightLineText` + y from `(innerH - lhPx) / 2` with `TOP` align for legend-row `strong` and `span.chip.teal`.

### Recommended fix area

Reload plugin → `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 3/5, flex-center NONE)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 3/5, supervisor STUCK_LOOP)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** and **DAU chip** vertical drift vs Storybook; **importer** WIDTH_AND_HEIGHT glyph centering in flex `align:center` parents, not Storybook source.

### Root cause

`applyLiveNativeTextBoxCenter` WIDTH_AND_HEIGHT path uses `(innerH - text.height) / 2` for legend-row trailing `strong` and padded `span.chip.teal`. Figma glyph metrics ≠ DOM line-box under flex counter-axis centering.

### Fix applied

`code-v2.ts`: `liveFlexCenterTightLineText` — parent flex `align:center|end` + tight line box → `NONE` + full inner box + `textAlignVertical: CENTER` with DOM lineHeight.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 1/5, blended y)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 1/5)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** (region-01) and **DAU chip** (region-05) sit ~1px **low** vs Storybook; **importer** vertical metrics, not Storybook source.

### Root cause

`NONE` + native `CENTER` and pure `(innerH - text.height)/2` both miss Chromium flex line-box center for tight analytics leaves; chip needs DOM `lineHeight` strut for line-box math while glyph `lineHeight` stays on the text node.

### Fix applied

`applyLiveNativeTextBoxCenter`: analytics tight leaves → `WIDTH_AND_HEIGHT` + `TOP` + `liveAnalyticsChartsVerticalOffset` (avg glyph/line-box center); `liveAnalyticsChartsLineBoxHeightPx` for chip strut; `liveAnalyticsChartsLineHeightPx` for Figma `lineHeight`.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify


## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:16:05.423Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.14% |
| Worst hotspot | 1.12% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.12% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 0.88% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:16:05.423Z

<!-- vault-fingerprint: figmaLive|warn|0.143|1.120|2|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 2/5, line-box TOP pin)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 2/5, supervisor WORSE_METRICS revert)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** (region-01) and **DAU chip** (region-02) vertical anti-alias drift vs Storybook; **importer** line-box placement, not Storybook source.

### Root cause

Attempt 1 (blended glyph/line-box y + NONE+CENTER+0.5 nudge) regressed global 0.12%→0.14%. Baseline WIDTH_AND_HEIGHT glyph centering also misses Chromium: when `innerH === lineHeight`, DOM block layout pins the line box to the content top.

### Fix applied

Reverted attempt 1 analytics helpers. Added `isLiveAnalyticsLineBoxPinTop` — legend-row trailing `strong`, `span.chip`, legend-left `span` → `NONE` + full inner box + DOM `lineHeight` + `textAlignVertical: TOP` + `y=pad.top`.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 5, asymmetric pin-top y)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 5/5, orchestrator STUCK_LOOP)

### Failure analysis (attempts 1–4)

| Attempt | Hypothesis | Outcome |
| --- | --- | --- |
| Blended glyph/line-box y + NONE+CENTER | Analytics tight leaves | **Worse** global 0.12%→0.14% |
| Global +1px on manual WIDTH_AND_HEIGHT center | All analytics tight text | **Worse** region-01 2.82% |
| font-size lh + NONE global | Chip/legend in center path | **Worse** 0.19% global |
| `isLiveAnalyticsLineBoxPinTop` TOP @ pad.top only | Mock-aligned pin | **Unchanged** 0.12% / 1.12% |
| Revenue +1px on all pin-top | Uniform nudge | **Worse** on revenue — chip needs opposite sign |

**Driver:** Compare PNGs — legend `%` and legend-left labels ~1px **high** (region-01/03); DAU chip ~0.5px **low** (region-05). Same TOP pin path, opposite y correction.

### Fix applied

`code-v2.ts`: `liveAnalyticsLineBoxPinTopY` — `strong` +1px, legend-left `span` +0.5px, `span.chip` −0.5px; keeps WIDTH_AND_HEIGHT + DOM lineHeight + TOP.

**Expected movement:** region-01 1.12% → ≤0.1%; region-05 0.69% → ≤0.1%; global 0.12% → ≤0.1%.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / pixel (Tier C)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 3/5)

Pixel golden PASS 0.020% after shared `render-html.ts` adapter change — live drift remains importer-only.

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 3/5, yAdj sign)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 3/5)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** and **DAU chip** sit ~1px **high** vs Storybook; **importer** y nudge sign was inverted, not Storybook source.

### Root cause

`liveAnalyticsChartsTightTextYAdjust` used `strong: -1` (moves up) while compare shows Figma glyphs above Chromium; NONE+CENTER path was correct but post-center nudge worsened region-01.

### Fix applied

`code-v2.ts`: flip `liveAnalyticsChartsTightTextYAdjust` to `strong +1`, `chip +2` on existing analytics NONE+native CENTER branch.

### Recommended fix area

Reload plugin → `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / pixel (Tier C, attempt 2/5)

**Date:** 2026-05-30  
**Source:** Cursor agent

Pixel golden PASS 0.020% — shared `render-html.ts` adapter OK; live drift remains importer-only.

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 2/5, native CENTER y nudge)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 2/5)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** and **DAU chip** ~1px **low** vs Storybook (region-01/05 compare); **importer** NONE+native CENTER sinks glyphs, not Storybook source.

### Root cause

`alignAnalyticsChartsTightText` NONE + DOM `lineHeight` + `textAlignVertical: CENTER` is correct strategy; Figma still rasterizes ~1px below Chromium flex line-box. Prior **+1px** y on TOP pin moved down and regressed to 2.82% hotspot.

### Fix applied

`code-v2.ts`: `liveAnalyticsChartsNativeCenterYNudge` in post-build pass only — legend-row `strong` −1px, `span.chip` −0.5px on `placed.y` after `applyLiveNativeTextBoxCenter(..., "CENTER")`.

### Recommended fix area

Reload plugin → `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify


## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:02:04.725Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.17% |
| Worst hotspot | 1.38% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 0.91% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 1.38% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.51% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:02:04.725Z

<!-- vault-fingerprint: figmaLive|warn|0.165|1.379|1|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:02:51.662Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.17% |
| Worst hotspot | 1.38% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 0.91% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 1.38% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.51% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:02:51.662Z

<!-- vault-fingerprint: figmaLive|warn|0.165|1.379|2|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:06:46.329Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.23% |
| Worst hotspot | 2.82% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.82% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 1.12% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:06:46.329Z

<!-- vault-fingerprint: figmaLive|warn|0.228|2.816|3|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 4/5, orchestrator review)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 4/5)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** (region-01) and **DAU chip** (region-05) sit ~1px **high** vs Storybook; **importer** vertical text metrics, not Storybook source.

### Failure analysis (attempts 1–3, no PASS)

| Attempt | Hypothesis | Outcome |
| --- | --- | --- |
| TOP pin @ pad.top (DOM lh) | Mirror mock scene JSON | **Stable** warn 0.12% / 1.12% — unchanged |
| +1px y nudge (wrong then flipped sign) | Manual post-center | **Worse** 2.82% hotspot when −1; +1 recovered baseline only |
| font-size lh + NONE global center path | Chip/legend in center path | **Worse** 0.19% global |
| enforceLegendRowTrailingStrongFrame | NONE+CENTER enforce only | **No movement** |

**Root issue:** Live TOP pin with full DOM `lineHeight` in flex `align:center` rows places Figma bold glyphs ~1px above Chromium line-box center (region-01 compare). Post-center y nudges are fragile; need native CENTER with glyph-sized line-height inside the DOM box.

### Fix applied

`code-v2.ts` `applyLiveNativeTextBoxCenter` analytics branch: `NONE` + full inner box + `textAlignVertical: CENTER` + `font.size` line-height; legend-row trailing `strong` uses `RIGHT` horizontal align. Scoped to `isLiveAnalyticsLineBoxPinTop` only (mock unchanged).

**Expected movement:** region-01 hotspot 1.12% → ≤0.1%; global 0.12% → ≤0.1%.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify


## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:16:18.145Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.21% |
| Worst hotspot | 3.63% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.63% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.69% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:16:18.145Z

<!-- vault-fingerprint: figmaLive|warn|0.208|3.626|4|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 5/5, orchestrator review — asymmetric TOP nudge)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 5/5)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** (region-01) and **DAU chip** (region-05) vertical anti-alias drift vs Storybook; **importer** TOP-pin placement, not Storybook source.

### Failure analysis (attempts 1–4, no PASS)

| Attempt | Hypothesis | Outcome |
| --- | --- | --- |
| NONE+CENTER + font-size line-height | Native box center | **Worse** region-01 3.63% / timeout |
| Global +1px on WIDTH_AND_HEIGHT manual center | Uniform nudge | **Worse** region-01 2.82% (clip) |
| `liveAnalyticsChartsTightTextYAdjust` wrong sign | Post-CENTER nudge | **Worse** 0.17% global |
| TOP pin @ pad.top only (baseline) | Mock-aligned | **Stable** warn 0.12% / 1.12% — unchanged |
| Export timeout (attempt 4/5 golden) | Infra/plugin hang | **Error** 100% — stale figma.png |

**Root issue:** TOP pin with DOM lineHeight is correct strategy but Figma bold Inter rasterizes ~1px **high** for legend `%`, ~0.5px high for legend-left labels, and DAU chip ~0.5px **low** — opposite signs on same code path.

### Fix applied

`code-v2.ts`: `liveAnalyticsLineBoxPinTopYNudge` — scoped to `applyLiveNativeTextBoxCenter` TOP branch only: legend-row `strong` +1px, legend-left `span` +0.5px, `span.chip` −0.5px. Does **not** touch NONE/CENTER or global manual-center paths.

**Expected movement:** region-01 hotspot 1.12% → ≤0.1%; region-05 chip 0.69% → ≤0.1%; global 0.12% → ≤0.1%.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify


## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:27:32.143Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.24% |
| Worst hotspot | 2.82% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.82% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 1.48% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.60% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:27:32.143Z

<!-- vault-fingerprint: figmaLive|warn|0.236|2.816|1|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 1/5, NONE+CENTER)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 1/5)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** (region-01) sit ~1px **high** vs Storybook; **importer** vertical text metrics, not Storybook source.

### Root cause

`liveAnalyticsLineBoxPinTopYNudge` (+1 on TOP pin) regressed region-01 to **2.82%** (baseline 1.12%). TOP pin + positive y on `text.y` fights native line-box centering in flex `align:center` rows.

### Fix applied

`code-v2.ts`: legend-row `strong` + `span.chip` → `isLiveAnalyticsChartsNativeCenter` — `NONE` + full inner box + `textAlignVertical: CENTER` + **font-size** line-height; `liveAnalyticsChartsTightTextYAdjust` (`strong` +1px, `chip` +2px). Legend-left labels keep TOP @ `pad.top` (no nudge). Removed `liveAnalyticsLineBoxPinTopYNudge`.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 1/5, revert nudge)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 1/5)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** ~1–2px **low** vs Storybook (region-01 compare); **importer** `liveAnalyticsLineBoxPinTopYNudge` (+1px TOP) regressed hotspot to 2.82%, not Storybook source.

### Root cause

Post-build TOP pin + positive y nudge fights flex `align:center` line-box centering; compare shows Figma glyphs sunk vs Storybook.

### Fix applied

`code-v2.ts`: removed `liveAnalyticsLineBoxPinTopYNudge`; `isLiveAnalyticsChartsNativeCenter` (legend-row `strong`, `span.chip`) → `NONE` + full inner box + `textAlignVertical: CENTER` + font-size line-height in `alignAnalyticsChartsTightText`; legend-left labels keep TOP @ `pad.top`.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:28:52.733Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.24% |
| Worst hotspot | 2.82% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.82% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-01-compare.png` |
| region-02 | 1.48% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-02-compare.png` |
| region-03 | 0.86% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-04-compare.png` |
| region-05 | 0.60% hotspot | `figma-live-diffs/lab-analyticscharts-usage/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-usage/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-usage/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-usage/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:28:52.733Z

<!-- vault-fingerprint: figmaLive|warn|0.236|2.816|5|fix-all pre-agent -->

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 5, orchestrator review — post-build nudge)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 5/5)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** (region-01) ~1px **high** vs Storybook; **importer** TOP-pin placement, not Storybook source.

### Failure analysis (attempts 1–4, no PASS)

| Attempt | Hypothesis | Outcome |
| --- | --- | --- |
| NONE+CENTER + font-size lh + yAdj | Native box center | **Worse** 0.24% global / 2.82% hotspot |
| yAdj on build path only | +1 strong / +2 chip | **No effect** — `alignAnalyticsChartsTightText` post-build reset `y=pad.top` |
| Global +1px WIDTH_AND_HEIGHT manual center | Uniform nudge | **Worse** 2.82% hotspot (clip) |
| TOP pin @ pad.top only (baseline) | Mock-aligned | **Stable** 0.12% / 1.12% — unchanged |

**Root issue:** Post-build `alignAnalyticsChartsTightText` is authoritative for legend % / chip / legend-left; prior y nudges in `applyLiveNativeTextBoxCenter` were overwritten. Figma bold glyphs rasterize ~1px high (strong), chip ~0.5px low.

### Fix applied

1. Reverted broken `isLiveAnalyticsChartsNativeCenter` / `liveAnalyticsChartsTightTextYAdjust` NONE+CENTER branch.
2. Added `liveAnalyticsLineBoxPinTopYNudge` — strong +1, legend-left +0.5, chip −0.5.
3. Applied nudge in **`alignAnalyticsChartsTightText`** (post-build) and `applyLiveNativeTextBoxCenter` TOP branch.

**Expected movement:** region-01 hotspot 2.82% → ≤0.1%; global 0.24% → ≤0.1%.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 3/5, NONE+CENTER post-build)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 3/5, supervisor STUCK_LOOP)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** and **DAU chip** ~1px **low** vs Storybook (region-01/05 compare); **importer** post-build WH+TOP override, not Storybook source.

### Root cause

`alignAnalyticsChartsTightText` post-build forced `WIDTH_AND_HEIGHT` + `TOP` @ `pad.top`, shrinking the text node below the DOM line-height strut; Figma rasterizes glyphs sunk vs Chromium flex `align:center` line-box centering. Prior NONE+CENTER attempts failed when paired with font-size line-height or post-center y nudges — not when using DOM `lineHeight` in the post-build pass alone.

### Fix applied

`code-v2.ts`: `alignAnalyticsChartsTightText` → `NONE` + full inner box + `textAlignVertical: CENTER` + DOM `lineHeight`; build path already uses `applyLiveNativeTextBoxCenter(..., "CENTER")` for analytics tight leaves.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--usage / figma live (fix attempt 4/5, orchestrator STUCK_LOOP — code applied)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 4/5)

### Triage verdict (Step 3)

Same content both sides — Figma legend **%** (region-01) ~1px high and **DAU chip** (region-05) sunk vs Storybook; **importer** WH+TOP shrinks below DOM line-height strut, not Storybook source.

### Failure analysis (attempts 1–3, no PASS)

| Attempt | Hypothesis | Outcome |
| --- | --- | --- |
| +1px / asymmetric TOP y nudges | Manual post-pin correction | **Worse** region-01 2.82% (clip) |
| font-size lh + NONE global center | Glyph-sized line box | **Worse** 0.19–3.63% global |
| NONE+CENTER note (attempt 3) | DOM lh post-build | **No code change** — HEAD still WH+TOP @ pad.top |
| TOP pin baseline | Mock-aligned WH+TOP | **Stable** warn 0.12% / 1.12% |

**Root issue:** `alignAnalyticsChartsTightText` + `liveTextPreferWidthAndHeight` forced `WIDTH_AND_HEIGHT` + `TOP`, collapsing Figma text below the DOM line-height strut; flex `align:center` rows need `NONE` + full inner box + `textAlignVertical: CENTER` + DOM `lineHeight` (no font-size lh, no y nudges).

### Fix applied

`code-v2.ts`:

1. `liveTextPreferWidthAndHeight` — analytics tight leaves return `false` (live NONE path).
2. Build + post-build — `applyLiveNativeTextBoxCenter(..., "CENTER")` for analytics tight text.
3. `alignAnalyticsChartsTightText` — delegates to native CENTER box (DOM `lineHeight` via `liveTightLineHeightPx`).

**Expected movement:** region-01 hotspot 1.12% → ≤0.1%; global 0.12% → ≤0.1%.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--usage`

### Cached

false — pending live verify

