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

- [[visual/patterns/figma-guing-screen-roundtrip]] — Figma Guing screen roundtrip (Manifest → Delivery)

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

## Investigation — screen_2 / vsFigmaLive

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:12:42.344Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.10% |
| Worst hotspot | 8.47% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_2/originalParity/diff-original-figmaLive.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_2/originalParity/diff-original-figmaLive.png`
- Storybook PNG: `figma-screen-diffs/screen_2/originalParity/storybook.png`
- Figma PNG: `figma-screen-diffs/screen_2/originalParity/figmaLive.png`
- Artifact JSON: `artifacts/figma-screens/screen_2.contract.json`
- Scene JSON: ``

### Root cause

**Triage (Original vs Figma live — both sides have same content; Figma renderer produces wrong pixels):**

| Region | Hotspot | Symptom | Artifact trace | Stage |
| --- | --- | --- | --- | --- |
| region-01 (8.47%) | user-header | Hebrew label + email + avatar visually match but pixels differ | `fig-106` "שם משתמש:" stamped as reference PNG raster (`figmaReferenceRaster:text`, abs 109×16) — re-import IMAGE placement vs flex-parent offset (box x:74 in align:end column); sibling `fig-107` email is native Inter TEXT (AA drift) | importer |
| region-02 (7.82%) | pagination-footer | Two-line Hebrew paragraph ghosting / clipped descenders | 8× `fig-172` pattern: `figmaTextAutoResize:WIDTH_AND_HEIGHT` but box 380×40 with lineHeight 19.6 (>1.3× → wrapped); align:right direction:rtl verticalAlign:middle | importer |
| region-03 (5.83%) | filter-button | RTL label horizontal shift | `fig-144` "טיוב התמלול": WIDTH_AND_HEIGHT, x:99.5 in padded flex column (center/center) | importer |
| region-04 (2.53%) | phone-row | "מעבר ל 05:54" link row sub-pixel drift | `fig-169` center-aligned RTL TEXT + `fig-252` flip-vector chevron (`figmaRelativeTransform` scale −1) | importer |
| region-05 (1.26%) | breadcrumbs | Breadcrumb RTL text offset left | `fig-53` "רשימת משימות": HEIGHT mode, align:right direction:rtl, absolute x:28 | importer |

**Primary (worst region):** user-header diff is a **mixed rendering** problem — header Hebrew uses a PNG crop from the original (`applyLiveHebrewTextRasters`, y&lt;100) but live re-import does not land the IMAGE at the same sub-pixel position as the source vector text, and the adjacent native email TEXT re-rasterizes with different anti-aliasing. Not missing content (both sides present).

**Secondary (bulk of global 2.10%):** 15 Hebrew paragraph nodes still honor `WIDTH_AND_HEIGHT` despite multi-line box height; `figmaNativeNeedsFixedTextBox` rule exists but pagination-footer rows (`fig-172` ×8) remain the largest remaining text ghosting band after prior partial fixes (global improved 5.16% → 2.10%).

### Recommended fix area

1. **`code-v2.ts` — user-header raster placement:** When `figmaReferenceRaster:"text"` + `figmaReferenceAbsX/Y` present, anchor IMAGE node using absolute reference coords (not only parent-relative box.x/y) so stamped crop from original PNG lands pixel-identical; consider reverting header Hebrew to native Figma TEXT (Open Sans SemiBold, RTL RIGHT) if raster cannot achieve ≤0.1% in user-header gate.

2. **`code-v2.ts` — multi-line WIDTH_AND_HEIGHT:** Ensure `figmaNativeNeedsFixedTextBox` → `NONE` also sets fixed `resize(w,h)`, `textAlignHorizontal=RIGHT`, and `textDirection=RTL` for Hebrew paragraphs (`fig-172` pattern: 380×40, verticalAlign middle). Verify plugin reload after build.

3. **`code-v2.ts` — RTL bare-text anchoring:** filter-button (`fig-144`) and breadcrumbs (`fig-53`) — audit `anchorFigmaRtlBareText` / flex-child absolute positioning so RTL right-aligned TEXT in centered columns matches contract box.x.

4. **`code-v2.ts` — flip chevron:** `fig-252` pagination vector with scale flip — confirm `isFigmaFlipFrame` disables clip (pattern [[visual/patterns/figma-guing-screen-roundtrip]] §4).

Upstream contract is correct (manifest matches box/text fields); fix importer only. Tier C regression after edit.

### Linked patterns

[[visual/patterns/figma-guing-screen-roundtrip]]

### Cached

false — full investigate run 2026-05-30 (attempt 1/5 vsFigmaLive)

<!-- vault-fingerprint: vsFigmaLive|fail|2.103|8.470|1|fix-all pre-agent -->

## Investigation — screen_2 / vsFigmaLive

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:14:03.431Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.10% |
| Worst hotspot | 8.47% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_2/originalParity/diff-original-figmaLive.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_2/originalParity/diff-original-figmaLive.png`
- Storybook PNG: `figma-screen-diffs/screen_2/originalParity/storybook.png`
- Figma PNG: `figma-screen-diffs/screen_2/originalParity/figmaLive.png`
- Artifact JSON: `artifacts/figma-screens/screen_2.contract.json`
- Scene JSON: ``

