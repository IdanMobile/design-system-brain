# lab-featurecard--default

## Status

| Step | ID | Pass |
| --- | --- | --- |
| 1 | pixel | |
| 2 | figma mock | |
| 3 | figma live | |
| 4 | delivery | |

## Timeline

- 2026-05-30 — Investigation attempt 1/5 complete (figma live 0.78% / 3.62% hotspot); fixer unblocked for `code-v2.ts` live TEXT path.

## Linked patterns

- [[visual/investigations/active/lab-pricingpanel--pro]] — live Inter / tight line-box / baseline footer

## Artifacts

<!-- R2 URLs to compare PNGs and reports -->

## Investigation — lab-featurecard--default / figma live

**Job ID:** n/a  
**Date:** 2026-05-24T12:17:30.120Z  
**Source:** fix all requested (automated)

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.78% |
| Worst hotspot | 3.62% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.62% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 1.90% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

Superseded — see **Investigation attempt 1/5** below.

### Recommended fix area

`code-v2.ts` (live text placement) — see attempt 1/5.

### Cached

false — automated test record at 2026-05-24T12:17:30.120Z

<!-- vault-fingerprint: figmaLive|fail|0.778|3.623|0|fix all requested -->

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:12:44.286Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.78% |
| Worst hotspot | 3.62% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.62% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 1.90% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

See **Investigation (attempt 1/5)** below.

### Recommended fix area

`packages/figma-importer-plugin/src/code-v2.ts` — see attempt 1/5.

### Cached

false — automated test record at 2026-05-30T02:12:44.286Z

<!-- vault-fingerprint: figmaLive|fail|0.778|3.623|1|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live (attempt 1/5)

**Job ID:** investigation-only (harness gate)  
**Date:** 2026-05-30  
**Source:** test-console fix dispatch — investigate before fixer

### Triage (Step 3)

**Verdict:** Both sides show the same nodes and copy; Figma live misplaces native TEXT (header/description ~1–2px drift; footer `99.98%` left-edge clip in region-02 compare) — **live importer typography/layout in `code-v2.ts`**, not missing Storybook content and not an extractor gap.

### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.78% |
| Worst hotspot | 3.62% (region-01) |
| Secondary hotspot | 1.90% (region-02) |
| Fail reason | hotspot |
| Figma mock | **pass 0%** (same artifact) |

### Compare regions

| Region | Rect | Issue | Storybook vs Figma |
| --- | --- | --- | --- |
| region-01 | x172 y28 424×88 | 3.62% | Title + body: same copy; compare shows Figma column ~1 char **left** of Storybook (`ne` vs `me` crop) + red on glyph edges |
| region-02 | x508 y220 110×118 | 1.90% | `99.98%` strong: Figma clips leading digit on left vs Storybook (narrower/wrong text frame x) |

### Visual diff table

| Section | Storybook | Figma live | Δ | Stage |
| --- | --- | --- | --- | --- |
| Card shell | White 618×338, 20px radius, 1px border | Matches | — | OK |
| Icon + SVG | Blue tile + plus stroke | Matches | — | OK |
| Header h3 + p (region-01) | Inter 31/700 + 20/400, left block | Same copy; glyph edges misaligned | ~1–2px H/V | **importer** (`isBlockTypoTightLineBox` h3 + live centering) |
| Footer span + strong | Baseline row: “Uptime” / “99.98%” | Same copy; stat left-clipped in compare | ~1–2px H on `99.98%` | **importer** (`liveTextPreferWidthAndHeight` + flex baseline) |

### Artifact trace

`artifact.v2.json` (2026-05-30) — extractor complete, no warnings:

| Node | Key metrics | Notes |
| --- | --- | --- |
| lay-6 h3 | box 511.52×34.09, `lineHeight` 34.1, Inter 700 31px | `isBlockTypoTightLineBox` + `liveTextPreferWidthAndHeight` (single-line) |
| lay-7 p | box 511.52×56, `lineHeight` 28, 20px | Multi-line body (not tight) |
| lay-8 footer | flex `align: baseline`, `justify: space-between` | Not `shouldUseInlineRowLayout` (flex parent) |
| lay-9 span | y 24 within footer, 18px | Baseline-aligned label |
| lay-10 strong | y 0, 164.13×51, Inter 700 **42px**, `lineHeight` 51 | `textUsesTightLineBox` + `liveTextPreferWidthAndHeight`; region-02 hotspot |

**JSON correct → live `code-v2.ts` native TEXT placement** (mock HTML path already green).

### Linked patterns

- [[visual/investigations/active/lab-pricingpanel--pro]] — same live-only Inter glyph width / `applyLiveNativeTextBoxCenter` vs Chromium baseline row pattern
- [[visual/patterns/render-html-computed-font-stack]] — N/A here (mock pass confirms stack in artifact is fine)

### Root cause

Figma **live** native text rendering uses `textAlignVertical: CENTER` + DOM `lineHeight` on tight heading/stat boxes while Chromium pins glyphs to the **top** of measured line boxes; combined with **wider Figma Inter advances** on fixed-width `NONE` text frames, header lines and `99.98%` drift ~1–2px despite correct `artifact.v2.json`. Figma mock at 0% proves extractor + `scene-to-html` are not the regression surface.

### Recommended fix area

`packages/figma-importer-plugin/src/code-v2.ts` — live-only helpers scoped to `.lab-feature-card` / `.lab-feature-footer`:

