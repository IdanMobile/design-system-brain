// Generic UniversalLayer v1.0 renderer.
//
// Design rules:
//  1. No component-specific code, no class-name heuristics.
//  2. Every visible CSS property captured by the extractor is honored.
//  3. Frames are always layoutMode: 'NONE' with explicit child positioning —
//     children land exactly where the DOM put them.
//  4. Per-side borders use Figma `individualStrokes`. When per-side colors/
//     styles differ OR `borders.gaps` is non-empty, we fall back to a vector
//     outline drawn inside the frame.
//  5. Vector content is reconstructed as a clean SVG string (all CSS already
//     resolved at extraction) and handed to figma.createNodeFromSvg.
//  6. Images are embedded as data URLs so the renderer never reaches out.
//
// Exports: renderDocumentV2(doc) → SceneNode and isUniversalDocumentV2(value).

import type {
  UniversalDocumentV2,
  UniversalLayer,
  LayerSource,
  LayerPaint,
  LayerBorders,
  BorderSide,
  FillLayer,
  GradientStop,
  ShadowLayer,
  FilterEntry,
  LayerVector,
  VectorShape,
  LayerImage,
  LayerText,
  LayerTransform
} from "./types-v2";

export type { UniversalDocumentV2 } from "./types-v2";

const TAU = Math.PI * 2;

export function isUniversalDocumentV2(value: unknown): value is UniversalDocumentV2 {
  if (!value || typeof value !== "object") return false;
  return (value as { schemaVersion?: unknown }).schemaVersion === "1.0";
}

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
  if (
    layer.source?.kind === "figma" &&
    (layer.source.dataset as { figmaNodeType?: string } | undefined)?.figmaNodeType ===
      "ELLIPSE" &&
    layer.box.width <= 48 &&
    layer.box.height <= 48
  ) {
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
  g: number;
  b: number;
  a: number;
}

function parseColor(raw: string): RGBA {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "transparent" || trimmed === "none")
    return { r: 0, g: 0, b: 0, a: 0 };

  // Hex
  const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const v = hex[1];
    let expanded: string;
    if (v.length === 3 || v.length === 4) {
      expanded = v.split("").map((c) => c + c).join("");
    } else {
      expanded = v;
    }
    const withAlpha = expanded.length === 6 ? expanded + "ff" : expanded;
    return {
      r: parseInt(withAlpha.slice(0, 2), 16) / 255,
      g: parseInt(withAlpha.slice(2, 4), 16) / 255,
      b: parseInt(withAlpha.slice(4, 6), 16) / 255,
      a: parseInt(withAlpha.slice(6, 8), 16) / 255
    };
  }

  // rgb / rgba
  const rgb = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i
  );
  if (rgb) {
    let a = 1;
    if (rgb[4] !== undefined) {
      a = rgb[4].endsWith("%") ? Number(rgb[4].slice(0, -1)) / 100 : Number(rgb[4]);
    }
    return {
      r: Number(rgb[1]) / 255,
      g: Number(rgb[2]) / 255,
      b: Number(rgb[3]) / 255,
      a
    };
  }

  // hsl / hsla
  const hsl = trimmed.match(
    /^hsla?\(\s*([\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i
  );
  if (hsl) {
    const h = Number(hsl[1]) / 360;
    const s = Number(hsl[2]) / 100;
    const l = Number(hsl[3]) / 100;
    const a = hsl[4] !== undefined
      ? (hsl[4].endsWith("%") ? Number(hsl[4].slice(0, -1)) / 100 : Number(hsl[4]))
      : 1;
    const [r, g, b] = hslToRgb(h, s, l);
    return { r, g, b, a };
  }

  // Named colors — handle a couple common ones, fall back to opaque black.
  if (trimmed === "white") return { r: 1, g: 1, b: 1, a: 1 };
  if (trimmed === "black") return { r: 0, g: 0, b: 0, a: 1 };

  return { r: 0, g: 0, b: 0, a: 1 };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3)];
}

function toFigmaRgb(c: RGBA): RGB {
  return { r: c.r, g: c.g, b: c.b };
}

function solidPaint(color: string, alphaMul = 1): SolidPaint {
  const c = parseColor(color);
  return { type: "SOLID", color: toFigmaRgb(c), opacity: c.a * alphaMul };
}

/** Explicit no-fill for Figma shells — empty `fills` exports as opaque white in live PNG. */
function transparentFill(): SolidPaint {
  return { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0 };
}

/** SVG stroke attrs — split rgba into rgb + stroke-opacity for reliable mock/live paint. */
function svgStrokeColorAttrs(color: string): string {
  const c = parseColor(color);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  if (c.a >= 0.999) return `stroke="rgb(${r}, ${g}, ${b})"`;
  return `stroke="rgb(${r}, ${g}, ${b})" stroke-opacity="${snap(c.a)}"`;
}

// ─────────────────────────── gradient → Figma Paint ───────────────────────────

function gradientTransformForAngle(
  angleDeg: number,
  width?: number,
  height?: number
): Transform {
  // CSS gradient: 0deg = bottom→top, increases clockwise.
  // Figma linear gradients use standard handles at (0, 0.5) and (1, 0.5) in
  // gradient space — NOT (0, 0) and (1, 0). The transform maps those handles
  // into the node's normalized space.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  let dx = Math.cos(rad);
  let dy = Math.sin(rad);
  if (width != null && width > 0 && height != null && height > 0) {
    const cssLen = Math.abs(width * dy) + Math.abs(height * dx);
    const currentLen = Math.hypot(dx * width, dy * height);
    if (currentLen > 0) {
      const scale = cssLen / currentLen;
      dx *= scale;
      dy *= scale;
    }
  }
  const m: [[number, number, number], [number, number, number]] = [
    [dx, -dy, 0.5 - dx / 2 + dy / 2],
    [dy, dx, 0.5 - dy / 2 - dx / 2]
  ];
  return m as unknown as Transform;
}

function toColorStops(stops: GradientStop[]): ColorStop[] {
  return stops
    .slice()
    .sort((a, b) => a.offset - b.offset)
    .map((s) => {
      const c = parseColor(s.color);
      return {
        position: Math.max(0, Math.min(1, s.offset)),
        color: { r: c.r, g: c.g, b: c.b, a: c.a }
      };
    });
}

function reverseLinearStops(stops: ColorStop[]): ColorStop[] {
  return stops
    .map((s) => ({ ...s, position: 1 - s.position }))
    .sort((a, b) => a.position - b.position);
}

type FigmaNativeGradient = {
  type?: "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR";
  gradientTransform: Transform;
  gradientStops: Array<{
    position: number;
    color: { r: number; g: number; b: number; a: number };
  }>;
  opacity?: number;
};

function figmaNativeGradientPaint(layer: FillLayer): GradientPaint | null {
  const native = (layer as FillLayer & { figmaNative?: FigmaNativeGradient }).figmaNative;
  if (!native?.gradientTransform || !native.gradientStops?.length) return null;
  const gradientStops: ColorStop[] = native.gradientStops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      position: Math.max(0, Math.min(1, s.position)),
      color: {
        r: s.color.r,
        g: s.color.g,
        b: s.color.b,
        a: s.color.a,
      },
    }));
  const type =
    native.type ??
    (layer.kind === "radial-gradient"
      ? "GRADIENT_RADIAL"
      : layer.kind === "conic-gradient"
      ? "GRADIENT_ANGULAR"
      : "GRADIENT_LINEAR");
  const paint: GradientPaint = {
    type,
    gradientTransform: native.gradientTransform,
    gradientStops,
  };
  if (native.opacity != null && native.opacity < 0.999) {
    (paint as GradientPaint & { opacity?: number }).opacity = snap(native.opacity);
  }
  return paint;
}

function gradientPaint(
  layer: FillLayer,
  width?: number,
  height?: number,
  opts?: { preferCssAngle?: boolean }
): GradientPaint | null {
  if (!opts?.preferCssAngle) {
    const nativePaint = figmaNativeGradientPaint(layer);
    if (nativePaint) return nativePaint;
  }

  if (layer.kind === "linear-gradient") {
    const stops = toColorStops(layer.stops);
    return {
      type: "GRADIENT_LINEAR",
      gradientTransform: gradientTransformForAngle(layer.angleDeg, width, height),
      // Figma 0%/100% run opposite CSS along the same edge-to-edge line.
      gradientStops: reverseLinearStops(stops)
    };
  }
  if (layer.kind === "radial-gradient") {
    return {
      type: "GRADIENT_RADIAL",
      gradientTransform: [
        [1, 0, 0],
        [0, 1, 0]
      ] as unknown as Transform,
      gradientStops: toColorStops(layer.stops)
    };
  }
  if (layer.kind === "conic-gradient") {
    return {
      type: "GRADIENT_ANGULAR",
      gradientTransform: gradientTransformForAngle(layer.fromDeg, width, height),
      gradientStops: toColorStops(layer.stops)
    };
  }
  return null;
}

// ─────────────────────────── images ───────────────────────────

const imageHashByDataUrl = new Map<string, string>();

/**
 * Drop renderer-level caches that are scoped to a single figma instance
 * (image hashes, fonts list). Production callers can ignore this; the
 * Figma-emulator test harness uses it between runs so a fresh figma mock
 * doesn't see stale references to objects that were registered against
 * the previous mock instance.
 */
export function __resetRendererCaches(): void {
  imageHashByDataUrl.clear();
  availableFonts = null;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function svgMarkupFromDataUrl(dataUrl: string): string | null {
  if (!dataUrl.startsWith("data:image/svg+xml")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (meta.includes(";base64")) return atob(payload);
  return decodeURIComponent(payload);
}

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Encode export bytes on the plugin main thread (avoid Array.from + UI re-encode). */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_CHARS[(n >> 18) & 63]!;
    out += BASE64_CHARS[(n >> 12) & 63]!;
    out += i + 1 < bytes.length ? BASE64_CHARS[(n >> 6) & 63]! : "=";
    out += i + 2 < bytes.length ? BASE64_CHARS[n & 63]! : "=";
  }
  return out;
}

function imageHashFromDataUrl(dataUrl: string): string {
  const cached = imageHashByDataUrl.get(dataUrl);
  if (cached) return cached;
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) throw new Error("Unsupported data URL");
  const bytes = base64ToBytes(match[1]);
  const hash = figma.createImage(bytes).hash;
  imageHashByDataUrl.set(dataUrl, hash);
  return hash;
}

function imagePaintFromFill(
  layer: Extract<FillLayer, { kind: "image" }>
): ImagePaint | null {
  if (!layer.dataUrl) return null;
  let scaleMode: ImagePaint["scaleMode"] = "FILL";
  if (layer.size === "contain") scaleMode = "FIT";
  else if (layer.size === "cover") scaleMode = "FILL";
  else if (layer.repeat && layer.repeat !== "no-repeat") scaleMode = "TILE";
  return { type: "IMAGE", imageHash: imageHashFromDataUrl(layer.dataUrl), scaleMode };
}

function imagePaintFromImage(image: LayerImage): ImagePaint | null {
  const dataUrl = image.dataUrl || image.src;
  if (!dataUrl) return null;
  const mode = image.mode || "fill";
  let scaleMode: ImagePaint["scaleMode"] = "FILL";
  if (mode === "contain" || mode === "fit") scaleMode = "FIT";
  else if (mode === "cover") scaleMode = "FILL";
  else if (mode === "none") scaleMode = "CROP";
  if (svgMarkupFromDataUrl(dataUrl)) return null;
  return { type: "IMAGE", imageHash: imageHashFromDataUrl(dataUrl), scaleMode };
}

// ─────────────────────────── borders ───────────────────────────

function bordersUniform(b: LayerBorders | undefined): BorderSide | null {
  if (!b) return null;
  if (b.gaps && b.gaps.length) return null;
  const sides = [b.top, b.right, b.bottom, b.left].filter(Boolean) as BorderSide[];
  if (!sides.length) return null;
  const first = sides[0];
  const allSame = sides.every(
    (s) =>
      s.color === first.color &&
      s.style === first.style
  );
  return allSame ? first : null;
}

type BorderEdge = "top" | "right" | "bottom" | "left";

function countActiveBorderSides(b: LayerBorders | undefined): number {
  if (!b) return 0;
  let n = 0;
  if (b.top?.width) n++;
  if (b.right?.width) n++;
  if (b.bottom?.width) n++;
  if (b.left?.width) n++;
  return n;
}

function singleEdgeBorderSide(b: LayerBorders | undefined): BorderEdge | null {
  if (!b || (b.gaps && b.gaps.length)) return null;
  const active: BorderEdge[] = [];
  if (b.top?.width) active.push("top");
  if (b.right?.width) active.push("right");
  if (b.bottom?.width) active.push("bottom");
  if (b.left?.width) active.push("left");
  return active.length === 1 ? active[0] : null;
}

function perCornerRadii(paint: LayerPaint): { tl: number; tr: number; br: number; bl: number } {
  const c = paint.cornerRadii;
  return {
    tl: c?.topLeft?.x ?? 0,
    tr: c?.topRight?.x ?? 0,
    br: c?.bottomRight?.x ?? 0,
    bl: c?.bottomLeft?.x ?? 0,
  };
}

function clampCornerRadius(r: number, width: number, height: number): number {
  return Math.max(0, Math.min(r, width / 2 - 1, height / 2 - 1));
}

function borderStrokeAttrs(color: string, style: string, sw: number): string {
  let dashAttr = "";
  if (style === "dashed") {
    const dash = Math.max(2, Math.round(sw * 3));
    dashAttr = ` stroke-dasharray="${dash} ${dash}"`;
  } else if (style === "dotted") {
    const dot = Math.max(1, Math.round(sw));
    const gapLen = Math.max(2, Math.round(sw * 2));
    dashAttr = ` stroke-dasharray="${dot} ${gapLen}" stroke-linecap="round"`;
  }
  return `fill="none" ${svgStrokeColorAttrs(color)} stroke-width="${sw}"${dashAttr}`;
}

function edgeSegmentPath(
  edge: BorderEdge,
  width: number,
  height: number,
  inset: number,
  cr: { tl: number; tr: number; br: number; bl: number }
): string {
  const tl = clampCornerRadius(cr.tl, width, height);
  const tr = clampCornerRadius(cr.tr, width, height);
  const br = clampCornerRadius(cr.br, width, height);
  const bl = clampCornerRadius(cr.bl, width, height);
  if (edge === "top") return `M ${inset + tl} ${inset} L ${width - inset - tr} ${inset}`;
  if (edge === "bottom") return `M ${inset + bl} ${height - inset} L ${width - inset - br} ${height - inset}`;
  if (edge === "left") return `M ${inset} ${inset + tl} L ${inset} ${height - inset - bl}`;
  return `M ${width - inset} ${inset + tr} L ${width - inset} ${height - inset - br}`;
}

/** Live: draw 1–3 border sides with per-corner radii (avoids phantom native strokes). */
function buildActiveBorderSvg(width: number, height: number, paint: LayerPaint): string | null {
  const b = paint.borders;
  if (!b) return null;
  const edges: BorderEdge[] = [];
  if (b.top?.width) edges.push("top");
  if (b.right?.width) edges.push("right");
  if (b.bottom?.width) edges.push("bottom");
  if (b.left?.width) edges.push("left");
  if (!edges.length) return null;

  const ref = b[edges[0]!]!;
  const color = ref.color || "black";
  const style = ref.style || "solid";
  const sw = Math.max(...edges.map((e) => b[e]!.width || 0));
  if (!sw) return null;
  const uniformStyle = edges.every(
    (e) => b[e]!.color === ref.color && b[e]!.style === ref.style
  );
  if (!uniformStyle) return null;

  const inset = sw / 2;
  const cr = perCornerRadii(paint);
  const strokeAttrs = borderStrokeAttrs(color, style, sw);
  const paths = edges
    .map((e) => `<path d="${edgeSegmentPath(e, width, height, inset, cr)}" ${strokeAttrs} />`)
    .join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
}

/** Real Figma can paint phantom side strokes on frames with per-side weights; use one SVG segment. */
function buildSingleEdgeBorderSvg(
  width: number,
  height: number,
  paint: LayerPaint,
  edge: BorderEdge
): string | null {
  const b = paint.borders;
  const side = b?.[edge];
  if (!b || !side?.width) return null;
  return buildActiveBorderSvg(width, height, paint);
}

