/**
 * Figma → UniversalLayer v1.0 extractor.
 *
 * Mirrors what extractor-playwright does for the DOM: walks a Figma node tree
 * and produces a self-contained UniversalDocumentV2 artifact.
 *
 * Design rules:
 *  1. No component-specific code — zero class/name sniffing.
 *  2. All values are resolved at extraction (no CSS vars, no tokens).
 *  3. Image fills are embedded as base64 dataUrls (self-contained artifact).
 *  4. Invisible nodes are skipped.
 *  5. Stroke position is baked into box geometry + border width so the contract
 *     always uses the CSS-model (border inside the stated box dimensions).
 *  6. Auto-layout frames emit layout.flex; non-auto-layout frames emit absolute
 *     children (display: "block", position: "absolute").
 *  7. Rotation is expressed as a 2D affine matrix in transform.matrix.
 */

import type {
  UniversalDocumentV2,
  UniversalLayer,
  LayerRect,
  LayerPaint,
  LayerBorders,
  BorderSide,
  FillLayer,
  GradientStop,
  ShadowLayer,
  FilterEntry,
  LayerText,
  FontSpec,
  LayerVector,
  VectorShape,
  VectorPaint,
  LayerLayout,
  FlexLayout,
  LayerTransform,
  LayerInset,
} from "./types-v2";

// ─────────────────────────── helpers ────────────────────────────

let _counter = 0;
function nextId(): string {
  return `fig-${++_counter}`;
}

