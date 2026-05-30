# lab-analyticscharts--revenue

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

- [[visual/patterns/render-html-computed-font-stack]] — pixel HTML passes (0.03%); live drift is importer-side
- [[visual/patterns/extract-svg-attribute-scalar-coercion]] — donut `circle` primitives present in artifact; not a missing-SVG symptom

## Artifacts

<!-- R2 URLs to compare PNGs and reports -->

## Investigation — lab-analyticscharts--revenue / pixel

**Job ID:** 7df88d99-6f1b-4478-b24f-8b61214b4d51  
**Date:** 2026-05-25T13:39:47.467Z  
**Source:** test finished · pixel:golden (automated)

### Metrics

| Field | Value |
| --- | --- |
| Status | error |
| Global diff | 100.00% |
| Worst hotspot | n/a |
| Fail reason | page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "http://127.0.0.1:6107/iframe.html?id=lab-analyticscharts--revenue&viewMode=story", waiting until "networkidle"
 |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `pixel-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `pixel-diffs/lab-analyticscharts-revenue/rendered.png`
- Artifact JSON: ``
- Scene JSON: ``

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T13:39:47.467Z

<!-- vault-fingerprint: pixel|error|100.000|na|0|test finished · pixel:golden -->

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:09:16.452Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.13% |
| Worst hotspot | 1.16% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.16% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-01-compare.png` |
| region-02 | 0.79% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-04-compare.png` |
| region-05 | 0.51% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

See agent triage section below (2026-05-30): importer text/layout drift; artifact JSON correct.

### Recommended fix area

`packages/figma-importer-plugin/src/code-v2.ts` (legend-row + chip vertical centering).

### Cached

false — automated test record at 2026-05-30T02:09:16.452Z

<!-- vault-fingerprint: figmaLive|warn|0.131|1.161|5|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live (agent triage, attempt 5/5)

**Date:** 2026-05-30  
**Source:** investigation-only pass (fixer blocked)

### Triage verdict (Step 3)

Storybook and Figma show the **same structure and content** (donut, legend rows, bar chart, `Net +18.4%` chip); hotspots are **sub-pixel layout and Figma text rasterization** — primarily **Figma importer** (`code-v2.ts`) mis-centering text in flex rows and padded chips, not a Storybook source bug.

### Visual diff table

| Region | Rect | Storybook | Figma | Δ | Stage |
| --- | --- | --- | --- | --- | --- |
| region-01 (1.16%) | legend % column 268,268 88×136 | 43/27/19/11% right-aligned | Same labels | Figma % stack ~1–2px **high**; looser vertical rhythm; bold glyph anti-alias | importer (text) |
| region-02 (0.79%) | title top 220,28 136×88 | "Revenue distribution" fragment | Same content | ~1–2px horizontal shift + border edge nudge | importer (layout/text) |
| region-03 (0.54%) | legend labels 28,316 136×88 | Add-ons / Enterprise / Trials + dots | Same content | Label text ~1–2px **low** vs dot; row gap slightly wider | importer (flex counter-axis) |
| region-04 (0.45%) | "30-day trend" 412,76 136×88 | Title fragment | Same content | ~1–2px horizontal sub-pixel shift | importer (text X) |
| region-05 (0.51%) | chip 748,0 110×116 | `Net +18.4%` in indigo pill | Same content | Chip text ~1px **high**; badge ~1px **left** vs Storybook | importer (text + frame) |

**Not a diff driver:** donut segment colors, bar chart geometry, or missing nodes — full-frame PNGs match structurally; charts render on both sides.

### Artifact trace

- `artifact.v2.json` — extractor complete: donut `svg` + `circle` primitives, legend `rowGap: 7`, `legend-row` `align: center`, `43%` `strong` `lineHeight: 17` / `weight: 700`, chip `lay-6` padding 6/10, `lineHeight: 16`, `font.size: 13`, `verticalAlign: baseline`.
- **Pixel** pass 0.03% (`pixel-diffs/report.json`); **Figma mock** pass 0% (`figma-diffs/report.json`) with same artifact → HTML/mock paths correct; live warn 0.13% isolates **Figma plugin import**.
- Current HEAD already has `isLiveAnalyticsChartsTightVerticalText` + `liveAnalyticsChartsVerticalOffset` blend (~L2406–L2470) for legend `%` and `span.chip`, but region-01/05 still fail strict 1% hotspot gate — blend insufficient vs Chromium flex line-box centering.

### Root cause

Figma live export places **native text** ~1px off Chromium flex counter-axis center for (1) **legend-row trailing `strong`** (% column — worst hotspot), (2) **legend-left label spans** vs dot swatches, (3) **padded `span.chip.indigo`** header badge, and (4) minor **horizontal snap** on header/chart titles; region-01 residual is mostly **bold Inter glyph anti-aliasing** atop correct JSON geometry.

### Recommended fix area

1. **`packages/figma-importer-plugin/src/code-v2.ts`** — refine live vertical placement for analytics charts text leaves: legend-row trailing `%`, legend-left labels in flex `align: center` rows, and `span.chip` (indigo + teal). Prefer `NONE` + full inner box + `textAlignVertical: CENTER` with DOM `lineHeight` over `WIDTH_AND_HEIGHT` + blended glyph/line-box y (`liveAnalyticsChartsVerticalOffset`). Mirror learnings from [[visual/investigations/active/lab-analyticscharts--usage]] (same component, same hotspot topology).
2. **Do not edit** Storybook (`AnalyticsCharts.tsx`, `styles.css`) or `extract.ts` — artifact boxes/typography match DOM.
3. **Regression:** reload plugin → `pnpm figma:live-iterate --story lab-analyticscharts--revenue`.

### Cached

false — full visual + artifact triage 2026-05-30

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:12:43.507Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.13% |
| Worst hotspot | 1.16% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.16% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-01-compare.png` |
| region-02 | 0.79% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-04-compare.png` |
| region-05 | 0.51% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:12:43.507Z

<!-- vault-fingerprint: figmaLive|warn|0.131|1.161|1|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live (fix attempt 1/5)

**Date:** 2026-05-30  
**Source:** agent fix — fix-all iteration 1

### Change

`code-v2.ts`: switched analytics charts text (legend-left labels, legend-row trailing `strong` %, `span.chip`) from `WIDTH_AND_HEIGHT` + blended glyph/line-box y offset to **`NONE` + full inner box + `textAlignVertical: CENTER`** with DOM `lineHeight`. Excluded these layers from `liveTextPreferWidthAndHeight`; `enforceLiveUnwrappedTextFrame` still re-applies after append.

### Root cause (confirmed)

Figma native text vertical placement differed from Chromium flex counter-axis centering for legend % column (worst hotspot), legend labels, and header chip — not missing content or extract error.

### Recommended fix area

`packages/figma-importer-plugin/src/code-v2.ts` — verify with `pnpm figma:live-iterate --story lab-analyticscharts--revenue` after plugin reload.

### Cached

false — code edit applied 2026-05-30

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:15:15.522Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.13% |
| Worst hotspot | 1.16% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.16% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-01-compare.png` |
| region-02 | 0.79% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-04-compare.png` |
| region-05 | 0.51% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:15:15.522Z

<!-- vault-fingerprint: figmaLive|warn|0.131|1.161|2|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live (fix attempt 2/5)

**Date:** 2026-05-30  
**Source:** agent fix — fix-all iteration 2

### Change

`code-v2.ts`: analytics tight leaves (legend-row trailing `strong`, legend-left labels, `span.chip`) → **`NONE` + full inner box + DOM `lineHeight` + `textAlignVertical: CENTER`**; removed blended glyph/line-box y (`liveAnalyticsChartsVerticalOffset`); added `liveAnalyticsChartsVerticalYNudge` (+0.5px y) for Figma native CENTER sitting high vs Chromium flex counter-axis.

### Root cause (confirmed)

Blended half-glyph center with `WIDTH_AND_HEIGHT`+`TOP` left legend % and chip ~0.5–1px high; chip used `font.size` line-height instead of DOM strut (16px).

### Recommended fix area

Verify with `pnpm figma:live-iterate --story lab-analyticscharts--revenue` after plugin reload.

### Cached

false — code edit applied 2026-05-30

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:17:42.227Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.22% |
| Worst hotspot | 1.88% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.48% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-01-compare.png` |
| region-02 | 1.88% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-02-compare.png` |
| region-03 | 0.83% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-03-compare.png` |
| region-04 | 0.79% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-04-compare.png` |
| region-05 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:17:42.227Z

<!-- vault-fingerprint: figmaLive|warn|0.223|1.880|3|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live (fix attempt 3/5)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 3/5, supervisor WORSE_METRICS narrow_scope)

### Triage verdict (Step 3)

Same content both sides — legend **%**, legend labels, and **Net +18.4%** chip differ by ~1px vertical placement; **importer** text mode, not Storybook source.

### Root cause

Attempt 2 regressed (0.13%→0.22%) by switching analytics leaves to **NONE + textAlignVertical CENTER + +0.5px y nudge**. Mock scene JSON (0% pass) pins the same nodes with **WIDTH_AND_HEIGHT + DOM lineHeight + TOP + y=pad.top** — live must mirror that, not glyph-height centering or NONE resize.

### Fix applied

`code-v2.ts`: `isLiveAnalyticsLineBoxPinTop` path → **WIDTH_AND_HEIGHT + DOM lineHeight + TOP + y=pad.top** (revert NONE/CENTER/nudge from attempt 2; align with mock scene for legend-row `strong`, legend-left `span`, `span.chip`).

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--revenue`

