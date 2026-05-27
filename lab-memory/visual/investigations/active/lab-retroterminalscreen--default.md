# lab-retroterminalscreen--default

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

- [[visual/patterns/render-html-button-appearance]]
- [[visual/patterns/render-html-pre-whitespace]]
- [[visual/patterns/render-html-layer-class-names]]

## Artifacts

<!-- R2 URLs to compare PNGs and reports -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** 8b708980-fcda-4ebf-9f68-594d819ce593  
**Date:** 2026-05-25T08:47:32.257Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 5.87% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

Two bugs in `render-html.ts`:
1. **Button appearance reset skipped when border exists** — `paintToBaseCss()` guards `appearance:none` + `background:transparent` inside `!hasSchemaBorder()`, so any button with a schema border (e.g. solid 1px green) keeps the browser's native white background. The RetroTerminalScreen buttons have borders but transparent backgrounds — rendered white instead of transparent.
2. **`white-space: pre-line` ignores schema `whiteSpace: "pre"`** — `textToHtml()` hardcodes `pre-line` for any text containing `\n`, collapsing leading spaces. The GHOST ASCII logo (`<pre class="lab-retro-terminal-ascii">`) has `whiteSpace:"pre"` and leading spaces for alignment; `pre-line` collapses those, misaligning the art.

### Recommended fix area

`packages/pixel-test/src/render-html.ts`:
1. Split button CSS block: always emit `appearance:none` / `outline:none` / conditional `background:transparent`; only emit `border:none` when no schema border.
2. In `textToHtml`, respect `t.whiteSpace` when building newline CSS — use `t.whiteSpace` if it is `"pre"` or `"pre-wrap"`, otherwise fall back to `pre-line`.

### Cached

false — automated test record at 2026-05-25T08:47:32.257Z

<!-- vault-fingerprint: pixel|fail|5.870|na|1|fix-all pre-agent -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** 8b708980-fcda-4ebf-9f68-594d819ce593  
**Date:** 2026-05-25T08:55:40.069Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 3.29% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T08:55:40.069Z

<!-- vault-fingerprint: pixel|fail|3.288|na|2|fix-all pre-agent -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** 8b708980-fcda-4ebf-9f68-594d819ce593  
**Date:** 2026-05-25T09:03:48.684Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 3.29% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T09:03:48.684Z

<!-- vault-fingerprint: pixel|fail|3.288|na|3|fix-all pre-agent -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** 8b708980-fcda-4ebf-9f68-594d819ce593  
**Date:** 2026-05-25T09:11:58.094Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 3.29% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T09:11:58.094Z

<!-- vault-fingerprint: pixel|fail|3.288|na|4|fix-all pre-agent -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** n/a  
**Date:** 2026-05-25T09:19:51.188Z  
**Source:** fix all requested (automated)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 3.29% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T09:19:51.188Z

<!-- vault-fingerprint: pixel|fail|3.288|na|0|fix all requested -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** 58cfaa98-3d7c-4758-8c2e-f422189f2c53  
**Date:** 2026-05-25T09:19:52.829Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 3.29% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T09:19:52.829Z

<!-- vault-fingerprint: pixel|fail|3.288|na|1|fix-all pre-agent -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** n/a  
**Date:** 2026-05-25T09:20:21.829Z  
**Source:** fix all requested (automated)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.63% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T09:20:21.829Z

<!-- vault-fingerprint: pixel|fail|2.633|na|0|fix all requested -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** 2c8471c4-879f-49d5-8d3b-ae28e927c685  
**Date:** 2026-05-25T09:20:23.210Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.63% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T09:20:23.210Z

<!-- vault-fingerprint: pixel|fail|2.633|na|1|fix-all pre-agent -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** 621a616a-4e50-42c5-b22d-22aaa39fc5e8  
**Date:** 2026-05-25T09:20:50.266Z  
**Source:** test finished · pixel:golden (automated)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.63% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: ``
- Scene JSON: ``

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T09:20:50.266Z

<!-- vault-fingerprint: pixel|fail|2.633|na|0|test finished · pixel:golden -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** c4244a95-94bf-4718-91d1-830ad4885378  
**Date:** 2026-05-25T10:31:43.880Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.63% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T10:31:43.880Z