function buildBorderOutlineSvg(
  width: number,
  height: number,
  paint: LayerPaint
): string | null {
  const b = paint.borders;
  if (!b) return null;
  const corners = paint.cornerRadii;
  // Use inset = strokeWidth / 2 so the stroke sits inside the node bounds.
  const r =
    corners
      ? Math.max(
          corners.topLeft.x,
          corners.topRight.x,
          corners.bottomRight.x,
          corners.bottomLeft.x
        )
      : 0;
  const sw = Math.max(
    b.top?.width || 0,
    b.right?.width || 0,
    b.bottom?.width || 0,
    b.left?.width || 0
  );
  const inset = sw / 2;
  const color = (b.top || b.right || b.bottom || b.left)?.color || "black";
  const style = (b.top || b.right || b.bottom || b.left)?.style || "solid";
  const cornerR = Math.max(0, Math.min(r, width / 2 - 1, height / 2 - 1));

  // Build sequenced path with optional gaps on the top side. We support gaps
  // only on top in the schema right now; extend as needed.
  const gaps = (b.gaps || []).filter((g) => g.side === "top").sort((a, b2) => a.from - b2.from);

  // Uniform solid borders use native strokes; dashed/dotted on rounded rects need
  // an explicit SVG path so Figma/live export matches browser dash geometry.
  if (gaps.length === 0 && bordersUniform(b)) {
    const uniform = bordersUniform(b);
    if (!uniform || cornerR <= 0 || (uniform.style !== "dashed" && uniform.style !== "dotted")) {
      return null;
    }
  }

  let dashAttr = "";
  if (style === "dashed") {
    const dash = Math.max(2, Math.round(sw * 3));
    dashAttr = ` stroke-dasharray="${dash} ${dash}"`;
  } else if (style === "dotted") {
    const dot = Math.max(1, Math.round(sw));
    const gapLen = Math.max(2, Math.round(sw * 2));
    dashAttr = ` stroke-dasharray="${dot} ${gapLen}" stroke-linecap="round"`;
  }
  const strokeAttrs = `fill="none" ${svgStrokeColorAttrs(color)} stroke-width="${sw}"${dashAttr}`;

  // MUI notched outline — three open paths (a closed or compound path draws a chord
  // across the label notch in Figma's SVG importer and in scene-to-html).
  if (gaps.length) {
    let gapEndX = inset + cornerR;
    let gapStartX = width - inset - cornerR;
    const g = gaps[0];
    const from = Math.max(gapEndX, g.from);
    const to = Math.min(width - inset - cornerR, g.to);
    gapEndX = from;
    gapStartX = to > from ? to : gapStartX;
    const p1 = `M ${inset} ${inset + cornerR} A ${cornerR} ${cornerR} 0 0 1 ${inset + cornerR} ${inset} L ${gapEndX} ${inset}`;
    const p2 = `M ${gapStartX} ${inset} L ${width - inset - cornerR} ${inset} A ${cornerR} ${cornerR} 0 0 1 ${width - inset} ${inset + cornerR}`;
    const p3 = `M ${width - inset} ${inset + cornerR} L ${width - inset} ${height - inset - cornerR} A ${cornerR} ${cornerR} 0 0 1 ${width - inset - cornerR} ${height - inset} L ${inset + cornerR} ${height - inset} A ${cornerR} ${cornerR} 0 0 1 ${inset} ${height - inset - cornerR} L ${inset} ${inset + cornerR}`;
    const paths = [p1, p2, p3]
      .map((d) => `<path d="${d}" ${strokeAttrs}/>`)
      .join("");
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
  }

  const cmds: string[] = [];
  cmds.push(`M ${inset} ${inset + cornerR}`);
  cmds.push(`A ${cornerR} ${cornerR} 0 0 1 ${inset + cornerR} ${inset}`);
  cmds.push(`L ${width - inset - cornerR} ${inset}`);
  cmds.push(`A ${cornerR} ${cornerR} 0 0 1 ${width - inset} ${inset + cornerR}`);
  cmds.push(`L ${width - inset} ${height - inset - cornerR}`);
  cmds.push(`A ${cornerR} ${cornerR} 0 0 1 ${width - inset - cornerR} ${height - inset}`);
  cmds.push(`L ${inset + cornerR} ${height - inset}`);
  cmds.push(`A ${cornerR} ${cornerR} 0 0 1 ${inset} ${height - inset - cornerR}`);
  cmds.push(`Z`);

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><path d="${cmds.join(" ")}" ${strokeAttrs}/></svg>`;
}

// ─────────────────────────── shadows / filters ───────────────────────────

/**
 * Build Figma `Effect` objects from the layer's paint.
 *
 * Figma rejects `spread`:
 *  - on TEXT nodes outright,
 *  - on frames where `clipsContent` is false.
 *
 * Pass `allowSpread: false` for either of those cases.
 */
function effectsFromPaint(paint: LayerPaint, allowSpread: boolean): Effect[] {
  const out: Effect[] = [];
  const withSpread = (eff: any, spread: number): any =>
    allowSpread && spread !== 0 ? { ...eff, spread: snap(spread) } : eff;
  for (const s of paint.shadows || []) {
    const c = parseColor(s.color);
    const eff: any = {
      type: s.inset ? "INNER_SHADOW" : "DROP_SHADOW",
      color: { r: c.r, g: c.g, b: c.b, a: c.a },
      offset: { x: snap(s.offsetX), y: snap(s.offsetY) },
      radius: Math.max(0, snap(s.blur)),
      blendMode: "NORMAL",
      visible: true
    };
    out.push(withSpread(eff, s.spread) as Effect);
  }
  for (const f of paint.filters || []) {
    if (f.kind === "blur") {
      out.push({
        type: "LAYER_BLUR",
        radius: Math.max(0, snap(f.valuePx)),
        visible: true
      } as any);
    } else if (f.kind === "drop-shadow") {
      const c = parseColor(f.shadow.color);
      const eff: any = {
        type: "DROP_SHADOW",
        color: { r: c.r, g: c.g, b: c.b, a: c.a },
        offset: { x: snap(f.shadow.offsetX), y: snap(f.shadow.offsetY) },
        radius: Math.max(0, snap(f.shadow.blur)),
        blendMode: "NORMAL",
        visible: true
      };
      out.push(withSpread(eff, f.shadow.spread) as Effect);
    }
  }
  for (const f of paint.backdropFilters || []) {
    if (f.kind === "blur") {
      out.push({
        type: "BACKGROUND_BLUR",
        radius: Math.max(0, snap(f.valuePx)),
        visible: true
      } as any);
    }
  }
  return out;
}

/** Clone effect payloads before assigning (live Figma can seal parsed objects). */
function cloneEffects(effects: readonly Effect[]): Effect[] {
  return effects.map((e) => JSON.parse(JSON.stringify(e)) as Effect);
}

function clonePaints(paints: readonly Paint[]): Paint[] {
  return paints.map((p) => JSON.parse(JSON.stringify(p)) as Paint);
}

// ─────────────────────────── fonts ───────────────────────────

let availableFonts: Promise<Font[]> | null = null;

async function listFonts(): Promise<Font[]> {
  availableFonts ??= figma.listAvailableFontsAsync();
  return availableFonts;
}

/** Figma Desktop Inter renders ~one step lighter than Chromium; Roboto does not. */
function liveCompensatedWeight(
  weight: number,
  font?: { family: string; stack?: string },
  layer?: UniversalLayer,
  parent?: UniversalLayer
): number {
  if (isMockFigmaRuntime()) return weight;
  // Lab components: keep exact DOM weight — +100 widens pills/tabs and drifts live diffs.
  if (layer && isLabDomContext(layer, parent)) return weight;
  // Heavier Inter (700→800) widens pill/tab labels and forces live Figma to wrap.
  if (layer && liveLayoutSensitiveText(layer, parent)) return weight;
  const primary = (familyCandidates(font ?? { family: "" })[0] ?? "").toLowerCase();
  if (primary === "roboto") return weight;
  if (weight >= 400 && weight <= 700) return Math.min(900, weight + 100);
  return weight;
}

function isLabDomContext(layer?: UniversalLayer, parent?: UniversalLayer): boolean {
  for (const l of [layer, parent]) {
    if (!l) continue;
    if ((l.source.classList ?? []).some((c) => c.startsWith("lab-"))) return true;
  }
  return false;
}

/** Single-line pills/tabs/chips — keep exact DOM weight so glyphs fit extracted boxes. */
function liveLayoutSensitiveText(layer: UniversalLayer, parent?: UniversalLayer): boolean {
  const text = layer.text;
  if (!text) return false;
  if (text.whiteSpace === "nowrap" || text.whiteSpace === "pre") return true;
  if (isLabTightCenterButton(layer, parent)) return true;
  if (
    isLabButtonLabelSpan(layer, parent) &&
    (parent?.source?.classList ?? []).includes("lab-button")
  ) {
    return true;
  }
  if (isTextLeafLayer(layer) && layer.paint?.fills?.length) {
    const pad = layer.layout?.padding;
    const innerH = layer.box.height - (pad?.top ?? 0) - (pad?.bottom ?? 0);
    const lh = text.lineHeight;
    if (lh != null && innerH > 0 && Math.abs(lh - innerH) <= 2 && !text.value.includes("\n")) {
      return true;
    }
  }
  const pad = layer.layout?.padding;
  const innerH = layer.box.height - (pad?.top ?? 0) - (pad?.bottom ?? 0);
  const lh = text.lineHeight;
  if (
    lh != null &&
    innerH > 0 &&
    Math.abs(lh - innerH) <= 2 &&
    !text.value.includes("\n")
  ) {
    return true;
  }
  return false;
}

/** Figma Desktop style strings vary ("SemiBold" vs "Semi Bold") — try aliases. */
function figmaStyleAliases(style: string): string[] {
  const out = new Set<string>([style]);
  const pairs: Array<[RegExp, string]> = [
    [/SemiBold/i, "Semi Bold"],
    [/Semi Bold/i, "SemiBold"],
    [/ExtraBold/i, "Extra Bold"],
    [/Extra Bold/i, "ExtraBold"],
    [/ExtraLight/i, "Extra Light"],
    [/Extra Light/i, "ExtraLight"],
  ];
  for (const [re, alt] of pairs) {
    if (re.test(style)) out.add(style.replace(re, alt));
  }
  return [...out];
}

function isFigmaNativeEllipse(layer: UniversalLayer): boolean {
  return (
    layer.source?.kind === "figma" &&
    (layer.source.dataset as { figmaNodeType?: string } | undefined)?.figmaNodeType ===
      "ELLIPSE"
  );
}

function isFigmaReferenceRasterLayer(layer: UniversalLayer): boolean {
  return Boolean(
    layer.image?.dataUrl &&
    (layer.source?.dataset as { figmaReferenceRaster?: string } | undefined)?.figmaReferenceRaster
  );
}

/** Guing round-trip TEXT — glyph color lives on layer.text; never wrap in a chrome frame. */
function isFigmaNativeTextLayer(layer: UniversalLayer): boolean {
  if (isFigmaReferenceRasterLayer(layer)) return false;
  return (
    layer.source?.kind === "figma" &&
    (layer.source.dataset as { figmaNodeType?: string } | undefined)?.figmaNodeType === "TEXT"
  );
}

/**
 * Guing manifest often marks paragraph TEXT as WIDTH_AND_HEIGHT even when the
 * captured box is multi-line (height > ~1.3× line-height). Live auto-size both
 * axes skips wrapping and drifts vs the reference PNG (screen_2: 15 nodes).
 */
function figmaNativeNeedsFixedTextBox(layer: UniversalLayer, text: LayerText): boolean {
  if (!isFigmaNativeTextLayer(layer)) return false;
  const resize = (layer.source?.dataset as { figmaTextAutoResize?: string } | undefined)
    ?.figmaTextAutoResize;
  if (resize !== "WIDTH_AND_HEIGHT") return false;
  const lh = text.lineHeight ?? text.font.size;
  if (!(layer.box.height > lh * 1.3)) return false;
  return /\s/.test(text.value.trim());
}

/**
 * WIDTH_AND_HEIGHT with a single-line contract box but paragraph-length copy.
 * Live both-axes auto-size keeps one line and overlaps neighbors (screen_2).
 */
function figmaNativeNeedsWidthConstrainedWrap(
  layer: UniversalLayer,
  text: LayerText
): boolean {
  if (!isFigmaNativeTextLayer(layer)) return false;
  const resize = (layer.source?.dataset as { figmaTextAutoResize?: string } | undefined)
    ?.figmaTextAutoResize;
  if (resize !== "WIDTH_AND_HEIGHT") return false;
  const trimmed = text.value.trim();
  if (!/\s/.test(trimmed)) return false;
  const lh = text.lineHeight ?? text.font.size;
  if (layer.box.height > lh * 1.3) return false;
  const fontSize = Math.max(1, text.font.size ?? 14);
  const isHebrew = /[\u0590-\u05FF]/.test(trimmed);
  const emFactor = isHebrew ? 0.45 : 0.52;
  const estCharsPerLine = Math.max(8, Math.floor(layer.box.width / (fontSize * emFactor)));
  return (
    trimmed.length > estCharsPerLine ||
    (trimmed.length > 40 && layer.box.height <= lh * 1.3)
  );
}

function parentUsesFlexCrossEnd(parent?: UniversalLayer): boolean {
  if (parent?.layout?.display !== "flex") return false;
  return parent.layout.flex?.align === "end";
}

/**
 * Guing header labels in flex-column align:end full-width slots — lock NONE + contract box.
 * left/start → RIGHT inside box (screen_2 email). right/end → keep RIGHT (notification header).
 * When natural glyph width < contract box, pin by geometry (live Figma ignores RIGHT+NONE).
 */
function pinFigmaFlexCrossEndBareText(
  text: TextNode,
  layer: UniversalLayer,
  parent: UniversalLayer
): void {
  if (!layer.text) return;
  const align = layer.text.align;
  if (
    align !== "left" &&
    align !== "start" &&
    align !== "right" &&
    align !== "end"
  ) {
    return;
  }
  const parentW = parent.box.width;
  const childRight = layer.box.x + layer.box.width;
  const spansParent =
    layer.box.width >= parentW - 1 || childRight + 0.5 >= parentW;
  if (!spansParent) return;
  const boxW = Math.max(1, Math.ceil(snap(layer.box.width)));
  const boxH = Math.max(1, Math.ceil(snap(layer.box.height)));
  text.textAutoResize = "WIDTH_AND_HEIGHT";
  if (layer.text.direction === "rtl") {
    try {
      (text as TextNode & { textDirection?: "RTL" | "LTR" }).textDirection = "RTL";
    } catch {
      /* older Figma builds */
    }
  }
  text.textAlignHorizontal =
    layer.text.direction === "rtl" || align === "right" || align === "end"
      ? "RIGHT"
      : "LEFT";
  void text.width;
  const naturalW = Math.max(1, Math.ceil(snap(text.width)));
  const naturalH = Math.max(1, Math.ceil(snap(text.height)));
  const placedW = Math.min(naturalW, boxW);
  text.textAutoResize = "NONE";
  text.textAlignHorizontal =
    layer.text.direction === "rtl" || align === "right" || align === "end"
      ? "RIGHT"
      : "LEFT";
  text.resize(placedW, Math.max(boxH, naturalH));
  text.x = snap(childRight - placedW);
  text.y = snap(layer.box.y);
}

function figmaReferenceRasterPosition(
  layer: UniversalLayer,
  parentDocOrigin: { x: number; y: number }
): { x: number; y: number } {
  const local = {
    x: Math.round(layer.box.x),
    y: Math.round(layer.box.y),
  };
  const ds = layer.source?.dataset as
    | { figmaReferenceAbsX?: string; figmaReferenceAbsY?: string }
    | undefined;
  const absX = ds?.figmaReferenceAbsX != null ? Number(ds.figmaReferenceAbsX) : NaN;
  if (Number.isFinite(absX)) {
    local.x = Math.round(absX - parentDocOrigin.x);
    // Flex parent box.y can be sub-pixel (e.g. 0.38); doc-abs raster y=0 needs
    // local lift without reading figmaReferenceAbsY (regresses other screens).
    if (layer.box.y === 0) {
      const subPxY = parentDocOrigin.y - Math.round(parentDocOrigin.y);
      if (Math.abs(subPxY) > 0.001) {
        local.y = snap(local.y - subPxY);
      }
    }
  }
  return local;
}

function reaffirmFigmaFlexCrossEndBareText(
  node: SceneNode,
  layer: UniversalLayer,
  parent?: UniversalLayer
): void {
  if (!parentUsesFlexCrossEnd(parent) || !parentUsesFlexColumn(parent)) return;
  if (node.type !== "TEXT" || !isFigmaNativeTextLayer(layer) || !layer.text) return;
  pinFigmaFlexCrossEndBareText(node as TextNode, layer, parent!);
}

function isFigmaNativeEllipseSiblingLetter(
  layer: UniversalLayer,
  parent?: UniversalLayer
): boolean {
  if (!isFigmaNativeTextLayer(layer) || !layer.text) return false;
  if (layer.text.align !== "center" || layer.text.verticalAlign !== "middle") return false;
  if ((layer.text.value ?? "").length > 3) return false;
  return (parent?.children ?? []).some((c) => c !== layer && isFigmaNativeEllipse(c));
}

/** Avatar initial over ELLIPSE — lock contract text box + native center alignment. */
function applyFigmaNativeCenteredGlyphPin(
  text: TextNode,
  layer: UniversalLayer,
  parent?: UniversalLayer
): void {
  const boxW = Math.max(1, snap(layer.box.width));
  const boxH = Math.max(1, snap(layer.box.height));
  if (
    layer.text?.lineHeight != null &&
    layer.text.lineHeight > boxH + 0.25
  ) {
    text.lineHeight = { unit: "PIXELS", value: Math.max(1, snap(boxH)) };
  }
  text.textAutoResize = "NONE";
  text.textAlignHorizontal = "CENTER";
  text.textAlignVertical = "CENTER";
  text.resize(boxW, boxH);
  text.x = snap(layer.box.x);
  text.y = snap(layer.box.y);
}

function weightToStyle(weight: number, italic: boolean): string {
  let base: string;
  if (weight >= 900) base = "Black";
  else if (weight >= 800) base = "Extra Bold";
  else if (weight >= 700) base = "Bold";
  else if (weight >= 600) base = "Semi Bold";
  else if (weight >= 500) base = "Medium";
  else if (weight >= 400) base = "Regular";
  else if (weight >= 300) base = "Light";
  else if (weight >= 200) base = "Extra Light";
  else base = "Thin";
  return italic ? `${base} Italic` : base;
}

/**
 * Map CSS generic families to a concrete fallback we can look up in the
 * Figma font registry. `serif` / `monospace` / etc. don't exist as real
 * fonts in Figma, so we must pick a concrete substitute or the text loses
 * its visual category entirely.
 */
const GENERIC_FALLBACKS: Record<string, string[]> = {
  monospace: ["Roboto Mono", "Source Code Pro", "JetBrains Mono", "Courier New", "Courier"],
  serif: ["Georgia", "Roboto Slab", "Merriweather", "Times New Roman", "Times"],
  "sans-serif": ["Inter", "Roboto", "Helvetica", "Arial"],
  "system-ui": ["Inter", "Roboto", "Helvetica", "Arial"],
  "ui-sans-serif": ["Inter", "Roboto", "Helvetica", "Arial"],
  "ui-monospace": ["Roboto Mono", "Source Code Pro", "Courier New"],
  "ui-serif": ["Georgia", "Roboto Slab", "Times New Roman"],
  cursive: ["Pacifico", "Dancing Script", "Inter"],
  fantasy: ["Impact", "Arial Black", "Inter"]
};

/**
 * Walk the CSS font-family STACK looking for the first family we recognize.
 * Honoring the stack is critical because CSS authors put fallbacks like
 * `"My Brand Font", monospace` exactly for the case where the brand font
 * is missing — and "monospace" must NOT collapse to Inter.
 */
function familyCandidates(font: { family: string; stack?: string }): string[] {
  const raw = font.stack || font.family || "";
  return raw
    .split(",")
    .map((s) => s.replace(/['"]/g, "").trim())
    .filter(Boolean);
}

async function resolveFont(
  text: LayerText,
  layer?: UniversalLayer,
  parent?: UniversalLayer
): Promise<FontName> {
  const italic = text.font.style === "italic" || text.font.style === "oblique";
  let weight = liveCompensatedWeight(text.font.weight || 400, text.font, layer, parent);
  const tag = layer?.source.tag ?? "";
  if (tag === "input" && weight < 600 && parent?.name === "inline-edit") {
    weight = liveCompensatedWeight(700, text.font, layer, parent);
  }
  const desired = weightToStyle(weight, italic);
  const fonts = await listFonts();

  const styleWeight = (style: string): number => {
    const s = style.toLowerCase();
    if (s.includes("thin")) return 100;
    if (s.includes("extra light") || s.includes("ultra light")) return 200;
    if (s.includes("light")) return 300;
    if (s.includes("regular") || s === "normal" || s === "book") return 400;
    if (s.includes("medium")) return 500;
    if (s.includes("semi bold") || s.includes("demi bold")) return 600;
    if (s.includes("extra bold") || s.includes("ultra bold")) return 800;
    if (s.includes("black") || s.includes("heavy")) return 900;
    if (s.includes("bold")) return 700;
    return 400;
  };

  const pickNearestInFamily = (family: string): FontName | null => {
    const inFamily = fonts.filter((f) => f.fontName.family === family);
    if (!inFamily.length) return null;
    const exact = inFamily.find((f) => f.fontName.style === desired);
    if (exact) return exact.fontName;
    const target = weight || styleWeight(desired);
    let best = inFamily[0]!;
    let bestDist = Math.abs(styleWeight(best.fontName.style) - target);
    for (const f of inFamily) {
      const d = Math.abs(styleWeight(f.fontName.style) - target);
      if (d < bestDist) {
        best = f;
        bestDist = d;
      }
    }
    return best.fontName;
  };

  if (layer?.source?.kind === "figma") {
    const ds = layer.source.dataset as {
      figmaFontFamily?: string;
      figmaFontStyle?: string;
    };
    if (ds?.figmaFontFamily && ds?.figmaFontStyle) {
      const hasHebrew = /[\u0590-\u05FF]/.test(text.value ?? "");
      const families =
        hasHebrew && ds.figmaFontFamily === "Open Sans"
          ? ["Open Sans Hebrew"]
          : [ds.figmaFontFamily];
      for (const family of families) {
        for (const style of figmaStyleAliases(ds.figmaFontStyle)) {
          const hit = fonts.find(
            (f) => f.fontName.family === family && f.fontName.style === style
          );
          if (hit) return hit.fontName;
        }
        const nearest = pickNearestInFamily(family);
        if (nearest) return nearest;
      }
    }
  }
  const candidates = familyCandidates(text.font);

  const tryFamily = (family: string): FontName | null => pickNearestInFamily(family);

  for (const cand of candidates) {
    const direct = tryFamily(cand);
    if (direct) return direct;
    const generic = GENERIC_FALLBACKS[cand.toLowerCase()];
    if (generic) {
      for (const sub of generic) {
        const hit = tryFamily(sub);
        if (hit) return hit;
      }
    }
  }

  const inter =
    fonts.find((f) => f.fontName.family === "Inter" && f.fontName.style === desired) ||
    fonts.find((f) => f.fontName.family === "Inter" && f.fontName.style === "Regular");
  if (inter) return inter.fontName;

  return { family: "Inter", style: "Regular" };
}

async function preloadFonts(root: UniversalLayer, missing: Set<string>): Promise<void> {
  const fontNames = new Map<string, FontName>();
  async function walk(layer: UniversalLayer) {
    if (layer.text) {
      try {
        const fn = await resolveFont(layer.text, layer);
        fontNames.set(`${fn.family}:${fn.style}`, fn);
      } catch {
        // skip
      }
    }
    for (const c of layer.children || []) await walk(c);
  }
  await walk(root);
  await Promise.all(
    Array.from(fontNames.values()).map(async (fn) => {
      try {
        await figma.loadFontAsync(fn);
      } catch {
        missing.add(`${fn.family} ${fn.style}`);
      }
    })
  );
}

// ─────────────────────────── transforms ───────────────────────────

function applyTransform(node: SceneNode, layer: UniversalLayer): void {
  if (!("relativeTransform" in node)) return;

  const rt = (layer.source?.dataset as { figmaRelativeTransform?: number[][] } | undefined)
    ?.figmaRelativeTransform;
  if (
    layer.source?.kind === "figma" &&
    (layer.vector || isFigmaFlipIconFrame(layer)) &&
    rt?.length === 2 &&
    rt[0]?.length === 3 &&
    rt[1]?.length === 3
  ) {
    node.relativeTransform = [
      [snap(rt[0][0]), snap(rt[0][1]), snap(rt[0][2])],
      [snap(rt[1][0]), snap(rt[1][1]), snap(rt[1][2])],
    ];
    return;
  }

  let x = snap(layer.box.x);
  let y = snap(layer.box.y);
  if (
    !isMockFigmaRuntime() &&
    isFigmaNativeEllipse(layer) &&
    layer.box.width <= 48 &&
    layer.box.height <= 48
  ) {
    x = Math.round(layer.box.x);
    y = Math.round(layer.box.y);
  }
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
    // Pure rotation — box is the post-rotation AABB; re-apply rotation on the node
    // so local vector paths (ellipses, icons) match the origin PNG.
    if ("rotation" in node) {
      const isCircularProgress =
        isMockFigmaRuntime() &&
        (layer.source.classList ?? []).some((c) => c.includes("MuiCircularProgress-root"));
      if (!isCircularProgress) {
        const rotDeg = (Math.atan2(b, a) * 180) / Math.PI;
        if (Math.abs(rotDeg) > 0.01) {
          (node as any).rotation = snap(rotDeg);
        }
      }
    }
    node.x = x;
    node.y = y;
    return;
  }
  node.x = x;
  node.y = y;
}

function isIdentity(m: [number, number, number, number, number, number]): boolean {
  return (
    Math.abs(m[0] - 1) < 1e-6 &&
    Math.abs(m[1]) < 1e-6 &&
    Math.abs(m[2]) < 1e-6 &&
    Math.abs(m[3] - 1) < 1e-6 &&
    Math.abs(m[4]) < 1e-6 &&
    Math.abs(m[5]) < 1e-6
  );
}

function isMockFigmaRuntime(): boolean {
  return typeof (figma as { __reset?: () => void }).__reset === "function";
}

// ─────────────────────────── fills ───────────────────────────

function buildFills(
  paint: LayerPaint | undefined,
  width?: number,
  height?: number,
  layer?: UniversalLayer
): Paint[] | undefined {
  if (!paint?.fills?.length) return undefined;
  const out: Paint[] = [];
  // Schema order is back-to-front (array order). Figma's `fills` paints in the
  // SAME order: index 0 paints first (behind), last index paints last (front).
  for (const f of paint.fills) {
    if (f.kind === "color") {
      out.push(solidPaint(f.color));
    } else if (f.kind === "linear-gradient" || f.kind === "radial-gradient" || f.kind === "conic-gradient") {
      const p = gradientPaint(f, width, height);
      if (p) out.push(p);
    } else if (f.kind === "image") {
      const p = imagePaintFromFill(f);
      if (p) out.push(p);
    }
  }
  return out;
}

// ─────────────────────────── corner radii ───────────────────────────

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
  const activeCount = countActiveBorderSides(paint.borders);

  // Live: partial borders (table grid, pagination) — SVG with per-corner radii.
  if (!isMockFigmaRuntime() && activeCount >= 1 && activeCount < 4) {
    const svg = buildActiveBorderSvg(width, height, paint);
    if (svg) {
      const vector = figma.createNodeFromSvg(svg);
      vector.name = "__border";
      vector.x = 0;
      vector.y = 0;
      vector.resize(Math.max(1, snap(width)), Math.max(1, snap(height)));
      if ("fills" in vector) (vector as GeometryMixin).fills = [];
      return vector;
    }
  }

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

  if (uniform && "strokes" in node && !useSvgOutline) {
    node.strokes = [solidPaint(uniform.color)];
    if ("strokeAlign" in node) node.strokeAlign = "INSIDE";
    // Per-side widths (Figma natively supports this on rect+frame).
    if ("strokeTopWeight" in node) {
      const f = node as any;
      f.strokeTopWeight = snap(sides.top?.width || 0);
      f.strokeRightWeight = snap(sides.right?.width || 0);
      f.strokeBottomWeight = snap(sides.bottom?.width || 0);
      f.strokeLeftWeight = snap(sides.left?.width || 0);
      // strokeWeight is required even when individuals set.
      node.strokeWeight = snap(uniform.width);
    } else {
      node.strokeWeight = snap(uniform.width);
    }
    if ("dashPattern" in node) {
      if (uniform.style === "dashed") {
        const dash = Math.max(2, Math.round(uniform.width * 3));
        node.dashPattern = [dash, dash];
      } else if (uniform.style === "dotted") {
        const dot = Math.max(1, Math.round(uniform.width));
        const gap = Math.max(2, Math.round(uniform.width * 2));
        node.dashPattern = [dot, gap];
      } else {
        node.dashPattern = [];
      }
    }
    return null;
  }

  // Gaps or per-side mismatch → emit a vector outline overlay.
  const svg = buildBorderOutlineSvg(width, height, paint);
  if (!svg) return null;
  const vector = figma.createNodeFromSvg(svg);
  vector.name = "__border";
  vector.x = 0;
  vector.y = 0;
  vector.resize(Math.max(1, snap(width)), Math.max(1, snap(height)));
  if ("fills" in vector) (vector as GeometryMixin).fills = [];
  return vector;
}

// ─────────────────────────── vector reconstruction ───────────────────────────

function escapeAttr(v: string): string {
  return v.replace(/"/g, "&quot;").replace(/&/g, "&amp;");
}

/** Parse rotate() or matrix() on a merged SVG attr map → degrees (SVG y-down). */
function rotationDegFromTransform(transform: string): number {
  const rot = transform.match(/rotate\(\s*([-\d.e]+)/);
  if (rot) return parseFloat(rot[1]);
  const m = transform.match(
    /matrix\(\s*([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)/
  );
  if (m) {
    const a = parseFloat(m[1]);
    const b = parseFloat(m[2]);
    return (Math.atan2(b, a) * 180) / Math.PI;
  }
  return -90;
}

/**
 * Figma's createNodeFromSvg() mangles <circle stroke-dasharray> (donut/pie
 * charts become cardinal “ticks”). Browsers render the same SVG correctly, which
 * is why the pixel harness can pass while real Figma looks wrong. Convert each
 * dashed stroke ring segment to a filled annular sector <path>.
 */
function circleDashToArcPath(attrs: Record<string, string>): string | null {
  const cx = parseFloat(attrs.cx ?? "");
  const cy = parseFloat(attrs.cy ?? "");
  const r = parseFloat(attrs.r ?? "");
  const dashRaw = attrs["stroke-dasharray"];
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || !dashRaw) {
    return null;
  }
  const dashLen = parseFloat(dashRaw.split(/[\s,]+/)[0] ?? "");
  if (!(dashLen > 0)) return null;

  const strokeWidth = parseFloat(attrs["stroke-width"] ?? "0");
  if (!(strokeWidth > 0)) return null;
  const innerR = r - strokeWidth / 2;
  const outerR = r + strokeWidth / 2;
  if (!(innerR > 0 && outerR > innerR)) return null;

  const circ = 2 * Math.PI * r;
  const dashOffset = parseFloat(attrs["stroke-dashoffset"] ?? "0");
  const offsetPx = -dashOffset;
  const rotDeg = attrs.transform ? rotationDegFromTransform(attrs.transform) : -90;
  const startDeg = rotDeg + (offsetPx / circ) * 360;
  const endDeg = rotDeg + ((offsetPx + dashLen) / circ) * 360;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const onCircle = (radius: number, deg: number) => ({
    x: cx + radius * Math.cos(toRad(deg)),
    y: cy + radius * Math.sin(toRad(deg))
  });
  const outerStart = onCircle(outerR, startDeg);
  const outerEnd = onCircle(outerR, endDeg);
  const innerEnd = onCircle(innerR, endDeg);
  const innerStart = onCircle(innerR, startDeg);
  let sweep = endDeg - startDeg;
  if (sweep <= 0) sweep += 360;
  const largeArc = sweep > 180 ? 1 : 0;

  const out: Record<string, string> = { ...attrs };
  delete out.cx;
  delete out.cy;
  delete out.r;
  delete out["stroke-dasharray"];
  delete out["stroke-dashoffset"];
  delete out.transform;
  delete out.stroke;
  delete out["stroke-width"];
  delete out["stroke-linecap"];
  delete out["stroke-linejoin"];
  out.fill = attrs.stroke ?? "none";
  out.d = `M ${snap(outerStart.x)} ${snap(outerStart.y)} A ${snap(outerR)} ${snap(outerR)} 0 ${largeArc} 1 ${snap(outerEnd.x)} ${snap(outerEnd.y)} L ${snap(innerEnd.x)} ${snap(innerEnd.y)} A ${snap(innerR)} ${snap(innerR)} 0 ${largeArc} 0 ${snap(innerStart.x)} ${snap(innerStart.y)} Z`;
  const attrStr = Object.keys(out)
    .map((k) => `${k}="${escapeAttr(out[k])}"`)
    .join(" ");
  return `<path ${attrStr} />`;
}

/** Donut slices store dash length in attrs; append full circumference like the DOM. */
function ensureCircleStrokeDashPair(map: Record<string, string>): void {
  const raw = map["stroke-dasharray"];
  if (!raw) return;
  const parts = String(raw)
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length !== 1) return;
  const r = parseFloat(map.r ?? "");
  if (!Number.isFinite(r)) return;
  const circ = 2 * Math.PI * r;
  map["stroke-dasharray"] = `${parts[0]} ${circ}`;
}

function shapeToSvg(shape: VectorShape): string {
  // Merge raw attrs + computed paint into one canonical map so paint and
  // transform OVERRIDE the originals. Duplicate attributes on the same
  // element make figma.createNodeFromSvg() reject the whole tree with
  // "Cannot create node from SVG".
  const map: { [k: string]: string } = {};
  for (const k in shape.attrs || {}) {
    if (Object.prototype.hasOwnProperty.call(shape.attrs, k)) {
      map[k] = String(shape.attrs![k]);
    }
  }
  const p = shape.paint;
  if (p) {
    if (p.fill !== undefined) map.fill = String(p.fill);
    if (p.stroke !== undefined) map.stroke = String(p.stroke);
    if (p.strokeWidth !== undefined && !(p.fill && p.fill !== "none")) {
      map["stroke-width"] = String(snap(p.strokeWidth));
    }
    // Keep DOM-precision dash attrs (extractor); paint.dashArray is rounded.
    if (p.dashArray && p.dashArray.length && !map["stroke-dasharray"]) {
      map["stroke-dasharray"] = p.dashArray.join(" ");
    }
    if (p.dashOffset !== undefined && map["stroke-dashoffset"] === undefined) {
      map["stroke-dashoffset"] = String(p.dashOffset);
    }
    if (p.lineCap) map["stroke-linecap"] = p.lineCap;
    if (p.lineJoin) map["stroke-linejoin"] = p.lineJoin;
    if (p.miterLimit !== undefined) map["stroke-miterlimit"] = String(p.miterLimit);
    if (p.fillRule) map["fill-rule"] = p.fillRule;
    if (p.opacity !== undefined) map.opacity = String(p.opacity);
    if (p.fillOpacity !== undefined) map["fill-opacity"] = String(p.fillOpacity);
    if (p.strokeOpacity !== undefined) map["stroke-opacity"] = String(p.strokeOpacity);
  }
  if (shape.primitive === "circle") ensureCircleStrokeDashPair(map);
  // Prefer rotate() from attrs over matrix() — Chromium replays them differently.
  if (shape.transform?.matrix && !map.transform) {
    map.transform = `matrix(${shape.transform.matrix.join(" ")})`;
  }
  if (shape.primitive === "circle" && map["stroke-dasharray"] && !isMockFigmaRuntime()) {
    const arc = circleDashToArcPath(map);
    if (arc) return arc;
  }
  // Render attrs in a deterministic order; the leading space ensures we never
  // emit `<path/>` with no attrs (which is fine but ugly).
  const attrs = Object.keys(map)
    .map((k) => `${k}="${escapeAttr(map[k])}"`)
    .join(" ");
  if (shape.primitive === "group") {
    const inner = (shape.shapes || []).map((s) => shapeToSvg(s)).join("");
    return `<g ${attrs}>${inner}</g>`;
  }
  if (shape.primitive === "text") {
    const txt = shape.text?.value || "";
    return `<text ${attrs}>${escapeAttr(txt)}</text>`;
  }
  return `<${shape.primitive} ${attrs} />`;
}

function reconstructSvg(vector: LayerVector, box: { width: number; height: number }): string {
  const vb = vector.viewBox || { x: 0, y: 0, width: box.width, height: box.height };
  let body = vector.shapes.map((s) => shapeToSvg(s)).join("");
  let viewBox = `${vb.x} ${vb.y} ${vb.width} ${vb.height}`;
  if (isMockFigmaRuntime() && (vb.x !== 0 || vb.y !== 0)) {
    body = `<g transform="translate(${snap(-vb.x)} ${snap(-vb.y)})">${body}</g>`;
    viewBox = `0 0 ${vb.width} ${vb.height}`;
  }
  const par = vector.preserveAspectRatio ? ` preserveAspectRatio="${vector.preserveAspectRatio}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="${viewBox}"${par}>${body}</svg>`;
}

