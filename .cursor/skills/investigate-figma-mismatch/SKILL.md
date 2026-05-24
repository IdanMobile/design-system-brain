---
name: investigate-figma-mismatch
description: Diagnose and fix visual mismatches between Storybook and imported Figma output in the Storybook-to-Figma lab. Use when components do not match positioning, sizing, borders, text layout, effects, or SVG rendering after import. Default quality bar is pixel-perfect parity (≤1px geometry, matched colors and typography).
---

# Investigate Figma Mismatch

## Goal
Make imported Figma output **pixel-perfect** against Storybook — not “close enough.”

Default rule: fix adapter pipeline first (`extractor`, `contract`, `figma-importer-plugin`), not component styles, unless user explicitly asks.

## Pixel-perfect acceptance criteria

| Dimension | Target |
|-----------|--------|
| **Position & size** | `x`, `y`, `width`, `height` within **≤1px** of Storybook `getBoundingClientRect` |
| **Colors** | Same RGBA as computed styles (no missing fills/strokes) |
| **Typography** | Same family, weight, size, line-height, letter-spacing; text visually centered where DOM centers it |
| **Effects** | Multi-layer `box-shadow` preserved (offset, blur, spread, color) |
| **SVG** | Stroke/fill present when rendered in browser (including CSS-only strokes) |
| **Stacking** | Overlapping layers (badge, fieldset, thumb) in correct z-order |
| **No extras** | No phantom nodes (`input[type=range]`, `fieldset-text`, a11y-only text) |

If the user says “pixel perfect,” treat any visible deviation as a bug until explained by a documented platform limit.

## Workflow

```
Pixel-perfect investigation
- [ ] 0) Lab memory: read lab-memory/stories/<storyId>.md if it exists; create from lab-memory/templates/story.md if missing
- [ ] 1) Label screenshots (Storybook vs Figma) + story + artifact path
- [ ] 2) Section-by-section visual diff table (match / diff / severity)
- [ ] 3) For each diff: trace artifact JSON → extractor vs importer
- [ ] 4) Measure DOM in Storybook (box, computed style) as ground truth
- [ ] 4b) Append investigation notes to lab-memory/stories/<storyId>.md (lab-memory/templates/investigation.md format) BEFORE code edits
- [ ] 5) Apply minimal deterministic adapter fix
- [ ] 6) Re-extract (if extractor changed) + rebuild plugin + re-import
- [ ] 7) Re-screenshot compare; repeat until criteria pass
```

**Vault policy:** no secrets in `lab-memory/` — link artifact paths and PRs only.

## Visual diff report format

### Section table (required)

| Section | Storybook | Figma | Δ (px) | Stage |
|---------|-----------|-------|--------|-------|
| Form Controls | … | … | … | importer |

### Per-issue block

1. **Symptom** — visible delta in plain language  
2. **Ground truth** — DOM selector + measured `left/top/width/height` or computed property  
3. **Artifact** — node id/selector + wrong/missing fields  
4. **Fix** — rule (not story-specific hack)  
5. **Verify** — what to re-check after fix  

### Summary

- **Matches** — sections already pixel-perfect  
- **Blocking diffs** — must fix for acceptance  
- **Platform limits** — only if truly impossible (document why)  

## Artifact tracing

Never debug from screenshots alone. Confirm in `artifacts/...json`:

- `box` / `computedBox`
- `layout` (`mode`, `padding`, `gap`)
- `style.fills`, `style.strokes`, `style.radius`, `style.effects`
- `style.typography` + `text.value`
- `vector.svg`

**Missing/wrong in JSON → extractor (or contract).**  
**Correct in JSON, wrong in Figma → importer.**

Quick checks:

```bash
rg '"selector": "fieldset"|StarIcon|boxShadow' artifacts/MUI/Showcase.json
node -e "const j=require('./artifacts/MUI/Showcase.json'); ..."
```

## Common root causes (this project)

| Pattern | Symptom | Fix direction |
|---------|---------|---------------|
| Flex + margin gaps | Horizontal overlap | Coordinate parent when child `x` ≠ flow position |
| Overlapping children | Wrong z-order | Paint-order sort (fieldset back, label front) |
| Bundled `box-shadow` | Flat cards | Parse multi-layer `effects[]` |
| SVG stroke via CSS | Missing spinner | Inject `stroke` on `<circle>` in SVG |
| `::before` thumb | Missing/wrong thumb | Read `getComputedStyle(el, '::before')` |
| Hidden range input | Thumb clutter | Skip `input[type=range]` |
| Wrong font fallback | Text width drift | Preload Roboto; match weight |
| Badge root fill | Chip looks like double pill | Clear fill on `MuiBadge-root` wrapper |
| Subpixel coords | 0.5px layout drift | `snapPx` (2 decimal places) in extract + import |

## Fix rules

- Rule-based mapping from extracted properties — no story-id hacks  
- Scope fallbacks tightly (exact signatures)  
- Prefer explicit geometry over renderer-dependent effects when parity is critical  

## Validation

1. `pnpm --filter @lab/extractor-playwright build` (if extractor changed)  
2. `pnpm --filter @lab/figma-importer-plugin build`  
3. Re-extract target story when extractor changed  
4. Re-import on a **fresh Figma page**  
5. Side-by-side screenshot at **same zoom** (100% or 200%)  
6. Spot-check measured nodes in artifact vs Storybook devtools  

## Output to user

- **Root cause** — one sentence  
- **What changed** — extractor/importer rules  
- **Pixel-perfect status** — which sections pass / which still fail  
- **Next step** — if any gap remains  

## Guardrails

- High-risk: global `layoutPositioning=ABSOLUTE`, overlays inside auto-layout, thickening main stroke for inset borders  
- See `reference.md` for triage matrix and proven fixes  