### Root cause

**Triage (Original vs Figma live):** Figma live is wrong — same chrome is present but native TEXT layout/rendering diverges from the Guing reference PNG (not missing Storybook/source content).

| Region | Original | Figma live | Stage |
| --- | --- | --- | --- |
| user-header (8.47%) | Hebrew label + email right-aligned beside avatar | Live Hebrew shows broken bidi (`משתמש שם:`); email anchored left with gap to avatar | importer |
| pagination-footer (7.82%) | Single-line visible in crop; tight wrap | Extra visible line / different line metrics in card footers | importer |
| filter-button (5.83%) | Tab label `טיוב התמלול` intact | Left glyph clipped (vertical seam) | importer |
| phone-row (2.53%) | Hebrew row text | Subtle glyph AA/position shift | importer |
| breadcrumbs (1.26%) | Breadcrumb strip right-aligned | Same glyphs left-aligned in band | importer |

Contract trace (worst region): `שם משתמש:` is stamped `figmaReferenceRaster: "text"` at abs (109, 16) with `layer.image` and **no** `layer.text`, yet region-01 target still shows vector Hebrew — live export is not matching the reference crop (either IMAGE placement fails or a figma-native TEXT path still runs). Adjacent `Yaronk@audiocodes.com` keeps manifest `align: left`, `WIDTH_AND_HEIGHT` in a 144px column (`align:end` parent) so LTR email sits on the column’s left edge vs original’s right-near-avatar cluster.

**screen_2-only pattern (15 nodes, screen_1 has 0):** Hebrew paragraph TEXT nodes carry `figmaTextAutoResize: WIDTH_AND_HEIGHT` while contract box height implies multi-line wrap (e.g. card footers `380×40`, lh≈19.6 at y≈868). `figmaNativeNeedsFixedTextBox` exists in `code-v2.ts` but 2.10% global diff remains — pagination-footer + summary paragraphs still drift. Breadcrumbs/tab labels (`align: right`, `direction: rtl`, HEIGHT or WIDTH_AND_HEIGHT) render with wrong horizontal anchor in live Figma.

Artifact JSON is correct for alignment/dimensions; failures are **contract → Figma live** (primary fixer `contract-to-figma`).

### Recommended fix area

`packages/figma-importer-plugin/src/code-v2.ts`:

1. **Reference raster honor** — Before `figmaBareText`, if `layer.image` + `figmaReferenceRaster` (especially header Hebrew y&lt;100), build IMAGE rectangle only; optionally position via `figmaReferenceAbsX/Y`. Do not recreate TEXT from `figmaNodeType: TEXT` dataset when text was stripped.
2. **Multi-line Guing TEXT** — Ensure `figmaNativeNeedsFixedTextBox` applies on live bare-text path for all 15 screen_2 nodes (NONE + fixed box + RIGHT + `textDirection: RTL`); tune line-height to contract px when box height is multi-line.
3. **RTL horizontal anchor** — Breadcrumbs + tab labels: respect `text.align: right` / `direction: rtl` inside padded frames (filter-button clipping).
4. **User-header email** — In flex column with `align: end`, right-anchor WIDTH_AND_HEIGHT LTR email (or NONE + fixed width) so glyphs sit near avatar like original.

