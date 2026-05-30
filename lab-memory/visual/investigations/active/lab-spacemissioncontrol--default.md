# lab-spacemissioncontrol--default

## Status

| Step | ID | Pass |
| --- | --- | --- |
| 1 | pixel | pass (0.082%) |
| 2 | figma mock | |
| 3 | figma live | |
| 4 | delivery | |

## Timeline

**2026-05-30** — Fix try 1/5: `paintToBaseCss` inverted `!hasSchemaBorder` guard skipped UA reset on bordered buttons; restored pattern + post-paint transparent background. Pixel **pass 0.082%** (was 1.89%).

**2026-05-30** — Investigation attempt 1/5 (pixel, 1.885% global). Region-01 dominated (5937/6206 px): footer “Abort Burn” outline button rendered as solid light fill.

## Linked patterns

- [[visual/patterns/render-html-button-appearance]] — bordered `<button>` without schema fill must replay transparent background + `appearance: none`, not native chrome

## Logic spec (optional)

<!-- [[logic/specs/lab-spacemissioncontrol--default.spec.json]] — behavior track, not visual -->

## Artifacts

<!-- R2 URLs to compare PNGs and reports -->

## Investigation — lab-spacemissioncontrol--default / pixel

**Job ID:** 4fa5cce8-1f02-48e8-a877-3641d69de920  
**Date:** 2026-05-29T17:14:32.110Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.89% |
| Worst hotspot | n/a |
| Fail reason | — |

### Visual diff (section table)

| Section | Storybook | Rendered | Severity | Stage |
| --- | --- | --- | --- | --- |
| Footer “Abort Burn” | Outline, transparent fill, slate border/text | Solid light-gray fill, low-contrast label | **High** (region-01) | `render-html.ts` button paint |
| Radar “DEBRIS FIELD” / Closing | Baseline typography | ~1px vertical shift + AA | Low (region-02) | replay layout/text |
| Header “ANOMALY” | Corner radius + kerning | Slightly larger radius, fuller glyphs | Low (region-03) | replay radius/AA |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | Abort Burn button fill vs outline | `pixel-diffs/lab-spacemissioncontrol-default/regions/region-01-compare.png` |
| region-02 | Target lock text sub-pixel shift | `pixel-diffs/lab-spacemissioncontrol-default/regions/region-02-compare.png` |
| region-03 | Anomaly corner / glyph AA | `pixel-diffs/lab-spacemissioncontrol-default/regions/region-03-compare.png` |

### Artifacts

- Compare: `pixel-diffs/lab-spacemissioncontrol-default/regions/region-01-compare.png`
- Storybook PNG: `pixel-diffs/lab-spacemissioncontrol-default/storybook.png`
- Figma PNG: `pixel-diffs/lab-spacemissioncontrol-default/rendered.png`
- Artifact JSON: `pixel-diffs/lab-spacemissioncontrol-default/artifact.v2.json`
- Scene JSON: `pixel-diffs/lab-spacemissioncontrol-default/scene.json`

### Root cause

**Rendered replay is wrong (schema replay), not Storybook source.** Storybook shows the footer “Abort Burn” `<button>` as **outline-only** (`background: transparent`, `border: 1px solid #334155`, `color: #94a3b8` per `packages/ui/src/styles.css`). The rendered PNG paints the same control as a **solid light-gray filled button** (native/UA button face), which matches ~96% of diff pixels (region-01 rect `y:748`, 5937 px).

Artifact `lay-46` (Abort Burn) correctly has **borders only** (no `paint.fills`) and text color `rgb(148, 163, 184)` — extraction is fine. Failure is in **pixel HTML replay**: `packages/pixel-test/src/render-html.ts` button branch in `paintToBaseCss` (see [[visual/patterns/render-html-button-appearance]]) — either `background: transparent` / `appearance: none` is overridden later in the inline style stack, or bordered buttons without fills still leak UA background despite schema borders.

Secondary hotspots (regions 02–03, ~228 px combined): sub-pixel text position at “Closing” / DEBRIS FIELD block and corner-radius/AA on the anomaly chip — lower priority until region-01 passes.

### Recommended fix area

| Priority | Area | Action |
| --- | --- | --- |
| **P0** | `packages/pixel-test/src/render-html.ts` | Apply [[visual/patterns/render-html-button-appearance]]: for `<button>` with `hasSchemaBorder` and no `paint.fills`, ensure final inline CSS keeps `appearance: none` + `background: transparent` (emit button reset **after** `backgroundsToCss` / border paint, or dedupe conflicting `background` shorthands). Re-check `isInlineTextLeaf` button merge path (`style; textStyle`). |
| **P2** | Same file (text/layout) | If region-02/03 remain after P0: tighten line-height/position for radar info `span`/`strong` and root `cornerRadii` on header container. |
| **Not** | `code-v2.ts`, `@lab/ui`, Storybook story | Source/CSS and schema match Storybook for the abort button; do not change component for this failure. |
| **Verify** | `pnpm test:pixel:golden -- --story lab-spacemissioncontrol--default` then Tier A pixel | Target ≤0.1% global + regions. |

### Fix applied (2026-05-30)

**Change:** `packages/pixel-test/src/render-html.ts` — `paintToBaseCss` gated `appearance: none` / `background: transparent` on `!hasSchemaBorder`, so bordered outline buttons (Abort Burn) kept native UA fill. Restored [[visual/patterns/render-html-button-appearance]]: always emit appearance reset; only gate `border: none` when no schema border; re-emit `background-color: transparent` after `backgroundsToCss` for fill-less buttons.

**Verify:** `pnpm test:pixel:golden -- --story lab-spacemissioncontrol--default` → **pass 0.082%** global (was 1.89%).

### Cached

false — automated test record at 2026-05-29T17:14:32.110Z

<!-- vault-fingerprint: pixel|pass|0.082|na|2|fix-all try-1 -->

## Note — prior auto-resolved (stale)

2026-05-29 harness logged PASS once; **current** `pixel-diffs/report.json` and `by-story/.../result.json` show **fail @ 1.885%** — treat resolved block as stale until golden re-run passes.

## Resolved — lab-spacemissioncontrol--default / pixel

**Date:** 2026-05-29T23:52:14.694Z  
**Attempt:** 1  
**Suite:** pixel

Automated harness reports **PASS** for this story/step.

If the fix was a reusable rule, add or update a note under `lab-memory/visual/patterns/`.

<!-- vault-fingerprint: resolved|pixel|1|2026-05-29 -->
