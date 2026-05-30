# Investigation — screen_1 / figma-entry roundtrip

**Story / screen:** `screen_1` (Guing manifest entry)  
**Date:** 2026-05-27

## Pipeline status (handoff)

| Step | Status | Notes |
| --- | --- | --- |
| Manifest → Contract | PASS | 449 layers |
| Contract → Figma | PASS | ~0.076% global; user-header / phone-row hotspots |
| Storybook | PASS | 0% vs original after original-PNG bake + rebuild |
| 4-way | PASS | original↔storybook/reactHtml 0%; original↔figma ~0.076% |
| Logic | PASS | 4 controls audited |

## Root causes (resolved or documented)

1. **Shell fill on TEXT** — avatar white box (`fillFigmaHeaderShells` skipped TEXT)
2. **GROUP absolute coords** — pagination chevrons mispositioned until rebase
3. **Flip frame clip** — phone icon missing under scaleX=-1 + overflow hidden
4. **Delivery bake** — Storybook must use original Guing PNG, not Figma live re-import
5. **Stale Storybook static** — served old assets until `storybook:build` + restart
6. **Hebrew rasters scope** — header-only; pagination broke when applied globally

## Recommended fix area (by symptom)

See [[visual/patterns/figma-guing-screen-roundtrip]].

## Artifacts

- Manifest: `artifacts/figma-screens/screen_1.manifest.json`
- Contract: `artifacts/figma-screens/screen_1.contract.json`
- Original: `artifacts/figma-screens/screen_1.png`
- Figma live: `figma-screen-diffs/screen_1/rendered.png`
- Four-way: `figma-screen-diffs/screen_1/fourWay/report.html`

## Test console

Figma tab Fix / Fix all wired via `scripts/figma-entry-fix.mjs` (2026-05-27).

## Cached

true — patterns generalized in vault + `figma-screen-until-pass` skill

## Investigation — screen_1 / vsFigmaLive

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:12:41.511Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.31% |
| Worst hotspot | 12.33% |
| Fail reason | — |

### Compare regions

| Region | Hotspot | Symptom | Original | Figma live | Contract stage |
| --- | --- | --- | --- | --- | --- |
| region-01 | filter-button | Purple bleed + clipped Hebrew + missing icon | Clean pill: סינון + filter icon | Left purple bar, only ןון visible, icon gone | JSON correct → **importer** |
| region-02 | user-header | Wrong Hebrew label + alignment | שם משתמש: right-aligned | Wrong glyphs, left-aligned | Raster PNG verified → **importer** |
| region-03 | sidebar / view-toggle | Active segment radius | Purple pill: all corners 8px | Inner-left corners square | cornerRadii in JSON → **importer** |

Side-by-side: `figma-screen-diffs/by-screen/screen_1/vsFigmaLive/regions/region-0{1,2,3}-compare.png`

### Artifacts

- Compare: `figma-screen-diffs/screen_1/originalParity/diff-original-figmaLive.png`
- Original PNG: `artifacts/figma-screens/screen_1.png`
- Figma live PNG: `figma-screen-diffs/screen_1/originalParity/figmaLive.png`
- Contract: `artifacts/figma-screens/screen_1.contract.json`
- Test report: `figma-screen-diffs/by-screen/screen_1/vsFigmaLive/test-report.json`

### Root cause

**Triage:** Figma live is wrong vs original Guing PNG — renderer/importer bug (`code-v2.ts`), not a source or contract defect.

1. **region-01 / filter-button (fig-142, worst 12.3%)** — Contract node `Buttons` at abs (1256,190) has `overflow:hidden`, 12px pill radius, children: content row (fig-143: RTL TEXT `סינון` 28×13 at x:0 + filter icon fig-145 at x:34) and decorative ellipse frame (fig-147 at x:-39 with rotated vectors opacity 0.06). Figma live shows concentric purple outlines, a solid purple bar on the left, clipped Hebrew (only tail glyphs), and missing filter icon. Contract geometry/fills/borders match original; live export mis-handles (a) overflow clip vs `figmaRelativeTransform` vectors inside the pill, and/or duplicate border stroke rendering, and (b) RTL absolute TEXT in a narrow 28px box.

2. **region-02 / user-header (fig-85, 5.6%)** — Hebrew label `שם משתמש:` is stamped as reference raster (`figmaReferenceRaster:text`, abs 109×16, 70×11). Extracted PNG matches original crop pixel-for-pixel (0 RGB diff). Figma live displays unrelated Hebrew (`ועד חסכונות`) left-aligned — the image node is misplaced or not composited at the contract box inside the flex column (`align:end`) header shell, not a bad stamp.

3. **region-03 / view-toggle (fig-101, 1.9%)** — Active list segment has uniform `cornerRadii` 8px on all four corners in contract; Figma live renders inner-left corners square while outer-right corners stay rounded — per-corner radius on nested filled segment frames not preserved during import.

Global 0.31% includes additional scattered table/header Hebrew AA drift; the three hotspots above dominate `maxRegionPercent`.

### Recommended fix area

Primary: `packages/figma-importer-plugin/src/code-v2.ts`