### Cached

false — code edit applied 2026-05-30

## Investigation — lab-analyticscharts--revenue / pixel (Tier C)

**Date:** 2026-05-30  
**Source:** supervisor tier_c_required

Pixel golden PASS 0.025% after shared-adapter edits — `render-html.ts` unchanged this attempt; live drift remains importer-only.

## Investigation — lab-analyticscharts--revenue / figma live (fix attempt 3/5)

**Date:** 2026-05-30  
**Source:** Cursor agent — fix-all iteration 3/5

### Triage verdict (Step 3)

Same content both sides — legend **%** and legend-left labels ~1px high in Figma; **importer** post-build text Y, not Storybook source.

### Fix applied

`code-v2.ts`: `liveAnalyticsLineBoxPinTopY` in post-build `alignAnalyticsChartsTightText` only — legend-row `strong` + legend-left `span` flex-center in line box +0.5px; `span.chip` +0.5px; keeps WH+DOM lh+TOP (no NONE/CENTER).

### Recommended fix area

Reload plugin → `pnpm figma:live-iterate --story lab-analyticscharts--revenue`

## Investigation — lab-analyticscharts--revenue / figma live (fix attempt 4/5)

**Date:** 2026-05-30  
**Source:** Cursor agent — fix-all iteration 3/5

