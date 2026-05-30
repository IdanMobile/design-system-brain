# radial-gradient-ellipse-size

When Storybook CSS uses explicit radial ellipse sizes (`ellipse 120% 60% at …`), extraction stores `sizeX`/`sizeY` on the fill layer. Render paths must emit `${shape} ${sizeX} ${sizeY}` — not just `ellipse` — or the browser uses default sizing and glow spreads too wide.

**Fix:** `radialGradientShapeCss()` in `packages/pixel-test/src/render-html.ts` (and equivalent in mock/Figma paths if needed).

**Symptom:** Subtle blue/dark gradient fringe mismatch on dark headers or columns; region diffs show diffuse glow vs tighter Storybook ellipse.