function snap(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Safe number coercion for Figma properties that may be `figma.mixed` (a Symbol).
 * Returns `fallback` (default 0) whenever the value is not a plain number.
 */
function toNum(v: unknown, fallback = 0): number {
  return typeof v === "number" ? v : fallback;
}

/** Figma color {r,g,b,a} (0-1) → CSS hex string */
function figmaColorToHex(c: RGB | RGBA): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  const a = "a" in c ? c.a : 1;
  if (Math.abs(a - 1) < 0.004) {
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  const alpha = Math.round(a * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}${alpha.toString(16).padStart(2, "0")}`;
}

function resolveOpacity(fill: Paint, nodeOpacity: number): number {
  const fillOpacity = (fill as { opacity?: number }).opacity ?? 1;
  return snap(fillOpacity * nodeOpacity);
}

// ─────────────────────────── gradient helpers ────────────────────────────

/**
 * Figma gradientTransform is a 2×3 affine matrix [[a,b,c],[d,e,f]] that maps
 * from gradient space [0..1] to object space [0..1].
 *
 * Start handle: gradient space (0,0) → object space (c, f)
 * End handle:   gradient space (1,0) → object space (a+c, d+f)
 *
 * To get the CSS angle (0° = to top, clockwise):
 *   direction in object [0..1] space = (a, d)
 *   scale to pixels: dx = a * nodeW, dy = d * nodeH
 *   angleDeg = atan2(dx, -dy) * 180/PI
 *
 * We fall back to atan2(a, d) when nodeW/H unavailable (not called for radial center).
 */
function gradientLinearAngle(transform: Transform, nodeW = 1, nodeH = 1): number {
  const [[a, , ], [d]] = transform;
  const dx = a * nodeW;
  const dy = d * nodeH;
  const angleDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return snap((angleDeg + 360) % 360);
}

function gradientCenter(transform: Transform): { cx: string; cy: string } {
  // Center handle is at gradient space (0.5, 0.5)
  // object space = [[a,b],[d,e]] * [0.5, 0.5] + [c, f]
  const [[a, b, c], [d, e, f]] = transform;
  const cx = snap(a * 0.5 + b * 0.5 + c) * 100;
  const cy = snap(d * 0.5 + e * 0.5 + f) * 100;
  return { cx: `${cx}%`, cy: `${cy}%` };
}

// ─────────────────────────── fill parsing ────────────────────────────

async function parseFill(
  fill: Paint,
  nodeOpacity: number,
  nodeW = 1,
  nodeH = 1,
): Promise<FillLayer | null> {
  if (!fill.visible) return null;
  const opacity = resolveOpacity(fill, nodeOpacity);

  if (fill.type === "SOLID") {
    const rgba: RGBA = { ...fill.color, a: opacity };
    return { kind: "color", color: figmaColorToHex(rgba) };
  }

  if (fill.type === "GRADIENT_LINEAR") {
    const stops: GradientStop[] = fill.gradientStops.map((s) => ({
      color: figmaColorToHex({ ...s.color, a: s.color.a * opacity }),
      offset: snap(s.position),
    }));
    const angleDeg = gradientLinearAngle(fill.gradientTransform, nodeW, nodeH);
    return { kind: "linear-gradient", angleDeg, stops };
  }

  if (fill.type === "GRADIENT_RADIAL") {
    const stops: GradientStop[] = fill.gradientStops.map((s) => ({
      color: figmaColorToHex({ ...s.color, a: s.color.a * opacity }),
      offset: snap(s.position),
    }));
    const { cx, cy } = gradientCenter(fill.gradientTransform);
    return {
      kind: "radial-gradient",
      shape: "ellipse",
      centerX: cx,
      centerY: cy,
      stops,
    };
  }

  if (fill.type === "GRADIENT_ANGULAR") {
    const stops: GradientStop[] = fill.gradientStops.map((s) => ({
      color: figmaColorToHex({ ...s.color, a: s.color.a * opacity }),
      offset: snap(s.position),
    }));
    const { cx, cy } = gradientCenter(fill.gradientTransform);
    // CSS conic-gradient "from" angle — same direction as linear
    const fromDeg = gradientLinearAngle(fill.gradientTransform, nodeW, nodeH);
    return {
      kind: "conic-gradient",
      fromDeg,
      centerX: cx,
      centerY: cy,
      stops,
    };
  }

  if (fill.type === "IMAGE" && fill.imageHash) {
    try {
      const image = figma.getImageByHash(fill.imageHash);
      if (!image) return null;
      const bytes = await image.getBytesAsync();
      const base64 = bytesToBase64(bytes);
      const dataUrl = `data:image/png;base64,${base64}`;
      const scaleMode = fill.scaleMode;

      if (scaleMode === "TILE") {
        return { kind: "image", url: "", dataUrl, size: "auto", positionX: "0%", positionY: "0%", repeat: "repeat" };
      }
      if (scaleMode === "FIT") {
        return { kind: "image", url: "", dataUrl, size: "contain", positionX: "50%", positionY: "50%", repeat: "no-repeat" };
      }
      if (scaleMode === "CROP" && fill.imageTransform) {
        // CROP: image is positioned/scaled by imageTransform (2×3 matrix, same format as gradientTransform).
        // Transform maps image [0..1] coords to node [0..1] coords. Invert to get CSS background-position/size.
        const [[a, b, tx], [c, d, ty]] = fill.imageTransform;
        // Scale of the image in node-relative units (determinant gives area scale; each axis separately):
        const scaleX = Math.sqrt(a * a + c * c);
        const scaleY = Math.sqrt(b * b + d * d);
        // Image covers (scaleX * nodeW) × (scaleY * nodeH) pixels.
        // CSS background-size in % relative to the box:
        const bgW = scaleX > 0 ? snap(100 / scaleX) : 100;
        const bgH = scaleY > 0 ? snap(100 / scaleY) : 100;
        // Origin offset: tx,ty in node [0..1] coords → CSS % relative to image size.
        const posX = snap(-tx * 100 * (bgW / 100));
        const posY = snap(-ty * 100 * (bgH / 100));
        return {
          kind: "image",
          url: "",
          dataUrl,
          size: { width: `${bgW}%`, height: `${bgH}%` },
          positionX: `${posX}%`,
          positionY: `${posY}%`,
          repeat: "no-repeat",
        };
      }
      // FILL (default): cover
      return { kind: "image", url: "", dataUrl, size: "cover", positionX: "50%", positionY: "50%", repeat: "no-repeat" };
    } catch {
      warnings.push(`Failed to fetch image hash ${fill.imageHash}`);
    }
  }

  return null;
}

// ─────────────────────────── effects ────────────────────────────

function parseEffects(effects: readonly Effect[]): {
  shadows: ShadowLayer[];
  filters: FilterEntry[];
  backdropFilters: FilterEntry[];
} {
  const shadows: ShadowLayer[] = [];
  const filters: FilterEntry[] = [];
  const backdropFilters: FilterEntry[] = [];

  for (const effect of effects) {
    if (!effect.visible) continue;

    if (effect.type === "DROP_SHADOW") {
      shadows.push({
        offsetX: snap(effect.offset.x),
        offsetY: snap(effect.offset.y),
        blur: snap(effect.radius),
        spread: snap(toNum(effect.spread)),
        color: figmaColorToHex(effect.color),
        inset: false,
      });
    } else if (effect.type === "INNER_SHADOW") {
      shadows.push({
        offsetX: snap(effect.offset.x),
        offsetY: snap(effect.offset.y),
        blur: snap(effect.radius),
        spread: snap(toNum(effect.spread)),
        color: figmaColorToHex(effect.color),
        inset: true,
      });
    } else if (effect.type === "LAYER_BLUR") {
      filters.push({ kind: "blur", valuePx: snap(effect.radius) });
    } else if (effect.type === "BACKGROUND_BLUR") {
      backdropFilters.push({ kind: "blur", valuePx: snap(effect.radius) });
    }
  }

  return { shadows, filters, backdropFilters };
}

// ─────────────────────────── strokes → borders ────────────────────────────

/**
 * Converts Figma strokes to contract LayerBorders.
 * Returns adjusted box delta too — OUTSIDE strokes expand the visual box.
 */
function parseStrokes(
  strokes: readonly Paint[],
  strokeWeight: number,
  strokeAlign: "INSIDE" | "OUTSIDE" | "CENTER",
  dashPattern: readonly number[]
): { borders: LayerBorders | undefined; boxExpand: number } {
  if (!strokes.length || strokeWeight <= 0) return { borders: undefined, boxExpand: 0 };

  const visible = strokes.filter((s) => s.visible !== false);
  if (!visible.length) return { borders: undefined, boxExpand: 0 };

  const stroke = visible[0];
  const color = stroke.type === "SOLID" ? figmaColorToHex(stroke.color) : "#000000";
  const style: BorderSide["style"] =
    dashPattern && dashPattern.length > 0 ? "dashed" : "solid";

  let borderWidth = strokeWeight;
  let boxExpand = 0;

  if (strokeAlign === "OUTSIDE") {
    boxExpand = strokeWeight;
    borderWidth = strokeWeight;
  } else if (strokeAlign === "CENTER") {
    boxExpand = strokeWeight / 2;
    borderWidth = strokeWeight;
  }
  // INSIDE: no expansion, border eats into fill area — CSS default model

  const side: BorderSide = { width: snap(borderWidth), color, style };
  const borders: LayerBorders = { top: side, right: side, bottom: side, left: side };
  return { borders, boxExpand: snap(boxExpand) };
}

// ─────────────────────────── text ────────────────────────────

function figmaAlignToCSS(
  align: "LEFT" | "RIGHT" | "CENTER" | "JUSTIFIED"
): LayerText["align"] {
  const map: Record<string, LayerText["align"]> = {
    LEFT: "left",
    RIGHT: "right",
    CENTER: "center",
    JUSTIFIED: "justify",
  };
  return map[align] ?? "left";
}

function figmaWeightFromStyle(style: string): number {
  const s = style.toLowerCase();
  if (s.includes("thin")) return 100;
  if (s.includes("extralight") || s.includes("extra light")) return 200;
  if (s.includes("light")) return 300;
  if (s.includes("medium")) return 500;
  if (s.includes("semibold") || s.includes("semi bold")) return 600;
  if (s.includes("extrabold") || s.includes("extra bold")) return 800;
  if (s.includes("black") || s.includes("heavy")) return 900;
  if (s.includes("bold")) return 700;
  return 400;
}

function figmaFontStyle(style: string): "normal" | "italic" | "oblique" {
  const s = style.toLowerCase();
  if (s.includes("italic")) return "italic";
  if (s.includes("oblique")) return "oblique";
  return "normal";
}

async function parseText(node: TextNode): Promise<LayerText> {
  // fontName / fontSize may be figma.mixed when characters have different styles
  const fontName: FontName =
    typeof node.fontName === "symbol"
      ? (node.getRangeFontName(0, 1) as FontName) ?? { family: "Inter", style: "Regular" }
      : (node.fontName as FontName);
  const fontSize =
    typeof node.fontSize === "number"
      ? node.fontSize
      : (node.getRangeFontSize(0, 1) as number) ?? 14;

  const font: FontSpec = {
    family: fontName.family,
    size: snap(fontSize),
    weight: figmaWeightFromStyle(fontName.style),
    style: figmaFontStyle(fontName.style),
  };

  const fillsVal = node.fills;
  const primaryFill =
    Array.isArray(fillsVal) && fillsVal.length > 0 && fillsVal[0].type === "SOLID"
      ? figmaColorToHex(fillsVal[0].color)
      : "#000000";

  const letterSpacingVal = node.letterSpacing as LetterSpacing;
  const lineHeightVal = node.lineHeight as LineHeight;

  const letterSpacing =
    letterSpacingVal && (letterSpacingVal.unit === "PIXELS" || letterSpacingVal.unit === "PERCENT")
      ? snap(letterSpacingVal.value)
      : undefined;

  const lineHeight =
    lineHeightVal && (lineHeightVal as LineHeight).unit === "PIXELS"
      ? snap((lineHeightVal as { unit: "PIXELS"; value: number }).value)
      : undefined;

  const textCaseMap: Record<string, LayerText["transform"]> = {
    UPPER: "uppercase",
    LOWER: "lowercase",
    TITLE: "capitalize",
    ORIGINAL: "none",
  };
  const transform = textCaseMap[String(node.textCase)] ?? undefined;

  const textDecorationMap: Record<string, string> = {
    UNDERLINE: "underline",
    STRIKETHROUGH: "line-through",
    NONE: "",
  };
  const decorationStr = textDecorationMap[String(node.textDecoration)] ?? "";

  const layerText: LayerText = {
    value: node.characters,
    font,
    color: primaryFill,
    align: figmaAlignToCSS(node.textAlignHorizontal as "LEFT" | "RIGHT" | "CENTER" | "JUSTIFIED"),
    ...(letterSpacing !== undefined && { letterSpacing }),
    ...(lineHeight !== undefined && { lineHeight }),
    ...(transform && transform !== "none" && { transform }),
    ...(decorationStr && {
      decoration: {
        lines: [decorationStr as "underline" | "line-through"],
        color: primaryFill,
        style: "solid",
      },
    }),
  };

  // Mixed-style runs via getStyledTextSegments
  try {
    const segments = node.getStyledTextSegments([
      "fills",
      "fontSize",
      "fontName",
      "letterSpacing",
      "lineHeight",
      "textDecoration",
      "textCase",
    ]);

    if (segments.length > 1) {
      layerText.runs = segments.map((seg) => {
        const segFill =
          seg.fills.length > 0 && seg.fills[0].type === "SOLID"
            ? figmaColorToHex(seg.fills[0].color)
            : undefined;
        const segFontName = seg.fontName as FontName;
        const segFontSize = seg.fontSize as number;
        const runFont: Partial<FontSpec> = {
          family: segFontName.family,
          size: snap(segFontSize),
          weight: figmaWeightFromStyle(segFontName.style),
          style: figmaFontStyle(segFontName.style),
        };
        return {
          start: seg.start,
          end: seg.end,
          font: runFont,
          ...(segFill && { color: segFill }),
        };
      });
    }
  } catch {
    // getStyledTextSegments may fail on mixed-style text in some Figma versions
  }

  return layerText;
}

// ─────────────────────────── vector ────────────────────────────

function parseVectorPaint(fills: readonly Paint[], strokes: readonly Paint[], strokeWeight: number): VectorPaint {
  const fillPaint = fills.find((f) => f.visible !== false && f.type === "SOLID") as SolidPaint | undefined;
  const strokePaint = strokes.find((s) => s.visible !== false && s.type === "SOLID") as SolidPaint | undefined;
  return {
    fill: fillPaint ? figmaColorToHex(fillPaint.color) : "none",
    stroke: strokePaint ? figmaColorToHex(strokePaint.color) : "none",
    strokeWidth: strokeWeight > 0 ? snap(strokeWeight) : undefined,
  };
}

function extractVectorPaths(node: VectorNode | StarNode | PolygonNode | LineNode | BooleanOperationNode): LayerVector {
  const paths = (node as VectorNode).vectorPaths ?? [];
  const paint = parseVectorPaint(
    (node as GeometryMixin).fills as Paint[],
    (node as GeometryMixin).strokes as Paint[],
    toNum((node as GeometryMixin).strokeWeight)
  );

  const shapes: VectorShape[] = paths.map((p) => ({
    primitive: "path" as const,
    attrs: {
      d: p.data,
      fillRule: p.windingRule === "EVENODD" ? "evenodd" : "nonzero",
    },
    paint,
  }));

  return {
    viewBox: { x: 0, y: 0, width: snap(node.width), height: snap(node.height) },
    shapes,
  };
}

// ─────────────────────────── rotation → matrix ────────────────────────────

function rotationToMatrix(
  degrees: number
): [number, number, number, number, number, number] | undefined {
  if (Math.abs(degrees) < 0.01) return undefined;
  const rad = (degrees * Math.PI) / 180;
  const cos = snap(Math.cos(rad));
  const sin = snap(Math.sin(rad));
  return [cos, sin, -sin, cos, 0, 0];
}

// ─────────────────────────── layout ────────────────────────────

function parseLayout(node: FrameNode | ComponentNode | InstanceNode | ComponentSetNode): LayerLayout {
  const hasAutoLayout = node.layoutMode !== "NONE";

  if (hasAutoLayout) {
    const isRow = node.layoutMode === "HORIZONTAL";

    const justifyMap: Record<string, FlexLayout["justify"]> = {
      MIN: "start",
      MAX: "end",
      CENTER: "center",
      SPACE_BETWEEN: "space-between",
      BASELINE: "start",
    };
    const alignMap: Record<string, FlexLayout["align"]> = {
      MIN: "start",
      MAX: "end",
      CENTER: "center",
      BASELINE: "baseline",
      STRETCH: "stretch",
    };

    // layoutWrap for WRAP auto-layout (Figma 2023+)
    const wrapMode = (node as FrameNode & { layoutWrap?: string }).layoutWrap;
    const wrap: FlexLayout["wrap"] = wrapMode === "WRAP" ? "wrap" : "nowrap";

    const flex: FlexLayout = {
      direction: isRow ? "row" : "column",
      wrap,
      justify: justifyMap[node.primaryAxisAlignItems] ?? "start",
      align: alignMap[node.counterAxisAlignItems] ?? "start",
      rowGap: snap(isRow ? toNum(node.itemSpacing) : 0),
      columnGap: snap(!isRow ? toNum(node.itemSpacing) : 0),
    };

    const padding: LayerInset = {
      top: snap(toNum(node.paddingTop)),
      right: snap(toNum(node.paddingRight)),
      bottom: snap(toNum(node.paddingBottom)),
      left: snap(toNum(node.paddingLeft)),
    };

    const overflowX = node.clipsContent ? "hidden" : "visible";
    const overflowY = node.clipsContent ? "hidden" : "visible";

    return {
      display: "flex",
      position: "relative",
      overflow: { x: overflowX, y: overflowY },
      flex,
      padding,
    };
  }

  // Non-auto-layout: absolute children
  return {
    display: "block",
    position: "relative",
    overflow: {
      x: (node as FrameNode).clipsContent ? "hidden" : "visible",
      y: (node as FrameNode).clipsContent ? "hidden" : "visible",
    },
  };
}

/**
 * For nodes inside a flex parent, resolve Figma layoutGrow / layoutAlign /
 * layoutSizingHorizontal/Vertical into CSS flexGrow, alignSelf, flexBasis.
 */
function parseFlexChildProps(node: SceneNode): Partial<LayerLayout> {
  const n = node as FrameNode; // most node types share these props

  const props: Partial<LayerLayout> = {};

  // layoutGrow: 0 (fixed) | 1 (fill parent)
  const grow = toNum((n as unknown as { layoutGrow?: number }).layoutGrow, 0);
  if (grow > 0) props.flexGrow = grow;

  // layoutAlign: "STRETCH" | "INHERIT" | "MIN" | "CENTER" | "MAX" | "BASELINE"
  const alignSelfMap: Record<string, string> = {
    STRETCH: "stretch",
    MIN: "flex-start",
    CENTER: "center",
    MAX: "flex-end",
    BASELINE: "baseline",
  };
  const la = String((n as unknown as { layoutAlign?: string }).layoutAlign ?? "INHERIT");
  if (la !== "INHERIT" && alignSelfMap[la]) props.alignSelf = alignSelfMap[la];

  // layoutSizingHorizontal / layoutSizingVertical: "FIXED" | "FILL" | "HUG"
  const sizH = String((n as unknown as { layoutSizingHorizontal?: string }).layoutSizingHorizontal ?? "FIXED");
  const sizV = String((n as unknown as { layoutSizingVertical?: string }).layoutSizingVertical ?? "FIXED");
  if (sizH === "FILL" || sizV === "FILL") {
    // Signal that this child fills its parent axis
    if (sizH === "FILL" && sizV !== "FILL") props.flexBasis = "100%";
    else if (sizV === "FILL") props.flexBasis = "auto";
  }

  return props;
}

// ─────────────────────────── module-level warning accumulator ────────────────────────────

let warnings: string[] = [];

// ─────────────────────────── main walk ────────────────────────────

async function extractLayer(
  node: SceneNode,
  parentLayout?: "flex" | "absolute"
): Promise<UniversalLayer | null> {
  // Skip invisible nodes
  if (!node.visible) return null;

  const id = nextId();

  // Position relative to parent
  const rawBox: LayerRect = {
    x: snap(node.x),
    y: snap(node.y),
    width: snap(node.width),
    height: snap(node.height),
  };

  // Rotation matrix
  const rotation = "rotation" in node ? toNum((node as FrameNode).rotation) : 0;
  const matrix = rotationToMatrix(rotation ?? 0);
  const transform: LayerTransform | undefined = matrix ? { matrix } : undefined;

  // Source
  const source = {
    kind: "figma" as const,
    id: node.id,
    dataset: {
      figmaNodeType: node.type,
      ...(node.type === "INSTANCE" && (node as InstanceNode).mainComponent
        ? { figmaComponentKey: (node as InstanceNode).mainComponent!.key }
        : {}),
    },
  };

  // ── Containers (FRAME, COMPONENT, INSTANCE, COMPONENT_SET, GROUP, SECTION) ──
  if (
    node.type === "FRAME" ||
    node.type === "COMPONENT" ||
    node.type === "INSTANCE" ||
    node.type === "COMPONENT_SET" ||
    node.type === "GROUP" ||
    node.type === "SECTION"
  ) {
    const hasChildren = "children" in node;
    const children: UniversalLayer[] = [];

    const isGroup = node.type === "GROUP";
    const layout: LayerLayout | undefined = isGroup
      ? undefined
      : parseLayout(node as FrameNode);

    const childParentLayout =
      layout?.display === "flex" ? "flex" : "absolute";

    if (hasChildren) {
      for (const child of (node as ChildrenMixin).children) {
        const extracted = await extractLayer(child, childParentLayout);
        if (extracted) children.push(extracted);
      }
    }

    // Paint (fills, strokes, effects)
    // Groups have no fills but do carry opacity, blendMode, and effects.
    let paint: LayerPaint | undefined;
    let box = rawBox;

    if (isGroup) {
      const groupOpacity = toNum((node as GroupNode).opacity, 1);
      const { shadows, filters, backdropFilters } = parseEffects((node as BlendMixin).effects ?? []);
      const gBlend = (node as GroupNode).blendMode;
      if (groupOpacity < 0.999 || shadows.length || filters.length || backdropFilters.length || (gBlend && gBlend !== "NORMAL" && gBlend !== "PASS_THROUGH")) {
        paint = {
          ...(groupOpacity < 0.999 && { opacity: snap(groupOpacity) }),
          ...(shadows.length > 0 && { shadows }),
          ...(filters.length > 0 && { filters }),
          ...(backdropFilters.length > 0 && { backdropFilters }),
          ...(gBlend && gBlend !== "NORMAL" && gBlend !== "PASS_THROUGH" && { blendMode: gBlend.toLowerCase().replace(/_/g, "-") }),
        };
      }
    }

    if (!isGroup && "fills" in node) {
      const fills: FillLayer[] = [];
      const nodeOpacity = toNum((node as FrameNode).opacity, 1);
      const rawFills = (node as GeometryMixin).fills;
      if (Array.isArray(rawFills)) {
        for (const f of rawFills as Paint[]) {
          const parsed = await parseFill(f, nodeOpacity, rawBox.width, rawBox.height);
          if (parsed) fills.push(parsed);
        }
      }

      const { borders, boxExpand } = parseStrokes(
        (node as GeometryMixin).strokes as Paint[],
        toNum((node as GeometryMixin).strokeWeight),
        (node as GeometryMixin).strokeAlign as "INSIDE" | "OUTSIDE" | "CENTER",
        (node as GeometryMixin).dashPattern ?? []
      );

      if (boxExpand > 0) {
        box = {
          x: snap(rawBox.x - boxExpand),
          y: snap(rawBox.y - boxExpand),
          width: snap(rawBox.width + boxExpand * 2),
          height: snap(rawBox.height + boxExpand * 2),
        };
      }

      const { shadows, filters, backdropFilters } = parseEffects(
        (node as BlendMixin).effects ?? []
      );

      const fr = node as FrameNode;
      const cornerRadii =
        typeof fr.cornerRadius === "number" && fr.cornerRadius > 0
          ? {
              topLeft: { x: fr.cornerRadius, y: fr.cornerRadius },
              topRight: { x: fr.cornerRadius, y: fr.cornerRadius },
              bottomRight: { x: fr.cornerRadius, y: fr.cornerRadius },
              bottomLeft: { x: fr.cornerRadius, y: fr.cornerRadius },
            }
          : typeof fr.topLeftRadius === "number" &&
            (fr.topLeftRadius > 0 ||
              fr.topRightRadius > 0 ||
              fr.bottomRightRadius > 0 ||
              fr.bottomLeftRadius > 0)
          ? {
              topLeft: { x: toNum(fr.topLeftRadius), y: toNum(fr.topLeftRadius) },
              topRight: { x: toNum(fr.topRightRadius), y: toNum(fr.topRightRadius) },
              bottomRight: { x: toNum(fr.bottomRightRadius), y: toNum(fr.bottomRightRadius) },
              bottomLeft: { x: toNum(fr.bottomLeftRadius), y: toNum(fr.bottomLeftRadius) },
            }
          : undefined;

      paint = {
        ...(fills.length > 0 && { fills }),
        ...(borders && { borders }),
        ...(cornerRadii && { cornerRadii }),
        ...(shadows.length > 0 && { shadows }),
        ...(filters.length > 0 && { filters }),
        ...(backdropFilters.length > 0 && { backdropFilters }),
        opacity: snap(nodeOpacity),
        ...(fr.blendMode && fr.blendMode !== "NORMAL" && { blendMode: fr.blendMode.toLowerCase().replace(/_/g, "-") }),
      };
    }

    // Merge flex-child sizing props (grow, alignSelf, flexBasis) when inside a flex parent
    const flexChildProps = parentLayout === "flex" ? parseFlexChildProps(node) : {};
    const layoutWithPosition: LayerLayout | undefined = layout
      ? { ...layout, ...flexChildProps }
      : Object.keys(flexChildProps).length > 0
      ? { display: "block", position: "relative", overflow: { x: "visible", y: "visible" }, ...flexChildProps }
      : undefined;

    return {
      id,
      name: node.name,
      source,
      box,
      ...(transform && { transform }),
      ...(paint && { paint }),
      ...(layoutWithPosition && { layout: layoutWithPosition }),
      ...(children.length > 0 && { children }),
    };
  }

  // ── Text ──
  if (node.type === "TEXT") {
    const text = await parseText(node);
    const nodeOpacity = toNum((node as BlendMixin).opacity, 1);
    const { shadows } = parseEffects((node as BlendMixin).effects ?? []);

    const paint: LayerPaint | undefined =
      nodeOpacity < 1 || shadows.length > 0
        ? {
            ...(nodeOpacity < 1 && { opacity: snap(nodeOpacity) }),
            ...(shadows.length > 0 && { shadows }),
          }
        : undefined;

    // Absolute position inside parent unless parent is flex
    const flexChildProps = parentLayout === "flex" ? parseFlexChildProps(node) : {};
    const layout: LayerLayout | undefined =
      parentLayout !== "flex"
        ? { display: "block", position: "absolute", overflow: { x: "visible", y: "visible" } }
        : Object.keys(flexChildProps).length > 0
        ? { display: "block", position: "relative", overflow: { x: "visible", y: "visible" }, ...flexChildProps }
        : undefined;

    return {
      id,
      name: node.name,
      source,
      box: rawBox,
      ...(transform && { transform }),
      ...(paint && { paint }),
      text,
      ...(layout && { layout }),
    };
  }

  // ── Vector / Shape primitives ──
  if (
    node.type === "VECTOR" ||
    node.type === "STAR" ||
    node.type === "POLYGON" ||
    node.type === "LINE" ||
    node.type === "BOOLEAN_OPERATION"
  ) {
    const vector = extractVectorPaths(node as VectorNode);
    const nodeOpacity = toNum((node as BlendMixin).opacity, 1);
    const { shadows, filters } = parseEffects((node as BlendMixin).effects ?? []);

    const paint: LayerPaint | undefined =
      nodeOpacity < 1 || shadows.length > 0 || filters.length > 0
        ? {
            ...(nodeOpacity < 1 && { opacity: snap(nodeOpacity) }),
            ...(shadows.length > 0 && { shadows }),
            ...(filters.length > 0 && { filters }),
          }
        : undefined;

    const vectorFlexChildProps = parentLayout === "flex" ? parseFlexChildProps(node) : {};
    const layout: LayerLayout | undefined =
      parentLayout !== "flex"
        ? { display: "block", position: "absolute", overflow: { x: "visible", y: "visible" } }
        : Object.keys(vectorFlexChildProps).length > 0
        ? { display: "block", position: "relative", overflow: { x: "visible", y: "visible" }, ...vectorFlexChildProps }
        : undefined;

    return {
      id,
      name: node.name,
      source,
      box: rawBox,
      ...(transform && { transform }),
      ...(paint && { paint }),
      vector,
      ...(layout && { layout }),
    };
  }

  // ── Rectangle / Ellipse (leaf shapes with fills) ──
  if (node.type === "RECTANGLE" || node.type === "ELLIPSE") {
    const nodeOpacity = toNum((node as BlendMixin).opacity, 1);
    const fills: FillLayer[] = [];
    const rawFills = (node as GeometryMixin).fills;
    if (Array.isArray(rawFills)) {
      for (const f of rawFills as Paint[]) {
        const parsed = await parseFill(f, nodeOpacity, rawBox.width, rawBox.height);
        if (parsed) fills.push(parsed);
      }
    }

    const { borders, boxExpand } = parseStrokes(
      (node as GeometryMixin).strokes as Paint[],
      toNum((node as GeometryMixin).strokeWeight),
      (node as GeometryMixin).strokeAlign as "INSIDE" | "OUTSIDE" | "CENTER",
      (node as GeometryMixin).dashPattern ?? []
    );

    let box = rawBox;
    if (boxExpand > 0) {
      box = {
        x: snap(rawBox.x - boxExpand),
        y: snap(rawBox.y - boxExpand),
        width: snap(rawBox.width + boxExpand * 2),
        height: snap(rawBox.height + boxExpand * 2),
      };
    }

    const { shadows, filters, backdropFilters } = parseEffects(
      (node as BlendMixin).effects ?? []
    );

    // Ellipse gets full corner radii (50%) so render-html renders a circle/oval
    let cornerRadii = undefined;
    if (node.type === "ELLIPSE") {
      cornerRadii = {
        topLeft: { x: box.width / 2, y: box.height / 2 },
        topRight: { x: box.width / 2, y: box.height / 2 },
        bottomRight: { x: box.width / 2, y: box.height / 2 },
        bottomLeft: { x: box.width / 2, y: box.height / 2 },
      };
    } else {
      const rn = node as RectangleNode;
      const cr = rn.cornerRadius;
      cornerRadii =
        typeof cr === "number" && cr > 0
          ? {
              topLeft: { x: cr, y: cr },
              topRight: { x: cr, y: cr },
              bottomRight: { x: cr, y: cr },
              bottomLeft: { x: cr, y: cr },
            }
          : typeof rn.topLeftRadius === "number" &&
            (rn.topLeftRadius > 0 || rn.topRightRadius > 0 || rn.bottomRightRadius > 0 || rn.bottomLeftRadius > 0)
          ? {
              topLeft: { x: toNum(rn.topLeftRadius), y: toNum(rn.topLeftRadius) },
              topRight: { x: toNum(rn.topRightRadius), y: toNum(rn.topRightRadius) },
              bottomRight: { x: toNum(rn.bottomRightRadius), y: toNum(rn.bottomRightRadius) },
              bottomLeft: { x: toNum(rn.bottomLeftRadius), y: toNum(rn.bottomLeftRadius) },
            }
          : undefined;
    }

    const paint: LayerPaint = {
      ...(fills.length > 0 && { fills }),
      ...(borders && { borders }),
      ...(cornerRadii && { cornerRadii }),
      ...(shadows.length > 0 && { shadows }),
      ...(filters.length > 0 && { filters }),
      ...(backdropFilters.length > 0 && { backdropFilters }),
      opacity: snap(nodeOpacity),
    };

    const rectFlexChildProps = parentLayout === "flex" ? parseFlexChildProps(node) : {};
    const layout: LayerLayout | undefined =
      parentLayout !== "flex"
        ? { display: "block", position: "absolute", overflow: { x: "visible", y: "visible" } }
        : Object.keys(rectFlexChildProps).length > 0
        ? { display: "block", position: "relative", overflow: { x: "visible", y: "visible" }, ...rectFlexChildProps }
        : undefined;

    return {
      id,
      name: node.name,
      source,
      box,
      ...(transform && { transform }),
      paint,
      ...(layout && { layout }),
    };
  }

  // Unknown / unsupported node type (SLICE, Figjam types, EMBED, etc.)
  warnings.push(`Skipped unsupported node type: ${node.type} (id: ${node.id})`);
  return null;
}

// ─────────────────────────── public API ────────────────────────────

export async function extractFigmaNode(
  node: SceneNode
): Promise<UniversalDocumentV2> {
  // Reset state for this extraction
  _counter = 0;
  warnings = [];

  const root = await extractLayer(node, "absolute");
  if (!root) throw new Error(`extractFigmaNode: root node produced no output (type: ${node.type})`);

  // Root node coordinates are page-relative in the plugin API.
  // Zero them out — all children are relative to the root, which is the viewport origin.
  root.box = { x: 0, y: 0, width: snap(node.width), height: snap(node.height) };

  return {
    schemaVersion: "1.0",
    meta: {
      componentName: node.name,
      extractedAt: new Date().toISOString(),
      viewport: { x: 0, y: 0, width: snap(node.width), height: snap(node.height) },
      devicePixelRatio: 1,
    },
    root,
    diagnostics: {
      warnings: [...warnings],
      unmappedProperties: [],
    },
  };
}

// ─────────────────────────── utility ────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