| Priority | Fix target | Rule (not story hack) |
| --- | --- | --- |
| 1 | Filter pill overflow + borders (fig-142 tree) | Ensure `clipsContent=true` clips rotated `figmaRelativeTransform` vector descendants; avoid double border stroke on Guing pill frames with existing `paint.borders` |
| 2 | RTL Hebrew TEXT in narrow flex rows (fig-144 pattern) | Guing manifest TEXT with `direction:rtl` + `position:absolute`: use full measured width or reference raster; honor RTL glyph order in live text placement |
| 3 | Reference raster images (fig-85 pattern) | Honor `figmaReferenceAbsX/Y` + contract `box` for `layer.image` nodes under flex parents; verify live export places 70×11 raster at abs (109,16) |
| 4 | Segmented control fills (fig-101 pattern) | Apply all four `cornerRadii` on filled child segment frames (not just outer container) |

Secondary (if clip still fails): `packages/pixel-test/src/scene-to-html.ts` mock parity only.

Pattern: [[visual/patterns/figma-guing-screen-roundtrip]] §6 Hebrew rasters (header scope) + §1 GROUP/clip.

Verify: `pnpm test:figma:screen:parity -- --artifact artifacts/figma-screens/screen_1.manifest.json` (tier C).

### Cached

false — full investigate at 2026-05-30 (attempt 1/5)

<!-- vault-fingerprint: vsFigmaLive|fail|0.310|12.333|1|fix-all pre-agent -->

## Investigation — screen_1 / vsFigmaLive

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:18:24.265Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.31% |
| Worst hotspot | 12.33% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_1/originalParity/diff-original-figmaLive.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_1/originalParity/diff-original-figmaLive.png`
- Storybook PNG: `figma-screen-diffs/screen_1/originalParity/storybook.png`
- Figma PNG: `figma-screen-diffs/screen_1/originalParity/figmaLive.png`
- Artifact JSON: `artifacts/figma-screens/screen_1.contract.json`
- Scene JSON: ``

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:18:24.265Z

<!-- vault-fingerprint: vsFigmaLive|fail|0.310|12.333|2|fix-all pre-agent -->

## Investigation — screen_1 / vsFigmaLive

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:27:07.079Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.31% |
| Worst hotspot | 12.33% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_1/originalParity/diff-original-figmaLive.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_1/originalParity/diff-original-figmaLive.png`
- Storybook PNG: `figma-screen-diffs/screen_1/originalParity/storybook.png`
- Figma PNG: `figma-screen-diffs/screen_1/originalParity/figmaLive.png`
- Artifact JSON: `artifacts/figma-screens/screen_1.contract.json`
- Scene JSON: ``

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:27:07.079Z

<!-- vault-fingerprint: vsFigmaLive|fail|0.310|12.333|3|fix-all pre-agent -->

## Investigation — screen_1 / vsFigmaLive

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:31:42.974Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.31% |
| Worst hotspot | 12.33% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_1/originalParity/diff-original-figmaLive.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_1/originalParity/diff-original-figmaLive.png`
- Storybook PNG: `figma-screen-diffs/screen_1/originalParity/storybook.png`
- Figma PNG: `figma-screen-diffs/screen_1/originalParity/figmaLive.png`
- Artifact JSON: `artifacts/figma-screens/screen_1.contract.json`
- Scene JSON: ``

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:31:42.974Z

<!-- vault-fingerprint: vsFigmaLive|fail|0.310|12.333|4|fix-all pre-agent -->

## Investigation — screen_1 / vsFigmaLive

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:42:45.434Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.31% |
| Worst hotspot | 12.33% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_1/originalParity/diff-original-figmaLive.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_1/originalParity/diff-original-figmaLive.png`
- Storybook PNG: `figma-screen-diffs/screen_1/originalParity/storybook.png`
- Figma PNG: `figma-screen-diffs/screen_1/originalParity/figmaLive.png`
- Artifact JSON: `artifacts/figma-screens/screen_1.contract.json`
- Scene JSON: ``

### Root cause

**Attempt 4 (orchestrator review):** Prior edits (RTL right-only lock, inset-ring, flex-cross-end) left metrics flat — they never hit **fig-144**.

| Hypothesis | Result |
| --- | --- |
| RTL contract box for all RTL WIDTH_AND_HEIGHT | **Partial** — only `align:right\|end`; filter label is `align:center` |
| Native rounded INSIDE stroke on fig-142 | **Likely** — phantom concentric purple rings in live PNG |
| clipsContent / overflow | Unlikely — contract has `overflow:hidden`; clip path already on |

**fig-144 (`סינון`):** `direction:rtl` + `align:center` + `WIDTH_AND_HEIGHT` + 28×13 box. Live kept auto-width → glyphs wider than box → clipped Hebrew + icon pushed out of hotspot.

**fig-142:** uniform 1px `#8a5adb` stroke + 12px radius — live native stroke ghosts; switch to single SVG `__border` overlay (same rule as dashed pills).

### Recommended fix area

`code-v2.ts`:

1. `figmaNativeNeedsRtlContractBox` — include `align:center`; `reaffirmFigmaRtlContractText` uses `CENTER` when contract says center.
2. `applyBorders` / `buildBorderOutlineSvg` — live uniform solid + `cornerRadii` → SVG outline, clear native strokes.

**Expected movement:** region-01 hotspot 12.3% → ≤0.1%; global 0.31% → ≤0.1% if secondary regions unchanged.

### Cached

false — attempt 4 triage 2026-05-30

<!-- vault-fingerprint: vsFigmaLive|fail|0.310|12.333|5|fix-all pre-agent -->