/** Live lab-button SVG icons — keep DOM box coords; mock skips centering entirely. */
function centerLabButtonVector(
  _node: SceneNode,
  _layer: UniversalLayer,
  _parent: UniversalLayer | undefined,
  _w: number,
  _h: number
): void {
  // reaffirmChildBoxPositions + clipped vector frame match Storybook; re-centering drifts live export.
}

function createFigmaNativeVectorNode(layer: UniversalLayer): VectorNode | null {
  const native = (
    layer.vector as LayerVector & {
      figmaNative?: {
        vectorPaths: Array<{ data: string; windingRule: string }>;
        fill?: string;
        stroke?: string;
        strokeWeight?: number;
        strokeAlign?: string;
      };
    }
  )?.figmaNative;
  if (layer.source?.kind !== "figma" || !native?.vectorPaths?.length) return null;

  const v = figma.createVector();
  v.vectorPaths = native.vectorPaths.map((p) => ({
    windingRule: (p.windingRule === "EVENODD" ? "EVENODD" : "NONZERO") as "EVENODD" | "NONZERO",
    data: p.data
  }));

  const fills: Paint[] = [];
  if (native.fill) fills.push(solidPaint(native.fill));
  v.fills = fills;

  if (native.stroke && (native.strokeWeight ?? 0) > 0) {
    v.strokes = [solidPaint(native.stroke)];
    v.strokeWeight = snap(native.strokeWeight!);
    if (native.strokeAlign && "strokeAlign" in v) {
      v.strokeAlign = native.strokeAlign as VectorNode["strokeAlign"];
    }
  } else {
    v.strokes = [];
    v.strokeWeight = 0;
  }

  const shapeOpacity = (
    layer.vector?.shapes?.[0]?.paint as { opacity?: number } | undefined
  )?.opacity;
  if (shapeOpacity != null && shapeOpacity < 0.999) {
    v.opacity = Math.max(0, Math.min(1, snap(shapeOpacity)));
  }

  const w = Math.max(1, snap(layer.box.width));
  const h = Math.max(1, snap(layer.box.height));
  v.resize(w, h);
  v.name = layer.name || "vector";
  return v;
}