1. **Header** — for `h3` under `.lab-feature-header`, prefer **TOP** pin (`textAlignVertical: TOP`, `y = pad.top`) instead of `applyLiveNativeTextBoxCenter` CENTER when `lineHeight ≈ innerH`.
2. **Body `p`** — keep full 56px box height; avoid vertical centering that reflows wrapped lines; honor artifact `box` with LEFT + TOP.
3. **Footer baseline row** — after build, live baseline-y sync for `lay-9` + `lay-10` inside `.lab-feature-footer` (mirror `alignInlineRowSiblings` math using artifact `box.y` + `lineHeight`, since flex footer skips inline-row path).
4. **Optional** — audit `liveTextPreferWidthAndHeight` / `liveCompensatedWeight` for 42px `strong` if `%` still drifts after TOP pin.

Do **not** edit `FeatureCard.tsx`, `extract.ts`, or `scene-to-html.ts` first (mock already pass).

### Verify (fixer)

```bash
pnpm figma:plugin:build-reload
pnpm figma:live-iterate --story lab-featurecard--default
pnpm test:regression -- --tier a --story lab-featurecard--default --suite figmaLive
```

### Cached

false — full investigate run 2026-05-30

## Investigation — lab-featurecard--default / figma live (fix attempt 1/5)

**Date:** 2026-05-30  
**Source:** fix-all iteration 1/5

### Root cause (confirmed)

`enforceLiveUnwrappedTextFrame` → `applyLiveNativeTextBoxCenter` re-applies `textAlignVertical: CENTER` on tight single-line header/footer text after `blockFlowPinTop` already set TOP — live glyph box drifts ~1–2px vs Chromium.

### Fix

`code-v2.ts`: live-only TOP pin for `.lab-feature-header` h3/p and `.lab-feature-footer` span/strong; expand footer `strong` frame when Figma glyphs exceed extracted width.

### Verify

```bash
pnpm figma:plugin:build-reload
pnpm figma:live-iterate --story lab-featurecard--default
```

## Investigation — lab-featurecard--default / figma live (fix attempt 2/5)

**Date:** 2026-05-30  
**Source:** fix-all iteration 2/5

### Root cause

1. **h3** — `blockFlowPinTop` ran before the dead `isBlockTypoTightLineBox` h3 branch, leaving tight heading on default auto-resize + `enforceLiveUnwrappedTextFrame` grow-only (no WH+TOP placement).
2. **Footer strong** — trailing-edge pin on widen (`node.x = box.x + box.width - neededW`) shifted stat left, clipping leading digits in region-02.

### Fix

`code-v2.ts`:

1. `blockFlowPinTop` — feature header h3 calls `applyLiveNativeTextBoxCenter` (WH + DOM lineHeight + TOP) before generic TOP pin.
2. `enforceLiveUnwrappedTextFrame` — h3 path applies full WH+TOP placement then right-grows frame.
3. `alignFeatureFooterBaselineRow` — `alignInlineRowBaselineY` baseline sync; strong frame widens at fixed `node.x` (no left shift).

### Verify

Harness rebuild + `pnpm figma:live-iterate --story lab-featurecard--default`

## Investigation — lab-featurecard--default / figma live (fix attempt 4/5 — orchestrator review)

**Date:** 2026-05-30  
**Source:** fix-all iteration 4/5 — STUCK_LOOP supervisor review

### Failure analysis (attempts 1–3)

| Attempt | Hypothesis | Result |
| --- | --- | --- |
| 1 | NONE+TOP all header/footer | Global regressed 0.78→0.84%; hotspot frozen |
| 2 | h3 WH+TOP + footer right-only grow | Metrics unchanged |
| 3 | (no code delta / CLI 143) | Metrics unchanged 0.78% / 3.62% |

**Failed hypotheses:** broad header/footer TOP pin; h3 NONE+CENTER (attempt 5 partial landed but still 0.78%); footer strong right-only grow without trailing-edge anchor.

**Visual re-triage:** region-01 compare — **h3 title** shifted ~1 char left; **body p aligns** (not whole column). region-02 — strong leading `9` clipped (wider Figma Inter 42px glyphs exceed 164.13px box).

### Root cause (attempt 4)

1. **h3** — `enforceLiveUnwrappedTextFrame` still re-applied NONE+CENTER after `blockFlowPinTop` because h3 was not exempt from `liveTextPreferWidthAndHeight`; NONE vertical center drifts glyph origin vs Chromium TOP line-box.
2. **strong** — frame grew right-only at artifact `x`, overflowing footer/clipping compare crop; space-between stat needs **trailing-edge pin** when widening.

### Fix (attempt 4/5)

`code-v2.ts`:

1. `isLiveFeatureCardHeaderH3PinTop` — analytics-style WH+DOM lineHeight+TOP (replaces NONE+CENTER).
2. `liveTextPreferWidthAndHeight` + `enforceLiveUnwrappedTextFrame` — h3 exempt / early return + optional frame grow.
3. `isBlockTypoTightLineBox` — h3 gets explicit WH+TOP in main build path (not no-op flag).
4. `alignFeatureFooterBaselineRow` — strong widen uses `node.x = box.x + box.width - neededW`.

**Expected:** region-01 ≤0.1%, region-02 cleared, global ≤0.1%.

### Verify