Upstream only if raster coords wrong: `scripts/figma-screen-reference-align.mjs` (`applyLiveHebrewTextRasters` abs-Y gate). Pattern: [[visual/patterns/figma-guing-screen-roundtrip]] §3 (bare TEXT), §6 (header Hebrew rasters).

Verify: `pnpm test:figma:screen:parity -- --artifact artifacts/figma-screens/screen_2.manifest.json`

### Cached

false — full investigate run 2026-05-30 (attempt 2/5)

<!-- vault-fingerprint: vsFigmaLive|fail|2.103|8.470|2|fix-all pre-agent -->

## Investigation — screen_2 / vsFigmaLive

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:27:34.844Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.10% |
| Worst hotspot | 8.47% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_2/originalParity/diff-original-figmaLive.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_2/originalParity/diff-original-figmaLive.png`
- Storybook PNG: `figma-screen-diffs/screen_2/originalParity/storybook.png`
- Figma PNG: `figma-screen-diffs/screen_2/originalParity/figmaLive.png`
- Artifact JSON: `artifacts/figma-screens/screen_2.contract.json`
- Scene JSON: ``

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:27:34.844Z

<!-- vault-fingerprint: vsFigmaLive|fail|2.103|8.470|3|fix-all pre-agent -->

## Investigation — screen_2 / vsFigmaLive

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:28:59.499Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.10% |
| Worst hotspot | 8.47% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_2/originalParity/diff-original-figmaLive.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_2/originalParity/diff-original-figmaLive.png`
- Storybook PNG: `figma-screen-diffs/screen_2/originalParity/storybook.png`
- Figma PNG: `figma-screen-diffs/screen_2/originalParity/figmaLive.png`
- Artifact JSON: `artifacts/figma-screens/screen_2.contract.json`
- Scene JSON: ``

### Root cause

**Orchestrator review (attempt 4/5) — metrics stuck at 2.10% / 8.47% because attempts 2–3 made zero code edits (watchdog).**

| Failed hypothesis | Evidence |
| --- | --- |
| `figmaNativeNeedsFixedTextBox` alone fixes screen_2 | Global improved 5.16%→2.10% earlier, but 8.47% user-header unchanged — email still left-anchored |
| Reference raster path missing | `fig-106` has `image` + `figmaReferenceAbsX/Y` but `code-v2.ts` ignored abs coords (render-html had them) |
| Re-create Hebrew as TEXT | `fig-106` has no `layer.text` — builds IMAGE; mismatch is placement + sibling email, not missing raster |

**Confirmed (region-01 compare + contract):** Parent `fig-105` is flex **column** `align: end`. `fig-107` email is bare TEXT `WIDTH_AND_HEIGHT`, `align: left`, box `0×144` — importer left-anchors glyphs; original clusters right near avatar. `fig-106` raster needs screen-abs positioning like mock HTML.

**Secondary:** `fig-172` paragraphs use U+2028 line separators; Figma treated them as soft wraps → pagination-footer ghosting. `figmaNativeNeedsFixedTextBox` already applies but line breaks were wrong.

### Recommended fix area

`code-v2.ts` only (attempt 4):

1. `figmaReferenceRasterLocal` + `parentDocPos` in `buildLayer` / `reaffirmChildBoxPositions`
2. `reaffirmFigmaFlexCrossEndChild` — right-pin + `RIGHT` align for LTR bare TEXT in flex column `align: end`
3. `textDisplayValue` — map `\u2028`/`\u2029` → `\n` for Guing TEXT; extend `figmaNativeNeedsFixedTextBox` line-break detection

Expected: user-header ≤0.1%; global drops with pagination-footer + RTL tabs.

### Cached

false — orchestrator review + targeted edit 2026-05-30

<!-- vault-fingerprint: vsFigmaLive|fail|2.103|8.470|4|fix-all pre-agent -->

