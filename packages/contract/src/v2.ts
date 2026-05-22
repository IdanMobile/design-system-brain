/**
 * UniversalLayer v1.0 — a pixel-perfect, lossless intermediate representation
 * for any DOM/SVG/canvas surface.
 *
 * Contract rules (read before consuming):
 * 1. `box.x / box.y / box.width / box.height` are the POST-TRANSFORM bounding
 *    rect in the parent layer's local coordinate space (matches the browser's
 *    `getBoundingClientRect()` minus the parent offset).
 * 2. `transform` carries the CSS `transform` matrix that the source already
 *    applied. A renderer may EITHER bake it into resolved values OR pass it
 *    through as a native transform — both are legal.
 * 3. `paint.fills` is painted back-to-front in array order (first listed paints
 *    LAST — matching CSS `background-image: a, b` painting order).
 * 4. All colors are resolved to absolute values at extraction. `currentColor`
 *    and CSS variables never appear.
 * 5. Children are PRE-SORTED by `(zIndex ascending, source-order)`. Renderers
 *    paint children in array order; they must not re-sort.
 * 6. Per-primitive SVG paint is captured by `getComputedStyle()` on each
 *    primitive at extraction. Renderers never re-resolve CSS.
 * 7. Image bytes are embedded as `dataUrl` so artifacts are self-contained.
 */

export type CSSNumber = number;
export type ColorString = string;

export interface LayerRect {
  x: CSSNumber;
  y: CSSNumber;
  width: CSSNumber;
  height: CSSNumber;
}

export interface LayerInset {
  top: CSSNumber;
  right: CSSNumber;
  bottom: CSSNumber;
  left: CSSNumber;
}

export interface LayerPoint {
  x: CSSNumber;
  y: CSSNumber;
}

export interface PerCornerRadius {
  x: CSSNumber;
  y: CSSNumber;
}

export interface LayerCorners {
  topLeft: PerCornerRadius;
  topRight: PerCornerRadius;
  bottomRight: PerCornerRadius;
  bottomLeft: PerCornerRadius;
}

export type BorderStyleKind =
  | "none"
  | "hidden"
  | "dotted"
  | "dashed"
  | "solid"
  | "double"
  | "groove"
  | "ridge"
  | "inset"
  | "outset";

export interface BorderSide {
  width: CSSNumber;
  color: ColorString;
  style: BorderStyleKind;
}

export interface BorderGap {
  side: "top" | "right" | "bottom" | "left";
  from: CSSNumber;
  to: CSSNumber;
}

export interface LayerBorders {
  top?: BorderSide;
  right?: BorderSide;
  bottom?: BorderSide;
  left?: BorderSide;
  gaps?: BorderGap[];
}

export interface GradientStop {
  color: ColorString;
  offset: number;
}

export type FillLayer =
  | { kind: "color"; color: ColorString }
  | { kind: "linear-gradient"; angleDeg: number; stops: GradientStop[] }
  | {
      kind: "radial-gradient";
      shape: "ellipse" | "circle";
      centerX: string;
      centerY: string;
      stops: GradientStop[];
    }
  | {
      kind: "conic-gradient";
      fromDeg: number;
      centerX: string;
      centerY: string;
      stops: GradientStop[];
    }
  | {
      kind: "image";
      url: string;
      dataUrl?: string;
      size: "cover" | "contain" | "auto" | { width: string; height: string };
      positionX: string;
      positionY: string;
      repeat: "no-repeat" | "repeat" | "repeat-x" | "repeat-y" | "space" | "round";
    };

export interface ShadowLayer {
  offsetX: CSSNumber;
  offsetY: CSSNumber;
  blur: CSSNumber;
  spread: CSSNumber;
  color: ColorString;
  inset: boolean;
}

export type FilterEntry =
  | { kind: "blur"; valuePx: number }
  | {
      kind:
        | "brightness"
        | "contrast"
        | "grayscale"
        | "invert"
        | "saturate"
        | "sepia"
        | "opacity";
      value: number;
    }
  | { kind: "hue-rotate"; degrees: number }
  | { kind: "drop-shadow"; shadow: ShadowLayer };

export interface LayerTransform {
  matrix?: [number, number, number, number, number, number];
  origin?: { x: string; y: string };
}

export interface TextDecoration {
  lines: Array<"underline" | "line-through" | "overline">;
  color: ColorString;
  style: "solid" | "wavy" | "dotted" | "dashed" | "double";
  thicknessPx?: number;
}

export interface FontSpec {
  /** First family in the stack, deduped of quotes. */
  family: string;
  /** Full CSS `font-family` value (multi-family stack, including fallbacks). */
  stack?: string;
  size: CSSNumber;
  weight: number;
  style: "normal" | "italic" | "oblique";
  variant?: string;
  featureSettings?: string;
}

export interface LayerText {
  value: string;
  font: FontSpec;
  color: ColorString;
  lineHeight?: CSSNumber;
  letterSpacing?: CSSNumber;
  wordSpacing?: CSSNumber;
  align: "left" | "right" | "center" | "justify" | "start" | "end";
  verticalAlign?: string;
  decoration?: TextDecoration;
  transform?: "none" | "uppercase" | "lowercase" | "capitalize";
  whiteSpace?: "normal" | "pre" | "pre-wrap" | "pre-line" | "nowrap" | "break-spaces";
  overflow?: "visible" | "clip" | "ellipsis";
  wordBreak?: "normal" | "break-all" | "keep-all" | "break-word";
  direction?: "ltr" | "rtl";
  shadows?: ShadowLayer[];
  runs?: Array<{
    start: number;
    end: number;
    font?: Partial<FontSpec>;
    color?: ColorString;
    decoration?: TextDecoration;
  }>;
}