<!-- vault-fingerprint: pixel|fail|2.633|na|2|fix-all pre-agent -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** fix-all iteration 1  
**Date:** 2026-05-25  
**Source:** agent fix session

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | GHOST ASCII logo misaligned — leading spaces collapsed | `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png` |
| region-02 | Stat box backgrounds / progress bar tint | `pixel-diffs/lab-retroterminalscreen-default/regions/region-02-compare.png` |
| region-03 | CPU label shifted left (padding/whitespace) | `pixel-diffs/lab-retroterminalscreen-default/regions/region-03-compare.png` |

### Root cause

Schema replay bug in `render-html.ts`: `textToHtml()` always replaced `\n` with `<br>` even when schema `whiteSpace` is `"pre"`, breaking ASCII art alignment; `<pre>` was not routed through `isInlineTextLeaf` so text was wrapped in an extra `.text` div.

### Recommended fix area

`packages/pixel-test/src/render-html.ts`: respect `t.whiteSpace` in `textToHtml` body; add `pre` to `isInlineTextLeaf`.

### Cached

false — agent investigation 2026-05-25


## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** 966cb478-7793-40f5-b0d2-056b936d4019  
**Date:** 2026-05-25T10:49:48.628Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.86% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — agent investigation 2026-05-25

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** fix-all iteration 3  
**Date:** 2026-05-25  
**Source:** agent fix session

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | GHOST ASCII + panel/log vertical spacing | `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png` |
| region-02 | Stat box label/value alignment | `pixel-diffs/lab-retroterminalscreen-default/regions/region-02-compare.png` |
| region-03 | CPU label + progress vertical shift | `pixel-diffs/lab-retroterminalscreen-default/regions/region-03-compare.png` |

### Root cause

Remaining 0.86% after pre/whiteSpace fix: (1) `<pre>` forced `font-family: monospace` instead of extracted `"Roboto Mono", monospace`, misaligning box-drawing glyphs; (2) `paintToBaseCss` skipped inline margin for non-flex `p`/`strong` with non-zero schema margin — pixel-test reset `#__pixel_test_root .layer :is(h1,…,p) { margin-block: 0 }` then beat class rules, collapsing log line gaps and stat `strong` margin-top.

### Recommended fix area

`packages/pixel-test/src/render-html.ts`: use extracted font stack for `<pre>`; emit schema margin for all non-flex children when `hasNonZero || resetUaMargin` (mirror flex-child branch).

### Cached

false — agent investigation 2026-05-25


## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** 966cb478-7793-40f5-b0d2-056b936d4019  
**Date:** 2026-05-25T10:54:25.333Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.86% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T10:54:25.333Z

<!-- vault-fingerprint: pixel|fail|0.864|na|4|fix-all pre-agent -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** 966cb478-7793-40f5-b0d2-056b936d4019  
**Date:** 2026-05-25T11:21:33.604Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 5.87% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T11:21:33.604Z

<!-- vault-fingerprint: pixel|fail|5.870|na|5|fix-all pre-agent -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** agent session  
**Date:** 2026-05-25  
**Source:** focused pixel pass (user confirmed)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.63% |
| Worst hotspot | region-01 (y≈28, ASCII + header) |
| Fail reason | global > 0.1% strict |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | ~8479 px — GHOST ASCII / header / top panel | `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png` |
| region-02 | ~887 px — stats grid / progress | `pixel-diffs/lab-retroterminalscreen-default/regions/region-02-compare.png` |
| region-03 | ~167 px — footer buttons | `pixel-diffs/lab-retroterminalscreen-default/regions/region-03-compare.png` |

### Root cause

Committed `render-html.ts` still gated `appearance:none` on buttons behind `!hasSchemaBorder()` (footer CTA white boxes). `textToHtml()` forced `pre-line` + `<br>` for ASCII despite schema `whiteSpace:"pre"`. Blanket `margin` replay for all non-flex children regressed to ~3.85% (reverted).

### Recommended fix area

`packages/pixel-test/src/render-html.ts` (keep): split button appearance/background from border guard; `white-space:pre` + raw newlines in `textToHtml`; `overflow:hidden` for `overflow:clip`; `pointer-events:none` on `.lab-retro-terminal-glow`. Next: ASCII glyph/font parity (Roboto Mono vs measured stack), stat `strong` margin-top without broad margin replay.