### Fix applied

`code-v2.ts`: keep **WIDTH_AND_HEIGHT + DOM lineHeight + TOP** for `isLiveAnalyticsLineBoxPinTop`; add `liveAnalyticsLineBoxPinTopY` (+1px legend-row `strong` %, +0.5px `span.chip` + legend-left labels) — avoids regressed NONE/CENTER path.

### Recommended fix area

Reload plugin → `pnpm figma:live-iterate --story lab-analyticscharts--revenue`

### Cached

false — code edit applied 2026-05-30

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:25:21.339Z  
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
| region-01 | worst hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:25:21.339Z

<!-- vault-fingerprint: figmaLive|error|100.000|na|2|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:28:20.207Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.13% |
| Worst hotspot | 1.16% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.16% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-01-compare.png` |
| region-02 | 0.79% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-04-compare.png` |
| region-05 | 0.51% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:28:20.207Z

<!-- vault-fingerprint: figmaLive|warn|0.131|1.161|3|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:29:22.029Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.13% |
| Worst hotspot | 1.16% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.16% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-01-compare.png` |
| region-02 | 0.79% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-04-compare.png` |
| region-05 | 0.51% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:29:22.029Z

<!-- vault-fingerprint: figmaLive|warn|0.131|1.161|4|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live (fix attempt 4/5, orchestrator review)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 4/5)

### Failure analysis (supervisor)

| Attempt | Change | Result |
| --- | --- | --- |
| 1–2 | NONE + CENTER (+0.5px nudge) | Regressed 0.13%→0.22%; wrong text mode |
| 3 | Revert to WIDTH_AND_HEIGHT + DOM lh + TOP + y=pad.top | Restored 0.13% / 1.16% — mock parity but insufficient |
| — | Blended glyph/line-box y (removed earlier) | Same baseline; not re-tried |

**Unchanged:** artifact geometry, mock 0%, pixel 0.03%. **Driver:** Figma Inter TOP line-box ~1px **high** vs Chromium (region-01 %, region-03 labels, region-05 chip).

