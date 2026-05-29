# lab-muiworkspacescreen--default

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

## Investigation — lab-muiworkspacescreen--default / pixel

**Job ID:** n/a  
**Date:** 2026-05-25T09:19:51.192Z  
**Source:** fix all requested (automated)

### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.29% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-muiworkspacescreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-muiworkspacescreen-default/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-muiworkspacescreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-muiworkspacescreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-muiworkspacescreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-muiworkspacescreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-muiworkspacescreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T09:19:51.192Z

<!-- vault-fingerprint: pixel|warn|0.291|na|0|fix all requested -->

## Investigation — lab-muiworkspacescreen--default / pixel

**Date:** 2026-05-25  
**Source:** cursor agent (run-until-green)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.924% |
| Hotspots | region-01 header (1932 px), region-02 Paper/Alert (~y220) |

### Root cause

- MUI `MuiStack` spacing is captured as child `margin-top: 16` + absolute `box.y` (OK). Replaying `css-*` or broad `MuiPaper-root` classes **regresses** to 10%+ (Emotion + inline double layout).
- Drift is likely Paper outlined border, TextField/Alert chrome, or AppBar shadow — not missing Stack gap in artifact.

### Recommended fix area

- `render-html.ts`: targeted `bordersToCss` / shadow for `MuiPaper-outlined`, `MuiAlert-root` without Emotion class replay.
- [[visual/patterns/render-html-layer-class-allowlist-regression]]

<!-- vault-fingerprint: pixel|fail|0.924|na|agent -->