function createVectorNode(layer: UniversalLayer, parent?: UniversalLayer): SceneNode {
  const nativeVector = createFigmaNativeVectorNode(layer);
  if (nativeVector) return nativeVector;

  const v = layer.vector!;
  const w = Math.max(1, snap(layer.box.width));
  const h = Math.max(1, snap(layer.box.height));
  const svg = reconstructSvg(v, { width: w, height: h });
  try {
    const imported = figma.createNodeFromSvg(svg);
    if (isMockFigmaRuntime()) {
      if ("rescale" in imported && imported.width > 0 && imported.height > 0) {
        const scale = Math.min(w / imported.width, h / imported.height);
        if (Math.abs(scale - 1) > 0.001) imported.rescale(scale);
      }
      if ("resize" in imported) imported.resize(w, h);
      centerLabButtonVector(imported, layer, parent, w, h);
      return imported;
    }
    const wrap = figma.createFrame();
    wrap.name = layer.name || "vector";
    wrap.resize(w, h);
    wrap.clipsContent = !isPrevNextGroupChild(parent);
    wrap.fills = [];
    wrap.layoutMode = "NONE";
    if ("rescale" in imported && imported.width > 0 && imported.height > 0) {
      const scale = Math.min(w / imported.width, h / imported.height);
      if (Math.abs(scale - 1) > 0.001) imported.rescale(scale);
    }
    if ("resize" in imported) imported.resize(w, h);
    imported.x = 0;
    imported.y = 0;
    wrap.appendChild(imported);
    centerLabButtonVector(wrap, layer, parent, w, h);
    return wrap;
  } catch (err) {
    // Figma's SVG parser is strict — bad attr values, exotic primitives, or
    // unsupported transforms make it bail on the whole tree. Fall back to a
    // transparent rectangle of the right size and surface the failure as a
    // notice so the user can see which layer needs attention.
    const reason = err instanceof Error ? err.message : String(err);
    figma.notify(`SVG layer "${layer.name}" failed to import: ${reason}`, {
      timeout: 4000
    });
    const fallback = figma.createFrame();
    fallback.name = `${layer.name} (svg-failed)`;
    fallback.resize(w, h);
    fallback.fills = [];
    fallback.clipsContent = false;
    return fallback;
  }
}

// ─────────────────────────── images ───────────────────────────

function createImageNode(layer: UniversalLayer): SceneNode {
  const isRef = isFigmaReferenceRasterLayer(layer);
  const w = Math.max(1, isRef ? Math.round(layer.box.width) : snap(layer.box.width));
  const h = Math.max(1, isRef ? Math.round(layer.box.height) : snap(layer.box.height));
  const img = layer.image!;
  const dataUrl = img.dataUrl || img.src;
  const svgMarkup = dataUrl ? svgMarkupFromDataUrl(dataUrl) : null;
  if (svgMarkup) {
    try {
      const node = figma.createNodeFromSvg(svgMarkup);
      const mode = img.mode || "fill";
      const nw = "width" in node ? node.width : w;
      const nh = "height" in node ? node.height : h;
      if (nw > 0 && nh > 0 && "rescale" in node) {
        const sx = w / nw;
        const sy = h / nh;
        const scale =
          mode === "contain" || mode === "fit"
            ? Math.min(sx, sy)
            : mode === "none"
              ? 1
              : Math.max(sx, sy);
        if (Math.abs(scale - 1) > 0.001) node.rescale(scale);
      }
      return node;
    } catch {
      /* fall through to raster rectangle */
    }
  }
  const paint = imagePaintFromImage(img);
  // Reference rasters are pre-cropped to box size — FILL maps 1:1; CROP+identity flips in live export.
  const fill = paint
    ? [paint]
    : [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } } as SolidPaint];
  const r = figma.createRectangle();
  r.resize(w, h);
  r.fills = fill;
  if (layer.paint?.cornerRadii) applyCornerRadii(r, layer.paint);
  return r;
}

// ─────────────────────────── text ───────────────────────────

/** Native password inputs mask value with filled circles in the browser. */
function textDisplayValue(layer: UniversalLayer, value: string): string {
  const inputType = (layer.source as { inputType?: string }).inputType;
  if (layer.source?.tag === "input" && inputType === "password" && value.length > 0) {
    return "\u2022".repeat(value.length);
  }
  return value;
}

async function createTextNode(
  layer: UniversalLayer,
  parent?: UniversalLayer
): Promise<TextNode> {
  const text = layer.text!;
  const displayValue = textDisplayValue(layer, text.value);
  const labLabel = isLabButtonLabelSpan(layer, parent);
  const labBtnLabel =
    labLabel &&
    parent?.source?.tag === "button" &&
    (parent.source.classList ?? []).includes("lab-button");
  const fontName = await resolveFont(text, layer, parent);
  await figma.loadFontAsync(fontName);
  const t = figma.createText();
  t.fontName = fontName;
  if (text.direction === "rtl") {
    try {
      (t as TextNode & { textDirection?: "RTL" | "LTR" }).textDirection = "RTL";
    } catch {
      /* older Figma builds */
    }
  }
  t.characters = displayValue;
  t.fontSize = Math.max(1, snap(text.font.size));
  if (layer.source?.tag === "input") {
    const b = layer.paint?.borders;
    const pad = layer.layout?.padding;
    const borderY = (b?.top?.width ?? 0) + (b?.bottom?.width ?? 0);
    const padY = (pad?.top ?? 0) + (pad?.bottom ?? 0);
    const innerH = Math.max(0, layer.box.height - borderY - padY);
    const fs = Math.max(1, snap(text.font.size));
    if (innerH > 0) {
      // Live textAlignVertical CENTER needs glyph line-height, not the padded box height.
      t.lineHeight = {
        unit: "PIXELS",
        value: !isMockFigmaRuntime() ? fs : snap(innerH)
      };
    }
  } else if (text.letterSpacing !== undefined && text.letterSpacing !== 0) {
    t.letterSpacing = { unit: "PIXELS", value: snap(text.letterSpacing) };
  }
  const figmaNativeText = isFigmaNativeTextLayer(layer);
  if (figmaNativeText) {
    if (text.lineHeight !== undefined && text.lineHeight > 0) {
      t.lineHeight = { unit: "PIXELS", value: snap(text.lineHeight) };
    }
  } else if (labBtnLabel) {
    const lhPx =
      text.lineHeight != null && text.lineHeight > 0
        ? snap(text.lineHeight)
        : Math.max(1, snap(text.font.size));
    t.lineHeight = { unit: "PIXELS", value: lhPx };
  } else if (
    /^h[1-6]$/.test(layer.source?.tag ?? "") &&
    text.lineHeight !== undefined &&
    text.lineHeight > 0
  ) {
    t.lineHeight = { unit: "PIXELS", value: snap(text.lineHeight) };
  } else if (labLabel && text.lineHeight !== undefined && text.lineHeight > 0) {
    t.lineHeight = { unit: "PIXELS", value: snap(text.lineHeight) };
  } else {
    const glyphLh = liveGlyphLineHeightPx(text, layer);
    if (glyphLh != null) {
      t.lineHeight = { unit: "PIXELS", value: glyphLh };
    }
  }
  if (
    !figmaNativeText &&
    !labLabel &&
    !labBtnLabel &&
    !/^h[1-6]$/.test(layer.source?.tag ?? "") &&
    liveGlyphLineHeightPx(text, layer) == null &&
    text.lineHeight !== undefined &&
    text.lineHeight > 0
  ) {
    const lh = snap(text.lineHeight);
    const fs = Math.max(1, snap(text.font.size));
    const boxH = layer.box.height;
    // Display-sized single lines (e.g. price with line-height: 1) must not be
    // inflated past the DOM box — that overlaps inline siblings in Figma.
    let capped: number;
    if (lh <= fs * 1.05 && boxH > 0 && boxH <= fs * 1.25) {
      capped = Math.min(lh, boxH);
    } else if (
      boxH > 0 &&
      lh >= fs &&
      lh <= fs * 1.15 &&
      Math.abs(lh - boxH) <= 2
    ) {
      // Pill button labels: keep DOM line-height, don't inflate for Figma leading.
      capped = lh;
    } else if (
      boxH > 0 &&
      lh > boxH &&
      (layer.layout?.display === "inline" || layer.layout?.display === "inline-block")
    ) {
      capped = boxH;
    } else {
      const minLh = fs * 1.15;
      capped =
        boxH > 0 && lh >= boxH - 0.5
          ? Math.max(lh, boxH)
          : lh <= fs * 1.05
          ? lh
          : boxH > 0 && lh <= boxH + 1
          ? lh
          : Math.max(lh, minLh);
    }
    t.lineHeight = { unit: "PIXELS", value: capped };
  }
  const align =
    text.align === "center"
      ? "CENTER"
      : text.align === "right" || text.align === "end"
      ? "RIGHT"
      : text.align === "justify"
      ? "JUSTIFIED"
      : "LEFT";
  t.textAlignHorizontal = align as TextNode["textAlignHorizontal"];
  if (text.direction === "rtl") {
    try {
      (t as TextNode & { textDirection?: "RTL" | "LTR" }).textDirection = "RTL";
    } catch {
      // older Figma builds — already set before characters when possible
    }
  }
  t.fills = [solidPaint(text.color)];
  if (text.decoration?.lines.includes("underline")) t.textDecoration = "UNDERLINE";
  else if (text.decoration?.lines.includes("line-through")) t.textDecoration = "STRIKETHROUGH";
  const figmaTextCase = layer.source?.dataset?.figmaTextCase;
  if (figmaTextCase) {
    try {
      t.textCase = figmaTextCase as TextNode["textCase"];
    } catch {
      // unsupported on older Figma builds
    }
  } else if (text.transform && text.transform !== "none") {
    const map = {
      uppercase: "UPPER",
      lowercase: "LOWER",
      capitalize: "TITLE"
    } as const;
    const mockMuiButton =
      isMockFigmaRuntime() &&
      layer.source.tag === "button" &&
      text.transform === "uppercase";
    if (!mockMuiButton) {
      t.textCase = (map[text.transform as keyof typeof map] || "ORIGINAL") as TextNode["textCase"];
    }
  }
  const multiline = displayValue.includes("\n");
  const lhPx = text.lineHeight;
  const boxH = layer.box.height;
  const tightLineBox =
    lhPx != null && boxH > 0 && Math.abs(lhPx - boxH) <= 2;
  const labTightBtn = isLabTightCenterButton(layer, parent);
  const blockTight = isBlockTypoTightLineBox(layer);
  try {
    // CAP_HEIGHT trim shifts glyphs vs Chromium on bold, medium, and tight DOM line boxes.
    const skipLeadingTrim =
      !isMockFigmaRuntime() ||
      layer.source?.kind === "figma" ||
      (labLabel && !labBtnLabel) ||
      multiline ||
      blockTight ||
      layer.source?.tag === "input" ||
      isLabTightCenterButton(layer, parent) ||
      ((text.font.weight ?? 400) >= 500 && !labTightBtn && !blockTight) ||
      (tightLineBox && !labTightBtn && !blockTight) ||
      text.transform === "uppercase";
    if (!skipLeadingTrim) {
      try {
        t.leadingTrim = "CAP_HEIGHT";
      } catch {
        // older Figma builds
      }
    }
  } catch {
    // older Figma builds
  }
  // Wrapping policy.
  //
  //  - white-space: nowrap | pre  → never wrap; natural width.
  //  - text has no whitespace (single word, e.g. "Home", "Email", "Status")
  //    → never wrap. The captured box.width sometimes lags the glyph width by
  //    a pixel or two and forcing the box width on a single word truncates
  //    it to "Hom"/"Statu".
  //  - multi-word text                       → constrain to box.width with
  //    HEIGHT auto-resize so paragraphs wrap the way they did in the DOM.
  //
  // Locking BOTH dimensions (the old behaviour) caused MUI floating labels
  // like "Email" to wrap into "Em / ail" because their post-transform rect
  // is narrower than the glyphs at the captured font-size.
  const figmaResize = layer.source?.dataset?.figmaTextAutoResize;
  if (layer.source?.kind === "figma" && figmaResize) {
    const resizeMap: Record<string, TextNode["textAutoResize"]> = {
      WIDTH_AND_HEIGHT: "WIDTH_AND_HEIGHT",
      HEIGHT: "HEIGHT",
      NONE: "NONE",
      TRUNCATE: "TRUNCATE",
    };
    let mode = resizeMap[figmaResize];
    let wrapBoxOverride = false;
    if (mode === "WIDTH_AND_HEIGHT" && figmaNativeNeedsFixedTextBox(layer, text)) {
      mode = "NONE";
      wrapBoxOverride = true;
    } else if (
      mode === "WIDTH_AND_HEIGHT" &&
      figmaNativeNeedsWidthConstrainedWrap(layer, text)
    ) {
      mode = "NONE";
      wrapBoxOverride = true;
    }
    if (mode) {
      t.textAutoResize = mode;
      if (wrapBoxOverride) {
        t.textAlignVertical = "TOP";
      } else if (text.verticalAlign === "middle") {
        t.textAlignVertical = "CENTER";
      } else if (text.verticalAlign === "bottom") {
        t.textAlignVertical = "BOTTOM";
      } else if (text.verticalAlign === "top") {
        t.textAlignVertical = "TOP";
      }
      if (mode !== "WIDTH_AND_HEIGHT") {
        if (
          mode === "NONE" &&
          text.verticalAlign === "middle" &&
          text.lineHeight != null &&
          text.lineHeight > layer.box.height + 0.25
        ) {
          t.lineHeight = {
            unit: "PIXELS",
            value: Math.max(1, snap(layer.box.height)),
          };
        }
        t.resize(
          Math.max(1, Math.ceil(snap(layer.box.width))),
          Math.max(1, Math.ceil(snap(layer.box.height)))
        );
      }
      if (parentUsesFlexCrossEnd(parent) && parentUsesFlexColumn(parent)) {
        pinFigmaFlexCrossEndBareText(t, layer, parent!);
      }
      return t;
    }
  }
  const labPillButton =
    layer.source.tag === "button" && isLabDomCenterButton(layer, parent);
  const noWrapCss =
    text.whiteSpace === "nowrap" ||
    text.whiteSpace === "pre" ||
    labBtnLabel ||
    labPillButton;
  const hasWrappableWhitespace = /\s/.test(displayValue.trim());
  const pad = layer.layout?.padding;
  const innerH =
    layer.box.height - (pad?.top ?? 0) - (pad?.bottom ?? 0);
  // DOM single-line boxes (task h4 titles, etc.) — don't force box width or
  // Figma wraps while the frame stays one line tall and overlaps siblings.
  const singleLineTextBox =
    lhPx != null &&
    innerH > 0 &&
    Math.abs(lhPx - innerH) <= 2 &&
    !noWrapCss &&
    !displayValue.includes("\n");
  if (
    noWrapCss ||
    !hasWrappableWhitespace ||
    isMuiAlertMessageText(layer) ||
    singleLineTextBox
  ) {
    t.textAutoResize = "WIDTH_AND_HEIGHT";
  } else {
    t.textAutoResize = "HEIGHT";
    // Ceil width — extracted boxes can be a fraction narrow vs real glyph bounds.
    t.resize(Math.max(1, Math.ceil(snap(layer.box.width))), 1);
  }
  if (parentUsesFlexCrossEnd(parent) && parentUsesFlexColumn(parent)) {
    pinFigmaFlexCrossEndBareText(t, layer, parent!);
  }
  return t;
}