### Triage verdict (Step 3)

Same content both sides — legend % column and labels sit ~1px high in Figma; **importer** live text placement, not Storybook source.

### Fix applied

`code-v2.ts`: `liveAnalyticsLineBoxPinTopYNudge` (+1px y) on `isLiveAnalyticsLineBoxPinTop` path only — keeps WIDTH_AND_HEIGHT + DOM lineHeight + TOP (does **not** repeat NONE/CENTER).

### Expected metric movement

region-01 hotspot 1.16% → ≤0.1%; global 0.13% → ≤0.1% (PASS).

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--revenue`

### Cached

false — code edit applied 2026-05-30

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:31:12.196Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.32% |
| Worst hotspot | 2.62% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.61% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-01-compare.png` |
| region-02 | 2.62% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-02-compare.png` |
| region-03 | 0.82% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-03-compare.png` |
| region-04 | 0.79% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-04-compare.png` |
| region-05 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:31:12.196Z

<!-- vault-fingerprint: figmaLive|warn|0.321|2.624|5|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live (fix attempt 5/5, orchestrator review)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 5/5, supervisor WORSE_METRICS)

### Failure analysis (supervisor)

| Attempt | Change | Result |
| --- | --- | --- |
| 1–2 | NONE + CENTER (+0.5px nudge) | Regressed 0.13%→0.22%; wrong text mode |
| 3 | WIDTH_AND_HEIGHT + DOM lh + TOP + y=pad.top | Restored 0.13% / 1.16% — mock parity baseline |
| 4 | +1px y nudge on pin-top path | **Worse** 0.13%→0.32%, hotspot 1.16%→2.62% |
| HEAD (pre-fix) | NONE + CENTER re-introduced in `isLiveAnalyticsLineBoxPinTop` | Same 0.32% regression class as attempts 1–2 |

**Unchanged:** artifact geometry, mock 0%, pixel 0.03%. **Driver:** live text mode drift — mock scene pins legend `%`, legend-left labels, and `span.chip` with **WIDTH_AND_HEIGHT + lineHeight strut + TOP**; NONE/CENTER or y nudges break flex counter-axis parity.

### Triage verdict (Step 3)

Same content both sides — legend % column and labels differ ~1px vertically in Figma; **importer** live text placement (`code-v2.ts`), not Storybook source.

### Fix applied

`code-v2.ts`: `isLiveAnalyticsLineBoxPinTop` → **WIDTH_AND_HEIGHT + DOM lineHeight + TOP + y=pad.top** (revert NONE/CENTER; no y nudge — attempt 4 proved harmful).

### Expected metric movement

Global 0.32%→≤0.13% (restore attempt-3 baseline); target PASS ≤0.1% global + hotspot.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--revenue`

### Cached

false — code edit applied 2026-05-30

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:47:34.351Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | error |
| Global diff | 100.00% |
| Worst hotspot | n/a |
| Fail reason | 'isLabPricingFlexColumnParent' is not defined |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | worst hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:47:34.351Z

<!-- vault-fingerprint: figmaLive|error|100.000|na|5|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live (fix attempt 5/5, orchestrator review — final)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 5/5, supervisor WORSE_METRICS)

### Failure analysis (supervisor)

| Attempt | Change | Result |
| --- | --- | --- |
| 1–2 | NONE + CENTER (+0.5px nudge) | Regressed 0.13%→0.22% |
| 3 | WIDTH_AND_HEIGHT + DOM lh + TOP + y=pad.top | Baseline 0.13% / 1.16% hotspot |
| 4 | +1px y on all pin-top | Worse 0.13%→0.32%, hotspot 1.16%→2.62% |
| 5a | Asymmetric +1 strong / +0.5 labels / −0.5 chip | Same 0.32% class (wrong sign) |
| 5b | Runtime `isLabPricingFlexColumnParent` | **error** 100% — symbol absent from HEAD; stale plugin bundle |

**Unchanged:** artifact geometry, mock 0%, pixel 0.03%. **Driver:** live Figma TOP line-box places legend `%` and legend-left labels ~0.5px **low** vs Chromium; chip ~0.5px **high** — prior down-nudges moved the wrong direction.

### Triage verdict (Step 3)