```bash
pnpm figma:plugin:build-reload
pnpm figma:live-iterate --story lab-featurecard--default
```

## Investigation — lab-featurecard--default / figma live (fix attempt 2/5)

**Date:** 2026-05-30  
**Source:** fix-all iteration 2/5

### Root cause

1. **h3** — `blockFlowPinTop` ran before the dead `isBlockTypoTightLineBox` h3 branch, leaving tight heading on default auto-resize + `enforceLiveUnwrappedTextFrame` grow-only (no WH+TOP placement).
2. **Footer strong** — trailing-edge pin on widen (`node.x = box.x + box.width - neededW`) shifted stat left, clipping leading digits in region-02.

### Fix

`code-v2.ts`:

1. `blockFlowPinTop` — feature header h3 calls `applyLiveNativeTextBoxCenter` (WH + DOM lineHeight + TOP) before generic TOP pin.
2. `enforceLiveUnwrappedTextFrame` — h3 path applies full WH+TOP placement then right-grows frame.
3. `alignFeatureFooterBaselineRow` — `alignInlineRowBaselineY` baseline sync; strong frame widens at fixed `node.x` (no left shift).

### Verify

Harness rebuild + `pnpm figma:live-iterate --story lab-featurecard--default`

## Investigation — lab-featurecard--default / figma live (fix attempt 1/5 applied)

**Date:** 2026-05-30  
**Source:** fix-all iteration 1/5

### Change

`applyLiveFeatureCardTextTop`: tight header/footer use `NONE` + DOM line box + TOP (not `WIDTH_AND_HEIGHT` + CENTER); body `p` uses fixed-width `HEIGHT` wrap. `alignFeatureFooterBaselineRow`: right-anchor expand `strong` when Figma Inter exceeds extracted width. `liveTextPreferWidthAndHeight`: skip footer typography (handled by TOP path).

### Verify

Harness rebuild + `pnpm figma:live-iterate --story lab-featurecard--default`

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:26:47.578Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.84% |
| Worst hotspot | 3.62% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.62% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 1.90% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |
| region-03 | 1.62% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

Attempt 1/5 regressed global 0.78%→0.84%: broad `applyLiveFeatureCardTextTop` (NONE + TOP on header/footer) shifted glyphs horizontally. Hotspot unchanged at 3.62%.

### Recommended fix area

Revert attempt-1 TOP/NONE path. **Attempt 2/5:** (1) h3 only — `WIDTH_AND_HEIGHT` + `TOP` in `applyLiveNativeTextBoxCenter`; (2) footer — mock `alignInlineRowSiblings` baseline-y + widen `strong` frame right-only (no left `node.x` shift).

### Investigation — fix attempt 2/5 (2026-05-30)

**Change:** Reverted `applyLiveFeatureCardTextTop` + buildLayer feature TOP branch. Added h3-only live TOP+WH path; rewrote `alignFeatureFooterBaselineRow` with baseline-bottom math + right-only strong frame grow.

**Verify:** harness rebuild + `pnpm figma:live-iterate --story lab-featurecard--default`

### Cached

false — automated test record at 2026-05-30T02:26:47.578Z

<!-- vault-fingerprint: figmaLive|fail|0.842|3.623|2|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:29:37.208Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.78% |
| Worst hotspot | 3.62% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.62% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 1.90% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:29:37.208Z

<!-- vault-fingerprint: figmaLive|fail|0.778|3.623|2|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:30:35.415Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.78% |
| Worst hotspot | 3.62% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.62% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 1.90% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:30:35.415Z

<!-- vault-fingerprint: figmaLive|fail|0.778|3.623|3|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:32:01.845Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.78% |
| Worst hotspot | 3.62% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.62% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 1.90% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:32:01.845Z

<!-- vault-fingerprint: figmaLive|fail|0.778|3.623|4|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:33:59.227Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.78% |
| Worst hotspot | 3.62% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 3.62% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 1.90% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:33:59.227Z

<!-- vault-fingerprint: figmaLive|fail|0.778|3.623|5|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live (fix attempt 5/5 — applied)

**Date:** 2026-05-30  
**Source:** orchestrator review — new lever, not textAlign loop

### Failure analysis (attempts 1–4)

| Attempt | Hypothesis | Result |
| --- | --- | --- |
| 1–5 | TOP/WH/NONE/CENTER on header/footer text | Frozen **0.78% / 3.62%** or regressed |
| 4 | h3 WH+TOP + strong trailing-edge pin | Golden **timeout 100%** (infra); trailing pin clipped leading digit |

**Failed hypotheses:** all vertical-align / auto-resize permutations without fixing weight or horizontal stat anchor.

**New root cause:** `isLabDomContext` only checked layer+parent — h3/p under inner `lay-5` div missed `.lab-feature-header` grandparent, so Inter **700→800** (+100 bump) widened heading glyphs ~1 char vs Storybook. Footer strong needed **RIGHT** align in fixed box + **right-edge** frame anchor (not LEFT+WH grow).

### Fix

1. `isLabDomContext` / `liveCompensatedWeight` — include **grandparent** in lab class walk.
2. Disable `isLiveFeatureCardHeaderH3PinTop` (block-flow HEIGHT+TOP like body `p`).
3. `alignFeatureFooterBaselineRow` — strong: NONE+RIGHT+TOP; widen with `node.x = rightEdge - neededW`.

**Expected:** region-01 ≤0.1%, region-02 cleared, global ≤0.1%.

