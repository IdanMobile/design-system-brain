# lab-cryptochaosdashboard--default

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

<!-- [[logic/specs/lab-cryptochaosdashboard--default.spec.json]] — behavior track, not visual -->

## Artifacts

<!-- R2 URLs to compare PNGs and reports -->

## Investigation — lab-cryptochaosdashboard--default / pixel

**Job ID:** 774988f8-1f34-4152-8254-c2c26ca21cd7  
**Date:** 2026-05-30T11:27:57.868Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.14% |
| Worst hotspot | n/a |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | diff region | `pixel-diffs/lab-cryptochaosdashboard-default/regions/regions/region-01-compare.png` |
| region-02 | diff region | `pixel-diffs/lab-cryptochaosdashboard-default/regions/regions/region-02-compare.png` |
| region-03 | diff region | `pixel-diffs/lab-cryptochaosdashboard-default/regions/regions/region-03-compare.png` |
| region-04 | diff region | `pixel-diffs/lab-cryptochaosdashboard-default/regions/regions/region-04-compare.png` |
| region-05 | diff region | `pixel-diffs/lab-cryptochaosdashboard-default/regions/regions/region-05-compare.png` |
| region-06 | diff region | `pixel-diffs/lab-cryptochaosdashboard-default/regions/regions/region-06-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-cryptochaosdashboard-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-cryptochaosdashboard-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-cryptochaosdashboard-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-cryptochaosdashboard-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-cryptochaosdashboard-default/scene.json`

### Root cause

1. **Chart SVG** — area path uses `fill="url(#cryptoFill)"` but `vectorToHtml` emits no `<defs>`; gradient fill is missing vs Storybook.
2. **Ticker deltas** — `<em>` nodes have `font.style: normal` in artifact; render-html omits `font-style: normal`, so UA italic skews green/red delta text.
3. **Footer / panic buttons** — inline-text buttons with `layout.display: block` get forced `display:flex` centering + `line-height: 12px`; `computedStack: Arial` drops Inter webfont from authored stack.

### Recommended fix area

`packages/pixel-test/src/render-html.ts` — `vectorToHtml` gradient defs, `textFontCss` authored-stack fallback, `textToHtml` em normal + block-button line-height, `paintToBaseCss` flex only when layout is flex.

### Cached

false — automated test record at 2026-05-30T11:27:57.868Z

## Resolved — pixel PASS 0.097%

**Date:** 2026-05-30  
**Fix:** `render-html.ts` — SVG gradient defs for `url(#id)` fills; `font-style: normal` on `<em>`; authored font stack when computed drops webfont; block-button `inline-flex` centering; line elements skip spurious fill.

<!-- vault-fingerprint: pixel|pass|0.097|na|1|fix-all pre-agent -->

## Resolved — lab-cryptochaosdashboard--default / pixel

**Date:** 2026-05-30T11:31:53.519Z  
**Attempt:** 1  
**Suite:** pixel

Automated harness reports **PASS** for this story/step.

If the fix was a reusable rule, add or update a note under `lab-memory/visual/patterns/`.

<!-- vault-fingerprint: resolved|pixel|1|2026-05-30 -->