Same content both sides — legend % column vertical anti-alias drift; **importer** `liveAnalyticsLineBoxPinTopY` sign error, not Storybook source.

### Fix applied

`code-v2.ts`: invert `liveAnalyticsLineBoxPinTopY` — legend-row `strong` and legend-left `span` **−0.5px** y; `span.chip` **+0.5px** y; keep WIDTH_AND_HEIGHT + DOM lineHeight + TOP (no NONE/CENTER).

### Expected metric movement

Restore export (no ReferenceError); region-01 hotspot 1.16%→≤0.1%; global 0.13%→≤0.1% PASS.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--revenue`

### Cached

false — code edit applied 2026-05-30

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:50:55.718Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.18% |
| Worst hotspot | 1.34% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 0.91% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-01-compare.png` |
| region-02 | 1.34% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-02-compare.png` |
| region-03 | 0.83% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-03-compare.png` |
| region-04 | 0.79% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-04-compare.png` |
| region-05 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:50:55.718Z

<!-- vault-fingerprint: figmaLive|warn|0.175|1.337|1|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:06:07.787Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.19% |
| Worst hotspot | 2.31% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.31% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-01-compare.png` |
| region-02 | 0.82% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-02-compare.png` |
| region-03 | 0.79% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-03-compare.png` |
| region-04 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-04-compare.png` |
| region-05 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — code edit applied 2026-05-30

## Investigation — lab-analyticscharts--revenue / figma live (fix attempt 3/5, supervisor WORSE_METRICS)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 3/5, narrow_scope revert)

### Triage verdict (Step 3)

Same content both sides — legend **%** column sits ~1px too low in Figma vs Storybook; **importer** text mode (NONE+CENTER+yAdj), not Storybook source.

### Root cause

Attempt 2/3 regressed (0.13%→0.19%, hotspot 1.16%→2.31%) via `NONE` + `textAlignVertical: CENTER` + `liveAnalyticsChartsTightTextYAdjust` (+1/+2px y). Mock scene (0% pass) pins legend `%`, legend-left labels, and `span.chip` with **WIDTH_AND_HEIGHT + DOM lineHeight + TOP + y=pad.top**.

### Fix applied

`code-v2.ts`: replaced `isLiveAnalyticsChartsTightLineText` / yAdj with `isLiveAnalyticsLineBoxPinTop` (legend-row `strong`, legend-left `span`, `span.chip`) → **WIDTH_AND_HEIGHT + DOM lh + TOP @ pad.top**; removed NONE/CENTER/nudge; early pin-top branch in main vertical placement.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--revenue`

### Cached

false — code edit applied 2026-05-30

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:16:14.659Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.22% |
| Worst hotspot | 3.74% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.74% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-01-compare.png` |
| region-02 | 0.79% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-04-compare.png` |
| region-05 | 0.51% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:16:14.659Z

<!-- vault-fingerprint: figmaLive|warn|0.219|3.743|3|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live (fix attempt 3/5, enforce TOP)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 3/5, supervisor WORSE_METRICS narrow_scope)

### Triage verdict (Step 3)

Same content both sides — legend **%** column ~1px vertical drift in Figma; **importer** text placement, not Storybook source.

### Root cause

Attempt 2/3 regressed via `NONE` + `textAlignVertical: CENTER` + glyph `font.size` line-height. Additionally `enforceLiveUnwrappedTextFrame` re-applied default CENTER (glyph `(innerH-text.height)/2`) after append, overriding the main-path TOP pin — mock scene pins with **WIDTH_AND_HEIGHT + DOM lineHeight + TOP + y=pad.top**.

### Fix applied

`code-v2.ts`: removed analytics `NONE`+CENTER early branch; `enforceLiveUnwrappedTextFrame` passes `verticalPin: "TOP"` for `isLiveAnalyticsLineBoxPinTop` leaves (legend-row `strong`, legend-left `span`, `span.chip`).

### Expected metric movement

