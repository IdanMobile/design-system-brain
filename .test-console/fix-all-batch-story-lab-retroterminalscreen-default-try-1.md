# Fix-all investigation report

**Suite:** Pixel (schema) (`pixel`)
**Stories:** 1 fail/warn
**Pass bar:** global ≤ 0.1% AND worst hotspot ≤ 0.1%

## Component families

- `lab-retroterminalscreen--*` — 1: lab-retroterminalscreen--default

## Fix strategy hints

- All `@lab` stories — likely shared code-v2.ts or scene-to-html.ts path.

## Stories (read compare + artifact for each before editing)

### 1. `lab-retroterminalscreen--default` — fail
- Global diff: **3.19%** (over bar)
- Worst hotspot: —
- Fail reason: `global_over`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/pixel-diffs/lab-retroterminalscreen-default/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/pixel-diffs/lab-retroterminalscreen-default/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/pixel-diffs/lab-retroterminalscreen-default/rendered.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/pixel-diffs/lab-retroterminalscreen-default/scene.json
## Suspect renderer snippets (pre-extracted — do NOT Read the full files)

These are the most likely sites to edit for the failure patterns above. Use Grep on the file if you need a different symbol — never `Read` `code-v2.ts`, `scene-to-html.ts`, or `extract.ts` in full.

### `buildLayer` — `packages/figma-importer-plugin/src/code-v2.ts` (lines 2263–2303 of 3016)

```ts

async function buildLayer(
  layer: UniversalLayer,
  parent?: UniversalLayer,
  grandparent?: UniversalLayer
): Promise<SceneNode | null> {
  if (!isLayerVisible(layer)) return null;

  let node: SceneNode;
  let textChildToPlace: TextNode | null = null;

  const isTextLeaf =
    layer.text &&
    (!layer.children || layer.children.length === 0);

  if (isTextLeaf) {
    if (isLiveLabButtonBareLabel(layer, parent)) {
      const t = await createTextNode(layer, parent);
      t.name = layer.name || layer.source.dataset?.figmaName || "label";
      return t;
    }
    // Text leaf. The DOM element may also carry a background, border, shadow,
    // padding (think MUI buttons, chips, badges, table rows). A Figma TextNode
    // has none of those, so we ALWAYS build a frame container and place a
    // TextNode child inside it. The container holds the layer's paint.
    const frame = figma.createFrame();
    frame.layoutMode = "NONE";
    frame.fills = [];
    frame.clipsContent = shouldClipContent(layer, parent);
    textChildToPlace = await createTextNode(layer, parent);
    node = frame;
  } else if (layer.vector) {
    node = createVectorNode(layer, parent);
  } else if (layer.image) {
    node = createImageNode(layer);
  } else {
    const f = figma.createFrame();
    f.layoutMode = "NONE";
    f.fills = [];
    // Figma rejects shadow `spread` on frames where clipsContent is false.
    // Honour the original DOM overflow when set, otherwise default to true
```

### `applyTransform` — `packages/figma-importer-plugin/src/code-v2.ts` (lines 798–838 of 3016)

```ts

function applyTransform(node: SceneNode, layer: UniversalLayer): void {
  if (!("relativeTransform" in node)) return;
  let x = snap(layer.box.x);
  const y = snap(layer.box.y);
  if (isMuiShrunkInputLabel(layer) && isMockFigmaRuntime()) {
    // scene-to-html tryRenderMuiOutlinedLabel adds padding:0 4px before scale(0.75).
    x = snap(x - 3);
  }
  const t = layer.transform?.matrix;
  if (!t || isIdentity(t)) {
    node.x = x;
    node.y = y;
    return;
  }
  // The CSS matrix already lives inside the post-transform box coordinates.
  // Since `box` is the POST-transform bounding rect, we don't reapply the CSS
  // matrix on top. We DO honor rotation extracted from the matrix so vector
  // sub-trees keep their orientation hint, but only when the rotation is
  // meaningful AND the box is unchanged in size by the transform.
  const a = t[0], b = t[1], c = t[2], d = t[3];
  // Skip pure-translate or near-identity matrices (already in box).
  const scaleX = Math.hypot(a, b);
  const scaleY = Math.hypot(c, d);
  if (Math.abs(scaleX - 1) < 1e-3 && Math.abs(scaleY - 1) < 1e-3 && Math.abs(a * d - b * c - 1) < 1e-3) {
    // Pure rotation. Skip — `box` already accounts for the rotated bounds.
    // Mock HTML replay: skip spin on CircularProgress — dashoffset already encodes
    // the arc; extra rotation drifts vs Storybook's paused animation frame.
    if (isMockFigmaRuntime() && "rotation" in node) {
      const isCircularProgress = (layer.source.classList ?? []).some((c) =>
        c.includes("MuiCircularProgress-root")
      );
      if (!isCircularProgress) {
        const rotDeg = (Math.atan2(b, a) * 180) / Math.PI;
        if (Math.abs(rotDeg) > 0.01) {
          (node as any).rotation = snap(rotDeg);
        }
      }
    }
    node.x = x;
    node.y = y;
```

