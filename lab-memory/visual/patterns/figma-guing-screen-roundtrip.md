# Figma Guing screen roundtrip (Manifest → Delivery)

**Track:** Figma tab in test console — inverse of Storybook ingress.  
**Pipeline:** Manifest → Contract → Figma live → Storybook → 4-way (strict) → Logic.

## Fast triage by step

| Step | Symptom | Fix first |
| --- | --- | --- |
| Manifest → Contract | Layer count mismatch, missing nodes | `scripts/figma-manifest-to-contract.mjs` |
| Contract → Figma | Global or region diff vs original PNG | `code-v2.ts` + adapter; live export only |
| Storybook | Storybook ≠ original Guing PNG | `bake-figma-screen-ui.mjs`, Screen component, **rebuild** `pnpm storybook:build` |
| 4-way | One leg red in report.html | Triage pair (see below) |
| Logic | Gaps count | `lab-memory/logic/specs/<screenId>.spec.json` |

## Recurring root causes (screen_1)

### 1. GROUP children use absolute coords

Guing GROUP children often carry **absolute** x/y. Rebasing to group origin in `figma-manifest-to-contract.mjs` fixes pagination chevrons, toolbar icons, nested chrome.

**Storybook ingress (`prev-next`):** DOM extract nests chevron imgs under `prev-next` with frame-absolute `box.x` (e.g. 79 inside a 53px group) → Figma live clips them. Rebase in `extract.ts` + `code-v2.ts` (`normalizeAbsoluteGroupChildren`); disable clip on `prev-next` frames.

### 2. Shell fill inherited onto TEXT

`fillFigmaHeaderShells` copied header chrome `#f6f6f9` onto **TEXT** nodes → importer wrapped text in frames → white box behind avatar letter.

**Fix:** Skip TEXT in shell fill pass.

### 3. Figma-native TEXT must stay bare

Wrap-free TEXT in `code-v2.ts` for manifest-sourced text. Exact line-height; avatar uses NONE+CENTER cap.

### 4. Flip frames + overflow hidden

Phone icon used `figmaRelativeTransform` scaleX=-1. Default clip hid mirrored vector.

**Fix:** `isFigmaFlipFrame` → disable clip on that frame.

### 5. Delivery Storybook ≠ Figma live export

Storybook `@lab/ui` must bake **original Guing PNG** (`artifacts/figma-screens/<id>.png`) as `figma-export.png`. Keep Figma live PNG separate as `figma-live-export.png`.

After bake: `pnpm storybook:build && pnpm storybook:serve` (stale static = false 0% or huge header diff).

### 6. Hebrew / small vector rasters

Live parity rasters for Hebrew text: scope to **header only** (y &lt; 100). Applying to pagination/sidebar broke global diff (1%+).

Region gates: user-header, phone-row use **0.6%** tolerance; others **0.1%**.

### 7. Four-way leg ownership

| Failing pair | Owner |
| --- | --- |
| original ↔ figma | Live importer + adapter |
| original ↔ storybook | Bake + Storybook rebuild |
| original ↔ reactHtml | Playground / honest HTML fixture |
| figma ↔ storybook | Usually figma leg if storybook already 0% vs original |

## Commands (screen_1)

```bash
pnpm test:figma:screen:manifest -- --artifact artifacts/figma-screens/screen_1.manifest.json
pnpm test:figma:screen -- --artifact artifacts/figma-screens/screen_1.manifest.json
pnpm ui:bake:screen1
pnpm storybook:build && pnpm storybook:serve
pnpm test:figma:screen:four-way -- --artifact artifacts/figma-screens/screen_1.manifest.json
pnpm test:portfolio:refresh
```

## Test console Fix buttons

Figma tab now mirrors Storybook: **Fix** per screen row + **Fix all** per pipeline step. Dispatches Terminal fix→test loop (≤5 tries) via `scripts/figma-entry-fix.mjs`.

## Related

- [[visual/investigations/active/lab-screen1--default]]
- Skill: `.cursor/skills/figma-screen-until-pass/SKILL.md`