### Cached

false — agent investigation 2026-05-25

## Investigation — lab-retroterminalscreen--default / pixel (region-01)

**Date:** 2026-05-25  
**Global diff:** 2.23% (down from 2.63%)

### Fixes that helped

- Skip inline radial fill on `.lab-retro-terminal-glow` (use stylesheet gradient).
- ASCII: omit inline font-size/color on `.lab-retro-terminal-ascii`; inherit from class + parent `.lab-retro-terminal`; `line-height: 1.2`; flatten to `<pre>` (no nested `.text`).
- Targeted `margin` on `p` with schema non-zero margins.

### Still open

~7672 px in region-01 (ASCII/header/panel). Strict 0.1% needs ~7000+ px removed — likely root replay as absolute layers vs flex column + gap on `.lab-retro-terminal`.

## Investigation — lab-retroterminalscreen--default / pixel (session)

**Date:** 2026-05-25  
**Global diff:** 2.225% (stable with fixes below)

### Fixes confirmed

- Split `appearance:none` / `background:transparent` from `border:none` guard on buttons (footer CTAs).
- `white-space:pre` + raw newlines for ASCII; single `<pre>` wrapper (no nested `.text` div).
- Skip inline fill on `.lab-retro-terminal-glow`; `gradientStopColor()` → `transparent` on gradient stops.
- `tryRenderMeetingBottomNav` kept for meeting (separate story).

### Reverted (regressed)

- Screen-root flex + class replay (`lab-meeting-home`, all `SCREEN_FLEX_*`): retro 7.58%, meeting 4.43%.
- `lab-meeting-home-live-row` flex-only: meeting 2.67%.
- Root class without flex: retro 3.79%.

### Recommended fix area

`packages/pixel-test/src/render-html.ts` — continue ASCII/header/panel parity without screen-root flex replay.

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** f19e919f-d160-43a2-a232-1c5f621dfe83  
**Date:** 2026-05-25T13:21:56.331Z  
**Source:** test finished · pixel:golden (automated)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.22% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: ``
- Scene JSON: ``

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T13:21:56.331Z

<!-- vault-fingerprint: pixel|fail|2.225|na|0|test finished · pixel:golden -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** n/a  
**Date:** 2026-05-25T14:41:34.022Z  
**Source:** fix all requested (automated)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.22% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T14:41:34.022Z

<!-- vault-fingerprint: pixel|fail|2.225|na|0|fix all requested -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** d7083796-9616-42ce-9c9c-315730dab9e9  
**Date:** 2026-05-25T14:41:35.848Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.22% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T14:41:35.848Z

<!-- vault-fingerprint: pixel|fail|2.225|na|1|fix-all pre-agent -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** fix-all iteration 1  
**Date:** 2026-05-25  
**Source:** agent fix session

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | GHOST ASCII dark/missing green — class not replayed | `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png` |
| region-02 | Stat strong values shifted — nested `.text` wrapper | `pixel-diffs/lab-retroterminalscreen-default/regions/region-02-compare.png` |
| region-03 | CPU label anti-aliasing / glow | `pixel-diffs/lab-retroterminalscreen-default/regions/region-03-compare.png` |

### Root cause

`layerClassNames()` whitelisted only `lab-retro-terminal-stats`, not `lab-retro-terminal-ascii` / `lab-retro-terminal` / sibling chrome classes. `textToHtml()` intentionally skips inline color on ASCII, expecting `.lab-retro-terminal-ascii { color: #22cc22 }` — without the class, glyphs inherit default black on dark bg (~7672 px in region-01). Stat `<strong>` values used nested `.text` div instead of flat inline leaf.

### Recommended fix area

`packages/pixel-test/src/render-html.ts`: whitelist retro-terminal + state classes in `layerClassNames`; add `strong` to `isInlineTextLeaf`.

### Cached

false — agent investigation 2026-05-25

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** d7083796-9616-42ce-9c9c-315730dab9e9  
**Date:** 2026-05-25T14:44:28.574Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 3.19% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T14:44:28.574Z