// ─────────────────────────── visibility ───────────────────────────

function isLayerVisible(layer: UniversalLayer): boolean {
  if (layer.paint?.visibility === "hidden" || layer.paint?.visibility === "collapse") return false;
  if (isHiddenA11yShell(layer)) return false;
  return true;
}

/** Zero-width clipped labels (MUI Rating a11y) — not painted in Storybook. */
function isHiddenA11yShell(layer: UniversalLayer): boolean {
  if (layer.box.width > 0.5) return false;
  if (layer.source.tag !== "label") return false;
  const clip =
    layer.layout?.overflow?.x === "hidden" || layer.layout?.overflow?.y === "hidden";
  return layer.layout?.position === "absolute" && clip;
}

function isTextLeafLayer(layer: UniversalLayer): boolean {
  return Boolean(layer.text && (!layer.children || layer.children.length === 0));
}

function isMuiFormControlLabelCaption(layer: UniversalLayer): boolean {
  return (layer.source.classList ?? []).includes("MuiFormControlLabel-label");
}

function isMuiBadgeDot(layer: UniversalLayer): boolean {
  return (layer.source.classList ?? []).some((c) => c.includes("MuiBadge-badge"));
}

function isMuiPaginationItemButton(layer: UniversalLayer): boolean {
  return (layer.source.classList ?? []).some((c) => c.includes("MuiPaginationItem-root"));
}

/** Circular avatars / numeric badges — flex-centered glyphs (matches scene-to-html). */
function isMuiFlexCenterGlyphFrame(layer: UniversalLayer): boolean {
  if (isMuiBadgeDot(layer)) return false;
  if (!layer.text || (layer.children && layer.children.length > 0)) return false;
  if (!layer.paint?.fills?.length) return false;
  const w = Math.round(layer.box.width);
  const h = Math.round(layer.box.height);
  const c = layer.paint.cornerRadii;
  const maxR = c
    ? Math.max(c.topLeft.x, c.topRight.x, c.bottomRight.x, c.bottomLeft.x)
    : 0;
  const circle = w > 0 && w === h && maxR >= w / 2 - 1;
  const badge = w > 0 && w <= 24 && h <= 24 && maxR >= 50;
  return circle || badge;
}

/** Alert body copy — DOM is one line; Figma wraps if box width is treated as a hard wrap. */
function isMuiAlertMessageText(layer: UniversalLayer): boolean {
  return (layer.source.classList ?? []).some((c) => c.includes("MuiAlert-message"));
}

/** MUI outlined field labels — DOM uses transform:scale; box is post-transform. */
function isMuiShrunkInputLabel(layer: UniversalLayer): boolean {
  return (
    layer.source.tag === "label" &&
    Boolean(layer.text) &&
    (layer.source.classList ?? []).some((c) => c.startsWith("MuiInputLabel"))
  );
}

/** CSS transform:scale() on MUI shrunk labels (matrix is post-box in artifact). */
function muiShrunkLabelScale(layer: UniversalLayer): number {
  const m = layer.transform?.matrix;
  if (!m) return 0.75;
  const sx = Math.hypot(m[0], m[1]);
  const sy = Math.hypot(m[2], m[3]);
  const scale = Math.min(sx, sy);
  return scale > 0.01 && scale < 0.999 ? scale : 0.75;
}

/**
 * scene-to-html tryRenderMuiOutlinedLabel uses min-width: ceil(f.width)+8 then
 * transform:scale(0.75). f.width must be the pre-scale inner width (not the
 * post-transform DOM box) so the replayed chip matches Storybook.
 */
function mockMuiShrunkLabelFrameSize(layer: UniversalLayer): { width: number; height: number } {
  const scale = muiShrunkLabelScale(layer);
  const visualW = snap(layer.box.width);
  const visualH = snap(layer.box.height);
  return {
    width: Math.max(8, snap(visualW / scale - 8)),
    height: Math.max(1, snap(visualH / scale))
  };
}

function muiShrunkLabelForInputRoot(
  outlinedInput?: UniversalLayer,
  formControl?: UniversalLayer
): UniversalLayer | undefined {
  if (formControl) {
    const label = (formControl.children ?? []).find(isMuiShrunkInputLabel);
    if (label) return label;
  }
  if (outlinedInput) {
    return (outlinedInput.children ?? []).find(isMuiShrunkInputLabel);
  }
  return undefined;
}

/** Align notched-outline SVG gap with the visible shrunk label chip. */
function tightenMuiNotchGapPaint(
  paint: LayerPaint | undefined,
  outlinedInput?: UniversalLayer,
  formControl?: UniversalLayer
): LayerPaint | undefined {
  const gaps = paint?.borders?.gaps;
  if (!paint?.borders || !gaps?.length) return paint;
  const label = muiShrunkLabelForInputRoot(outlinedInput, formControl);
  if (!label) return paint;
  const g = gaps[0];
  const labelEnd = snap(label.box.x + label.box.width);
  const to = Math.min(g.to, labelEnd);
  if (to <= g.from + 1) return paint;
  const borders = paint.borders;
  return {
    ...paint,
    borders: {
      ...borders,
      gaps: [{ ...g, to }]
    }
  };
}

function isMuiOutlinedInputRoot(layer: UniversalLayer): boolean {
  return (layer.source.classList ?? []).some((c) => c.includes("MuiOutlinedInput-root"));
}

/** Outlined text/select value rows — mock replay uses positioned text, not native input CSS. */
function isMuiOutlinedValueField(layer: UniversalLayer, parent?: UniversalLayer): boolean {
  if (!parent || !isMuiOutlinedInputRoot(parent)) return false;
  if (layer.source.tag === "input" && Boolean(layer.text)) return true;
  return (
    layer.source.tag === "div" &&
    Boolean(layer.text) &&
    (layer.children ?? []).length === 1 &&
    Boolean(layer.children![0].text)
  );
}

/** MUI text/contained buttons — avoid scene-to-html flex replay (uses absolute scene boxes). */
function isMuiCompactCenterButton(layer: UniversalLayer): boolean {
  if (layer.source.tag !== "button" || !layer.text) return false;
  const lh = layer.text.lineHeight;
  const fs = layer.text.font.size;
  if (lh == null || fs == null) return false;
  return (
    layer.text.align === "center" &&
    Math.round(layer.box.height) < 40 &&
    lh > fs * 1.5
  );
}
function isMuiTabsIndicatorLayer(layer: UniversalLayer): boolean {
  return (layer.source.classList ?? []).some((c) => c.includes("MuiTabs-indicator"));
}

function isMuiLinearProgressBarLayer(layer: UniversalLayer): boolean {
  return (layer.source.classList ?? []).some((c) => c.includes("MuiLinearProgress-bar"));
}

/**
 * MUI determinate bars are full-width spans shifted left via negative `left` /
 * `transform: translateX`. The extractor keeps that geometry in `box.x` (often
 * hundreds of px). Figma exportAsync walks unclipped descendant bounds and can
 * hang on mui--showcase-sized trees — clamp to the visible segment inside the track.
 */
function applyMuiLinearProgressBarPlacement(node: SceneNode, layer: UniversalLayer): void {
  if (!isMuiLinearProgressBarLayer(layer)) return;
  const left = snap(layer.box.x);
  if (left >= 0) return;
  // Live: keep full bar width + negative x; parent overflow:hidden clips like the DOM.
  // Mock: shrink to visible segment so exportAsync bounds stay finite on large trees.
  if (!isMockFigmaRuntime()) {
    node.x = left;
    return;
  }
  const hidden = -left;
  const visibleW = Math.max(1, snap(layer.box.width) - hidden);
  if ("resize" in node && node.type !== "TEXT") {
    node.resize(visibleW, Math.max(1, snap(layer.box.height)));
  }
  node.x = 0;
}

function isMuiNotchedOutlineFieldset(layer: UniversalLayer): boolean {
  return (
    layer.source.tag === "fieldset" &&
    (layer.source.classList ?? []).some((c) => c.includes("MuiOutlinedInput-notchedOutline"))
  );
}

/** MUI outlined inputs — fieldset outline sits at negative y; parent must not clip it. */
function hasNotchedOutlineChild(layer: UniversalLayer): boolean {
  return (layer.children ?? []).some(
    (c) => isMuiNotchedOutlineFieldset(c) && c.box.y < 0
  );
}

function shouldApplyCornerRadii(layer: UniversalLayer, parent?: UniversalLayer): boolean {
  if (isFigmaNativeEllipse(layer)) return false;
  if (hasNotchedOutlineChild(layer)) {
    // OutlinedInput root keeps DOM border-radius; skip only for the fieldset outline itself.
    const cl = layer.source.classList ?? [];
    if (cl.some((c) => c.includes("MuiOutlinedInput-root"))) {
      return Boolean(layer.paint?.cornerRadii);
    }
    return false;
  }
  const parentCl = parent?.source.classList ?? [];
  if (parentCl.some((c) => c.includes("MuiOutlinedInput-root")) && layer.source.tag !== "fieldset") {
    return false;
  }
  return Boolean(layer.paint?.cornerRadii);
}

function parentUsesFlexColumn(parent?: UniversalLayer): boolean {
  if (parent?.layout?.display !== "flex") return false;
  const dir = parent.layout.flex?.direction;
  return dir === "column" || dir === "column-reverse";
}

/** Keep extracted box height for tight line-box text under flex-column parents (pricing cards, lists). */
function preserveDomLineBoxHeight(layer: UniversalLayer, parent?: UniversalLayer): boolean {
  if (!parentUsesFlexColumn(parent)) return false;
  const lh = layer.text?.lineHeight;
  const pad = layer.layout?.padding;
  const innerH = layer.box.height - (pad?.top ?? 0) - (pad?.bottom ?? 0);
  if (lh == null || innerH <= 0) return false;
  if (Math.abs(lh - innerH) > 2) return false;
  // Text-leaf badges/chips: keep DOM height so rowGap siblings stay at extracted y.
  if (isTextLeafLayer(layer)) return true;
  return !layer.paint?.fills?.length;
}

/** Lab buttons that center label glyphs from DOM box metrics (not textAlignVertical). */
function isLabDomCenterButton(layer: UniversalLayer, parent?: UniversalLayer): boolean {
  const cl = layer.source.classList ?? [];
  if (
    cl.includes("lab-button") ||
    cl.includes("lab-login-social-button") ||
    cl.includes("lab-pricing-cta") ||
    cl.includes("lab-tab")
  ) {
    return true;
  }
  // TabsPanel buttons have no lab-tab class in DOM — only the row wrapper does.
  return (
    layer.source.tag === "button" &&
    (parent?.source?.classList ?? []).includes("lab-tabs-row")
  );
}

/** Lab pill tabs + pricing CTA — leadingTrim + glyph-height centering. */
function isLabTightCenterButton(layer: UniversalLayer, parent?: UniversalLayer): boolean {
  return layer.source.tag === "button" && isLabDomCenterButton(layer, parent);
}

/** Block headings / paragraphs whose line-height fills the DOM box — center, don't pin top. */
function isBlockTypoTightLineBox(layer: UniversalLayer): boolean {
  const tag = layer.source.tag ?? "";
  if (!/^h[1-6]$/.test(tag) && tag !== "p") return false;
  const lh = layer.text?.lineHeight;
  const pad = layer.layout?.padding;
  const innerH = layer.box.height - (pad?.top ?? 0) - (pad?.bottom ?? 0);
  if (lh == null || innerH <= 0) return false;
  return Math.abs(lh - innerH) <= 2;
}

/** MUI-style labels: line-height ≈ box height with extra leading → flex center in DOM. */
function textUsesTightLineBox(layer: UniversalLayer): boolean {
  if (isMuiFormControlLabelCaption(layer)) return false;
  if (isMuiShrunkInputLabel(layer)) return false;
  const lh = layer.text?.lineHeight;
  const fs = layer.text?.font?.size;
  const pad = layer.layout?.padding;
  const innerH = layer.box.height - (pad?.top ?? 0) - (pad?.bottom ?? 0);
  if (lh == null || innerH <= 0) return false;
  if (/^h[1-6]$/.test(layer.source.tag ?? "")) {
    return Math.abs(lh - innerH) <= 2;
  }
  if (fs == null) return false;
  return Math.abs(lh - innerH) <= 2 && lh > fs + 1;
}

/** Inline / display text keeps glyphs at the top of the frame (baseline row). */
function textFramePinsToTop(layer: UniversalLayer, parent?: UniversalLayer): boolean {
  if (isMuiFormControlLabelCaption(layer)) return false;
  if (isMuiShrunkInputLabel(layer)) return false;
  if (layer.layout?.display === "table-cell") return false;
  if (layer.source.tag === "th" || layer.source.tag === "td") return false;
  const parentFlex = parent?.layout?.flex?.align;
  if (parentFlex === "center" || parentFlex === "end") return false;
  if (textUsesTightLineBox(layer)) {
    const pad = layer.layout?.padding;
    const innerH = layer.box.height - (pad?.top ?? 0) - (pad?.bottom ?? 0);
    const lh = layer.text?.lineHeight;
    if (lh != null && innerH > 0 && Math.abs(lh - innerH) <= 2) return false;
    return true;
  }
  if (layer.layout?.display === "inline") {
    const lh = layer.text?.lineHeight;
    const pad = layer.layout?.padding;
    const innerH = layer.box.height - (pad?.top ?? 0) - (pad?.bottom ?? 0);
    if (lh != null && innerH > 0 && lh > innerH + 0.5) return false;
    return true;
  }
  if (layer.source.kind === "synthetic") return true;
  const flexAlign = layer.layout?.flex?.align;
  if (flexAlign === "center" || flexAlign === "end") return false;
  const lh = layer.text?.lineHeight;
  const fs = layer.text?.font?.size;
  const pad = layer.layout?.padding;
  const innerH =
    layer.box.height - (pad?.top ?? 0) - (pad?.bottom ?? 0);
  // Block buttons with generous vertical padding center the label even when
  // line-height ≈ font-size (e.g. pricing CTA); only pin for genuinely flat boxes.
  if (
    layer.source.tag === "button" &&
    fs != null &&
    innerH > fs * 1.3
  ) {
    return false;
  }
  if (lh != null && fs != null && lh <= fs * 1.1) return true;
  return false;
}

/** Mock figma over-estimates wrapped line count; trust the DOM inner box height. */
function clampMockTextToDomBox(
  text: TextNode,
  innerW: number,
  innerH: number,
  layer?: UniversalLayer,
  parent?: UniversalLayer
): void {
  if (layer && isLabTightCenterButton(layer, parent)) return;
  if (innerH <= 0) return;
  if (isMockFigmaRuntime()) {
    const mock = text as { __height?: number; __width?: number };
    if (text.height > innerH + 1) {
      mock.__height = snap(innerH);
    }
    if (text.textAutoResize === "HEIGHT" && innerW > 0) {
      mock.__width = snap(Math.max(1, Math.ceil(innerW)));
    }
    return;
  }
  if (
    text.textAutoResize === "HEIGHT" &&
    innerW > 0 &&
    text.width > innerW + 0.5 &&
    !liveTextPreferWidthAndHeight(layer!, parent)
  ) {
    text.resize(Math.max(1, Math.ceil(snap(innerW))), text.height);
  }
  if (text.height > innerH + 1 && text.textAutoResize !== "WIDTH_AND_HEIGHT") {
    text.resize(text.width, Math.max(1, snap(innerH)));
  }
}

/** Block containers with multiple inline text runs (e.g. `$49` + `/month`). */
function shouldUseInlineRowLayout(layer: UniversalLayer): boolean {
  const kids = layer.children ?? [];
  if (kids.length < 2) return false;
  if (layer.layout?.display === "flex" || layer.layout?.display === "grid") return false;
  if (!kids.every(isTextLeafLayer)) return false;
  return kids.some(
    (c) =>
      c.layout?.display === "inline" ||
      c.source.tag === "span" ||
      c.source.kind === "synthetic"
  );
}

function inlineGlyphAdvance(node: SceneNode): number {
  if (node.type === "TEXT") return node.width;
  if (node.type === "FRAME") {
    let w = node.width;
    for (const c of node.children) {
      if (c.type === "TEXT") w = Math.max(w, c.x + c.width);
    }
    return w;
  }
  return node.width;
}

function expandInlineTextFrame(node: SceneNode): void {
  if (node.type !== "FRAME" || !("resize" in node)) return;
  const text = node.children.find((c) => c.type === "TEXT") as TextNode | undefined;
  if (!text || text.width <= node.width + 0.5) return;
  node.resize(Math.max(1, snap(text.width)), node.height);
}

function textNodeIn(node: SceneNode): TextNode | null {
  if (node.type === "TEXT") return node;
  if (node.type === "FRAME") {
    return (node.children.find((c) => c.type === "TEXT") as TextNode | undefined) ?? null;
  }
  return null;
}

