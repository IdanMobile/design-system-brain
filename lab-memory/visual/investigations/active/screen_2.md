# screen_2

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

## Logic spec (optional)

<!-- [[logic/specs/screen_2.spec.json]] — behavior track, not visual -->

## Artifacts

<!-- R2 URLs to compare PNGs and reports -->

## Investigation — screen_2 / contractFigma

**Job ID:** n/a  
**Date:** 2026-05-27T10:39:34.991Z  
**Source:** fix all requested (automated)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 5.16% |
| Worst hotspot | 11.16% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_2/diff.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_2/diff.png`
- Storybook PNG: `figma-screen-diffs/screen_2/reference.png`
- Figma PNG: `figma-screen-diffs/screen_2/rendered.png`
- Artifact JSON: `artifacts/figma-screens/screen_2.contract.json`
- Scene JSON: ``

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-27T10:39:34.991Z

<!-- vault-fingerprint: contractFigma|fail|5.159|11.164|0|fix all requested -->

## Investigation — screen_2 / contractFigma

**Job ID:** 3532a1fe-4f84-47da-956d-6bb6f716d996  
**Date:** 2026-05-27T10:39:43.682Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 5.16% |
| Worst hotspot | 11.16% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_2/diff.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_2/diff.png`
- Storybook PNG: `figma-screen-diffs/screen_2/reference.png`
- Figma PNG: `figma-screen-diffs/screen_2/rendered.png`
- Artifact JSON: `artifacts/figma-screens/screen_2.contract.json`
- Scene JSON: ``

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-27T10:39:43.682Z

<!-- vault-fingerprint: contractFigma|fail|5.159|11.164|1|fix-all pre-agent -->

## Investigation — screen_2 / contractFigma

**Job ID:** 3532a1fe-4f84-47da-956d-6bb6f716d996  
**Date:** 2026-05-27T10:43:57.450Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 5.16% |
| Worst hotspot | 11.16% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_2/diff.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_2/diff.png`
- Storybook PNG: `figma-screen-diffs/screen_2/reference.png`
- Figma PNG: `figma-screen-diffs/screen_2/rendered.png`
- Artifact JSON: `artifacts/figma-screens/screen_2.contract.json`
- Scene JSON: ``

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-27T10:43:57.450Z

<!-- vault-fingerprint: contractFigma|fail|5.159|11.164|2|fix-all pre-agent -->

## Investigation — screen_2 / contractFigma

**Job ID:** try-2  
**Date:** 2026-05-27

### Root cause

15 Hebrew paragraph TEXT nodes carry manifest `figmaTextAutoResize: WIDTH_AND_HEIGHT` but contract box height implies **multi-line wrapped** text (height > 1.3× line-height). Importer honored WIDTH_AND_HEIGHT → glyphs auto-sized without wrapping → ghosting across main content, pagination-footer (11.16%), and 5.16% global. screen_1 has **0** such nodes (explains pass vs fail).

### Recommended fix area

`code-v2.ts` — `figmaNativeNeedsFixedTextBox`: downgrade WIDTH_AND_HEIGHT → NONE + fixed box when multi-line; preserves single-line WIDTH_AND_HEIGHT labels.

### Artifacts

- Compare: `figma-screen-diffs/screen_2/diff.png`
- Contract: `artifacts/figma-screens/screen_2.contract.json`

### Linked patterns

[[visual/patterns/figma-guing-screen-roundtrip]]

## Investigation — screen_2 / contractFigma

**Job ID:** 3532a1fe-4f84-47da-956d-6bb6f716d996  
**Date:** 2026-05-27T10:50:54.707Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 5.16% |
| Worst hotspot | 11.20% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_2/diff.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_2/diff.png`
- Storybook PNG: `figma-screen-diffs/screen_2/reference.png`
- Figma PNG: `figma-screen-diffs/screen_2/rendered.png`
- Artifact JSON: `artifacts/figma-screens/screen_2.contract.json`
- Scene JSON: ``

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-27T10:50:54.707Z

<!-- vault-fingerprint: contractFigma|fail|5.160|11.200|3|fix-all pre-agent -->