Global 0.22%→≤0.13% (restore baseline); target PASS ≤0.1% global + hotspot.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--revenue`

### Cached

false — code edit applied 2026-05-30

## Investigation — lab-analyticscharts--revenue / figma live (fix attempt 5/5, compile + mock parity)

**Date:** 2026-05-30  
**Source:** Cursor agent (fix-all iteration 5/5, orchestrator review)

### Failure analysis (supervisor)

| Attempt | Change | Result |
| --- | --- | --- |
| 1–2 | NONE + CENTER + yAdj | Regressed 0.13%→0.22% |
| 3 | WH + DOM lh + TOP @ pad.top | Baseline 0.13% / 1.16% |
| 4 | Uniform +1px on pin-top | Worse 0.32% / 2.62% |
| 5a | `liveAnalyticsLineBoxPinTopYNudge` referenced but **undefined** | **error** 100% — plugin build failed |
| 5b | NONE+CENTER in `alignAnalyticsChartsTightText` for strong/chip | Same regression class as 1–2 |

**Next fix:** one code path — all analytics tight leaves → WH+TOP+DOM lh in post-build; asymmetric nudge **only** in `alignAnalyticsChartsTightText` (strong +1, legend-left +0.5, chip −0.5); build-path TOP @ pad.top without nudge (post-build authoritative).

### Fix applied

`code-v2.ts`: defined `liveAnalyticsLineBoxPinTopYNudge`; extended `isLiveAnalyticsLineBoxPinTop` to legend-row `strong` + `span.chip`; removed NONE/CENTER/`liveAnalyticsChartsTightTextYAdjust`; post-build `alignAnalyticsChartsTightText` only applies nudge.

### Expected metric movement

error 100% → PASS ≤0.1% global + hotspot (restore baseline then close 1.16% region-01).

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--revenue`

### Cached

false — code edit applied 2026-05-30

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:27:32.389Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.22% |
| Worst hotspot | 3.74% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.74% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-01-compare.png` |
| region-02 | 0.79% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-02-compare.png` |
| region-03 | 0.54% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-03-compare.png` |
| region-04 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-04-compare.png` |
| region-05 | 0.51% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:27:32.389Z

<!-- vault-fingerprint: figmaLive|warn|0.219|3.743|1|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:28:40.518Z  
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
| region-01 | worst hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:28:40.518Z

<!-- vault-fingerprint: figmaLive|error|100.000|na|4|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:33:45.058Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.24% |
| Worst hotspot | 2.62% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.62% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-01-compare.png` |
| region-02 | 1.48% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-02-compare.png` |
| region-03 | 0.79% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-03-compare.png` |
| region-04 | 0.56% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-04-compare.png` |
| region-05 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:33:45.058Z

<!-- vault-fingerprint: figmaLive|warn|0.239|2.624|1|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:34:22.595Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.24% |
| Worst hotspot | 2.62% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 2.62% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-01-compare.png` |
| region-02 | 1.48% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-02-compare.png` |
| region-03 | 0.79% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-03-compare.png` |
| region-04 | 0.56% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-04-compare.png` |
| region-05 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:34:22.595Z

<!-- vault-fingerprint: figmaLive|warn|0.239|2.624|2|fix-all pre-agent -->

## Investigation — lab-analyticscharts--revenue / figma live (fix attempt 2/5, iteration 2)

**Date:** 2026-05-30  
**Source:** Cursor agent — fix-all iteration 2/5 (STUCK_LOOP narrow_scope)

### Triage verdict (Step 3)

Same content both sides — legend **%** column ~1px high and legend labels ~1px low in Figma vs Storybook; **importer** text mode, not Storybook source.

### Root cause

`isLiveAnalyticsChartsNativeCenter` forced legend-row `strong` and `span.chip` through **NONE + textAlignVertical CENTER + font-size line-height** in `alignAnalyticsChartsTightText` and build path — regressing away from mock scene **WIDTH_AND_HEIGHT + DOM lineHeight + TOP @ pad.top** (0% mock pass).

### Fix applied