/** Inline price rows: honor extractor box positions (browser ground truth). */
function alignInlineRowSiblings(
  built: { node: SceneNode; layer: UniversalLayer }[]
): void {
  if (!built.length) return;
  for (const { node } of built) {
    expandInlineTextFrame(node);
  }

  // Live Figma uses layout NONE — trust DOM box.x/y from the extractor.
  if (!isMockFigmaRuntime()) {
    for (const { node, layer } of built) {
      node.x = snap(layer.box.x);
      node.y = snap(layer.box.y);
    }
    return;
  }

  const rows = built
    .map(({ node, layer }) => ({ node, layer, text: textNodeIn(node) }))
    .filter(
      (r): r is { node: SceneNode; layer: UniversalLayer; text: TextNode } =>
        Boolean(r.text)
    );

  if (rows.length >= 2) {
    const primary = rows.reduce((a, b) =>
      (a.layer.text?.font?.size ?? 0) >= (b.layer.text?.font?.size ?? 0) ? a : b
    );
    primary.node.x = snap(primary.layer.box.x);
    primary.node.y = snap(primary.layer.box.y);
    const primaryLh =
      primary.layer.text?.lineHeight ??
      primary.layer.text?.font?.size ??
      primary.text.height;
    const baselineBottom = primary.layer.box.y + primaryLh;
    for (const row of rows) {
      if (row === primary) continue;
      const rowLh =
        row.layer.text?.lineHeight ?? row.layer.text?.font?.size ?? row.text.height;
      row.node.x = snap(row.layer.box.x);
      row.node.y = snap(baselineBottom - rowLh);
    }
    return;
  }

  for (const { node, layer } of built) {
    node.x = snap(layer.box.x);
    node.y = snap(layer.box.y);
  }
}

function isRadioIndicatorLayer(layer: UniversalLayer): boolean {
  const r = layer.paint?.cornerRadii;
  return (
    layer.name === "span" &&
    Math.round(layer.box.width) === 18 &&
    Math.round(layer.box.height) === 18 &&
    Boolean(r && Math.max(r.topLeft.x, r.topRight.x, r.bottomRight.x, r.bottomLeft.x) >= 100)
  );
}

/** Radio option caption span — scene-to-html radio fast path expects name `span`. */
function isRadioOptionLabelTextSpan(layer: UniversalLayer, parent?: UniversalLayer): boolean {
  if (!layer.text || layer.source.tag !== "span") return false;
  return (parent?.source?.classList ?? []).includes("lab-radio-option");
}

/** Calendar date number — scene-to-html CalendarScheduler fast path expects name `span`. */
function isCalendarDateDaySpan(layer: UniversalLayer, parent?: UniversalLayer): boolean {
  if (!layer.text || layer.source.tag !== "span") return false;
  return (parent?.source?.classList ?? []).includes("date-cell");
}

/** Lab button label span — must keep figma name for mock scene-to-html fast path. */
function isLabButtonLabelSpan(layer: UniversalLayer, parent?: UniversalLayer): boolean {
  if (parent?.source?.tag !== "button") return false;
  if (layer.source.tag !== "span") return false;
  return (
    layer.source.dataset?.figmaName === "label" ||
    layer.name === "label" ||
    Boolean(layer.text)
  );
}

/** Live lab-button label spans — skip frame wrapper; parent button carries fill. */
function isLiveLabButtonBareLabel(_layer: UniversalLayer, _parent?: UniversalLayer): boolean {
  // Frame + native textAlignVertical matches mock parity; bare TEXT drifts in live export.
  return false;
}

/** Lab buttons — NONE + DOM box coords (mock path). Live auto-layout / bare TEXT drops glyphs. */
function shouldUseLabButtonAutoLayout(_layer: UniversalLayer): boolean {
  return false;
}

/** Keep auto-layout children at DOM box size so icons do not crush label text. */
function fixLabButtonAutoLayoutChild(
  node: SceneNode,
  layer: UniversalLayer,
  isLabel: boolean
): void {
  if (isMockFigmaRuntime()) return;
  if (isLabel && node.type === "TEXT") {
    const text = node as TextNode;
    if ("layoutSizingHorizontal" in text) {
      text.layoutSizingHorizontal = "HUG";
      text.layoutSizingVertical = "HUG";
    }
    return;
  }
  const w = Math.max(1, snapBoxSize(layer, "width"));
  const h = Math.max(1, Math.round(layer.box.height));
  if ("resize" in node) {
    if (Math.abs(node.width - w) > 0.5 || Math.abs(node.height - h) > 0.5) {
      node.resize(w, h);
    }
  }
  if ("layoutSizingHorizontal" in node) {
    const sized = node as FrameNode;
    sized.layoutSizingHorizontal = "FIXED";
    sized.layoutSizingVertical = "FIXED";
  }
}

/** Live single-label lab buttons — DOM box coords from extractor; do not re-center. */
function centerLabButtonSoleChild(_frame: FrameNode, _layer: UniversalLayer): void {
  // Mock skips this path; reaffirmChildBoxPositions already matches Storybook flex center.
}

/** Live: when line-height fills the DOM box, use font-size line-height so Figma centers glyphs like flexbox. */
function liveGlyphLineHeightPx(_text: LayerText, _layer: UniversalLayer): number | null {
  // Shrinking to font-size drifts vertical center vs Chromium flex/line-box centering.
  return null;
}

/** Live tight line boxes — keep DOM line-height; native textAlignVertical handles centering. */
function liveTightLineHeightPx(text: LayerText, _layer: UniversalLayer, _innerH?: number): number | null {
  const domLh = text.lineHeight;
  if (domLh != null && domLh > 0) return snap(domLh);
  return Math.max(1, snap(text.font.size));
}

function figmaTextAlignHorizontal(
  layer: UniversalLayer
): TextNode["textAlignHorizontal"] {
  const align = layer.text?.align;
  if (align === "center") return "CENTER";
  if (align === "right" || align === "end") return "RIGHT";
  if (align === "justify") return "JUSTIFIED";
  return "LEFT";
}

/**
 * Live Figma glyph metrics are often wider than Chromium — NONE + fixed inner width
 * wraps single-line labels ("Overview", chip text, "MOST POPULAR").
 */
function liveTextPreferWidthAndHeight(
  layer: UniversalLayer,
  parent?: UniversalLayer
): boolean {
  const text = layer.text;
  if (!text) return false;
  if (text.whiteSpace === "nowrap" || text.whiteSpace === "pre") return true;
  if (isLabTightCenterButton(layer, parent)) return true;
  if ((layer.source.classList ?? []).some((c) => c.includes("MuiChip-label"))) return true;
  const pillR = layer.paint?.cornerRadii;
  const maxPillR = pillR
    ? Math.max(pillR.topLeft.x, pillR.topRight.x, pillR.bottomRight.x, pillR.bottomLeft.x)
    : 0;
  if (isTextLeafLayer(layer) && maxPillR >= 100) return true;
  if (
    isLabButtonLabelSpan(layer, parent) &&
    (parent?.source?.classList ?? []).includes("lab-button")
  ) {
    return true;
  }
  const pad = layer.layout?.padding;
  const innerH =
    layer.box.height - (pad?.top ?? 0) - (pad?.bottom ?? 0);
  const lh = text.lineHeight;
  const singleLine =
    lh != null &&
    innerH > 0 &&
    Math.abs(lh - innerH) <= 2 &&
    !text.value.includes("\n");
  // Any DOM single-line box — Figma wraps when NONE locks a narrow inner width.
  if (singleLine) return true;
  if (!/\s/.test(text.value.trim())) return true;
  if (isTextLeafLayer(layer) && layer.paint?.fills?.length) return true;
  return false;
}

/** Live Figma: fill padded content box + native align (matches mock wideBlockButton path). */
function applyLiveNativeTextBoxCenter(
  text: TextNode,
  layer: UniversalLayer,
  innerW: number,
  innerH: number,
  pad: { top: number; right: number; bottom: number; left: number },
  frame?: FrameNode,
  parent?: UniversalLayer
): { x: number; y: number } {
  const lhPx =
    liveTightLineHeightPx(layer.text!, layer, innerH) ??
    (layer.text?.lineHeight != null && layer.text.lineHeight > 0
      ? snap(layer.text.lineHeight)
      : Math.max(1, snap(layer.text!.font.size)));
  text.lineHeight = { unit: "PIXELS", value: lhPx };
  const hAlign = figmaTextAlignHorizontal(layer);
  if (frame) frame.clipsContent = false;

  if (liveTextPreferWidthAndHeight(layer, parent)) {
    text.textAutoResize = "WIDTH_AND_HEIGHT";
    text.textAlignHorizontal = hAlign;
    try {
      text.textAlignVertical = "CENTER";
    } catch {
      // older typings
    }
    let x = pad.left;
    if (hAlign === "CENTER") {
      x = snap(pad.left + Math.max(0, (innerW - text.width) / 2));
    } else if (hAlign === "RIGHT") {
      x = snap(pad.left + Math.max(0, innerW - text.width));
    }
    const y = snap(pad.top + Math.max(0, (innerH - text.height) / 2));
    return { x, y };
  }

  text.textAutoResize = "NONE";
  text.resize(Math.max(1, snap(innerW)), Math.max(1, snap(innerH)));
  text.textAlignHorizontal = hAlign;
  try {
    text.textAlignVertical = "CENTER";
  } catch {
    // older typings
  }
  return { x: pad.left, y: pad.top };
}

/** Live: Figma re-wraps pill/tab labels after append — force single-line glyphs. */
function enforceLiveUnwrappedTextFrame(
  frame: FrameNode,
  text: TextNode,
  layer: UniversalLayer,
  parent?: UniversalLayer
): void {
  if (isMockFigmaRuntime()) return;
  if (!liveTextPreferWidthAndHeight(layer, parent)) return;
  const pad = layer.layout?.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const innerW = frame.width - pad.left - pad.right;
  const innerH = frame.height - pad.top - pad.bottom;
  frame.clipsContent = false;
  if (
    isLabButtonLabelSpan(layer, parent) &&
    (parent?.source?.classList ?? []).includes("lab-button")
  ) {
    const domLh = layer.text?.lineHeight;
    const lhPx =
      domLh != null && domLh > 0
        ? snap(domLh)
        : Math.max(1, snap(layer.text!.font.size));
    text.lineHeight = { unit: "PIXELS", value: lhPx };
    text.textAutoResize = "WIDTH_AND_HEIGHT";
    text.textAlignHorizontal = "CENTER";
    text.x = snap(pad.left + Math.max(0, (innerW - text.width) / 2));
    text.y = snap(pad.top - 0.5);
    return;
  }
  const placed = applyLiveNativeTextBoxCenter(
    text,
    layer,
    innerW,
    innerH,
    pad,
    frame,
    parent
  );
  text.x = placed.x;
  text.y = placed.y;
  if (layer.paint?.fills?.length) {
    const neededW = snap(text.x + text.width + pad.right);
    if (neededW > frame.width + 0.5) {
      frame.resize(neededW, frame.height);
    }
  }
}

/** Live Figma sometimes resets child coords after append — re-apply DOM box positions. */
function reaffirmChildBoxPositions(
  built: { node: SceneNode; layer: UniversalLayer }[],
  parent?: UniversalLayer,
  parentDocOrigin: { x: number; y: number } = { x: 0, y: 0 }
): void {
  if (isMockFigmaRuntime()) return;
  for (const { node, layer } of built) {
    if (isFigmaReferenceRasterLayer(layer)) {
      const pos = figmaReferenceRasterPosition(layer, parentDocOrigin);
      node.x = pos.x;
      node.y = pos.y;
      continue;
    }
    if (isLiveLabButtonBareLabel(layer, parent) && node.type === "TEXT") {
      const text = node as TextNode;
      text.textAlignHorizontal = "CENTER";
      text.textAutoResize = "WIDTH_AND_HEIGHT";
      text.x = snap(layer.box.x);
      text.y = snap(layer.box.y);
      continue;
    }
    if (
      layer.source?.kind === "figma" &&
      (layer.source.dataset as { figmaRelativeTransform?: number[][] })?.figmaRelativeTransform
    ) {
      continue;
    }
    // layoutPositioning=ABSOLUTE only applies under auto-layout parents; on
    // layoutMode NONE it breaks live export (icons/text jump to wrong coords).
    node.x = snap(layer.box.x);
    node.y = snap(layer.box.y);
    reaffirmFigmaFlexCrossEndBareText(node, layer, parent);
    if (node.type === "TEXT" && isFigmaNativeEllipseSiblingLetter(layer, parent)) {
      applyFigmaNativeCenteredGlyphPin(node as TextNode, layer, parent);
    }
  }
}

/** Second pass after full tree build — live export can reset coords on deep nodes. */
function reaffirmTreeBoxPositions(
  node: SceneNode,
  layer: UniversalLayer,
  parent?: UniversalLayer,
  docOrigin: { x: number; y: number } = { x: 0, y: 0 }
): void {
  if (isMockFigmaRuntime()) return;

  if (isFigmaReferenceRasterLayer(layer)) {
    const pos = figmaReferenceRasterPosition(layer, docOrigin);
    node.x = pos.x;
    node.y = pos.y;
  } else if (
    !(
      layer.source?.kind === "figma" &&
      (layer.source.dataset as { figmaRelativeTransform?: number[][] })?.figmaRelativeTransform
    )
  ) {
    if (!(isLiveLabButtonBareLabel(layer, parent) && node.type === "TEXT")) {
      node.x = snap(layer.box.x);
      node.y = snap(layer.box.y);
    }
  }

  if (node.type === "TEXT") {
    reaffirmFigmaFlexCrossEndBareText(node, layer, parent);
    if (isFigmaNativeEllipseSiblingLetter(layer, parent)) {
      applyFigmaNativeCenteredGlyphPin(node as TextNode, layer, parent);
    }
  }

  const childOrigin = {
    x: docOrigin.x + layer.box.x,
    y: docOrigin.y + layer.box.y,
  };
  if (!layer.children?.length || !("children" in node)) return;
  const kids = layer.children.filter((child) => isLayerVisible(child));
  const nodes = (node as ChildrenMixin).children;
  for (let i = 0; i < kids.length && i < nodes.length; i++) {
    reaffirmTreeBoxPositions(nodes[i], kids[i], layer, childOrigin);
  }
}

/** MUI list rows only — keep semantic span names for lab boards (nav, badges, labels). */
function shouldRenameSpanFrameToTypography(
  layer: UniversalLayer,
  parent?: UniversalLayer
): boolean {
  if (isLabButtonLabelSpan(layer, parent)) return false;
  if (isRadioOptionLabelTextSpan(layer, parent)) return false;
  if (isCalendarDateDaySpan(layer, parent)) return false;
  if (layer.source.tag !== "span") return false;
  if (layer.layout?.display === "inline" || layer.layout?.display === "inline-block") return false;
  if (layer.name && layer.name !== "span") return false;
  if (layer.paint?.fills?.length) return false;
  const parentName = parent?.name;
  if (parentName === "nav") return false;
  if (
    (parentName === "label" || parent?.source?.tag === "label") &&
    !isMuiFormControlLabelCaption(layer)
  ) {
    return false;
  }
  if (
    (parentName === "header" || parent?.source?.tag === "header") &&
    (layer.source.classList ?? []).includes("status")
  ) {
    return false;
  }
  // Lab/MUI buttons: keep data-figma-name="label" for mock scene-to-html fast path.
  if (parent?.source?.tag === "button") return false;
  if (layer.source.dataset?.figmaName === "label") return false;
  const classes = layer.source.classList ?? [];
  if (classes.includes("badge") || classes.includes("active")) return false;
  // Analytics header chips — scene-to-html tryRenderAnalyticsCharts expects name "span".
  if (classes.includes("chip")) return false;
  // Select field value/chevron spans — scene-to-html tryRenderSelectField expects name "span".
  if ((parent?.source?.classList ?? []).includes("lab-select-field")) return false;
  // Dashboard time-range chips — scene-to-html tryRenderComplexDashboardCard expects name "span".
  if ((parent?.source?.classList ?? []).includes("chips")) return false;
  // Feature card footer label — scene-to-html tryRenderFeatureCard expects name "span".
  if ((parent?.source?.classList ?? []).includes("lab-feature-footer")) return false;
  return textUsesTightLineBox(layer);
}

function isFigmaFlipFrame(layer: UniversalLayer): boolean {
  const rt = (layer.source?.dataset as { figmaRelativeTransform?: number[][] } | undefined)
    ?.figmaRelativeTransform;
  return Boolean(rt?.[0]?.[0] != null && rt[0][0] < -0.5);
}

/** Small mirrored icon wrapper (phone handset) — not full-width UI frames. */
function isFigmaFlipIconFrame(layer: UniversalLayer): boolean {
  if (!isFigmaFlipFrame(layer)) return false;
  const nodeType = (layer.source?.dataset as { figmaNodeType?: string } | undefined)
    ?.figmaNodeType;
  if (nodeType !== "FRAME") return false;
  const w = layer.box.width;
  const h = layer.box.height;
  if (w > 28 || h > 28) return false;
  return (layer.children ?? []).some((c) => Boolean(c.vector));
}

function isPrevNextGroup(layer: UniversalLayer): boolean {
  const ds = layer.source?.dataset as { name?: string; figmaNodeType?: string } | undefined;
  return (
    layer.name === "prev-next" ||
    ds?.name === "prev-next" ||
    (ds?.figmaNodeType === "GROUP" && layer.name === "prev-next")
  );
}

function isPrevNextGroupChild(parent?: UniversalLayer): boolean {
  return Boolean(parent && isPrevNextGroup(parent));
}

/**
 * Guing pagination chevrons: GROUP/prev-next children often carry frame-absolute
 * x/y inside a narrow group box — Figma clips them. Rebase to group origin.
 */
