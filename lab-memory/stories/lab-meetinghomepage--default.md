# lab-meetinghomepage--default

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

<!-- [[patterns/...]] -->

## Artifacts

<!-- R2 URLs to compare PNGs and reports -->

## Investigation — lab-meetinghomepage--default / pixel

**Job ID:** 8b708980-fcda-4ebf-9f68-594d819ce593  
**Date:** 2026-05-25T08:06:45.521Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 75.01% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-01-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-meetinghomepage-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-meetinghomepage-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-meetinghomepage-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-meetinghomepage-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-meetinghomepage-default/scene.json`

### Root cause

Chromium drops the `ellipse` keyword from `radial-gradient(ellipse 120% 60% at 50% -10%, ...)` in `getComputedStyle().backgroundImage`, producing `radial-gradient(120% 60% at 50% -10%, ...)`. The `parseRadialGradient` function in `extract.ts` only detected header segments starting with "circle", "ellipse", or "at " — not "120% 60% at 50% -10%" which is a size+position spec without the explicit shape keyword. All segments including the header became "stops", producing malformed CSS color strings like `"80% 40% at 90%"`. Since all three fills (2 radial + 1 linear) are combined in one `background-image` property, the invalid radial gradient CSS caused the entire `background-image` declaration to be ignored, leaving a light background instead of the dark gradient.

### Recommended fix area

`packages/extractor-playwright/src/extract.ts` — `parseRadialGradient`: add `head.includes(" at ")` to the header-detection condition. Fixed 2026-05-25.

### Cached

false — automated test record at 2026-05-25T08:06:45.521Z

<!-- vault-fingerprint: pixel|fail|75.014|na|1|fix-all pre-agent -->

## Investigation — lab-meetinghomepage--default / pixel

**Job ID:** 8b708980-fcda-4ebf-9f68-594d819ce593  
**Date:** 2026-05-25T08:14:54.449Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.76% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-03-compare.png` |
| region-04 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-04-compare.png` |
| region-05 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-meetinghomepage-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-meetinghomepage-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-meetinghomepage-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-meetinghomepage-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-meetinghomepage-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T08:14:54.449Z

<!-- vault-fingerprint: pixel|fail|0.763|na|2|fix-all pre-agent -->

## Investigation — lab-meetinghomepage--default / pixel (attempt 2 analysis)

**Date:** 2026-05-25
**Fix attempt:** 2 (agent analysis)

### Root cause

Two remaining issues after gradient fix:

1. **"Join" button text missing**: `extract.ts` line 1211 excludes `button` from the "direct text + element children mixed" block. The `<button class="lab-meeting-home-join"><svg/>Join</button>` has a bare text node "Join" that never gets emitted as a synthetic child because `button` is in the exclusion list. Fix: remove `"button"` from that exclusion.

2. **"View All >" text wraps**: The button's measured `box.width=56.5px` is exactly the natural width of the text. In `render-html.ts`, when `whiteSpace === "normal"`, no `white-space` CSS is emitted. With a fixed 56.5px container in the renderer, sub-pixel font differences cause the text to wrap. Fix: in `textToHtml`, add `white-space: nowrap` when text has no newline and `box.height ≤ lineHeight * 1.5` (single-line measured content).

### Recommended fix area

- `packages/extractor-playwright/src/extract.ts` line 1211: remove `"button"` from exclusion list
- `packages/pixel-test/src/render-html.ts` line 528: add nowrap for single-line `whiteSpace: "normal"` text

## Investigation — lab-meetinghomepage--default / pixel

**Job ID:** 8b708980-fcda-4ebf-9f68-594d819ce593  
**Date:** 2026-05-25T08:23:03.138Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.65% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-03-compare.png` |
| region-04 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-04-compare.png` |
| region-05 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-meetinghomepage-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-meetinghomepage-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-meetinghomepage-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-meetinghomepage-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-meetinghomepage-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T08:23:03.138Z

<!-- vault-fingerprint: pixel|fail|0.647|na|3|fix-all pre-agent -->

## Investigation — lab-meetinghomepage--default / pixel

**Job ID:** 8b708980-fcda-4ebf-9f68-594d819ce593  
**Date:** 2026-05-25T08:31:12.514Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.65% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-03-compare.png` |
| region-04 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-04-compare.png` |
| region-05 | diff region | `pixel-diffs/lab-meetinghomepage-default/regions/regions/region-05-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-meetinghomepage-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-meetinghomepage-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-meetinghomepage-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-meetinghomepage-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-meetinghomepage-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T08:31:12.514Z

<!-- vault-fingerprint: pixel|fail|0.647|na|4|fix-all pre-agent -->