### `applyBorders` — `packages/figma-importer-plugin/src/code-v2.ts` (lines 898–938 of 3016)

```ts

function applyBorders(
  node: SceneNode,
  paint: LayerPaint | undefined,
  width: number,
  height: number,
  layer?: UniversalLayer
): SceneNode | null {
  if (!paint?.borders) return null;
  const uniform = bordersUniform(paint.borders);
  const singleEdge = singleEdgeBorderSide(paint.borders);
  if (singleEdge && !isMockFigmaRuntime()) {
    const edgeSvg = buildSingleEdgeBorderSvg(width, height, paint, singleEdge);
    if (edgeSvg) {
      const vector = figma.createNodeFromSvg(edgeSvg);
      vector.name = "__border";
      vector.x = 0;
      vector.y = 0;
      vector.resize(Math.max(1, snap(width)), Math.max(1, snap(height)));
      if ("fills" in vector) (vector as GeometryMixin).fills = [];
      return vector;
    }
  }
  const sides = paint.borders;
  const cornerR = paint.cornerRadii
    ? Math.max(
        paint.cornerRadii.topLeft.x,
        paint.cornerRadii.topRight.x,
        paint.cornerRadii.bottomRight.x,
        paint.cornerRadii.bottomLeft.x
      )
    : 0;
  const useSvgOutline =
    Boolean(uniform) &&
    cornerR > 0 &&
    (uniform!.style === "dotted" || uniform!.style === "dashed");

  if (uniform && (!("strokes" in node))) {
    return null;
  }

```

### `applyCornerRadii` — `packages/figma-importer-plugin/src/code-v2.ts` (lines 886–926 of 3016)

```ts

function applyCornerRadii(node: SceneNode, paint: LayerPaint | undefined): void {
  if (!paint?.cornerRadii) return;
  if (!("topLeftRadius" in node)) return;
  const c = paint.cornerRadii;
  node.topLeftRadius = snap(c.topLeft.x);
  node.topRightRadius = snap(c.topRight.x);
  node.bottomRightRadius = snap(c.bottomRight.x);
  node.bottomLeftRadius = snap(c.bottomLeft.x);
}

// ─────────────────────────── borders ───────────────────────────

function applyBorders(
  node: SceneNode,
  paint: LayerPaint | undefined,
  width: number,
  height: number,
  layer?: UniversalLayer
): SceneNode | null {
  if (!paint?.borders) return null;
  const uniform = bordersUniform(paint.borders);
  const singleEdge = singleEdgeBorderSide(paint.borders);
  if (singleEdge && !isMockFigmaRuntime()) {
    const edgeSvg = buildSingleEdgeBorderSvg(width, height, paint, singleEdge);
    if (edgeSvg) {
      const vector = figma.createNodeFromSvg(edgeSvg);
      vector.name = "__border";
      vector.x = 0;
      vector.y = 0;
      vector.resize(Math.max(1, snap(width)), Math.max(1, snap(height)));
      if ("fills" in vector) (vector as GeometryMixin).fills = [];
      return vector;
    }
  }
  const sides = paint.borders;
  const cornerR = paint.cornerRadii
    ? Math.max(
        paint.cornerRadii.topLeft.x,
        paint.cornerRadii.topRight.x,
        paint.cornerRadii.bottomRight.x,
```

### `clampNodeWidthToParent` — `packages/figma-importer-plugin/src/code-v2.ts` (lines 58–98 of 3016)

```ts
/** Extractor can report child widths wider than the parent box (grid overflow). Clamp for Figma. */
function clampNodeWidthToParent(
  node: SceneNode,
  layer: UniversalLayer,
  parent?: UniversalLayer
): void {
  if (!parent || !("resize" in node) || node.type === "TEXT") return;
  const pos = layer.layout?.position;
  if (pos === "absolute" || pos === "fixed") return;
  const maxW = Math.max(1, snap(parent.box.width - layer.box.x));
  if (node.width <= maxW + 0.5) return;
  node.resize(maxW, node.height);
  if (node.type === "FRAME") {
    const text = (node as FrameNode).children.find((c) => c.type === "TEXT") as
      | TextNode
      | undefined;
    if (text && text.width > maxW + 0.5) {
      // Pill tabs / lab buttons — never narrow text to parent width (wraps "Overview").
      if (layer.source.tag === "button" && isLabDomCenterButton(layer, parent)) return;
      if (text.textAutoResize === "HEIGHT") {
        text.resize(maxW, text.height);
      } else if (text.textAutoResize === "NONE") {
        text.resize(maxW, text.height);
      }
    }
  }
}

// ─────────────────────────── color parsing ───────────────────────────

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(raw: string): RGBA {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "transparent" || trimmed === "none")
    return { r: 0, g: 0, b: 0, a: 0 };
```

### `snap` — `packages/figma-importer-plugin/src/code-v2.ts` (lines 43–83 of 3016)