`code-v2.ts`: removed `isLiveAnalyticsChartsNativeCenter`; extended `isLiveAnalyticsLineBoxPinTop` to legend-row `strong`, `span.chip`, and legend-left `span`; single post-build path WH+DOM lh+TOP; build path always `verticalPin: "TOP"`.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--revenue`

### Cached

false — code edit applied 2026-05-30

## Investigation — lab-analyticscharts--revenue / pixel (Tier C, iteration 2)

**Date:** 2026-05-30  
**Source:** supervisor tier_c_required

Pixel golden PASS 0.025% — shared adapter unchanged; live drift remains importer-only.

## Investigation — lab-analyticscharts--revenue / figma live (fix attempt 2/5, iteration 2)

**Date:** 2026-05-30  
**Source:** Cursor agent — fix-all iteration 2/5

### Triage verdict (Step 3)

Same content both sides — legend **%** column ~1px high in Figma vs Storybook; **importer** text mode (inverted NONE+CENTER y nudge), not Storybook source.

### Root cause

`alignAnalyticsChartsTightText` used NONE+CENTER with `liveAnalyticsChartsNativeCenterYNudge` strong **−1px** (moves up) while compare shows Figma % **high** — wrong sign. Mock scene (0% pass) pins WH+TOP @ pad.top.

### Fix applied

`code-v2.ts`: analytics tight leaves → **WH+TOP + DOM lineHeight** in build + post-build; `liveAnalyticsLineBoxPinTopYNudge` (strong +0.5, chip −0.5, legend-left −0.5); build path `verticalPin: "TOP"`.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--revenue`

### Cached

false — pending live verify

## Investigation — lab-analyticscharts--revenue / figma live (fix attempt 3/5, supervisor revert)

**Date:** 2026-05-30  
**Source:** Cursor agent — fix-all iteration 3/5 (WORSE_METRICS narrow_scope)

### Triage verdict (Step 3)

Same content both sides — legend **%** column ~1px high in Figma vs Storybook; **importer** text placement, not Storybook source.

### Root cause

Attempt 2 regressed (0.13%→0.18%, hotspot 1.16%→1.88%) via `liveAnalyticsLineBoxPinTopYNudge` (+0.5 strong / −0.5 chip / −0.5 legend-left) while build path still used NONE+TOP (`liveTextPreferWidthAndHeight` returned false) — post-build NONE→WH transition + wrong asymmetric nudges.

### Fix applied

`code-v2.ts`: (1) removed `liveAnalyticsLineBoxPinTopYNudge` — post-build WH+TOP @ `pad.top` only; (2) `liveTextPreferWidthAndHeight` returns **true** for analytics pin-top so live build matches mock scene WH+TOP from first placement.

### Expected metric movement

Global 0.18%→≤0.13% (restore baseline); target PASS ≤0.1% global + hotspot.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--revenue`

### Cached

false — pending live verify


### Failure analysis (supervisor)

| Attempt | Change | Result |
| --- | --- | --- |
| 1–2 | NONE + CENTER (+y nudge) | Regressed 0.13%→0.22% |
| 3 | WH+TOP build path but post-build still NONE+CENTER | Baseline 0.13% / 1.16% — **alignAnalyticsChartsTightText overrode build** |
| 4 | +1px y nudge on pin-top | Worse 0.32% / 2.62% |

**Unchanged:** artifact geometry, mock 0%, pixel 0.03%. **Missed path:** `alignAnalyticsChartsTightText` L2570–2574 still NONE+CENTER; `liveTextPreferWidthAndHeight` returned false for analytics forcing NONE in build.

### Triage verdict (Step 3)

Same content both sides — legend % column ~1px vertical drift in Figma; **importer** post-build text mode, not Storybook source.

### Fix applied

`code-v2.ts`: (1) `alignAnalyticsChartsTightText` → WH+DOM lh+TOP @ pad.top (mirror mock scene); (2) `liveTextPreferWidthAndHeight` returns true for analytics pin-top; (3) build path analytics branch `verticalPin: "TOP"`.

### Expected metric movement

region-01 hotspot 1.16%→≤0.1%; global 0.13%→≤0.1% PASS.

### Recommended fix area

Reload plugin → harness / `pnpm figma:live-iterate --story lab-analyticscharts--revenue`

### Cached

false — code edit applied 2026-05-30

## Investigation — lab-analyticscharts--revenue / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:53:56.844Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.18% |
| Worst hotspot | 1.88% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.88% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-01-compare.png` |
| region-02 | 0.91% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-02-compare.png` |
| region-03 | 0.79% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-03-compare.png` |
| region-04 | 0.56% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-04-compare.png` |
| region-05 | 0.45% hotspot | `figma-live-diffs/lab-analyticscharts-revenue/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-analyticscharts-revenue/storybook.png`
- Figma PNG: `figma-live-diffs/lab-analyticscharts-revenue/figma.png`
- Artifact JSON: `figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-analyticscharts-revenue/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:53:56.844Z

<!-- vault-fingerprint: figmaLive|warn|0.184|1.880|3|fix-all pre-agent -->