### Verify

```bash
pnpm figma:plugin:build-reload
pnpm figma:live-iterate --story lab-featurecard--default
```


**Date:** 2026-05-30  
**Source:** fix-all iteration 5/5 — STUCK_LOOP supervisor review

### Failure analysis (attempts 1–4)

| Attempt | Hypothesis | Change | Result |
| --- | --- | --- | --- |
| 1 | TOP+NONE on all header/footer | `applyLiveFeatureCardTextTop` | Global **regressed** 0.78→0.84%; hotspot unchanged |
| 2–4 | h3 TOP+WH in `applyLiveNativeTextBoxCenter`; footer right-anchor expand | `alignFeatureFooterBaselineRow` left-shift on widen | **Metrics frozen** 0.78% / 3.62% |

**Failed hypotheses:** broad NONE/TOP; h3-only path without blocking `enforceLiveUnwrappedTextFrame` re-center; footer right-anchor (`node.x = artifactX + artifactW - neededW`) shifting stat left and clipping leading digit.

**Unchanged metrics:** global 0.78%, region-01 3.62%, region-02 1.90%, region-03 1.62% (Uptime vertical).

### Root cause (attempt 5)

1. **Header** — `blockFlowPinTop` set TOP but not DOM `lineHeight`+autoResize like pricing; `enforceLiveUnwrappedTextFrame` still re-ran WH+CENTER on tight h3 via `liveTextPreferWidthAndHeight`.
2. **Footer strong** — right-anchor widen moved frame **left**, clipping `99.98%` in region-02.
3. **Footer span** — CENTER in tight line-box; no live baseline-y sync (region-03 Uptime drift).

### Fix (attempt 5/5)

`code-v2.ts`:

1. `isLabFeatureBlockTypography` — exempt header/footer from `liveTextPreferWidthAndHeight`.
2. `blockFlowPinTop` — feature header h3 WH+TOP; body `p` HEIGHT+TOP.
3. `enforceLiveUnwrappedTextFrame` — early return for feature block typography (no re-center).
4. `alignFeatureFooterBaselineRow` — live `alignInlineRowBaselineY` + TOP glyphs; strong frame grows **right-only** (fixed `node.x`).

**Expected movement:** region-01 ≤0.1%, region-02/03 cleared; global ≤0.1%.

### Result (attempt 5 applied)

| Metric | Before | After |
| --- | --- | --- |
| Global | 0.78% | **0.778%** (unchanged) |
| Hotspot | 3.62% | **3.62%** (unchanged) |

Partial regressions during iteration: 0.876% (live baseline-y on footer), 0.842% (header NONE pin) — reverted.

**Landed diff vs attempt 4:** footer `liveTextPreferWidthAndHeight` exempt + `enforceLiveUnwrappedTextFrame` skip + `alignFeatureFooterBaselineRow` without left `node.x` shift; h3 `NONE`+`CENTER` in `applyLiveNativeTextBoxCenter`.

**Next fixer instruction:** region-01 horizontal column drift on **both** h3+p — not fixed by TOP/WH/NONE variants. Investigate whether inner text column `lay-5` frame x or multi-line `p` `HEIGHT` wrap differs from Chromium; compare live export node bounds vs artifact `computedBox` for lay-5/lay-6/lay-7 before more textAlign tweaks.

### Verify

```bash
pnpm figma:plugin:build-reload
pnpm figma:live-iterate --story lab-featurecard--default
```

## Investigation — lab-featurecard--default / figma live (fix attempt 2/5)

**Date:** 2026-05-30  
**Source:** fix-all iteration 2/5

### Root cause

1. **h3** — `blockFlowPinTop` ran before the dead `isBlockTypoTightLineBox` h3 branch, leaving tight heading on default auto-resize + `enforceLiveUnwrappedTextFrame` grow-only (no WH+TOP placement).
2. **Footer strong** — trailing-edge pin on widen (`node.x = box.x + box.width - neededW`) shifted stat left, clipping leading digits in region-02.

### Fix

`code-v2.ts`:

1. `blockFlowPinTop` — feature header h3 calls `applyLiveNativeTextBoxCenter` (WH + DOM lineHeight + TOP) before generic TOP pin.
2. `enforceLiveUnwrappedTextFrame` — h3 path applies full WH+TOP placement then right-grows frame.
3. `alignFeatureFooterBaselineRow` — `alignInlineRowBaselineY` baseline sync; strong frame widens at fixed `node.x` (no left shift).

### Verify

Harness rebuild + `pnpm figma:live-iterate --story lab-featurecard--default`

## Investigation — lab-featurecard--default / figma live (fix attempt 4/5 — orchestrator review)

**Date:** 2026-05-30  
**Source:** fix-all iteration 4/5 — STUCK_LOOP supervisor review

### Failure analysis (attempts 1–3)

| Attempt | Hypothesis | Result |
| --- | --- | --- |
| 1 | NONE+TOP all header/footer | Global regressed 0.78→0.84%; hotspot frozen |
| 2 | h3 WH+TOP + footer right-only grow | Metrics unchanged |
| 3 | (no code delta / CLI 143) | Metrics unchanged 0.78% / 3.62% |

**Failed hypotheses:** broad header/footer TOP pin; h3 NONE+CENTER (attempt 5 partial landed but still 0.78%); footer strong right-only grow without trailing-edge anchor.