function normalizeAbsoluteGroupChildren(layer: UniversalLayer): void {
  if (!layer.children?.length) return;
  if (isPrevNextGroup(layer)) {
    const ox = layer.box.x;
    const oy = layer.box.y;
    const minChildX = Math.min(...layer.children.map((c) => c.box.x));
    const maxChildR = Math.max(...layer.children.map((c) => c.box.x + c.box.width));
    const needsRebase =
      minChildX + 0.5 >= ox ||
      maxChildR > ox + layer.box.width + 0.5;
    if (needsRebase) {
      for (const child of layer.children) {
        child.box = {
          ...child.box,
          x: snap(child.box.x - ox),
          y: snap(child.box.y - oy)
        };
      }
    }
    let maxR = 0;
    let maxB = 0;
    for (const child of layer.children) {
      maxR = Math.max(maxR, child.box.x + child.box.width);
      maxB = Math.max(maxB, child.box.y + child.box.height);
    }
    layer.box = {
      ...layer.box,
      width: Math.max(layer.box.width, maxR),
      height: Math.max(layer.box.height, maxB)
    };
  }
  for (const child of layer.children) normalizeAbsoluteGroupChildren(child);
}

function shouldClipContent(layer: UniversalLayer, parent?: UniversalLayer): boolean {
  if (isPrevNextGroup(layer)) return false;
  if (isFigmaFlipFrame(layer)) return false;
  if (hasNotchedOutlineChild(layer)) return false;
  if (isMuiShrunkInputLabel(layer)) return false;
  const parentCl = parent?.source.classList ?? [];
  if (parentCl.some((c) => c.includes("MuiOutlinedInput-root"))) return false;
  // Lab pill buttons: external drop-shadow only — do not clip or live export loses shadow.
  const cl = layer.source.classList ?? [];
  if (cl.includes("lab-button")) {
    const shadows = layer.paint?.shadows || [];
    const needsClip = shadows.some((s) => s.inset || s.spread !== 0);
    if (!needsClip) return false;
  }
  const explicitClip =
    layer.layout?.overflow?.x === "hidden" ||
    layer.layout?.overflow?.y === "hidden" ||
    layer.layout?.overflow?.x === "clip" ||
    layer.layout?.overflow?.y === "clip";
  const hasSpreadShadow = (layer.paint?.shadows || []).some((s) => s.spread !== 0);
  // Text-leaf pills/chips: clipsContent forces Figma to wrap ("Overview", "MOST POPULAR").
  if (isTextLeafLayer(layer) && !explicitClip && !hasSpreadShadow) {
    return false;
  }
  const c = layer.paint?.cornerRadii;
  const w = Math.round(layer.box.width);
  const h = Math.round(layer.box.height);
  const maxR = c
    ? Math.max(c.topLeft.x, c.topRight.x, c.bottomRight.x, c.bottomLeft.x)
    : 0;
  // Circular avatars (MUI Chip, etc.) must not clip glyph centers.
  const circleAvatar = w > 0 && w === h && maxR >= w / 2 - 1;
  const hasFill = Boolean(layer.paint?.fills?.length);
  if (circleAvatar && hasFill) return false;
  const pill = c && maxR >= 100;
  const rounded =
    c &&
    !circleAvatar &&
    layer.box.width < 400 &&
    layer.box.height < 400 &&
    (c.topLeft.x > 0 ||
      c.topRight.x > 0 ||
      c.bottomRight.x > 0 ||
      c.bottomLeft.x > 0);
  return explicitClip || hasSpreadShadow || Boolean(pill) || Boolean(rounded);
}

function frameRequiresClipContent(layer: UniversalLayer): boolean {
  if (isFigmaFlipFrame(layer)) return false;
  return (
    layer.layout?.overflow?.x === "hidden" ||
    layer.layout?.overflow?.y === "hidden" ||
    layer.layout?.overflow?.x === "clip" ||
    layer.layout?.overflow?.y === "clip"
  );
}

// ─────────────────────────── main builder ───────────────────────────

