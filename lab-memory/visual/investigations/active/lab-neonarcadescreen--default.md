# lab-neonarcadescreen--default

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

## Investigation — lab-neonarcadescreen--default / pixel

**Job ID:** n/a  
**Date:** 2026-05-25T09:19:51.191Z  
**Source:** fix all requested (automated)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.88% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-neonarcadescreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-neonarcadescreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-neonarcadescreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-neonarcadescreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-neonarcadescreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-neonarcadescreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-neonarcadescreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-neonarcadescreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T09:19:51.191Z

<!-- vault-fingerprint: pixel|fail|0.882|na|0|fix all requested -->

## Investigation — lab-neonarcadescreen--default / pixel

**Job ID:** n/a  
**Date:** 2026-05-25T14:41:34.024Z  
**Source:** fix all requested (automated)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.83% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-neonarcadescreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-neonarcadescreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-neonarcadescreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-neonarcadescreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-neonarcadescreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-neonarcadescreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-neonarcadescreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-neonarcadescreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T14:41:34.024Z

<!-- vault-fingerprint: pixel|fail|0.825|na|0|fix all requested -->

## Investigation — lab-neonarcadescreen--default / pixel

**Job ID:** 774988f8-1f34-4152-8254-c2c26ca21cd7  
**Date:** 2026-05-30T11:36:36.691Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.38% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-neonarcadescreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-neonarcadescreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-neonarcadescreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-neonarcadescreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-neonarcadescreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-neonarcadescreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-neonarcadescreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-neonarcadescreen-default/scene.json`

### Root cause

Scanline overlay (`.lab-neon-arcade-scanlines`) uses `repeating-linear-gradient` in Storybook CSS but the extractor emits no `paint` for that layer — rendered HTML was a transparent absolute shell. Play CTA (`.lab-neon-arcade-play`) duplicated schema gradient/shadow inline while Storybook applies paint via CSS class; neon row modifiers (`you`, `top`, `rank`, `name`, `score`) were stripped from output classes.

### Recommended fix area

`packages/pixel-test/src/render-html.ts` — `tryRenderNeonArcadeScanlines`, `tryRenderNeonArcadePlayButton`, `isNeonArcadeClass` / `usesStorybookCssPaintShell` for neon arcade.

<!-- vault-fingerprint: pixel|warn|0.379|na|1|fix-all pre-agent -->

## Investigation — lab-neonarcadescreen--default / pixel

**Job ID:** 774988f8-1f34-4152-8254-c2c26ca21cd7  
**Date:** 2026-05-30T11:41:43.806Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.26% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-neonarcadescreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-neonarcadescreen-default/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-neonarcadescreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-neonarcadescreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-neonarcadescreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-neonarcadescreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-neonarcadescreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T11:41:43.806Z

<!-- vault-fingerprint: pixel|warn|0.260|na|2|fix-all pre-agent -->

## Investigation — lab-neonarcadescreen--default / pixel

**Job ID:** 774988f8-1f34-4152-8254-c2c26ca21cd7  
**Date:** 2026-05-30T11:46:50.624Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.26% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-neonarcadescreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-neonarcadescreen-default/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-neonarcadescreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-neonarcadescreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-neonarcadescreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-neonarcadescreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-neonarcadescreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T11:46:50.624Z

<!-- vault-fingerprint: pixel|warn|0.260|na|3|fix-all pre-agent -->