<!-- vault-fingerprint: pixel|fail|3.190|na|2|fix-all pre-agent -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** d7083796-9616-42ce-9c9c-315730dab9e9  
**Date:** 2026-05-25T14:48:34.388Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 3.19% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T14:48:34.388Z

<!-- vault-fingerprint: pixel|fail|3.190|na|3|fix-all pre-agent -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** n/a  
**Date:** 2026-05-25T15:00:22.119Z  
**Source:** fix all requested (automated)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 3.19% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — e.g. code-v2.ts -->

### Cached

false — automated test record at 2026-05-25T15:00:22.119Z

<!-- vault-fingerprint: pixel|fail|3.190|na|0|fix all requested -->

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** 8b70ceb0-7cb5-4d9a-ae5f-3530644f25db  
**Date:** 2026-05-25T15:00:23.560Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 3.19% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

Storybook `<pre class="lab-retro-terminal-ascii">` computes to **UA `monospace`**, while `render-html` inlined the extracted `"Roboto Mono", monospace` stack — box-drawing rows misaligned (~3.3% global). Secondary: radial glow / heading line-height / absolute margin emission tweaks (~2.2% after pre fix).

### Recommended fix area

`packages/pixel-test/src/render-html.ts` — dedicated `<pre>` branch with `font-family: monospace` and schema `line-height` px; keep glow class + skip inline fill; do **not** add full `lab-retro-terminal-*` section classes (flex/grid breaks absolute replay).

### Cached

false — automated test record at 2026-05-25T15:00:23.560Z

<!-- vault-fingerprint: pixel|fail|3.190|na|1|fix-all pre-agent -->

## Investigation — lab-retroterminalscreen--default / pixel

**Date:** 2026-05-25T16:35:00Z  
**Source:** cursor agent (user yes — continue retro fix)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.163% (was 3.28%) |
| Worst hotspot | region-01 ~6.3k px |

### Root cause

Primary: **font mismatch on ASCII `<pre>`** — Storybook uses computed `monospace` (UA pre stylesheet); renderer used extracted Roboto Mono stack. Fix: inline `font-family: monospace` on dedicated pre branch.

Remaining ~2.2%: diffuse background/glow + text AA deltas across full width (pixelmatch threshold 0.2); not fixed by glow CSS-only or `line-height: normal` on h1/strong.

### Recommended fix area

Continue `render-html.ts` only if chasing strict 0.1%: consider extractor recording **computed** `fontFamily` for text layers, or sub-pixel position policy for retro terminal children.

### Artifacts

- `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- `pixel-diffs/by-story/lab-retroterminalscreen-default/result.json`

## Investigation — lab-retroterminalscreen--default / pixel

**Job ID:** 93a05c00-a260-477a-86f7-97e07270888c  
**Date:** 2026-05-25T16:50:02.381Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.16% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-retroterminalscreen-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-retroterminalscreen-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-retroterminalscreen-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-retroterminalscreen-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-25T16:50:02.381Z

<!-- vault-fingerprint: pixel|fail|2.163|na|3|fix-all pre-agent -->

## Investigation — lab-retroterminalscreen--default / pixel

**Date:** 2026-05-25  
**Source:** cursor agent (run-until-green)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.163% |
| Worst region | region-01 (~6368 px) — glow + header + ASCII |

### Root cause

- **region-01:** diffuse `lab-retro-terminal-glow` radial AA + `lab-retro-terminal-ascii` monospace raster; `computedStack: monospace` + dedicated `<pre>` path is correct (Roboto Mono stack **regresses** to ~3.3%).
- **Rejected:** `usesFlexFlowLayout` on `lab-retro-terminal` root (5.6% fail); broad `lab-retro-terminal-*` section classes (3.2%+); CSS-only pre (no inline size/color).

### Recommended fix area

- `render-html.ts`: glow gradient stop parity (`gradientStopColor`), optional sub-pixel pre metrics; **not** root/section class allowlists — see [[visual/patterns/render-html-layer-class-allowlist-regression]].
- Re-extract only if extractor font/glow metadata wrong (currently OK in `artifact.v2.json`).

### Linked patterns

- [[visual/patterns/render-html-computed-font-stack]]
- [[visual/patterns/render-html-layer-class-allowlist-regression]]
- [[visual/patterns/render-html-pre-whitespace]]