## Investigation — screen_2 / vsFigmaLive

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:31:49.592Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.10% |
| Worst hotspot | 8.47% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_2/originalParity/diff-original-figmaLive.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_2/originalParity/diff-original-figmaLive.png`
- Storybook PNG: `figma-screen-diffs/screen_2/originalParity/storybook.png`
- Figma PNG: `figma-screen-diffs/screen_2/originalParity/figmaLive.png`
- Artifact JSON: `artifacts/figma-screens/screen_2.contract.json`
- Scene JSON: ``

### Root cause

**Orchestrator review (attempt 4/5) — prior attempts documented fixes but `code-v2.ts` never received them (agent exit 143). Metrics stuck at 2.10% / 8.47%.**

| Failed hypothesis | Evidence |
| --- | --- |
| `figmaNativeNeedsFixedTextBox` alone fixes screen_2 | Improved 5.16%→2.10% earlier; user-header unchanged |
| Reference raster path missing | `fig-106` abs coords (109,16) already match local box (74,0) — not the blocker |
| Re-create Hebrew as TEXT | `fig-106` has `image` only — builds IMAGE; mismatch is sibling email placement |

**Confirmed (region-01 compare + contract):** Parent `fig-105` is flex **column** `align: end` (144px). `fig-107` email is bare TEXT `WIDTH_AND_HEIGHT`, `align: left`, box `0×144` — importer left-anchors glyphs at x=0; original clusters right near avatar (`fig-108`). `fig-106` Hebrew raster already right-pinned at x=74.

**Secondary (region-02):** `fig-172` paragraphs carry U+2028 line separators; Figma ignores them unless mapped to `\n` → pagination-footer ghosting.

### Recommended fix area

`code-v2.ts`:

1. `reaffirmFigmaFlexCrossEndBareText` — right-pin LTR `WIDTH_AND_HEIGHT` bare TEXT when flex-column parent `align: end` and child spans full parent width (`fig-107`).
2. `textDisplayValue` + `figmaNativeNeedsFixedTextBox` — map `\u2028`/`\u2029` → `\n` for Guing TEXT.

Expected: user-header ≤0.1%; global drops with pagination-footer.

### Cached

false — orchestrator review + targeted edit 2026-05-30 (iteration 4)

<!-- vault-fingerprint: vsFigmaLive|fail|2.103|8.470|4|fix-all pre-agent -->

## Investigation — screen_2 / vsFigmaLive

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:07:30.638Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.10% |
| Worst hotspot | 8.47% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_2/originalParity/diff-original-figmaLive.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_2/originalParity/diff-original-figmaLive.png`
- Storybook PNG: `figma-screen-diffs/screen_2/originalParity/storybook.png`
- Figma PNG: `figma-screen-diffs/screen_2/originalParity/figmaLive.png`
- Artifact JSON: `artifacts/figma-screens/screen_2.contract.json`
- Scene JSON: ``

### Root cause

**Iteration 3/5 — metrics stuck at 2.10% / 8.47% because prior RIGHT-in-full-box pin is a no-op when `text.width === boxW` after NONE resize (x stays 0; live export ignores in-box RIGHT).**

| Region | Symptom | Contract node | Fix |
| --- | --- | --- | --- |
| user-header (8.47%) | Email left-anchored, wide gap to avatar | `fig-107`: LTR email `0×144`, parent `fig-105` column `align:end` | Measure WIDTH_AND_HEIGHT natural width → NONE tight box → pin `x = targetRight − naturalW` |
| pagination-footer (7.82%) | Extra line / ghost wrap | `fig-172`: U+2028 separator + `380×40` | Map `\u2028`→`\n` + per-line `lineHeight = boxH/lineCount` + CENTER |
| filter-button (5.83%) | RTL tab label clip/shift | `fig-144`: RTL `WIDTH_AND_HEIGHT` | NONE + contract box (existing rule) |
| breadcrumbs (1.26%) | RTL label left-shift | `fig-53`: RTL `HEIGHT` mode | Extend RTL contract-box rule to HEIGHT |

### Recommended fix area

`code-v2.ts`: `pinFigmaFlexCrossEndBareText` (natural-width right pin), extend `figmaNativeNeedsRtlContractBox` to HEIGHT, U+2028 line-height split in createTextNode.

### Linked patterns

[[visual/patterns/figma-guing-screen-roundtrip]]

<!-- vault-fingerprint: vsFigmaLive|fix|2.103|8.470|3|natural-width pin -->

## Investigation — screen_2 / vsFigmaLive

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:15:00.000Z  
**Source:** fix-all iteration 3/5 (agent)
**Fix attempt:** 3

### Metrics (before fix)

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.10% |
| Worst hotspot | 8.47% (user-header) |

### Root cause