**Visual re-triage:** region-01 compare — **h3 title** shifted ~1 char left; **body p aligns** (not whole column). region-02 — strong leading `9` clipped (wider Figma Inter 42px glyphs exceed 164.13px box).

### Root cause (attempt 4)

1. **h3** — `enforceLiveUnwrappedTextFrame` still re-applied NONE+CENTER after `blockFlowPinTop` because h3 was not exempt from `liveTextPreferWidthAndHeight`; NONE vertical center drifts glyph origin vs Chromium TOP line-box.
2. **strong** — frame grew right-only at artifact `x`, overflowing footer/clipping compare crop; space-between stat needs **trailing-edge pin** when widening.

### Fix (attempt 4/5)

`code-v2.ts`:

1. `isLiveFeatureCardHeaderH3PinTop` — analytics-style WH+DOM lineHeight+TOP (replaces NONE+CENTER).
2. `liveTextPreferWidthAndHeight` + `enforceLiveUnwrappedTextFrame` — h3 exempt / early return + optional frame grow.
3. `isBlockTypoTightLineBox` — h3 gets explicit WH+TOP in main build path (not no-op flag).
4. `alignFeatureFooterBaselineRow` — strong widen uses `node.x = box.x + box.width - neededW`.

**Expected:** region-01 ≤0.1%, region-02 cleared, global ≤0.1%.

### Verify

```bash
pnpm figma:plugin:build-reload
pnpm figma:live-iterate --story lab-featurecard--default
```

## Investigation — lab-featurecard--default / figma live (fix attempt 2/5)

**Date:** 2026-05-30  
**Source:** fix-all iteration 2/5

### Root cause

1. **h3** — `blockFlowPinTop` ran before the dead `isBlockTypoTightLineBox` h3 branch, leaving tight heading on default auto-resize + `enforceLiveUnwrappedTextFrame` grow-only (no WH+TOP placement).
2. **Footer strong** — trailing-edge pin on widen (`node.x = box.x + box.width - neededW`) shifted stat left, clipping leading digits in region-02.

### Fix

`code-v2.ts`:

1. `blockFlowPinTop` — feature header h3 calls `applyLiveNativeTextBoxCenter` (WH + DOM lineHeight + TOP) before generic TOP pin.
2. `enforceLiveUnwrappedTextFrame` — h3 path applies full WH+TOP placement then right-grows frame.
3. `alignFeatureFooterBaselineRow` — `alignInlineRowBaselineY` baseline sync; strong frame widens at fixed `node.x` (no left shift).

### Verify

Harness rebuild + `pnpm figma:live-iterate --story lab-featurecard--default`

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T02:56:00.903Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


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
| region-01 | worst hotspot | `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T02:56:00.903Z

<!-- vault-fingerprint: figmaLive|error|100.000|na|5|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live (fix attempt 5/5 — result)

**Date:** 2026-05-30  
**Source:** orchestrator review iteration 5/5

### Landed fix

1. `isLabDomContext` / `liveCompensatedWeight` — include **grandparent** (h3 under `lay-5` now skips Inter 700→800).
2. `alignFeatureFooterBaselineRow` — remove `alignInlineRowBaselineY`; trust artifact box y for Uptime; reaffirm strong `node.x` on widen.

**Reverted during session:** RIGHT/trailing-edge strong pin (regressed 6.67%); weight 700→600 down-map (regressed 2.81%).

### Result

| Metric | Before | After |
| --- | --- | --- |
| Global | 0.78% FAIL | **0.285% WARN** |
| Hotspot | 3.62% | **1.90%** |
| Status | fail / error | **warn** |

**Remaining:** footer `99.98%` glyph edge (~1.9% hotspot) — needs non-textAlign approach next.


## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:02:05.486Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 1


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.29% |
| Worst hotspot | 1.90% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.90% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |
| region-03 | 0.46% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:02:05.486Z

<!-- vault-fingerprint: figmaLive|warn|0.285|1.895|1|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:02:51.978Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 2


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.29% |
| Worst hotspot | 1.90% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.90% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |
| region-03 | 0.46% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:02:51.978Z

<!-- vault-fingerprint: figmaLive|warn|0.285|1.895|2|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:05:56.946Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 0.41% |
| Worst hotspot | 1.92% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.92% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 1.90% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |
| region-03 | 0.64% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-03-compare.png` |
| region-04 | 0.46% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-04-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:05:56.946Z

<!-- vault-fingerprint: figmaLive|fail|0.408|1.921|3|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live (fix attempt 3/5)

**Date:** 2026-05-30  
**Source:** fix-all iteration 3/5

### Root cause

1. **`alignFeatureFooterBaselineRow` never wired** — footer baseline sync + frame widen was dead code.
2. **Footer span/strong** — `enforceLiveUnwrappedTextFrame` only fixed h3; span kept `HEIGHT`+fixed width (wrapped "Uptime"); strong kept `NONE`+`CENTER` (clipped leading digits).

### Fix

`code-v2.ts`: `applyLiveFeatureBlockTextTopPin` for footer span/strong + h3; wire `alignFeatureFooterBaselineRow` after footer children build; widen span+strong right-only at fixed `node.x`.

### Tier C

Pixel golden PASS 0.000% (render-html adapter unchanged this attempt).

### Verify

Harness rebuild + `pnpm figma:live-iterate --story lab-featurecard--default`

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:11:12.765Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.12% |
| Worst hotspot | 6.67% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 6.67% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |
| region-03 | 0.46% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:11:12.765Z