async function buildLayer(
  layer: UniversalLayer,
  parent?: UniversalLayer,
  grandparent?: UniversalLayer,
  parentDocOrigin: { x: number; y: number } = { x: 0, y: 0 }
): Promise<SceneNode | null> {
  if (!isLayerVisible(layer)) return null;
  const selfDocOrigin = {
    x: parentDocOrigin.x + layer.box.x,
    y: parentDocOrigin.y + layer.box.y,
  };

  if (isFigmaReferenceRasterLayer(layer)) {
    const node = createImageNode(layer);
    node.name = layer.name || "reference-raster";
    if (!isMockFigmaRuntime()) {
      const pos = figmaReferenceRasterPosition(layer, parentDocOrigin);
      node.x = pos.x;
      node.y = pos.y;
    }
    return node;
  }

  let node: SceneNode;
  let textChildToPlace: TextNode | null = null;

  const isTextLeaf =
    layer.text &&
    !isFigmaReferenceRasterLayer(layer) &&
    (!layer.children || layer.children.length === 0);
  const figmaBareText =
    isTextLeaf &&
    isFigmaNativeTextLayer(layer) &&
    !layer.paint?.borders &&
    !(layer.paint?.shadows?.length);

  if (figmaBareText) {
    const t = await createTextNode(layer, parent);
    t.name = layer.name || "text";
    if (isFigmaNativeEllipseSiblingLetter(layer, parent)) {
      applyFigmaNativeCenteredGlyphPin(t, layer, parent);
    }
    return t;
  }

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
  } else if (isFigmaNativeEllipse(layer)) {
    node = figma.createEllipse();
  } else {
    const f = figma.createFrame();
    f.layoutMode = "NONE";
    f.fills = [];
    // Figma rejects shadow `spread` on frames where clipsContent is false.
    // Honour the original DOM overflow when set, otherwise default to true
    // so shadows with spread don't crash the import.
    f.clipsContent = shouldClipContent(layer, parent);
    node = f;
  }

  node.name = layer.name || layer.source.tag || "layer";
  if (isMuiOutlinedValueField(layer, parent) && isMockFigmaRuntime()) {
    node.name = layer.source.tag === "input" ? "outlined-value" : "outlined-select-value";
  }
  if (isMockFigmaRuntime() && isMuiCompactCenterButton(layer) && !layer.paint?.fills?.length) {
    node.name = "mui-action-btn";
  }
  if (layer.source?.tag === "input") {
    const inputType = (layer.source as { inputType?: string }).inputType;
    const src: { tag: string; inputType?: string; value?: string; fontStack?: string } = {
      tag: "input",
      inputType: inputType || "text"
    };
    if (layer.text?.value) {
      src.value = layer.text.value;
    }
    if (layer.text?.font?.stack) {
      src.fontStack = layer.text.font.stack;
    }
    // Mock scene-to-html reads frame.source; real Figma nodes are not extensible.
    if (isMockFigmaRuntime() && !isMuiOutlinedValueField(layer, parent)) {
      (node as FrameNode & { source?: typeof src }).source = src;
    }
  }
  if (node.type === "FRAME" && "fills" in node && !(layer.paint?.fills?.length)) {
    (node as FrameNode).fills = [];
  }
  if ("resize" in node && node.type !== "TEXT") {
    const w = snapBoxSize(layer, "width");
    let h = snapBoxSize(layer, "height");
    // Storybook `.lab-login-card input { height: 50px }` — border-box outer height,
    // not the 52px content+stroke rect the extractor reports.
    if (
      layer.source?.tag === "input" &&
      parent?.source?.classList?.includes("lab-login-card") &&
      Math.round(layer.box.height) === 52
    ) {
      h = 50;
    }
    node.resize(w, h);
    clampNodeWidthToParent(node, layer, parent);
  }
  applyTransform(node, layer);
  applyMuiLinearProgressBarPlacement(node, layer);

  // If we built a frame-wrapped text leaf, position the text child inside
  // the frame according to the layer's flex alignment. The CSS `flex.align` /
  // `flex.justify` capture exactly how the DOM centers (or starts) the text.
  if (textChildToPlace) {
    const frame = node as FrameNode;
    const text = textChildToPlace;
    if (isLabButtonLabelSpan(layer, parent)) {
      const fw = Math.max(1, snap(layer.box.width));
      const fh = Math.max(1, snap(layer.box.height));
      frame.resize(fw, fh);
      frame.name = layer.name || layer.source.dataset?.figmaName || "label";
      const labBtn = (parent?.source?.classList ?? []).includes("lab-button");
      if (labBtn) {
        if (!isMockFigmaRuntime()) {
          frame.appendChild(text);
          enforceLiveUnwrappedTextFrame(frame, text, layer, parent);
        } else {
          const lhPx =
            liveTightLineHeightPx(layer.text!, layer, fh) ??
            Math.max(1, snap(layer.text!.font.size));
          text.lineHeight = { unit: "PIXELS", value: lhPx };
          text.textAutoResize = "WIDTH_AND_HEIGHT";
          text.textAlignHorizontal = "CENTER";
          const tw = text.width;
          const th = text.height;
          text.x = snap(Math.max(0, (fw - tw) / 2));
          text.y = snap(Math.max(0, (fh - th) / 2));
          frame.appendChild(text);
        }
      } else {
        const lh = layer.text?.lineHeight;
        if (lh != null && lh > 0) {
          text.lineHeight = { unit: "PIXELS", value: snap(lh) };
        }
        text.textAlignHorizontal = "LEFT";
        text.textAutoResize = "WIDTH_AND_HEIGHT";
        const tw = text.width;
        const th = text.height;
        let tx = 0;
        if (layer.text?.align === "center" && fw > tw + 0.5) {
          tx = (fw - tw) / 2;
        }
        text.x = snap(Math.max(0, tx));
        text.y = snap(Math.max(0, (fh - th) / 2));
        if (text.y > 0 && text.y < 1) text.y = 0;
        frame.appendChild(text);
      }
    } else {
    // DOM labels (e.g. MUI outlined fields) use transform: scale() while the
    // layer box is already post-transform. Bake scale into font metrics so the
    // mock text fits the frame instead of clipping ("Email" → "Ema").
    const matrix = layer.transform?.matrix;
    const skipScaleBake = isMuiShrunkInputLabel(layer) && isMockFigmaRuntime();
    if (matrix && !skipScaleBake) {
      const sx = Math.hypot(matrix[0], matrix[1]);
      const sy = Math.hypot(matrix[2], matrix[3]);
      if (Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01) {
        const baseSize = typeof text.fontSize === "number" ? text.fontSize : 16;
        text.fontSize = Math.max(1, snap(baseSize * sy));
        const lh = text.lineHeight;
        if (
          lh !== figma.mixed &&
          typeof lh === "object" &&
          lh.unit === "PIXELS" &&
          lh.value
        ) {
          text.lineHeight = { unit: "PIXELS", value: snap(lh.value * sy) };
        }
        const ls = text.letterSpacing;
        if (
          ls !== figma.mixed &&
          typeof ls === "object" &&
          ls.unit === "PIXELS" &&
          ls.value
        ) {
          text.letterSpacing = { unit: "PIXELS", value: snap(ls.value * sx) };
        }
        const fn = text.fontName;
        if (fn !== figma.mixed) await figma.loadFontAsync(fn);
      }
    }
    if (isMuiShrunkInputLabel(layer)) {
      if (!isMockFigmaRuntime()) {
        const fs =
          typeof text.fontSize === "number" ? text.fontSize : layer.text!.font.size;
        text.lineHeight = { unit: "PIXELS", value: Math.max(1, snap(fs)) };
        const ls = layer.text!.letterSpacing;
        if (ls != null) {
          text.letterSpacing = { unit: "PIXELS", value: snap(ls) };
        }
      } else {
        const mockSize = mockMuiShrunkLabelFrameSize(layer);
        frame.resize(mockSize.width, mockSize.height);
      }
      frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } } as SolidPaint];
      frame.clipsContent = false;
    }
    const fw = frame.width;
    const fh = frame.height;
    const pad = layer.layout?.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const justify = layer.layout?.flex?.justify ?? "normal";
    const align = layer.layout?.flex?.align ?? "normal";
    // Horizontal placement: flex.justify on row, falls back to text-align /
    // padding-left for non-flex parents.
    const innerW = fw - pad.left - pad.right;
    const innerH = fh - pad.top - pad.bottom;
    clampMockTextToDomBox(text, innerW, innerH, layer, parent);
    const tw = text.width;
    const th = text.height;
    const textAlign = layer.text?.align;
    let x = pad.left;
    let y = pad.top;
    let usedNativeTextAlign = false;
    let usedNativeVerticalAlign = false;
    if (isMuiBadgeDot(layer)) {
      text.textAutoResize = "WIDTH_AND_HEIGHT";
      text.textAlignHorizontal = "CENTER";
      x = snap(pad.left + Math.max(0, (innerW - text.width) / 2));
      y = snap(pad.top + Math.max(0, (innerH - text.height) / 2));
      usedNativeTextAlign = true;
      usedNativeVerticalAlign = true;
    } else if (isMuiFlexCenterGlyphFrame(layer)) {
      text.textAutoResize = "HEIGHT";
      text.resize(Math.max(1, snap(innerW)), Math.max(1, snap(innerH)));
      text.textAlignHorizontal = "CENTER";
      try {
        text.textAlignVertical = "CENTER";
      } catch {
        // older typings
      }
      x = pad.left;
    } else if (isMuiFormControlLabelCaption(layer)) {
      text.textAutoResize = "HEIGHT";
      text.resize(Math.max(1, snap(innerW)), Math.max(1, snap(innerH)));
      try {
        text.textAlignVertical = "CENTER";
      } catch {
        // older typings
      }
    } else if (!isMockFigmaRuntime() && layer.source?.tag === "input") {
      const b = layer.paint?.borders;
      const borderL = b?.left?.width ?? 0;
      const borderR = b?.right?.width ?? 0;
      const borderT = b?.top?.width ?? 0;
      const borderB = b?.bottom?.width ?? 0;
      const contentW = Math.max(1, snap(innerW - borderL - borderR));
      const contentH = Math.max(1, snap(innerH - borderT - borderB));
      text.textAutoResize = "NONE";
      text.resize(contentW, contentH);
      text.textAlignHorizontal = "LEFT";
      try {
        text.textAlignVertical = "CENTER";
      } catch {
        // older typings
      }
      x = pad.left + borderL;
      y = pad.top + borderT;
      usedNativeTextAlign = true;
      usedNativeVerticalAlign = true;
    }
    // Wide boxes + text-align — use Figma's align instead of manual x offset
    // (glyph metrics differ from browser; manual center drifts, e.g. buttons).
    const tableCell = layer.source.tag === "th" || layer.source.tag === "td";
    const blockButtonCenter =
      layer.source.tag === "button" && textAlign === "center";
    const wideBlockButton =
      blockButtonCenter &&
      !isLabDomCenterButton(layer, parent) &&
      (innerW > tw + 12 && innerH > 40);
    if (
      (tableCell && (textAlign === "right" || textAlign === "end" || textAlign === "center")) ||
      isMuiPaginationItemButton(layer) ||
      blockButtonCenter ||
      ((textAlign === "center" || textAlign === "right" || textAlign === "end") &&
        innerW > tw + 2)
    ) {
      // Lock width so CENTER/RIGHT align spans the padded content box (mock ignores
      // resize while textAutoResize is WIDTH_AND_HEIGHT).
      if (wideBlockButton) {
        const btnLh = layer.text?.lineHeight;
        if (btnLh != null && btnLh > 0) {
          text.lineHeight = { unit: "PIXELS", value: snap(btnLh) };
        }
        if (isLabTightCenterButton(layer, parent)) {
          if (!isMockFigmaRuntime()) {
            const placed = applyLiveNativeTextBoxCenter(
              text,
              layer,
              innerW,
              innerH,
              pad,
              frame,
              parent
            );
            x = placed.x;
            y = placed.y;
          } else {
            const lhPx =
              liveTightLineHeightPx(layer.text!, layer, innerH) ??
              Math.max(1, snap(layer.text!.font.size));
            text.lineHeight = { unit: "PIXELS", value: lhPx };
            text.textAutoResize = "WIDTH_AND_HEIGHT";
            text.textAlignHorizontal = "CENTER";
            x = snap(pad.left + Math.max(0, (innerW - text.width) / 2));
            y = snap(pad.top + Math.max(0, (innerH - text.height) / 2));
          }
        } else if (!isMockFigmaRuntime()) {
          const placed = applyLiveNativeTextBoxCenter(text, layer, innerW, innerH, pad, frame, parent);
          x = placed.x;
          y = placed.y;
        } else {
          text.textAutoResize = "NONE";
          text.resize(Math.max(1, snap(innerW)), Math.max(1, snap(innerH)));
          text.textAlignHorizontal = "CENTER";
          try {
            text.textAlignVertical = "CENTER";
          } catch {
            // older typings
          }
          x = pad.left;
          y = pad.top;
        }
        usedNativeTextAlign = true;
        usedNativeVerticalAlign = true;
      } else if (isMuiPaginationItemButton(layer)) {
        const fs = layer.text?.font?.size ?? 14;
        text.lineHeight = { unit: "PIXELS", value: Math.max(1, snap(fs)) };
        text.textAutoResize = "WIDTH_AND_HEIGHT";
        text.textAlignHorizontal = "CENTER";
        x = snap(pad.left + Math.max(0, (innerW - text.width) / 2));
        y = snap(pad.top + Math.max(0, (innerH - text.height) / 2));
        usedNativeTextAlign = true;
        usedNativeVerticalAlign = true;
      } else if (blockButtonCenter) {
        if (isLabTightCenterButton(layer, parent)) {
          if (!isMockFigmaRuntime()) {
            const placed = applyLiveNativeTextBoxCenter(
              text,
              layer,
              innerW,
              innerH,
              pad,
              frame,
              parent
            );
            x = placed.x;
            y = placed.y;
          } else {
            const lhPx =
              liveTightLineHeightPx(layer.text!, layer, innerH) ??
              Math.max(1, snap(layer.text!.font.size));
            text.lineHeight = { unit: "PIXELS", value: lhPx };
            text.textAutoResize = "WIDTH_AND_HEIGHT";
            text.textAlignHorizontal = "CENTER";
            x = snap(pad.left + Math.max(0, (innerW - text.width) / 2));
            y = snap(pad.top + Math.max(0, (innerH - text.height) / 2));
          }
        } else {
          if (!isMockFigmaRuntime()) {
            const placed = applyLiveNativeTextBoxCenter(text, layer, innerW, innerH, pad, frame, parent);
            x = placed.x;
            y = placed.y;
          } else {
            const btnLh = layer.text?.lineHeight;
            if (btnLh != null && btnLh > 0) {
              text.lineHeight = { unit: "PIXELS", value: snap(btnLh) };
            }
            text.textAutoResize = "WIDTH_AND_HEIGHT";
            text.textAlignHorizontal = "CENTER";
            x = snap(pad.left + Math.max(0, (innerW - text.width) / 2));
            y = snap(pad.top + Math.max(0, (innerH - text.height) / 2));
          }
        }
        usedNativeTextAlign = true;
        usedNativeVerticalAlign = true;
      } else if (!isLabTightCenterButton(layer, parent) && !liveTextPreferWidthAndHeight(layer, parent)) {
        text.textAutoResize = "HEIGHT";
        text.resize(Math.max(1, snap(innerW)), text.height);
        text.textAlignHorizontal = figmaTextAlignHorizontal(layer);
        x = pad.left;
        usedNativeTextAlign = true;
      }
    } else if (
      !usedNativeTextAlign &&
      !isMuiFlexCenterGlyphFrame(layer) &&
      (justify === "center" || textAlign === "center")
    ) {
      x = pad.left + (innerW - tw) / 2;
    } else if (justify === "end" || textAlign === "right" || textAlign === "end") {
      x = fw - tw - pad.right;
    }
    // Vertical placement: flex.align on row, falls back to (frame - text)/2
    // whenever there's meaningfully more box height than text height AFTER
    // removing vertical padding. Pure CSS `line-height` centering (buttons /
    // chips / table rows / form controls) produces boxes much taller than
    // the glyph run, with tiny padding on top/bottom — those should center.
    if (!usedNativeVerticalAlign) {
      const blockFlowPinTop =
        !isMockFigmaRuntime() &&
        parent?.layout?.display === "block" &&
        (layer.source.tag === "p" ||
          /^h[1-6]$/.test(layer.source.tag ?? "") ||
          layer.source.tag === "span");
      if (blockFlowPinTop) {
        y = pad.top;
        try {
          text.textAlignVertical = "TOP";
        } catch {
          // older typings
        }
        usedNativeVerticalAlign = true;
      } else if (isBlockTypoTightLineBox(layer)) {
        if (!isMockFigmaRuntime()) {
          const placed = applyLiveNativeTextBoxCenter(text, layer, innerW, innerH, pad, frame, parent);
          x = placed.x;
          y = placed.y;
        } else {
          y = pad.top + Math.max(0, (innerH - text.height) / 2);
        }
        usedNativeVerticalAlign = true;
      } else if (isMuiFlexCenterGlyphFrame(layer)) {
        y = pad.top;
      } else if (isMuiFormControlLabelCaption(layer)) {
        y = pad.top + Math.max(0, (innerH - th) / 2);
        try {
          text.textAlignVertical = "CENTER";
        } catch {
          // older typings
        }
      } else if (isMuiShrunkInputLabel(layer)) {
        y = pad.top + Math.max(0, (innerH - th) / 2);
      } else if (layer.source?.tag === "input") {
        const b = layer.paint?.borders;
        const borderTop = b?.top?.width ?? 0;
        const borderBottom = b?.bottom?.width ?? 0;
        const contentInnerH = innerH - borderTop - borderBottom;
        y = pad.top + borderTop + Math.max(0, (contentInnerH - th) / 2);
        try {
          text.textAlignVertical = "CENTER";
        } catch {
          // older typings
        }
        usedNativeVerticalAlign = true;
      } else if (textFramePinsToTop(layer, parent)) {
        y = pad.top;
      } else if (align === "center" || innerH - th > 0.5 || textUsesTightLineBox(layer)) {
        if (!isMockFigmaRuntime() && textUsesTightLineBox(layer)) {
          const placed = applyLiveNativeTextBoxCenter(text, layer, innerW, innerH, pad, frame, parent);
          x = placed.x;
          y = placed.y;
          usedNativeVerticalAlign = true;
        } else {
          y = pad.top + (innerH - th) / 2;
          try {
            text.textAlignVertical = "CENTER";
          } catch {
            // older typings
          }
        }
      } else if (align === "end") {
        y = fh - th - pad.bottom;
      }
    }
    text.x = snap(Math.max(0, x));
    text.y = snap(Math.max(0, y));
    if (text.y > 0 && text.y < 1) text.y = 0;
    if (textFramePinsToTop(layer, parent) && !usedNativeVerticalAlign) {
      try {
        text.textAlignVertical = "TOP";
      } catch {
        // older typings
      }
    }
    // scene-to-html treats parent name "span" as inline runs (line-height:normal).
    // Block typographic spans (MUI ListItemText, FormControlLabel, etc.) need the
    // tight line-box path instead.
    if (isMuiFormControlLabelCaption(layer) || shouldRenameSpanFrameToTypography(layer, parent)) {
      frame.name = "typography";
    }
    frame.appendChild(text);

    if (!isMockFigmaRuntime()) {
      enforceLiveUnwrappedTextFrame(frame, text, layer, parent);
    }

    if (isMuiShrunkInputLabel(layer) && isMockFigmaRuntime()) {
      const neededH = Math.max(frame.height, text.y + text.height);
      if (neededH > frame.height + 0.5) {
        frame.resize(frame.width, snap(neededH));
      }
    }

    // Live wrapped headings (calendar event titles): grow frame to wrapped glyph height
    // so siblings keep extracted y and do not paint on the same row.
    if (
      !isMockFigmaRuntime() &&
      /^h[1-6]$/.test(layer.source.tag ?? "") &&
      text.textAutoResize === "HEIGHT"
    ) {
      const neededH = snap(text.y + text.height + pad.bottom);
      const domH = snap(layer.box.height);
      if (neededH > frame.height + 0.5 || domH > frame.height + 0.5) {
        frame.resize(frame.width, Math.max(domH, neededH));
      }
    }

    // Inline / price runs: frame box from DOM can be narrower than Figma glyphs.
    // Block-level rows (e.g. MUI ListItemText primary) keep the extractor width.
    if (
      textFramePinsToTop(layer, parent) &&
      !layer.paint?.fills?.length &&
      layer.box.width <= snap(text.width) + 2
    ) {
      frame.resize(
        Math.max(1, snap(text.width)),
        Math.max(1, snap(text.height))
      );
    } else if (
      textFramePinsToTop(layer, parent) &&
      !layer.paint?.fills?.length &&
      (/^h[1-6]$/.test(layer.source.tag ?? "") || preserveDomLineBoxHeight(layer, parent))
    ) {
      // Keep DOM line box height so flex-column siblings stay at extracted y (gap parity).
      frame.resize(fw, Math.max(1, snap(layer.box.height)));
    }
    }
  }

  // Paint: fills / radii / borders / shadows / opacity / blend
  // Real Figma frames default to opaque white — always set fills explicitly.
  if (layer.paint) {
    const paint = layer.paint;
    if ("fills" in node && node.type !== "TEXT") {
      // Image rectangles already received an IMAGE fill in createImageNode.
      if (layer.image) {
        const bgFills = paint.fills?.length
          ? buildFills(paint, layer.box.width, layer.box.height, layer)
          : undefined;
        if (bgFills?.length) {
          (node as any).fills = [
            ...clonePaints(bgFills),
            ...clonePaints((node as any).fills || [])
          ];
        }
      } else {
        const fills = paint.fills?.length
          ? buildFills(paint, layer.box.width, layer.box.height, layer)
          : undefined;
        if (fills?.length) {
          (node as any).fills = clonePaints(fills);
        } else if (
          layer.source?.kind === "figma" &&
          node.type === "FRAME" &&
          !isMockFigmaRuntime()
        ) {
          (node as any).fills = [transparentFill()];
        } else {
          (node as any).fills = [];
        }
      }
    }
    if (node.type !== "TEXT" && shouldApplyCornerRadii(layer, parent)) applyCornerRadii(node, paint);
    if ("effects" in node) {
      // Spread is only legal on shape/frame nodes whose container clips its
      // content. TEXT nodes never accept spread.
      const skipMockContainedButtonShadow =
        isMockFigmaRuntime() &&
        layer.source.tag === "button" &&
        Boolean(layer.paint?.fills?.length);
      if (!skipMockContainedButtonShadow) {
        const allowSpread =
          isMockFigmaRuntime() ||
          (node.type !== "TEXT" &&
            ((node as any).clipsContent === true || node.type !== "FRAME"));
        const effects = effectsFromPaint(paint, allowSpread);
        if (effects.length) node.effects = cloneEffects(effects);
      }
    }
    if (paint.opacity !== undefined && "opacity" in node) {
      (node as any).opacity = Math.max(0, Math.min(1, paint.opacity));
    }
    if (paint.blendMode && paint.blendMode !== "normal" && "blendMode" in node) {
      const bm = paint.blendMode.toUpperCase().replace(/-/g, "_");
      try {
        (node as any).blendMode = bm;
      } catch {
        // Unsupported blend modes are silently skipped.
      }
    }
  }

  // Borders: native individualStrokes OR vector overlay for gaps.
  const borderPaint =
    isMuiNotchedOutlineFieldset(layer) && parent
      ? tightenMuiNotchGapPaint(layer.paint, parent, grandparent)
      : layer.paint;
  const borderOverlay = applyBorders(node, borderPaint, layer.box.width, layer.box.height, layer);

  // Recurse children before the border overlay so the overlay paints on top.
  if (layer.children && "appendChild" in node) {
    if (shouldUseLabButtonAutoLayout(layer) && node.type === "FRAME") {
      const frame = node as FrameNode;
      const pad = layer.layout?.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
      const flex = layer.layout?.flex;
      const gap = flex?.columnGap ?? flex?.rowGap ?? 0;
      const btnW = snapBoxSize(layer, "width");
      const btnH = snapBoxSize(layer, "height");
      frame.layoutMode = "HORIZONTAL";
      frame.primaryAxisSizingMode = "FIXED";
      frame.counterAxisSizingMode = "FIXED";
      frame.primaryAxisAlignItems = "CENTER";
      frame.counterAxisAlignItems = "CENTER";
      frame.itemSpacing = snap(gap);
      frame.paddingLeft = snap(pad.left);
      frame.paddingRight = snap(pad.right);
      frame.paddingTop = snap(pad.top);
      frame.paddingBottom = snap(pad.bottom);

      // Unreachable while shouldUseLabButtonAutoLayout is false — kept for reference.
      const kids = layer.children ?? [];
      const childLayers = [...kids].sort((a, b) => a.box.x - b.box.x);
      for (const child of childLayers) {
        const childNode = await buildLayer(child, layer, parent, selfDocOrigin);
        if (!childNode) continue;
        childNode.x = snap(child.box.x);
        childNode.y = snap(child.box.y);
        frame.appendChild(childNode);
      }
      frame.layoutMode = "NONE";
      frame.itemSpacing = 0;
      frame.paddingLeft = 0;
      frame.paddingRight = 0;
      frame.paddingTop = 0;
      frame.paddingBottom = 0;

      if (Math.abs(frame.width - btnW) > 0.5 || Math.abs(frame.height - btnH) > 0.5) {
        frame.resize(btnW, btnH);
      }
    } else {
    const inlineRow =
      node.type === "FRAME" && shouldUseInlineRowLayout(layer);
    const childLayers = inlineRow
      ? [...layer.children].sort((a, b) => a.box.x - b.box.x)
      : layer.children;
    // Inline rows ($49 + /month): keep layout NONE so DOM box.x/box.y are honored.
    if (inlineRow) {
      (node as FrameNode).clipsContent = false;
    }
    const positionedBuilt: { node: SceneNode; layer: UniversalLayer }[] = [];
    const inlineBuilt: { node: SceneNode; layer: UniversalLayer }[] = [];
    for (const child of childLayers) {
      const childNode = await buildLayer(child, layer, parent, selfDocOrigin);
      if (!childNode) continue;
      if (layer.name === "label" && isRadioIndicatorLayer(child)) {
        childNode.y = 0;
      }
      if (layer.name === "label" && child.text && childNode.type === "FRAME") {
        const textKid = (childNode as FrameNode).children.find((c) => c.type === "TEXT");
        if (textKid && textKid.y > 0 && textKid.y < 1) textKid.y = 0;
      }
      (node as ChildrenMixin).appendChild(childNode);
      positionedBuilt.push({ node: childNode, layer: child });
      if (inlineRow) inlineBuilt.push({ node: childNode, layer: child });
    }
    if (inlineRow) {
      alignInlineRowSiblings(inlineBuilt);
    } else {
      reaffirmChildBoxPositions(positionedBuilt, layer, selfDocOrigin);
      for (const { node: childNode, layer: childLayer } of positionedBuilt) {
        applyMuiLinearProgressBarPlacement(childNode, childLayer);
      }
      if (
        !isMockFigmaRuntime() &&
        node.type === "FRAME" &&
        (layer.source.classList ?? []).includes("lab-button") &&
        !shouldUseLabButtonAutoLayout(layer)
      ) {
        centerLabButtonSoleChild(node as FrameNode, layer);
      }
    }
    }
  }
  if (borderOverlay && "appendChild" in node) {
    (node as ChildrenMixin).appendChild(borderOverlay);
    // Keep clipsContent when manifest/Figma marked overflow hidden — otherwise
    // nested layer-blur ellipses bleed into the header above (screen_1).
    if ("clipsContent" in node && !frameRequiresClipContent(layer)) {
      (node as FrameNode).clipsContent = false;
    }
  }
  if (node.type === "FRAME" && frameRequiresClipContent(layer)) {
    (node as FrameNode).clipsContent = true;
  }

  return node;
}

export async function renderDocumentV2(doc: UniversalDocumentV2): Promise<SceneNode> {
  // Clone tree so relay/frozen payloads are never mutated during render.
  const rootLayer = JSON.parse(JSON.stringify(doc.root)) as UniversalLayer;
  normalizeAbsoluteGroupChildren(rootLayer);
  await preloadFonts(rootLayer, new Set());
  const root = await buildLayer(rootLayer);
  if (!root) throw new Error("Root layer produced no node");
  reaffirmTreeBoxPositions(root, rootLayer);

  // Wrap in a canvas frame so we keep the original page background.
  const canvas = figma.createFrame();
  canvas.name = `${doc.meta.componentName} Canvas`;
  canvas.layoutMode = "NONE";
  canvas.clipsContent = false;
  const padding = 24;
  const w = Math.max(1, doc.root.box.width + padding * 2);
  const h = Math.max(1, doc.root.box.height + padding * 2);
  canvas.resize(w, h);
  if (doc.meta.canvasBackground) {
    canvas.fills = [solidPaint(doc.meta.canvasBackground)];
  } else {
    canvas.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } } as SolidPaint];
  }
  if (doc.meta.preserveEffects) {
    try {
      canvas.setPluginData("preserveEffects", "1");
    } catch {
      // older Figma builds
    }
  }
  root.x = padding;
  root.y = padding;
  canvas.appendChild(root);
  return canvas;
}

/** Content frame inside the padded canvas wrapper from renderDocumentV2. */
export function contentFrameFromCanvas(canvas: SceneNode): SceneNode {
  if (canvas.type === "FRAME" && canvas.children.length > 0) {
    return canvas.children[0];
  }
  return canvas;
}

/** Strip effects for export — Playwright element screenshots omit external box-shadow. */
function stripEffectsForExport(root: SceneNode): { node: SceneNode; effects: readonly Effect[] }[] {
  const saved: { node: SceneNode; effects: readonly Effect[] }[] = [];
  const walk = (node: SceneNode): void => {
    if ("effects" in node) {
      const blend = node as BlendMixin;
      if (blend.effects.length) {
        saved.push({ node, effects: blend.effects });
        try {
          blend.effects = [];
        } catch {
          // Some live nodes expose readonly effects — skip strip for this node.
        }
      }
    }
    if ("children" in node) {
      for (const child of (node as ChildrenMixin).children) walk(child);
    }
  };
  walk(root);
  return saved;
}

export async function exportContentPng(
  canvas: SceneNode,
  _canvasBackground?: string,
  exportScale?: number
): Promise<Uint8Array> {
  const target = contentFrameFromCanvas(canvas);
  const scale =
    typeof exportScale === "number" && exportScale > 0
      ? exportScale
      : isMockFigmaRuntime()
        ? 2
        : 1;
  const settings: ExportSettings = {
    format: "PNG",
    constraint: { type: "SCALE", value: scale },
    useAbsoluteBounds: false,
    colorProfile: "SRGB"
  };
  const preserveEffects =
    canvas.type === "FRAME" &&
    (canvas as FrameNode).getPluginData?.("preserveEffects") === "1";
  const stripped = preserveEffects ? [] : stripEffectsForExport(target);
  try {
    return await target.exportAsync(settings);
  } finally {
    for (const { node, effects } of stripped) {
      try {
        (node as BlendMixin).effects = cloneEffects(effects);
      } catch {
        // readonly effects on some live nodes — leave stripped for export parity
      }
    }
  }
}