export interface VectorPaint {
  fill?: ColorString | "none";
  stroke?: ColorString | "none";
  strokeWidth?: CSSNumber;
  strokeOpacity?: number;
  fillOpacity?: number;
  dashArray?: number[];
  dashOffset?: number;
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
  miterLimit?: number;
  fillRule?: "nonzero" | "evenodd";
  opacity?: number;
}

export interface VectorShape {
  primitive: "path" | "rect" | "circle" | "ellipse" | "line" | "polyline" | "polygon" | "group" | "text";
  attrs?: Record<string, string | number>;
  paint?: VectorPaint;
  transform?: LayerTransform;
  shapes?: VectorShape[];
  text?: { value: string; font?: FontSpec };
}

export interface LayerVector {
  viewBox?: LayerRect;
  preserveAspectRatio?: string;
  shapes: VectorShape[];
}

export interface LayerImage {
  src: string;
  dataUrl?: string;
  intrinsic?: { width: number; height: number };
  mode?: "fill" | "fit" | "cover" | "contain" | "none" | "scale-down";
  positionX?: string;
  positionY?: string;
  alt?: string;
}

export type DisplayMode =
  | "block"
  | "inline"
  | "inline-block"
  | "flex"
  | "inline-flex"
  | "grid"
  | "inline-grid"
  | "none"
  | "contents"
  | "table"
  | "table-row"
  | "table-cell"
  | "table-row-group"
  | "table-header-group"
  | "table-footer-group"
  | "list-item"
  | "other";

export type Position = "static" | "relative" | "absolute" | "fixed" | "sticky";

export type OverflowMode = "visible" | "hidden" | "clip" | "scroll" | "auto";

export interface FlexLayout {
  direction: "row" | "row-reverse" | "column" | "column-reverse";
  wrap: "nowrap" | "wrap" | "wrap-reverse";
  justify: "start" | "end" | "center" | "space-between" | "space-around" | "space-evenly";
  align: "start" | "end" | "center" | "stretch" | "baseline";
  rowGap: CSSNumber;
  columnGap: CSSNumber;
}

export interface GridLayout {
  templateRows: string;
  templateColumns: string;
  templateAreas?: string;
  rowGap: CSSNumber;
  columnGap: CSSNumber;
  autoFlow: string;
  justify: string;
  align: string;
}

export interface LayerLayout {
  display: DisplayMode;
  position: Position;
  inset?: Partial<LayerInset>;
  zIndex?: number;
  overflow: { x: OverflowMode; y: OverflowMode };
  flex?: FlexLayout;
  grid?: GridLayout;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: string;
  order?: number;
  alignSelf?: string;
  justifySelf?: string;
  gridColumn?: string;
  gridRow?: string;
  margin?: LayerInset;
  padding?: LayerInset;
}

export interface LayerPaint {
  fills?: FillLayer[];
  backgroundClip?: "border-box" | "padding-box" | "content-box" | "text";
  borders?: LayerBorders;
  outline?: BorderSide & { offset?: CSSNumber };
  cornerRadii?: LayerCorners;
  cornerSmoothing?: number;
  shadows?: ShadowLayer[];
  filters?: FilterEntry[];
  backdropFilters?: FilterEntry[];
  opacity?: number;
  blendMode?: string;
  isolation?: "auto" | "isolate";
  clipPath?: {
    kind: "inset" | "circle" | "ellipse" | "polygon" | "path" | "url" | "none";
    value?: string;
  };
  mask?: {
    image?: string;
    mode?: string;
    size?: string;
    position?: string;
    repeat?: string;
  };
  visibility?: "visible" | "hidden" | "collapse";
}

export type LayerSourceKind = "dom" | "svg" | "pseudo" | "canvas" | "video" | "synthetic";

export interface LayerSource {
  kind: LayerSourceKind;
  tag?: string;
  id?: string;
  classList?: string[];
  role?: string;
  ariaLabel?: string;
  dataset?: Record<string, string>;
  pseudo?: "before" | "after" | "first-line" | "placeholder" | "selection";
  /** Native input type when source.tag is input (email, password, …). */
  inputType?: string;
  /** Placeholder copy for empty text inputs (not stored as value). */
  placeholder?: string;
  refPath?: string;
}

export interface UniversalLayer {
  id: string;
  name?: string;
  source: LayerSource;
  box: LayerRect;
  computedBox?: LayerRect;
  transform?: LayerTransform;
  paint?: LayerPaint;
  text?: LayerText;
  vector?: LayerVector;
  image?: LayerImage;
  layout?: LayerLayout;
  children?: UniversalLayer[];
}

export interface UniversalDocumentV2 {
  schemaVersion: "1.0";
  meta: {
    storyId?: string;
    componentName: string;
    extractedAt: string;
    sourceUrl?: string;
    argsUsed?: Record<string, string | number | boolean>;
    viewport: LayerRect;
    devicePixelRatio: number;
    canvasBackground?: ColorString;
  };
  root: UniversalLayer;
  diagnostics: {
    warnings: string[];
    unmappedProperties: Array<{ layerId: string; property: string; raw: string }>;
    missingFonts?: string[];
  };
}

export function isUniversalDocumentV2(value: unknown): value is UniversalDocumentV2 {
  if (!value || typeof value !== "object") return false;
  const v = value as { schemaVersion?: unknown };
  return v.schemaVersion === "1.0";
}