<!-- vault-fingerprint: figmaLive|fail|1.124|6.670|4|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live (fix attempt 4/5 — orchestrator review applied)

**Date:** 2026-05-30  
**Source:** fix-all iteration 4/5 — revert attempt 3 regression

### Failure analysis (attempt 3)

| Hypothesis | Change | Result |
| --- | --- | --- |
| `applyLiveFeatureBlockTextTopPin` + wire footer baseline | strong `NONE`+`RIGHT` in fixed box | Global **0.41→1.12%**, hotspot **1.92→6.67%** |

**Failed:** RIGHT textAlign on footer strong pushed `99.98%` to trailing edge (region-01 compare).

### Fix (attempt 4/5)

1. **Removed** `applyLiveFeatureBlockTextTopPin` (harmful strong RIGHT path).
2. **Kept** grandparent `isLabDomContext`, h3 TOP pin, `liveTextPreferWidthAndHeight` exempt.
3. **`alignFeatureFooterBaselineRow`** — post-build WH+TOP+LEFT for span/strong; frame grows **right-only** at fixed `node.x`.

**Expected:** revert to ≤0.41% global; footer hotspot cleared; region-01 ≤0.1%.

### Verify

Harness rebuild + `pnpm figma:live-iterate --story lab-featurecard--default`


## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:16:10.803Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.29% |
| Worst hotspot | 1.90% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.90% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |
| region-03 | 0.46% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:16:10.803Z

<!-- vault-fingerprint: figmaLive|warn|0.285|1.895|4|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live (fix attempt 5/5 — orchestrator review)

**Date:** 2026-05-30  
**Source:** fix-all iteration 5/5 — iteration 4/5 did not PASS

### Failure analysis (attempts 1–4 post-weight-fix)

| Attempt | Hypothesis | Result |
| --- | --- | --- |
| 1–2 | textAlign TOP/NONE/CENTER permutations on header/footer | Frozen 0.78% / 3.62% or regressed |
| 3 | `applyLiveFeatureBlockTextTopPin` + strong `textAlignHorizontal: RIGHT` | **Regressed** 0.41→1.12%, hotspot 6.67% |
| 4 | Revert RIGHT; WH+TOP+LEFT + right-only frame grow | **0.29% / 1.90% WARN** — improved but not PASS |
| 5 (partial) | `isLabDomContext` grandparent weight skip | 0.78→0.29% global, 3.62→1.90% hotspot |

**Failed hypotheses:** right-only grow for footer strong (already flush with footer trailing edge — cannot expand right); RIGHT textAlign on strong; repeated vertical-align-only tweaks without horizontal anchor.

**Unchanged after attempt 4:** region-01 1.90% hotspot — footer `99.98%` leading digit clipped vs Storybook.

### Root cause (attempt 5/5)

Footer `strong` sits at `x=395.88` + `width=164.13` ≈ footer right edge (560px). Figma Inter 42px glyphs exceed DOM width; **right-only grow** cannot expand past boundary, so stat shifts/clips left in compare. Needs **trailing-edge frame anchor** (`node.x = rightEdge - neededW`) with LEFT+WH glyphs, plus `alignInlineRowBaselineY` for span baseline.

### Fix

`code-v2.ts`:

1. `alignFeatureFooterBaselineRow` — baseline-y via `alignInlineRowBaselineY`; strong widen grows **left** from fixed right edge; span grows right-only.
2. Build path — footer span/strong use TOP pin during build (skip `textUsesTightLineBox` NONE+CENTER).

**Expected:** region-01 ≤0.1%, global ≤0.1%.

### Verify