```ts

function snap(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Match Playwright element screenshot bounds (integer getBoundingClientRect). */
/** Match Playwright element screenshot bounds (integer getBoundingClientRect). */
function snapBoxSize(layer: UniversalLayer, axis: "width" | "height"): number {
  const v = axis === "width" ? layer.box.width : layer.box.height;
  if ((layer.source.classList ?? []).includes("lab-button")) {
    return Math.max(1, Math.round(v));
  }
  return Math.max(1, snap(v));
}

/** Extractor can report child widths wider than the parent box (grid overflow). Clamp for Figma. */
function clampNodeWidthToParent(
  node: SceneNode,
  layer: UniversalLayer,
  parent?: UniversalLayer
): void {
  if (!parent || !("resize" in node) || node.type === "TEXT") return;
  const pos = layer.layout?.position;
  if (pos === "absolute" || pos === "fixed") return;
  const maxW = Math.max(1, snap(parent.box.width - layer.box.x));
  if (node.width <= maxW + 0.5) return;
  node.resize(maxW, node.height);
  if (node.type === "FRAME") {
    const text = (node as FrameNode).children.find((c) => c.type === "TEXT") as
      | TextNode
      | undefined;
    if (text && text.width > maxW + 0.5) {
      // Pill tabs / lab buttons — never narrow text to parent width (wraps "Overview").
      if (layer.source.tag === "button" && isLabDomCenterButton(layer, parent)) return;
      if (text.textAutoResize === "HEIGHT") {
        text.resize(maxW, text.height);
      } else if (text.textAutoResize === "NONE") {
        text.resize(maxW, text.height);
      }
    }
  }
```

### `snapBoxSize` — `packages/figma-importer-plugin/src/code-v2.ts` (lines 49–89 of 3016)

```ts
/** Match Playwright element screenshot bounds (integer getBoundingClientRect). */
function snapBoxSize(layer: UniversalLayer, axis: "width" | "height"): number {
  const v = axis === "width" ? layer.box.width : layer.box.height;
  if ((layer.source.classList ?? []).includes("lab-button")) {
    return Math.max(1, Math.round(v));
  }
  return Math.max(1, snap(v));
}

/** Extractor can report child widths wider than the parent box (grid overflow). Clamp for Figma. */
function clampNodeWidthToParent(
  node: SceneNode,
  layer: UniversalLayer,
  parent?: UniversalLayer
): void {
  if (!parent || !("resize" in node) || node.type === "TEXT") return;
  const pos = layer.layout?.position;
  if (pos === "absolute" || pos === "fixed") return;
  const maxW = Math.max(1, snap(parent.box.width - layer.box.x));
  if (node.width <= maxW + 0.5) return;
  node.resize(maxW, node.height);
  if (node.type === "FRAME") {
    const text = (node as FrameNode).children.find((c) => c.type === "TEXT") as
      | TextNode
      | undefined;
    if (text && text.width > maxW + 0.5) {
      // Pill tabs / lab buttons — never narrow text to parent width (wraps "Overview").
      if (layer.source.tag === "button" && isLabDomCenterButton(layer, parent)) return;
      if (text.textAutoResize === "HEIGHT") {
        text.resize(maxW, text.height);
      } else if (text.textAutoResize === "NONE") {
        text.resize(maxW, text.height);
      }
    }
  }
}

// ─────────────────────────── color parsing ───────────────────────────

interface RGBA {
  r: number;
```

### `snap` — `packages/pixel-test/src/render-html.ts` (lines 21–61 of 2007)

```ts

function snap(v: number): number {
  return Math.round(v * 100) / 100;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(raw: string): string {
  return raw.replace(/"/g, "&quot;").replace(/&/g, "&amp;");
}

function px(v: number): string {
  return `${snap(v)}px`;
}

/** Safe inside style="…" (double-quoted HTML attributes). */
function cssFontFamily(stackOrFamily: string): string {
  return stackOrFamily.replace(/"([^"]+)"/g, "'$1'");
}

function hasSchemaBorder(b: LayerBorders | undefined): boolean {
  if (!b) return false;
  return [b.top, b.right, b.bottom, b.left].some((s) => (s?.width ?? 0) > 0);
}

function isFormControlWithInlineText(layer: UniversalLayer): boolean {
  const tag = layer.source.tag;
  return Boolean(layer.text && (tag === "button" || tag === "input" || tag === "textarea"));
}

function fillToCss(layer: FillLayer): string | null {
  if (layer.kind === "color") return layer.color;
  if (layer.kind === "linear-gradient") {
    const stops = layer.stops
      .slice()
```

## Agent instructions

1. Read this report, then open compare PNGs + artifact JSON per story above.
2. Find **shared root cause** across families — implement **one batch of edits** for all stories.
3. The snippets above are pre-extracted — edit those areas directly, do NOT Read `code-v2.ts` in full.
4. Do **not** run golden tests yourself; the harness re-tests every listed story after your session.