| Region | Symptom | Artifact | Stage |
| --- | --- | --- | --- |
| user-header (8.47%) | Email left-anchored with gap to avatar; original right-clusters near avatar | `fig-107`: LTR email, `align:left`, box `0×144` in flex-column parent `fig-105` (`align:end`) | importer |
| pagination-footer (7.82%) | Extra line / wrong wrap | `fig-172`: U+2028 line sep + `WIDTH_AND_HEIGHT` + 380×40 box | importer (partially fixed) |
| filter-button (5.83%) | RTL tab label clipped/shifted | `fig-144`: RTL `align:right`, `WIDTH_AND_HEIGHT` — glyphs hug content, lose box anchor | importer |
| breadcrumbs (1.26%) | RTL breadcrumb left-shifted | `fig-53`: RTL `HEIGHT` — secondary to tab fix | importer |

**Primary:** `reaffirmFigmaFlexCrossEndBareText` only moved `x` by `parentW - text.width`. Email at 12px Inter spans ~full 144px parent width after live sizing, so `x` stayed at 0. Fix: lock contract box (`NONE`) + `textAlignHorizontal=RIGHT` for full-width LTR children under flex-column `align:end`.

**Secondary:** RTL tab labels (`fig-144` pattern) need `figmaNativeNeedsRtlContractBox` → `NONE` so `align:right` + `direction:rtl` anchor inside captured box.

### Recommended fix area

`code-v2.ts`: (1) `reaffirmFigmaFlexCrossEndBareText` — NONE + RIGHT; (2) `figmaNativeNeedsRtlContractBox` in createTextNode resize path.

### Linked patterns

[[visual/patterns/figma-guing-screen-roundtrip]]

<!-- vault-fingerprint: vsFigmaLive|fix|2.103|8.470|3|agent iteration 3 -->

## Investigation — screen_2 / vsFigmaLive

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:43:36.144Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 2.10% |
| Worst hotspot | 8.47% |
| Fail reason | — |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | compare | `figma-screen-diffs/screen_2/originalParity/diff-original-figmaLive.png` |

### Artifacts

- Compare: `figma-screen-diffs/screen_2/originalParity/diff-original-figmaLive.png`
- Storybook PNG: `figma-screen-diffs/screen_2/originalParity/storybook.png`
- Figma PNG: `figma-screen-diffs/screen_2/originalParity/figmaLive.png`
- Artifact JSON: `artifacts/figma-screens/screen_2.contract.json`
- Scene JSON: ``

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:43:36.144Z

<!-- vault-fingerprint: vsFigmaLive|fail|2.103|8.470|5|fix-all pre-agent -->

## Investigation — screen_2 / vsFigmaLive

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T04:00:00.000Z  
**Source:** fix-all iteration 5/5 (orchestrator review)
**Fix attempt:** 5

### Failure analysis (orchestrator review)

| Failed hypothesis | Why it failed |
| --- | --- |
| Natural-width right pin for header email (`pinFigmaFlexCrossEndBareText`) | `fig-107` email at 12px spans ~144px — `x = targetRight − naturalW` stays 0 |
| Reference raster abs coords missing | `fig-106` local x=74 already matches abs 109; raster placement not the blocker |
| `figmaNativeNeedsFixedTextBox` alone | Improved global 5.16%→2.10% but user-header stuck at 8.47% |
| Prior agent edits (exit 143) | Code had pin logic but wrong algorithm — metrics unchanged across attempts 2–4 |

**Confirmed:** Region-01 compare + contract — parent `fig-105` flex column `align:end`; `fig-107` needs **RIGHT inside full 144×15 NONE box**, not natural-width pin. RTL tabs/paragraphs (`fig-144`, `fig-172`, `fig-53`) need contract-box anchor at `layer.box.x/y`, not `max(boxW, naturalW)` expansion.

### Recommended fix area

`code-v2.ts`:

1. `pinFigmaFlexCrossEndBareText` → NONE + full contract box + `textAlignHorizontal=RIGHT`
2. `applyFigmaRtlContractTextPin` → lock contract box dimensions; drop natural-width expansion

**Expected:** user-header ≤0.1%; global drops via pagination-footer + filter-button + breadcrumbs.

### Linked patterns

[[visual/patterns/figma-guing-screen-roundtrip]]

<!-- vault-fingerprint: vsFigmaLive|fix|2.103|8.470|5|RIGHT-in-box pin -->