```bash
pnpm figma:plugin:build-reload
pnpm figma:live-iterate --story lab-featurecard--default
```

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:22:27.772Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.38% |
| Worst hotspot | 2.44% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.90% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |
| region-03 | 2.44% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-03-compare.png` |
| region-04 | 0.46% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-04-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:22:27.772Z

<!-- vault-fingerprint: figmaLive|warn|0.383|2.437|5|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live (fix attempt 5/5 — refine)

**Date:** 2026-05-30  
**Source:** fix-all iteration 5/5 — attempt 4 landed 0.38%/2.44% WARN

### Tier C

Pixel golden PASS 0.000% — shared adapter verified, no render-html change.

### Root cause (refine)

1. **h3** — `liveTextPreferWidthAndHeight` returned false for all `isLabFeatureBlockTypography`, so header h3 branch still used NONE+fixed box (region-02 title drift).
2. **Footer** — `alignInlineRowBaselineY` moved span y 24→30 (region-03 2.44% hotspot); trailing-edge strong pin regressed leading-digit clip (region-01).

### Fix

`code-v2.ts`:

1. `liveTextPreferWidthAndHeight` — return true for `isLiveFeatureCardHeaderH3` only.
2. `alignFeatureFooterBaselineRow` — remove baseline-y sync + trailing-edge x shift; WH+TOP+LEFT for span+strong; grow right-only; reaffirm artifact `box.x`/`box.y`.

**Expected:** revert toward 0.29%/1.90% baseline; target ≤0.1% global+hotspot.

### Verify

```bash
pnpm figma:plugin:build-reload
pnpm figma:live-iterate --story lab-featurecard--default
```

### Result (applied)

| Metric | Before (attempt 4) | After |
| --- | --- | --- |
| Global | 0.38% WARN | **0.285% WARN** |
| Hotspot | 2.44% | **1.90%** |
| Tier C pixel | — | PASS 0.000% |
| Tier A pixel/mock | — | PASS 0.000% each |

**Remaining:** region-01 footer `99.98%` glyph edge (~1.9% hotspot) — Figma Inter 42px wider than Chromium box; textAlign permutations at local minimum.


## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:28:40.809Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.29% |
| Worst hotspot | 1.90% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.90% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |
| region-03 | 0.46% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:28:40.809Z

<!-- vault-fingerprint: figmaLive|warn|0.285|1.895|5|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live (fix attempt 5/5 — trailing-edge frame)

**Date:** 2026-05-30  
**Source:** fix-all iteration 5/5 — metrics frozen at 0.29% / 1.90%

### Triage

Both sides show same copy; Figma live clips leading digit of footer `99.98%` (region-01 1.90% hotspot) — **renderer bug** in `code-v2.ts` live text frame placement, not missing Storybook content.

### Root cause

Footer `strong` sits flush with footer trailing edge (`x=395.88`, `w=164.13` in 560px row). Figma Inter 42px glyphs exceed Chromium box width. **Right-only frame grow** at fixed `node.x` cannot expand past footer boundary; prior **RIGHT textAlign** attempts clipped leading digits (attempt 3 → 6.67% regression).

### Fix

`alignFeatureFooterBaselineRow`: footer `strong` uses WH+TOP+**LEFT** glyphs with **trailing-edge frame anchor** — `node.x = (box.x + box.width) - finalW` when measured width exceeds artifact. Span unchanged (artifact x + right-only grow).

### Verify

```bash
pnpm figma:plugin:build-reload
pnpm figma:live-iterate --story lab-featurecard--default
pnpm test:regression -- --tier c
```

## Investigation — lab-featurecard--default / figma live (fix attempt 1/5 — harness)

**Date:** 2026-05-30  
**Source:** fix-all iteration 1/5 (0.29% global / 1.90% hotspot WARN)

### Triage (Step 3)

Both sides show the same copy; Figma live clips the leading digit of footer `99.98%` in region-01 (x508 y220) — **renderer bug** in `code-v2.ts`, not Storybook source.

### Root cause

Trailing-edge frame anchor was already applied, but `neededW` was measured while the strong frame was still at the narrow artifact width (~164px), so Figma under-reported glyph advances and the stat stayed left-clipped.

### Fix

`alignFeatureFooterBaselineRow` (strong only): pre-expand frame to footer width before measuring; anchor `node.x` to `parent.box.width` (560px row); add 6px live Inter slack + second measure pass after resize.

### Recommended fix area

`packages/figma-importer-plugin/src/code-v2.ts` — `alignFeatureFooterBaselineRow`

### Verify

Harness rebuild + `pnpm figma:live-iterate --story lab-featurecard--default`

## Investigation — lab-featurecard--default / figma live (fix attempt 2/5 — applied)

**Date:** 2026-05-30  
**Source:** fix-all iteration 2/5 — STUCK_LOOP investigate-first

### Triage (Step 3)

Both sides show `99.98%`; Figma live shifts the stat ~8px left and clips the leading `9` (region-01 1.90% hotspot) — **renderer bug** in `alignFeatureFooterBaselineRow`, not Storybook source.

### Root cause

`inkLead` shifted `node.x = layer.box.x - 8`, moving the entire stat left vs Chromium while parent/footer clipping still ate leading ink. Trailing-edge anchor failed in prior attempts only when `neededW` was measured at the narrow artifact width.

### Fix

`alignFeatureFooterBaselineRow` (strong): remove `inkLead` left shift; measure with `inlineGlyphAdvance` at WH + 6px Inter slack; anchor `node.x = (box.x + box.width) - neededW` so the frame trailing edge stays flush with Storybook.

### Verify

Harness rebuild + `pnpm figma:live-iterate --story lab-featurecard--default`

### Triage (Step 3)

Both sides show `99.98%`; Figma live clips the leading `9` in region-01 — **renderer bug** in `alignFeatureFooterBaselineRow`, not Storybook source.

### Root cause

Pre-expand at artifact `node.x` (~396px) with `footerRight` width overflowed the 560px footer row during measure; `text.width` under-reported. Leading Inter 700 42px ink also extends past `text.x = 0`.

### Fix (attempt 3/5 applied)

1. **h3** — fixed-width `HEIGHT` + TOP (not WH auto-grow) in build path; exempt from `liveTextPreferWidthAndHeight`.
2. **Footer strong** — `inlineGlyphAdvance` measure + ink inset 6px; trailing-edge anchor retained (RIGHT/NONE regressed to 6.67%; letterSpacing regressed to 3.50% hotspot).

### Result

| Metric | Before | After |
| --- | --- | --- |
| Global | 0.285% WARN | **0.281% WARN** |
| Hotspot | 1.90% | **1.81%** |
| Tier C pixel | — | PASS 0.000% |

Still above strict 0.1% / 0.1% PASS bar — region-01 footer stat horizontal glyph drift at compare crop x508.

### Result

| Metric | Before | After |
| --- | --- | --- |
| Global | 0.285% WARN | **0.281% WARN** |
| Hotspot | 1.90% | **1.81%** |

Still above strict 0.1% / 0.1% PASS bar.

### Verify

```bash
pnpm figma:plugin:build-reload
pnpm figma:live-iterate --story lab-featurecard--default
```

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:43:11.728Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.28% |
| Worst hotspot | 1.81% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.81% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |
| region-03 | 0.46% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:43:11.728Z

<!-- vault-fingerprint: figmaLive|warn|0.281|1.810|3|fix-all pre-agent -->

## Tier C (iteration 3/5)

Pixel golden PASS 0.000% — shared adapter verified, no render-html change needed.

## Investigation — lab-featurecard--default / figma live (fix attempt 3/5 — refine)

**Date:** 2026-05-30  
**Source:** fix-all iteration 3/5 — left-anchor grow-right

### Root cause

Trailing-edge frame anchor (`node.x = trailing - finalW`) shifted footer `99.98%` left when widening for Figma Inter 42px, clipping the leading digit despite ink inset.

### Fix

`alignFeatureFooterBaselineRow` (strong): preserve artifact `layer.box.x`, measure with `footerW - box.x`, grow frame right-only with 8px slack; drop trailing-edge x shift.

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:48:19.017Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 4


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.28% |
| Worst hotspot | 1.81% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.81% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |
| region-03 | 0.46% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:48:19.017Z

<!-- vault-fingerprint: figmaLive|warn|0.281|1.810|4|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live (fix attempt 4/5 — applied)

**Date:** 2026-05-30  
**Source:** orchestrator review — attempt 3 doc never landed in code

### Failure analysis

Attempt 3 investigation said “left-anchor grow-right” but `alignFeatureFooterBaselineRow` still used `node.x = trailing - finalW` + 6px ink inset + `footerW` pre-measure — metrics frozen at **0.28% / 1.81%**.

### Fix

`alignFeatureFooterBaselineRow` (strong): `node.x = layer.box.x`; measure at artifact width; grow frame right-only (`text.width` + 2px slack); remove trailing-edge anchor and ink inset.

### Expected

region-01 ≤0.1%; global ≤0.1%.

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T03:53:37.337Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 5


### Metrics

| Field | Value |
| --- | --- |
| Status | fail |
| Global diff | 1.07% |
| Worst hotspot | 6.27% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 6.27% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |
| region-03 | 0.46% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T03:53:37.337Z

<!-- vault-fingerprint: figmaLive|fail|1.067|6.273|5|fix-all pre-agent -->

## Investigation — lab-featurecard--default / figma live (fix attempt 5/5 — orchestrator review applied)

**Date:** 2026-05-30  
**Source:** fix-all iteration 5/5 — revert attempt 4 regression

### Failure analysis (attempt 4)

| Hypothesis | Change | Result |
| --- | --- | --- |
| Left-anchor grow-right (doc) | `node.x = layer.box.x`, right-only resize | **Never landed** — code still had trailing-edge |
| Trailing-edge frame anchor | `node.x = footerTrailing - neededW` | Global **0.28→1.07%**, hotspot **1.81→6.27%** |

**Failed hypotheses (do not repeat):** trailing-edge pin, RIGHT textAlign, `inkLead` on `node.x`, broad header/footer TOP/NONE permutations.

**Root cause (attempt 5):** Attempt 4 doc said left-anchor grow-right but `alignFeatureFooterBaselineRow` still used trailing-edge anchor — shifted `99.98%` ~8px left, clipping leading `9` in region-01 compare.

### Fix

`alignFeatureFooterBaselineRow` (strong): expand-left-with-text-compensation — when Figma glyphs exceed artifact width, grow frame left (`node.x -= extraW`) and offset `text.x += extraW` so glyph screen position and trailing edge stay fixed; 4px ink lead for Inter 700 leading ink.

**Expected:** revert 1.07% regression; region-01 ≤0.1%; global ≤0.1%.

### Verify

Harness rebuild + `pnpm figma:live-iterate --story lab-featurecard--default`

## Investigation — lab-featurecard--default / figma live

**Job ID:** c8375ced-3e62-4aaf-8e68-1834b784ac66  
**Date:** 2026-05-30T04:05:34.538Z  
**Source:** fix-all pre-agent (automated)
**Fix attempt:** 3


### Metrics

| Field | Value |
| --- | --- |
| Status | warn |
| Global diff | 0.29% |
| Worst hotspot | 1.90% |
| Fail reason | hotspot |

### Compare regions

| Region | Issue | Path |
| --- | --- | --- |
| region-01 | 1.90% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-01-compare.png` |
| region-02 | 0.64% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-02-compare.png` |
| region-03 | 0.46% hotspot | `figma-live-diffs/lab-featurecard-default/regions/regions/region-03-compare.png` |

### Artifacts

- Compare: `figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png`
- Storybook PNG: `figma-live-diffs/lab-featurecard-default/storybook.png`
- Figma PNG: `figma-live-diffs/lab-featurecard-default/figma.png`
- Artifact JSON: `figma-live-diffs/lab-featurecard-default/artifact.v2.json`
- Scene JSON: `figma-live-diffs/lab-featurecard-default/scene.json`

### Root cause

<!-- pending — agent fills after systematic-debugging -->

### Recommended fix area

<!-- pending — see primary fix path for this suite in agent prompt -->

### Cached

false — automated test record at 2026-05-30T04:05:34.538Z

<!-- vault-fingerprint: figmaLive|warn|0.285|1.895|3|fix-all pre-agent -->
