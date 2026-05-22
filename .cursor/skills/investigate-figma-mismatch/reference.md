# Figma Mismatch Reference

Use with `investigate-figma-mismatch`. Default bar: **pixel-perfect** (≤1px geometry).

## Pixel-perfect verification checklist

```
- [ ] Screenshots labeled: Storybook = source, Figma = import
- [ ] Same zoom level (100% recommended)
- [ ] Artifact path + storyId confirmed
- [ ] DOM measurements taken for each reported diff
- [ ] Extractor build (if changed)
- [ ] Importer build
- [ ] Re-extract (if extractor changed)
- [ ] Fresh Figma page import (no stale plugin state)
- [ ] Section table: all rows "match" or explained platform limit
```

## Measuring ground truth in Storybook

In browser devtools on the story iframe:

```js
const el = document.querySelector('…'); // matching selector
const r = el.getBoundingClientRect();
({ x: r.left, y: r.top, w: r.width, h: r.height });
const s = getComputedStyle(el);
({ bg: s.backgroundColor, shadow: s.boxShadow, font: s.fontFamily, size: s.fontSize });
// Slider thumb pseudo:
getComputedStyle(el, '::before').backgroundColor;
```

Compare to artifact `computedBox` and `style.*` — then to Figma after import.

## Quick triage matrix

| Symptom | Stage | First check | Typical fix |
|---------|-------|-------------|-------------|
| >1px position drift | Extract/import | `box.x/y` vs DOM rect | `snapPx`; coordinate parent |
| Text width/line break | Importer | font family + `textAutoResize` | Roboto preload; block vs inline heuristic |
| Flat Paper | Extract+import | `effects[]` length & `blur` | `parseBoxShadowLayers` |
| No spinner | Extractor | `vector.svg` stroke attr | inject computed stroke |
| No slider thumb | Extractor | thumb node fill/shadow | `::before` styles; skip range input |
| Badge looks wrong | Extract+import | Badge root fill; pill centering | clear `MuiBadge-root` fill; center pill text |
| Form overlap | Importer | sibling `box` + paint order | explicit placement + stacking sort |
| Black icons | Extractor | path fill in SVG | inject fill from computed color |

## Proven fixes (pixel-perfect oriented)

### Geometry
- `snapPx(n) = Math.round(n * 100) / 100` on box, padding, radius, effects in extract + import  
- `childrenNeedExplicitPlacement` when flex children use margin-based `x` gaps  
- `sortChildrenForStacking` for overlapping absolute children  

### Shadows
- Parse comma-separated `box-shadow` into multiple `effects` entries  
- Importer `expandShadowLayers` for legacy single-string artifacts  

### Slider thumb
- Skip `input[type=range]`  
- Read `getComputedStyle(host, '::before')` for background + shadow  
- Force white fallback; `layout.mode: none`  
- Importer: `layoutMode NONE` on thumb-sized nodes with effects  

### SVG
- Inject stroke on stroke-only circles (`CircularProgress`)  
- Inject path fill when missing  
- Atomic vector import (no double children)  

### Typography
- Preload Roboto Regular/Medium/Bold before import  
- Pill/badge text: center in decorated frame (`isPillLikeNode`)  
- Decorated frame carries fill + radius from spec (not empty wrapper)  

### MUI Badge + Chip
- Source: `<Badge><Chip label="…" /></Badge>` — chip grey pill is correct  
- Strip erroneous fill on `MuiBadge-root` when it only positions children  

## High-risk changes

- Global `layoutPositioning=ABSOLUTE` under auto-layout  
- Overlay frames inside auto-layout trees  
- Inset shadow → thicker main stroke  

## Example diff table (MUI Showcase)

| Section | Storybook | Figma | Severity | Status |
|---------|-----------|-------|----------|--------|
| Buttons/chips | OK | OK | — | Match |
| Badge+chip | Chip + dot | Chip + dot | Low | Verify dot position |
| Form controls | Outlined fields | Outlined fields | — | Match |
| Slider | White thumb + shadow | White thumb + shadow | — | Match after ::before |
| Spinner | Blue arc | Blue arc | — | Match after stroke inject |
| Cards | Elevation | Elevation | Low | Multi-shadow; compare 100% zoom |

## Safe rollback

1. Revert last risky block only  
2. Build plugin  
3. Re-import known-good artifact  
4. Reintroduce with narrower signature  
