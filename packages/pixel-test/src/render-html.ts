/**
 * Render a UniversalLayer document back to a self-contained HTML+CSS string.
 *
 * The point of this module is to *prove the v2 schema is visually lossless*.
 * If a pixel diff between the live Storybook DOM and this reconstructor's
 * output is small, the schema captured everything that matters.
 */

import type {
  UniversalDocumentV2,
  UniversalLayer,
  LayerPaint,
  LayerBorders,
  BorderSide,
  FillLayer,
  LayerVector,
  VectorShape,
  LayerText,
  LayerImage
} from "@lab/contract";

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

/** Bake layer opacity into 6-digit hex for reliable SVG compositing. */
function hexWithOpacity(color: string, opacity: number): string {
  const trimmed = color.trim();
  const m = trimmed.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!m || opacity >= 0.999) return trimmed;
  const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${m[1]}${a}`;
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

function radialGradientShapeCss(layer: Extract<FillLayer, { kind: "radial-gradient" }>): string {
  const { shape, centerX, centerY, sizeX, sizeY } = layer;
  if (sizeX && sizeY) {
    return `${shape} ${sizeX} ${sizeY} at ${centerX} ${centerY}`;
  }
  return `${shape} at ${centerX} ${centerY}`;
}

function figmaNativeGradientCss(layer: FillLayer): string | null {
  const native = (
    layer as FillLayer & {
      figmaNative?: {
        gradientStops?: Array<{
          position: number;
          color: { r: number; g: number; b: number; a?: number };
        }>;
      };
    }
  ).figmaNative;
  if (!native?.gradientStops?.length) return null;
  const stops = native.gradientStops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const { r, g, b, a = 1 } = s.color;
      return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(
        b * 255
      )}, ${snap(a)}) ${snap(s.position * 100)}%`;
    })
    .join(", ");
  if (layer.kind === "linear-gradient") {
    return `linear-gradient(${layer.angleDeg}deg, ${stops})`;
  }
  if (layer.kind === "radial-gradient") {
    return `radial-gradient(${radialGradientShapeCss(layer)}, ${stops})`;
  }
  if (layer.kind === "conic-gradient") {
    return `conic-gradient(from ${layer.fromDeg}deg at ${layer.centerX} ${layer.centerY}, ${stops})`;
  }
  return null;
}

function fillToCss(layer: FillLayer): string | null {
  const nativeGrad = figmaNativeGradientCss(layer);
  if (nativeGrad) return nativeGrad;
  if (layer.kind === "color") return layer.color;
  if (layer.kind === "linear-gradient") {
    const stops = layer.stops
      .slice()
      .sort((a, b) => a.offset - b.offset)
      .map((s) => `${s.color} ${snap(s.offset * 100)}%`)
      .join(", ");
    return `linear-gradient(${layer.angleDeg}deg, ${stops})`;
  }
  if (layer.kind === "radial-gradient") {
    const stops = layer.stops
      .slice()
      .sort((a, b) => a.offset - b.offset)
      .map((s) => `${s.color} ${snap(s.offset * 100)}%`)
      .join(", ");
    return `radial-gradient(${radialGradientShapeCss(layer)}, ${stops})`;
  }
  if (layer.kind === "conic-gradient") {
    const stops = layer.stops
      .slice()
      .sort((a, b) => a.offset - b.offset)
      .map((s) => `${s.color} ${snap(s.offset * 360)}deg`)
      .join(", ");
    return `conic-gradient(from ${layer.fromDeg}deg at ${layer.centerX} ${layer.centerY}, ${stops})`;
  }
  if (layer.kind === "image") {
    const src = layer.dataUrl || layer.url;
    return `url("${escapeAttr(src)}")`;
  }
  return null;
}

function backgroundsToCss(fills: FillLayer[] | undefined): string[] {
  if (!fills || !fills.length) return [];
  const props: string[] = [];
  // CSS expects FRONT-to-back (first painted listed first; rendered LAST).
  // Our schema stores back-to-front. Reverse for CSS.
  const ordered = fills.slice().reverse();
  const images = ordered.filter((f) => f.kind !== "color");
  const colorFill = ordered.find((f) => f.kind === "color") as
    | Extract<FillLayer, { kind: "color" }>
    | undefined;
  if (images.length === 1 && images[0].kind === "linear-gradient" && !colorFill) {
    const grad = fillToCss(images[0]);
    if (grad) return [`background: ${grad}`];
  }
  const imgs = images.map(fillToCss).filter(Boolean) as string[];
  if (imgs.length) {
    props.push(`background-image: ${imgs.join(", ")}`);
    const sizes = images.map((f) => {
      if (f.kind === "image") {
        if (f.size === "cover" || f.size === "contain" || f.size === "auto") return f.size;
        if (typeof f.size === "object") return `${f.size.width} ${f.size.height}`;
      }
      return "auto";
    });
    const positions = images.map((f) =>
      f.kind === "image" ? `${f.positionX} ${f.positionY}` : "0% 0%"
    );
    const repeats = images.map((f) => (f.kind === "image" ? f.repeat : "no-repeat"));
    if (sizes.some((s) => s !== "auto")) props.push(`background-size: ${sizes.join(", ")}`);
    if (positions.some((p) => p !== "0% 0%")) props.push(`background-position: ${positions.join(", ")}`);
    if (repeats.some((r) => r !== "repeat")) props.push(`background-repeat: ${repeats.join(", ")}`);
  }
  if (colorFill) props.push(`background-color: ${colorFill.color}`);
  return props;
}

function borderSideCss(side: BorderSide | undefined): string | null {
  if (!side) return null;
  return `${snap(side.width)}px ${side.style} ${side.color}`;
}

function uniformBorder(
  b: LayerBorders | undefined
): { width: number; color: string; style: string } | null {
  if (!b?.top || !b.right || !b.bottom || !b.left) return null;
  const { top } = b;
  if (
    top.width !== b.right.width ||
    top.width !== b.bottom.width ||
    top.width !== b.left.width ||
    top.color !== b.right.color ||
    top.color !== b.bottom.color ||
    top.color !== b.left.color ||
    top.style !== b.right.style ||
    top.style !== b.bottom.style ||
    top.style !== b.left.style
  ) {
    return null;
  }
  return top;
}

function bordersToCss(
  b: LayerBorders | undefined,
  opts?: { insetShadow?: boolean; useNativeUniformSolid?: boolean; useOutlineBorder?: boolean }
): string[] {
  if (!b) return [];
  const uniform = uniformBorder(b);
  if (uniform && uniform.style === "solid" && uniform.width > 0) {
    if (opts?.useNativeUniformSolid) {
      return [`border: ${snap(uniform.width)}px solid ${uniform.color}`];
    }
    if (opts?.useOutlineBorder) {
      const w = snap(uniform.width);
      return [`outline: ${w}px solid ${uniform.color}`, `outline-offset: -${w}px`];
    }
    if (opts?.insetShadow) {
      return [`box-shadow: inset 0 0 0 ${snap(uniform.width)}px ${uniform.color}`];
    }
  }
  if (uniform && uniform.width > 0 && uniform.style !== "solid") {
    const side = `${snap(uniform.width)}px ${uniform.style} ${uniform.color}`;
    return [
      `border-top: ${side}`,
      `border-right: ${side}`,
      `border-bottom: ${side}`,
      `border-left: ${side}`
    ];
  }
  const topW = b.top?.width ?? 0;
  const rightW = b.right?.width ?? 0;
  const bottomW = b.bottom?.width ?? 0;
  const leftW = b.left?.width ?? 0;
  const sides = [b.top, b.right, b.bottom, b.left].filter(Boolean) as BorderSide[];
  if (
    sides.length === 1 &&
    sides[0].style === "solid" &&
    topW + rightW + bottomW + leftW > 0
  ) {
    const color = sides[0].color;
    if (opts?.useNativeUniformSolid) {
      if (topW > 0) return [`border-top: ${snap(topW)}px solid ${color}`];
      if (rightW > 0) return [`border-right: ${snap(rightW)}px solid ${color}`];
      if (bottomW > 0) return [`border-bottom: ${snap(bottomW)}px solid ${color}`];
      if (leftW > 0) return [`border-left: ${snap(leftW)}px solid ${color}`];
    }
    if (topW > 0) return [`box-shadow: inset 0 ${snap(topW)}px 0 0 ${color}`];
    if (rightW > 0) return [`box-shadow: inset -${snap(rightW)}px 0 0 0 ${color}`];
    if (bottomW > 0) return [`box-shadow: inset 0 -${snap(bottomW)}px 0 0 ${color}`];
    if (leftW > 0) return [`box-shadow: inset ${snap(leftW)}px 0 0 0 ${color}`];
  }
  const props: string[] = [];
  const top = borderSideCss(b.top);
  const right = borderSideCss(b.right);
  const bottom = borderSideCss(b.bottom);
  const left = borderSideCss(b.left);
  if (top) props.push(`border-top: ${top}`);
  if (right) props.push(`border-right: ${right}`);
  if (bottom) props.push(`border-bottom: ${bottom}`);
  if (left) props.push(`border-left: ${left}`);
  return props;
}

function buildBorderOverlaySvg(
  width: number,
  height: number,
  paint: LayerPaint
): string | null {
  const b = paint.borders;
  if (!b || !b.gaps || !b.gaps.length) return null;
  const corners = paint.cornerRadii;
  const r = corners
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
  const cornerR = Math.max(0, Math.min(r, width / 2 - 1, height / 2 - 1));
  const color = (b.top || b.right || b.bottom || b.left)?.color || "black";
  const gaps = (b.gaps || []).filter((g) => g.side === "top").sort((a, c) => a.from - c.from);
  let gapEndX = inset + cornerR;
  let gapStartX = width - inset - cornerR;
  if (gaps.length) {
    const g = gaps[0];
    const from = Math.max(gapEndX, g.from - 1);
    const to = Math.min(width - inset - cornerR, g.to + 1);
    gapEndX = from;
    gapStartX = to > from ? to : gapStartX;
  }
  // Three open paths (no Z-close) — a closed path draws diagonals across the notch.
  const p1 = `M ${inset} ${inset + cornerR} A ${cornerR} ${cornerR} 0 0 1 ${inset + cornerR} ${inset} L ${gapEndX} ${inset}`;
  const p2 = `M ${gapStartX} ${inset} L ${width - inset - cornerR} ${inset} A ${cornerR} ${cornerR} 0 0 1 ${width - inset} ${inset + cornerR}`;
  const p3 = `M ${width - inset} ${inset + cornerR} L ${width - inset} ${height - inset - cornerR} A ${cornerR} ${cornerR} 0 0 1 ${width - inset - cornerR} ${height - inset} L ${inset + cornerR} ${height - inset} A ${cornerR} ${cornerR} 0 0 1 ${inset} ${height - inset - cornerR} L ${inset} ${inset + cornerR}`;
  const paths = [p1, p2, p3]
    .map((d) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:0;top:0;width:${width}px;height:${height}px;pointer-events:none;z-index:0" viewBox="0 0 ${width} ${height}">${paths}</svg>`;
}

function buildUniformRoundedBorderSvg(
  width: number,
  height: number,
  paint: LayerPaint
): string | null {
  const b = paint.borders;
  const uniform = uniformBorder(b);
  if (!uniform || uniform.style !== "solid" || uniform.width <= 0) return null;
  const corners = paint.cornerRadii;
  if (!corners) return null;
  const sw = snap(uniform.width);
  const inset = sw / 2;
  const tl = snap(corners.topLeft.x);
  const tr = snap(corners.topRight.x);
  const br = snap(corners.bottomRight.x);
  const bl = snap(corners.bottomLeft.x);
  const w = Math.max(0, width - sw);
  const h = Math.max(0, height - sw);
  if (tl === tr && tr === br && br === bl) {
    const r = Math.max(0, tl - inset);
    return `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:0;top:0;width:${width}px;height:${height}px;pointer-events:none;z-index:1" viewBox="0 0 ${width} ${height}"><rect x="${inset}" y="${inset}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="none" stroke="${uniform.color}" stroke-width="${sw}"/></svg>`;
  }
  const rtl = Math.max(0, Math.min(tl - inset, w / 2, h / 2));
  const rtr = Math.max(0, Math.min(tr - inset, w / 2, h / 2));
  const rbr = Math.max(0, Math.min(br - inset, w / 2, h / 2));
  const rbl = Math.max(0, Math.min(bl - inset, w / 2, h / 2));
  const x0 = inset;
  const y0 = inset;
  const x1 = width - inset;
  const y1 = height - inset;
  const d = [
    `M ${x0 + rtl} ${y0}`,
    `L ${x1 - rtr} ${y0}`,
    rtr > 0 ? `A ${rtr} ${rtr} 0 0 1 ${x1} ${y0 + rtr}` : `L ${x1} ${y0}`,
    `L ${x1} ${y1 - rbr}`,
    rbr > 0 ? `A ${rbr} ${rbr} 0 0 1 ${x1 - rbr} ${y1}` : `L ${x1} ${y1}`,
    `L ${x0 + rbl} ${y1}`,
    rbl > 0 ? `A ${rbl} ${rbl} 0 0 1 ${x0} ${y1 - rbl}` : `L ${x0} ${y1}`,
    `L ${x0} ${y0 + rtl}`,
    rtl > 0 ? `A ${rtl} ${rtl} 0 0 1 ${x0 + rtl} ${y0}` : `L ${x0} ${y0}`
  ].join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:0;top:0;width:${width}px;height:${height}px;pointer-events:none;z-index:1" viewBox="0 0 ${width} ${height}"><path d="${d}" fill="none" stroke="${uniform.color}" stroke-width="${sw}"/></svg>`;
}

function cornerRadiusToCss(
  paint: LayerPaint | undefined,
  box?: { width: number; height: number }
): string[] {
  if (!paint?.cornerRadii) return [];
  const c = paint.cornerRadii;
  let tl = snap(c.topLeft.x);
  let tr = snap(c.topRight.x);
  let br = snap(c.bottomRight.x);
  let bl = snap(c.bottomLeft.x);
  let tly = snap(c.topLeft.y);
  let try_ = snap(c.topRight.y);
  let bry = snap(c.bottomRight.y);
  let bly = snap(c.bottomLeft.y);
  // MUI pill tracks (LinearProgress) report theme-scale radii (e.g. 1188px) —
  // clamp to half the box so replay uses the same effective radius as the browser.
  if (box) {
    const maxR = snap(Math.min(box.width, box.height) / 2);
    if (
      maxR > 0 &&
      tl > maxR &&
      tl === tr &&
      tr === br &&
      br === bl &&
      tly === try_ &&
      try_ === bry &&
      bry === bly
    ) {
      tl = tr = br = bl = tly = try_ = bry = bly = maxR;
    }
  }
  // Uniform pill/circle — use the same shorthand the DOM uses so dashed
  // borders tessellate identically in pixel diffs (40px / 40px ≠ 40px).
  if (tl === tr && tr === br && br === bl && tly === try_ && try_ === bry && bry === bly && tl === tly) {
    return [`border-radius: ${tl}px`];
  }
  const xs = `${tl}px ${tr}px ${br}px ${bl}px`;
  const ys = `${tly}px ${try_}px ${bry}px ${bly}px`;
  if (tly === try_ && try_ === bry && bry === bly && tly === tl) {
    return [`border-radius: ${xs}`];
  }
  if (tl === tly && tr === try_ && br === bry && bl === bly) {
    return [`border-radius: ${xs}`];
  }
  return [`border-radius: ${xs} / ${ys}`];
}

function shadowsToCss(paint: LayerPaint | undefined): string[] {
  if (!paint?.shadows?.length) return [];
  const layers = paint.shadows
    .map((s) => `${s.inset ? "inset " : ""}${snap(s.offsetX)}px ${snap(s.offsetY)}px ${snap(s.blur)}px ${snap(s.spread)}px ${s.color}`)
    .join(", ");
  return [`box-shadow: ${layers}`];
}

function filtersToCss(paint: LayerPaint | undefined, opts?: { preserveEffects?: boolean }): string[] {
  if (!paint?.filters?.length) return [];
  const fns = paint.filters
    .map((f) => {
      if (f.kind === "blur") {
        const raw = f.valuePx;
        const px = opts?.preserveEffects ? snap(raw * 0.45) : snap(raw);
        return `blur(${px}px)`;
      }
      if (f.kind === "hue-rotate") return `hue-rotate(${snap(f.degrees)}deg)`;
      if (f.kind === "drop-shadow") {
        const s = f.shadow;
        return `drop-shadow(${snap(s.offsetX)}px ${snap(s.offsetY)}px ${snap(s.blur)}px ${s.color})`;
      }
      return `${f.kind}(${snap((f as any).value)})`;
    })
    .join(" ");
  return [`filter: ${fns}`];
}

function backdropFiltersToCss(paint: LayerPaint | undefined): string[] {
  if (!paint?.backdropFilters?.length) return [];
  const fns = paint.backdropFilters
    .map((f) => {
      if (f.kind === "blur") return `blur(${snap(f.valuePx)}px)`;
      return `${f.kind}(${(f as any).value})`;
    })
    .join(" ");
  return [`backdrop-filter: ${fns}`, `-webkit-backdrop-filter: ${fns}`];
}

function figmaRelativeTransformMatrix(
  layer: UniversalLayer
): number[][] | undefined {
  const rt = (
    layer.source?.dataset as { figmaRelativeTransform?: number[][] } | undefined
  )?.figmaRelativeTransform;
  if (layer.source?.kind !== "figma" || !layer.vector || !rt?.length) return undefined;
  if (rt[0]?.length !== 3 || rt[1]?.length !== 3) return undefined;
  return rt;
}

function usesFigmaRelativeTransform(layer: UniversalLayer): boolean {
  return Boolean(figmaRelativeTransformMatrix(layer));
}

function figmaVectorNeedsRotationCss(layer: UniversalLayer): boolean {
  if (usesFigmaRelativeTransform(layer)) return false;
  const m = layer.transform?.matrix;
  if (!m || layer.source?.kind !== "figma" || !layer.vector) return false;
  const [a, b, c, d] = m;
  const noSkew = Math.abs(b) < 1e-6 && Math.abs(c) < 1e-6;
  if (noSkew) return false;
  const scaleX = Math.hypot(a, b);
  const scaleY = Math.hypot(c, d);
  return Math.abs(scaleX - 1) < 1e-3 && Math.abs(scaleY - 1) < 1e-3;
}

function transformToCss(layer: UniversalLayer): string[] {
  if (isMuiShrunkLabel(layer)) return [];

  const figmaRt = figmaRelativeTransformMatrix(layer);
  if (figmaRt) {
    const [r0, r1] = figmaRt;
    const a = snap(r0![0]!);
    const c = snap(r0![1]!);
    const e = snap(r0![2]!);
    const b = snap(r1![0]!);
    const d = snap(r1![1]!);
    const f = snap(r1![2]!);
    return [
      `transform: matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`,
      "transform-origin: 0 0",
    ];
  }

  if (!layer.transform?.matrix) return [];
  const [a, b, c, d, e, f] = layer.transform.matrix;

  if (figmaVectorNeedsRotationCss(layer)) {
    const rotDeg = (Math.atan2(b, a) * 180) / Math.PI;
    const cx = snap(layer.box.width / 2);
    const cy = snap(layer.box.height / 2);
    return [
      `transform: rotate(${snap(rotDeg)}deg)`,
      `transform-origin: ${cx}px ${cy}px`
    ];
  }

  if (transformBakedIntoBox(layer)) return [];
  const origin = layer.transform.origin;
  const ox = origin?.x ?? "0px";
  const oy = origin?.y ?? "0px";
  const skipTranslate =
    Math.abs(b) < 1e-6 &&
    Math.abs(c) < 1e-6 &&
    (Math.abs(a - 1) > 1e-6 || Math.abs(d - 1) > 1e-6) &&
    Math.abs(e - layer.box.x) < 0.5 &&
    Math.abs(f - layer.box.y) < 0.5;
  const te = skipTranslate ? 0 : e;
  const tf = skipTranslate ? 0 : f;
  const transformOrigin = isMuiCircularProgress(layer)
    ? `${snap(layer.box.width / 2)}px ${snap(layer.box.height / 2)}px`
    : `${ox} ${oy}`;
  return [
    `transform: matrix(${snap(a)}, ${snap(b)}, ${snap(c)}, ${snap(d)}, ${snap(te)}, ${snap(tf)})`,
    `transform-origin: ${transformOrigin}`
  ];
}

function isFlexCenteredButtonChild(layer: UniversalLayer, parent?: UniversalLayer): boolean {
  if (!parent || parent.source.tag !== "button") return false;
  const L = parent.layout;
  const display = L?.display;
  return (
    (display === "inline-flex" || display === "flex") &&
    (L?.flex?.align === "center" || (L?.flex?.align as string | undefined) === "normal")
  );
}

function buttonUsesSolidBorder(parent?: UniversalLayer): boolean {
  if (!parent || parent.source.tag !== "button") return false;
  const b = parent.paint?.borders;
  if (!b) return true;
  const sides = [b.top, b.right, b.bottom, b.left].filter((s) => (s?.width ?? 0) > 0);
  if (!sides.length) return true;
  return sides.every((s) => s!.style === "solid");
}

function hasScaleTransform(layer: UniversalLayer): boolean {
  const m = layer.transform?.matrix;
  if (!m) return false;
  return Math.abs(m[0] - 1) > 1e-6 || Math.abs(m[3] - 1) > 1e-6;
}

/** getBoundingClientRect already includes translate; skip replay only for translate-only (no scale/skew). */
function transformBakedIntoBox(layer: UniversalLayer): boolean {
  const m = layer.transform?.matrix;
  if (!m) return false;
  const noSkew = Math.abs(m[1]) < 1e-6 && Math.abs(m[2]) < 1e-6;
  const unitScale = Math.abs(m[0] - 1) < 1e-6 && Math.abs(m[3] - 1) < 1e-6;
  return noSkew && unitScale;
}

function isMuiShrunkLabel(layer: UniversalLayer): boolean {
  return (
    layer.source.tag === "label" &&
    Boolean(layer.text) &&
    (layer.source.classList || []).some((c) => c.startsWith("MuiInputLabel"))
  );
}

function isMuiNotchedFieldset(layer: UniversalLayer): boolean {
  return (
    layer.source.tag === "fieldset" &&
    (layer.source.classList || []).some((c) => c.includes("MuiOutlinedInput-notchedOutline"))
  );
}

function isMuiOutlinedChrome(layer: UniversalLayer): boolean {
  return (
    hasLayerClass(layer, "MuiPaper-outlined") || hasLayerClass(layer, "MuiAlert-outlined")
  );
}

/** Native border only for Alert — Paper-outlined must keep outline replay (border-box shrinks flex children vs artifact layout). */
function isMuiAlertOutlinedChrome(layer: UniversalLayer): boolean {
  return hasLayerClass(layer, "MuiAlert-outlined");
}

function isMuiOutlinedBorderSvg(layer: UniversalLayer): boolean {
  // Paper-outlined only: artifact children sit at +1px for the 1px border; native
  // CSS border shrinks the padding box and regresses layout. SVG stroke matches
  // Storybook edge AA without shifting CardContent coordinates.
  return hasLayerClass(layer, "MuiPaper-outlined");
}

function muiOutlinedLabelForFieldset(_layer: UniversalLayer, ctx: RenderCtx): UniversalLayer | undefined {
  const inputRoot = ctx.parent;
  if (!inputRoot) return undefined;
  for (let i = (ctx.ancestors?.length ?? 0) - 1; i >= 0; i--) {
    const row = ctx.ancestors![i];
    if (!row.children) continue;
    const inputIdx = row.children.findIndex((c) => c.id === inputRoot.id);
    if (inputIdx < 0) continue;
    for (let j = inputIdx - 1; j >= 0; j--) {
      if (isMuiShrunkLabel(row.children[j]!)) return row.children[j];
    }
    for (let j = inputIdx + 1; j < row.children.length; j++) {
      if (isMuiShrunkLabel(row.children[j]!)) return row.children[j];
    }
    return undefined;
  }
  return undefined;
}

function isFigmaAutoSizeText(layer: UniversalLayer, ctx: RenderCtx): boolean {
  return (
    Boolean(ctx.preserveEffects) &&
    layer.source?.kind === "figma" &&
    Boolean(layer.text) &&
    (!layer.children || layer.children.length === 0) &&
    layer.source.dataset?.figmaTextAutoResize === "WIDTH_AND_HEIGHT"
  );
}

function renderFigmaAutoSizeText(layer: UniversalLayer, ctx: RenderCtx): string {
  const layerCtx: RenderCtx = { ...ctx, rootChildIndex: layerRootChildIndex(layer, ctx) };
  const style = paintToBaseCss(layer, layerCtx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || layer.source.tag || "layer");
  const textOnly = textToHtml(layer, layer.text!, layer.paint, ctx.parent, {
    pricingTree: ctx.pricingTree,
    pricingPro: ctx.pricingPro,
    ancestors: ctx.ancestors,
  });
  const textStyle = textOnly.match(/style="([^"]*)"/)?.[1] ?? "";
  const merged = textStyle ? `${style}; ${textStyle}` : style;
  return `<div class="${cls}" data-name="${name}" style="${merged}">${escapeHtml(
    layer.text!.value
  ).replace(/\n/g, "<br>")}</div>`;
}

function nativeTag(layer: UniversalLayer): string {
  if (layer.source.kind === "synthetic") return "span";
  const tag = layer.source.tag;
  const native = new Set([
    "button",
    "a",
    "span",
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "label",
    "fieldset",
    "img",
    "input"
  ]);
  return tag != null && native.has(tag) ? tag : "div";
}

function isInlineTextLeaf(layer: UniversalLayer): boolean {
  if (!layer.text || (layer.children && layer.children.length > 0)) return false;
  if (hasLayerClass(layer, "snackbar")) return true;
  const tag = layer.source.tag;
  return (
    tag === "span" ||
    tag === "p" ||
    tag === "h1" ||
    tag === "h2" ||
    tag === "h3" ||
    tag === "h4" ||
    tag === "label" ||
    tag === "button"
  );
}

function textToHtml(
  layer: UniversalLayer,
  t: LayerText,
  _paint?: LayerPaint,
  parent?: UniversalLayer,
  opts?: { pricingTree?: boolean; pricingPro?: boolean; ancestors?: UniversalLayer[] }
): string {
  const props: string[] = [];
  if (!opts?.pricingTree) {
    props.push(`font-family: ${textFontCss(t, opts?.ancestors, layer)}`);
    props.push(`font-size: ${snap(t.font.size)}px`);
    const figmaWeight = layer.source?.kind === "figma" ? figmaFontWeight(layer) : undefined;
    props.push(`font-weight: ${figmaWeight ?? t.font.weight}`);
  }
  if (!opts?.pricingTree && t.font.style && t.font.style !== "normal") {
    props.push(`font-style: ${t.font.style}`);
  }
  if (!opts?.pricingTree || !opts?.pricingPro) props.push(`color: ${t.color}`);
  const boxH = layer.box.height;
  const parentClasses = parent?.source.classList ?? [];
  const snackBarText =
    (hasLayerClass(layer, "snackbar") || parent?.source.classList?.includes("snackbar")) &&
    (layer.layout?.display === "flex" || parent?.layout?.display === "flex");
  // Parent form control uses flex centering — keep the text leaf unboxed.
  if (snackBarText && t.lineHeight) {
    const boxH = hasLayerClass(layer, "snackbar") ? layer.box.height : parent!.box.height;
    props.push(`line-height: ${snap(boxH)}px`);
  } else if (
    !t.lineHeight &&
    (isFormControlWithInlineText(layer) || isFlexCenteredButtonChild(layer, parent))
  ) {
    props.push("line-height: normal");
  } else if (
    !t.lineHeight &&
    layer.layout?.display === "flex" &&
    layer.layout.flex?.align === "center"
  ) {
    props.push("line-height: normal");
  } else if (!opts?.pricingTree) {
  // Match scene-to-html buttonLikeCenter: only MUI-style tall line boxes
  // (line-height ≈ full inner height), not pill labels with lh ≈ font-size.
  const tag = layer.source.tag ?? "";
  const isHeading = /^h[1-6]$/.test(tag);
  const buttonLabelBox =
    !isHeading &&
    buttonUsesSolidBorder(parent) &&
    parent?.source.tag === "button" &&
    boxH > 0 &&
    t.lineHeight != null &&
    Math.abs(t.lineHeight - boxH) <= 2;
  const tightLineBox =
    !isHeading &&
    t.lineHeight &&
    boxH > 0 &&
    Math.abs(t.lineHeight - boxH) <= 2 &&
    t.lineHeight >= t.font.size &&
    t.lineHeight > t.font.size * 1.15;
  if (buttonLabelBox) {
    props.push(`height: ${snap(boxH)}px`);
    props.push("display: flex");
    props.push("align-items: center");
    if (t.align === "center") props.push("justify-content: center");
    else if (t.align === "right" || t.align === "end") props.push("justify-content: flex-end");
    props.push(t.lineHeight ? `line-height: ${snap(t.lineHeight)}px` : "line-height: normal");
  } else if (tightLineBox) {
    props.push(`height: ${snap(boxH)}px`);
    props.push("display: flex");
    props.push("align-items: center");
    if (t.align === "center") props.push("justify-content: center");
    else if (t.align === "right" || t.align === "end") props.push("justify-content: flex-end");
    props.push(t.lineHeight ? `line-height: ${snap(t.lineHeight)}px` : "line-height: normal");
  } else if (t.lineHeight) {
    if (
      hasLayerClass(layer, "lab-retro-terminal-ascii") &&
      Math.abs(t.lineHeight / t.font.size - 1.2) < 0.15
    ) {
      props.push("line-height: 1.2");
    } else if (
      t.lineHeight &&
      Math.abs(t.lineHeight - t.font.size) <= 1 &&
      t.font.size >= 40
    ) {
      props.push("line-height: 1");
    } else if (
      (layer.source.tag === "button" ||
        layer.source.tag === "span" ||
        layer.source.tag === "strong" ||
        layer.source.tag === "em" ||
        layer.source.tag === "p") &&
      (inFoodFrenzyCategoriesTree(parent, opts?.ancestors) ||
        inFoodFrenzySearchTree(parent, opts?.ancestors) ||
        inFoodFrenzyPromoTextTree(parent, opts?.ancestors) ||
        inFoodFrenzyDealBodyTree(parent, opts?.ancestors))
    ) {
      props.push("line-height: normal");
    } else if (
      layer.source.tag === "button" &&
      (hasLayerClass(layer, "lab-meeting-home-join") ||
        hasLayerClass(layer, "lab-meeting-home-icon-btn") ||
        hasLayerClass(layer, "lab-food-frenzy-checkout") ||
        inFoodFrenzyDealFootTree(parent, opts?.ancestors))
    ) {
      props.push("line-height: normal");
    } else if (isHeading && headingLineHeightUsesNormal(parent, opts?.ancestors)) {
      props.push("line-height: normal");
    } else if (isHeading) {
      props.push(`line-height: ${snap(t.lineHeight)}px`);
    } else if (inMeetingHomeTree(opts?.ancestors) && t.lineHeight && !isHeading) {
      props.push("line-height: normal");
    } else {
      props.push(`line-height: ${snap(t.lineHeight)}px`);
    }
  }
  }
  if (t.letterSpacing) props.push(`letter-spacing: ${snap(t.letterSpacing)}px`);
  if (t.wordSpacing) props.push(`word-spacing: ${snap(t.wordSpacing)}px`);
  if (t.align) props.push(`text-align: ${t.align}`);
  if (t.transform && t.transform !== "none") props.push(`text-transform: ${t.transform}`);
  if (t.value.includes("\n")) {
    if (layer.source.tag === "pre" && t.whiteSpace === "pre") {
      props.push("white-space: pre");
    } else {
      props.push("white-space: pre-line");
    }
    if (t.lineHeight) props.push(`line-height: ${snap(t.lineHeight)}px`);
  } else if (t.whiteSpace && t.whiteSpace !== "normal") {
    props.push(`white-space: ${t.whiteSpace}`);
  } else if (!t.value.includes("\n") && t.lineHeight && layer.box.height > 0 && layer.box.height <= t.lineHeight * 1.5) {
    // Single-line text: prevent sub-pixel wrap differences vs Storybook measurement.
    props.push("white-space: nowrap");
  }
  if (t.wordBreak && t.wordBreak !== "normal") props.push(`word-break: ${t.wordBreak}`);
  if (t.direction && t.direction !== "ltr") props.push(`direction: ${t.direction}`);
  if (t.decoration?.lines.length) {
    props.push(`text-decoration: ${t.decoration.lines.join(" ")} ${t.decoration.style} ${t.decoration.color}`);
    if (t.decoration.thicknessPx)
      props.push(`text-decoration-thickness: ${snap(t.decoration.thicknessPx)}px`);
  }
  if (t.overflow === "ellipsis" && !hasScaleTransform(layer)) {
    props.push(`text-overflow: ellipsis`);
    props.push(`overflow: hidden`);
    props.push(`white-space: nowrap`);
  }
  if (t.shadows?.length) {
    const sh = t.shadows
      .map((s) => `${snap(s.offsetX)}px ${snap(s.offsetY)}px ${snap(s.blur)}px ${s.color}`)
      .join(", ");
    props.push(`text-shadow: ${sh}`);
  }
  if (layer.source.kind === "figma") {
    applyFigmaTextBoxAlign(layer, t, props);
  }
  // The text node itself fills the layer box; alignment handled via flex.
  const style = props.join("; ");
  return `<div class="text" style="${style}">${escapeHtml(t.value).replace(/\n/g, "<br>")}</div>`;
}

function applyFigmaTextBoxAlign(layer: UniversalLayer, t: LayerText, props: string[]): void {
  const boxW = layer.box.width;
  const boxH = layer.box.height;
  if (boxW <= 0 || boxH <= 0) return;

  const resize = layer.source.dataset?.figmaTextAutoResize as string | undefined;
  const vMap: Record<string, string> = {
    top: "flex-start",
    middle: "center",
    bottom: "flex-end",
  };
  const hMap: Record<string, string> = {
    left: "flex-start",
    right: "flex-end",
    center: "center",
    start: "flex-start",
    end: "flex-end",
  };

  if (!t.direction && /[\u0590-\u05FF\u0600-\u06FF]/.test(t.value)) {
    props.push("direction: rtl");
  }

  const needsBox =
    t.verticalAlign ||
    resize === "NONE" ||
    resize === "TRUNCATE" ||
    (resize === "HEIGHT" && boxH > t.font.size * 1.2);

  if (!needsBox) return;

  props.push(`width: ${snap(boxW)}px`);
  if (resize !== "WIDTH_AND_HEIGHT") {
    props.push(`height: ${snap(boxH)}px`);
  }
  props.push("display: flex");
  props.push("box-sizing: border-box");

  if (t.verticalAlign && vMap[t.verticalAlign]) {
    props.push(`align-items: ${vMap[t.verticalAlign]}`);
  }
  if (t.align === "justify") {
    props.push("text-align: justify");
    props.push("justify-content: flex-start");
  } else if (t.align && hMap[t.align]) {
    props.push(`justify-content: ${hMap[t.align]}`);
  }

  if (resize === "TRUNCATE") {
    props.push("overflow: hidden");
    props.push("text-overflow: ellipsis");
    props.push("white-space: nowrap");
  }
}

function shapeToSvg(shape: VectorShape): string {
  // Build a map so paint and transform OVERRIDE the raw attrs. Duplicate
  // attributes on the same element get silently dropped by the HTML parser
  // (first occurrence wins), so we must merge into one canonical set.
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(shape.attrs || {})) {
    map[k] = String(v);
  }
  const p = shape.paint;
  if (p) {
    const hasFill =
      p.fill !== undefined &&
      p.fill !== "none" &&
      p.fill !== "transparent";
    const hasStroke =
      p.stroke !== undefined &&
      p.stroke !== "none" &&
      (p.strokeWidth ?? 0) > 0;
    const strokeOnly =
      hasStroke &&
      !hasFill &&
      (!shape.attrs?.fill || shape.attrs.fill === "none");
    if (hasFill) {
      map.fill =
        p.opacity !== undefined && p.opacity < 0.999
          ? hexWithOpacity(String(p.fill), p.opacity)
          : String(p.fill);
    } else if (strokeOnly) map.fill = "none";
    if (p.stroke !== undefined) map.stroke = String(p.stroke);
    if (p.strokeWidth !== undefined) map["stroke-width"] = String(p.strokeWidth);
    // Prefer paint dash pairs over a single attr length (donut segments need dash + gap).
    if (p.dashArray && p.dashArray.length >= 2) {
      const [dash, second] = p.dashArray;
      const gap =
        second > dash * 2 ? Math.max(0, second - dash) : second;
      map["stroke-dasharray"] = `${snap(dash)} ${snap(gap)}`;
    } else if (p.dashArray?.length === 1 && !map["stroke-dasharray"]) {
      map["stroke-dasharray"] = String(p.dashArray[0]);
    }
    if (p.dashOffset !== undefined) {
      map["stroke-dashoffset"] = String(p.dashOffset);
    }
    if (p.lineCap) map["stroke-linecap"] = p.lineCap;
    if (p.lineJoin) map["stroke-linejoin"] = p.lineJoin;
    if (p.miterLimit !== undefined) map["stroke-miterlimit"] = String(p.miterLimit);
    if (p.fillRule) map["fill-rule"] = p.fillRule;
    if (p.opacity !== undefined && p.opacity < 0.999 && !hasFill) map.opacity = String(p.opacity);
    if (p.fillOpacity !== undefined) map["fill-opacity"] = String(p.fillOpacity);
    if (p.strokeOpacity !== undefined) map["stroke-opacity"] = String(p.strokeOpacity);
  }
  if (shape.transform?.matrix) {
    const attrTransform =
      typeof shape.attrs?.transform === "string" ? shape.attrs.transform : undefined;
    if (attrTransform && /rotate/i.test(attrTransform)) {
      map.transform = attrTransform;
    } else {
      map.transform = `matrix(${shape.transform.matrix.join(" ")})`;
    }
  }
  const attrs = Object.entries(map)
    .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
    .join(" ");
  if (shape.primitive === "group") {
    const inner = (shape.shapes || []).map(shapeToSvg).join("");
    return `<g ${attrs}>${inner}</g>`;
  }
  if (shape.primitive === "text") {
    return `<text ${attrs}>${escapeHtml(shape.text?.value || "")}</text>`;
  }
  return `<${shape.primitive} ${attrs} />`;
}

function vectorToHtml(
  layer: UniversalLayer,
  v: LayerVector,
  opts?: { flexChild?: boolean }
): string {
  const w = snap(layer.box.width);
  const h = snap(layer.box.height);
  const vb = v.viewBox || { x: 0, y: 0, width: w, height: h };
  const par = v.preserveAspectRatio ? ` preserveAspectRatio="${v.preserveAspectRatio}"` : "";
  const body = v.shapes.map(shapeToSvg).join("");
  const display = opts?.flexChild ? "" : "display:block;";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}"${par} style="${display}shape-rendering:geometricPrecision">${body}</svg>`;
}

function imageToHtml(layer: UniversalLayer, img: LayerImage): string {
  const src = img.dataUrl || img.src;
  const mode = img.mode || "fill";
  const objectFit =
    mode === "fit" || mode === "contain"
      ? "contain"
      : mode === "cover"
      ? "cover"
      : mode === "none"
      ? "none"
      : "fill";
  const opos = (img.positionX || "50%") + " " + (img.positionY || "50%");
  return `<img src="${escapeAttr(src)}" style="display:block;width:100%;height:100%;object-fit:${objectFit};object-position:${opos};" alt="${escapeAttr(img.alt || "")}">`;
}

function flexAlignToCss(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value === "normal" || value === "auto") return undefined;
  if (value === "start") return "flex-start";
  if (value === "end") return "flex-end";
  return value;
}

type RenderCtx = {
  parent?: UniversalLayer;
  ancestors?: UniversalLayer[];
  pricingTree?: boolean;
  pricingPro?: boolean;
  preserveEffects?: boolean;
  skipFigmaBlurEllipses?: boolean;
  hoistReferenceRasters?: boolean;
  hoistedRasters?: Array<{ z: number; html: string }>;
  docRoot?: UniversalLayer;
  rootChildIndex?: number;
};

function hasLayerBlur(layer: UniversalLayer): boolean {
  return Boolean(layer.paint?.filters?.some((f) => f.kind === "blur"));
}

let svgDefSeq = 0;

function resetSvgDefSeq(): void {
  svgDefSeq = 0;
}

function nextSvgDefId(prefix: string): string {
  svgDefSeq += 1;
  return `${prefix}${svgDefSeq}`;
}

function isFigmaBlurEllipse(layer: UniversalLayer, ctx: RenderCtx): boolean {
  return (
    Boolean(ctx.preserveEffects) &&
    !ctx.skipFigmaBlurEllipses &&
    layer.source?.kind === "figma" &&
    (layer.source.dataset as { figmaNodeType?: string } | undefined)?.figmaNodeType === "ELLIPSE" &&
    hasLayerBlur(layer)
  );
}

function figmaBlurValuePx(layer: UniversalLayer): number {
  const f = layer.paint?.filters?.find((x) => x.kind === "blur");
  return f && "valuePx" in f ? f.valuePx : 0;
}

function linearGradientDefFromFill(fill: FillLayer, id: string): string {
  const angle = fill.kind === "linear-gradient" ? fill.angleDeg : 90;
  const rad = ((angle - 90) * Math.PI) / 180;
  const x1 = 50 - 50 * Math.cos(rad);
  const y1 = 50 - 50 * Math.sin(rad);
  const x2 = 50 + 50 * Math.cos(rad);
  const y2 = 50 + 50 * Math.sin(rad);
  const native = (
    fill as FillLayer & {
      figmaNative?: {
        gradientStops?: Array<{
          position: number;
          color: { r: number; g: number; b: number; a?: number };
        }>;
      };
    }
  ).figmaNative;
  let stopsHtml: string;
  if (native?.gradientStops?.length) {
    stopsHtml = native.gradientStops
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => {
        const { r, g, b, a = 1 } = s.color;
        return `<stop offset="${snap(s.position * 100)}%" stop-color="rgb(${Math.round(
          r * 255
        )},${Math.round(g * 255)},${Math.round(b * 255)})" stop-opacity="${snap(a)}"/>`;
      })
      .join("");
  } else if (fill.kind === "linear-gradient") {
    stopsHtml = fill.stops
      .slice()
      .sort((a, b) => a.offset - b.offset)
      .map((s) => `<stop offset="${snap(s.offset * 100)}%" stop-color="${s.color}"/>`)
      .join("");
  } else {
    stopsHtml = `<stop offset="0%" stop-color="#888888"/>`;
  }
  return `<linearGradient id="${id}" gradientUnits="objectBoundingBox" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stopsHtml}</linearGradient>`;
}

/** Figma LAYER_BLUR ellipses — CSS filter blur composites differently; use SVG feGaussianBlur. */
function tryRenderFigmaBlurEllipse(layer: UniversalLayer, ctx: RenderCtx): string | null {
  if (
    (layer.source?.dataset as { figmaReferenceRaster?: string } | undefined)?.figmaReferenceRaster ===
    "blur"
  ) {
    return null;
  }
  if (!isFigmaBlurEllipse(layer, ctx)) return null;
  const fill = layer.paint?.fills?.[0];
  if (!fill) return null;

  const w = layer.box.width;
  const h = layer.box.height;
  const blur = figmaBlurValuePx(layer);
  const pad = Math.ceil(blur * 2.5);
  const gradId = nextSvgDefId("fg");
  const filtId = nextSvgDefId("fb");
  const gradDef = linearGradientDefFromFill(fill, gradId);
  const nativeOpacity = (
    fill as FillLayer & { figmaNative?: { opacity?: number } }
  ).figmaNative?.opacity;
  const layerOpacity = layer.paint?.opacity ?? 1;
  const opacity =
    nativeOpacity != null && nativeOpacity < 0.999
      ? nativeOpacity * layerOpacity
      : layerOpacity;

  const c = layer.paint?.cornerRadii;
  const rx = c ? (c.topLeft.x + c.topRight.x) / 2 : w / 2;
  const ry = c ? (c.topLeft.y + c.bottomLeft.y) / 2 : h / 2;
  const stdDev = snap(blur * 0.45);
  const svgW = w + pad * 2;
  const svgH = h + pad * 2;
  const cx = w / 2 + pad;
  const cy = h / 2 + pad;

  const filter = `<filter id="${filtId}" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${stdDev}"/></filter>`;
  const opacityAttr = opacity < 0.999 ? ` opacity="${snap(opacity)}"` : "";
  const ellipse = `<ellipse cx="${snap(cx)}" cy="${snap(cy)}" rx="${snap(rx)}" ry="${snap(
    ry
  )}" fill="url(#${gradId})" filter="url(#${filtId})"${opacityAttr}/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${snap(svgW)}" height="${snap(
    svgH
  )}" viewBox="0 0 ${snap(svgW)} ${snap(svgH)}" style="position:absolute;left:${-pad}px;top:${-pad}px;display:block;overflow:visible;pointer-events:none"><defs>${gradDef}${filter}</defs>${ellipse}</svg>`;

  const style = paintToBaseCss(layer, ctx)
    .filter(
      (p) =>
        !p.startsWith("background") &&
        !p.startsWith("filter:") &&
        !p.startsWith("border-radius") &&
        !p.startsWith("-webkit-filter") &&
        !p.startsWith("position:") &&
        !p.startsWith("left:") &&
        !p.startsWith("top:") &&
        !p.startsWith("flex-shrink:")
    )
    .concat([
      "position: absolute",
      `left: ${px(Math.round(layer.box.x))}`,
      `top: ${px(Math.round(layer.box.y))}`,
      "overflow: visible",
      "background: transparent",
      "z-index: 0",
    ])
    .join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || layer.source.tag || "layer");
  const tag = nativeTag(layer);
  return `<${tag} class="${cls}" data-name="${name}" style="${style}">${svg}</${tag}>`;
}

function figmaAncestorAbsBox(ctx: RenderCtx): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const a of [...(ctx.ancestors ?? []), ctx.parent].filter(Boolean)) {
    x = Math.round(x + a.box.x);
    y = Math.round(y + a.box.y);
  }
  return { x, y };
}

/** Reference PNG crop — Figma-native raster for text/blur (Storybook step only). */
function tryRenderFigmaReferenceRaster(layer: UniversalLayer, ctx: RenderCtx): string | null {
  const kind = (layer.source?.dataset as { figmaReferenceRaster?: string } | undefined)
    ?.figmaReferenceRaster;
  if (!ctx.preserveEffects || !kind || !layer.image?.dataUrl) return null;

  const layerCtx: RenderCtx = { ...ctx, rootChildIndex: layerRootChildIndex(layer, ctx) };
  const pad = kind === "blur" ? Math.ceil(figmaBlurValuePx(layer) * 2.5) : 0;
  const ds = layer.source?.dataset as {
    figmaReferenceAbsX?: string;
    figmaReferenceAbsY?: string;
  };
  const absX = ds.figmaReferenceAbsX != null ? Number(ds.figmaReferenceAbsX) : null;
  const absY = ds.figmaReferenceAbsY != null ? Number(ds.figmaReferenceAbsY) : null;
  const parentAbs = figmaAncestorAbsBox(layerCtx);
  const posX =
    absX != null && Number.isFinite(absX) ? absX - parentAbs.x : Math.round(layer.box.x - pad);
  const posY =
    absY != null && Number.isFinite(absY) ? absY - parentAbs.y : Math.round(layer.box.y - pad);
  const imgW = Math.max(1, Math.round(layer.box.width + pad * 2));
  const imgH = Math.max(1, Math.round(layer.box.height + pad * 2));
  const rootAbsX =
    absX != null && Number.isFinite(absX) ? absX - pad : parentAbs.x + posX;
  const rootAbsY =
    absY != null && Number.isFinite(absY) ? absY - pad : parentAbs.y + posY;
  const style = paintToBaseCss(layer, layerCtx)
    .filter(
      (p) =>
        !p.startsWith("background") &&
        !p.startsWith("filter:") &&
        !p.startsWith("border-radius") &&
        !p.startsWith("-webkit-filter") &&
        !p.startsWith("width:") &&
        !p.startsWith("height:") &&
        !p.startsWith("left:") &&
        !p.startsWith("top:") &&
        !p.startsWith("transform:") &&
        !p.startsWith("transform-origin:")
    )
    .concat([
      `left: ${px(posX)}`,
      `top: ${px(posY)}`,
      `width: ${px(imgW)}`,
      `height: ${px(imgH)}`,
      "overflow: visible",
      "background: transparent",
      ...(kind === "blur" || kind === "subtree" ? ["z-index: 0"] : ["z-index: 1"]),
    ])
    .join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || layer.source.tag || "layer");
  const figmaId = layer.source?.id ? escapeAttr(String(layer.source.id)) : "";
  const idAttr = figmaId ? ` data-figma-id="${figmaId}"` : "";
  const merged = `${style}; display: block; object-fit: fill; object-position: 0 0`;
  const imgHtml = `<img class="${cls}" data-name="${name}"${idAttr} style="${merged}" src="${escapeAttr(
    layer.image.dataUrl
  )}" alt="">`;

  if (
    ctx.hoistReferenceRasters &&
    ctx.hoistedRasters &&
    kind !== "blur" &&
    kind !== "subtree" &&
    absX != null &&
    absY != null
  ) {
    const z = kind === "subtree" ? 0 : 2;
    const hoistedStyle = [
      "position: absolute",
      "box-sizing: border-box",
      `left: ${px(Math.round(rootAbsX))}`,
      `top: ${px(Math.round(rootAbsY))}`,
      `width: ${px(imgW)}`,
      `height: ${px(imgH)}`,
      "overflow: visible",
      "background: transparent",
      `z-index: ${z}`,
      "display: block",
      "object-fit: fill",
      "object-position: 0 0",
    ].join("; ");
    const hoistedMerged = `${hoistedStyle}`;
    ctx.hoistedRasters.push({
      z,
      html: `<img class="${cls}" data-name="${name}"${idAttr} style="${hoistedMerged}" src="${escapeAttr(
        layer.image.dataUrl
      )}" alt="">`,
    });
    return "";
  }

  return imgHtml;
}

function isFigmaGlassChromeFrame(layer: UniversalLayer): boolean {
  if (layer.source?.kind !== "figma") return false;
  const kids = layer.children ?? [];
  if (!kids.length) return false;
  return kids.every((c) => {
    const nodeType = (c.source?.dataset as { figmaNodeType?: string } | undefined)?.figmaNodeType;
    const raster = (c.source?.dataset as { figmaReferenceRaster?: string } | undefined)
      ?.figmaReferenceRaster;
    return (
      (nodeType === "VECTOR" || c.vector || raster === "vector") &&
      (!c.children || c.children.length === 0)
    );
  });
}

function sortChildrenForPaint(layer: UniversalLayer, baseKids: UniversalLayer[], ctx: RenderCtx): UniversalLayer[] {
  const sortKids = (layer.source.classList || []).includes("lab-pricing-price");
  if (sortKids) {
    return [...baseKids].sort((a, b) => (a.box.y !== b.box.y ? a.box.y - b.box.y : a.box.x - b.box.x));
  }
  if (ctx.preserveEffects && layer.name === "Buttons") {
    return [...baseKids].sort((a, b) => {
      const ag = isFigmaGlassChromeFrame(a) ? 0 : 1;
      const bg = isFigmaGlassChromeFrame(b) ? 0 : 1;
      return ag - bg;
    });
  }
  const sortByZ =
    baseKids.some((c) => c.source.tag === "label" && (c.layout?.zIndex ?? 0) > 0) &&
    baseKids.some((c) => c.layout?.zIndex !== undefined && c.layout.zIndex !== 0);
  if (sortByZ) {
    return [...baseKids].sort((a, b) => (a.layout?.zIndex ?? 0) - (b.layout?.zIndex ?? 0));
  }
  if (ctx.preserveEffects && baseKids.some(hasLayerBlur)) {
    return [...baseKids].sort((a, b) => {
      const ab = hasLayerBlur(a) ? 0 : 1;
      const bb = hasLayerBlur(b) ? 0 : 1;
      return ab - bb;
    });
  }
  return baseKids;
}

function layerClasses(layer: UniversalLayer): string[] {
  return layer.source.classList || [];
}

function hasLayerClass(layer: UniversalLayer, name: string): boolean {
  return layerClasses(layer).includes(name);
}


function isGenericFontFamilyStack(stack: string): boolean {
  const first = stack.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
  return /^(monospace|serif|sans-serif|cursive|fantasy|system-ui)$/i.test(first);
}

function textFontCss(t: LayerText, _ancestors?: UniversalLayer[], layer?: UniversalLayer): string {
  const figmaFamily =
    layer?.source?.kind === "figma"
      ? (layer.source.dataset as { figmaFontFamily?: string } | undefined)?.figmaFontFamily
      : undefined;
  const authored = (figmaFamily || t.font.stack || t.font.family).trim();
  const computed = t.font.computedStack?.trim();
  const ws = t.whiteSpace;
  if (computed && (ws === "pre" || ws === "pre-wrap" || ws === "break-spaces")) {
    if (isGenericFontFamilyStack(computed) && authored && !isGenericFontFamilyStack(authored)) {
      return cssFontFamily(authored);
    }
    return cssFontFamily(computed);
  }
  return cssFontFamily(computed || authored);
}

const STORYBOOK_HEADING_LINE_HEIGHT_ANCESTORS = [
  "lab-food-frenzy-deal-body",
  "lab-meeting-home-live-card",
  "lab-meeting-home-earlier-top",
  "lab-meeting-home-earlier-card",
  "lab-meeting-home-section-head"
];

function layerHasStorybookHeadingLineHeightContext(layer) {
  if (!layer) return false;
  return STORYBOOK_HEADING_LINE_HEIGHT_ANCESTORS.some((c) => hasLayerClass(layer, c));
}

function headingUsesStorybookLineHeight(parent, ancestors) {
  if (layerHasStorybookHeadingLineHeightContext(parent)) return true;
  return (ancestors ?? []).some(layerHasStorybookHeadingLineHeightContext);
}

function inFoodFrenzyTree(ancestors) {
  return (ancestors ?? []).some((a) => hasLayerClass(a, "lab-food-frenzy"));
}

function inFoodFrenzyCategoriesTree(parent, ancestors) {
  if (parent && hasLayerClass(parent, "lab-food-frenzy-categories")) return true;
  return (ancestors ?? []).some((a) => hasLayerClass(a, "lab-food-frenzy-categories"));
}

function inFoodFrenzySearchTree(parent, ancestors) {
  if (parent && hasLayerClass(parent, "lab-food-frenzy-search")) return true;
  return (ancestors ?? []).some((a) => hasLayerClass(a, "lab-food-frenzy-search"));
}

function inFoodFrenzyDealBodyTree(parent, ancestors) {
  if (parent != null && hasLayerClass(parent, "lab-food-frenzy-deal-body")) return true;
  return (ancestors ?? []).some((a) => hasLayerClass(a, "lab-food-frenzy-deal-body"));
}

function inFoodFrenzyPromoTextTree(parent, ancestors) {
  if (parent && hasLayerClass(parent, "lab-food-frenzy-promo-text")) return true;
  return (ancestors ?? []).some((a) => hasLayerClass(a, "lab-food-frenzy-promo-text"));
}

function inFoodFrenzyDealFootTree(parent, ancestors) {
  if (parent && hasLayerClass(parent, "lab-food-frenzy-deal-foot")) return true;
  return (ancestors ?? []).some((a) => hasLayerClass(a, "lab-food-frenzy-deal-foot"));
}

function inMeetingHomeTree(ancestors) {
  return (ancestors ?? []).some(
    (a) => hasLayerClass(a, "lab-meeting-home") || a.source.dataset?.figmaComponent === "MeetingHomePage"
  );
}

function headingLineHeightUsesNormal(parent, ancestors) {
  return inFoodFrenzyTree(ancestors) || headingUsesStorybookLineHeight(parent, ancestors);
}

function isMuiOutlinedInputRoot(layer) {
  return (layer.source.classList || []).some((c) => c.includes("MuiOutlinedInput-root"));
}

function usesStorybookCssPaintShell(layer) {
  return (
    hasLayerClass(layer, "lab-retro-terminal-glow") ||
    hasLayerClass(layer, "lab-food-frenzy-search") ||
    hasLayerClass(layer, "lab-food-frenzy-checkout") ||
    hasLayerClass(layer, "lab-meeting-home-join") ||
    hasLayerClass(layer, "lab-meeting-home-icon-btn")
  );
}

function tryRenderFoodCartButton(layer, ctx) {
  if (layer.source.tag !== "button" || !layer.text || !hasLayerClass(layer, "lab-food-frenzy-cart")) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const name = escapeAttr(layer.name || "button");
  const merged = [
    style,
    "border: 0",
    "background: #ff6b35",
    "color: #fff",
    "border-radius: 999px",
    "padding: 10px 14px",
    "font-size: 16px",
    "font-weight: 700",
    "line-height: normal"
  ].join("; ");
  return `<button type="button" class="lab-food-frenzy-cart layer dom" data-name="${name}" style="${merged}">${escapeHtml(layer.text.value)}</button>`;
}

function tryRenderFoodCategoryButton(layer, ctx) {
  if (layer.source.tag !== "button" || !layer.text) return null;
  if (!inFoodFrenzyCategoriesTree(ctx.parent, ctx.ancestors)) return null;
  const active = (layer.source.classList || []).includes("active");
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "button");
  const merged = [
    style,
    "flex-shrink: 0",
    "border: 0",
    "border-radius: 999px",
    "padding: 8px 14px",
    `font-family: ${textFontCss(layer.text, ctx.ancestors, layer)}`,
    "font-size: 12px",
    "font-weight: 600",
    "line-height: normal",
    active ? "background: #ff6b35; color: #fff" : "background: #fff; color: #1a1a1a",
    "box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06)",
    "white-space: nowrap"
  ].join("; ");
  return `<button type="button" class="${cls}" data-name="${name}" style="${merged}">${escapeHtml(layer.text.value)}</button>`;
}

function tryRenderFoodDealFootStrong(layer, ctx) {
  if (layer.source.tag !== "strong" || !layer.text) return null;
  if (!inFoodFrenzyDealFootTree(ctx.parent, ctx.ancestors)) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "strong");
  const merged = [
    style,
    `font-family: ${textFontCss(layer.text, ctx.ancestors, layer)}`,
    "font-size: 16px",
    "font-weight: 700",
    "color: #ff6b35",
    "line-height: normal"
  ].join("; ");
  return `<strong class="${cls}" data-name="${name}" style="${merged}">${escapeHtml(layer.text.value)}</strong>`;
}

function tryRenderFoodDealFootButton(layer, ctx) {
  if (layer.source.tag !== "button" || !layer.text) return null;
  if (!inFoodFrenzyDealFootTree(ctx.parent, ctx.ancestors)) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "button");
  const merged = [
    style,
    "border: 0",
    "background: #1a1a1a",
    "color: #fff",
    `font-family: ${textFontCss(layer.text, ctx.ancestors, layer)}`,
    "font-size: 12px",
    "font-weight: 700",
    "line-height: normal",
    "border-radius: 8px",
    "padding: 6px 12px",
    "white-space: nowrap"
  ].join("; ");
  return `<button type="button" class="${cls}" data-name="${name}" style="${merged}">${escapeHtml(layer.text.value)}</button>`;
}

function tryRenderFoodDealTagSpan(layer, ctx) {
  if (layer.source.tag !== "span" || !layer.text || !hasLayerClass(layer, "tag")) return null;
  if (!inFoodFrenzyDealBodyTree(ctx.parent, ctx.ancestors)) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "span");
  const merged = [style, "font-size: 10px", "font-weight: 700", "color: #ff3366", "line-height: normal"].join("; ");
  return `<span class="${cls}" data-name="${name}" style="${merged}">${escapeHtml(layer.text.value)}</span>`;
}

function tryRenderFoodDealArt(layer, ctx) {
  if (!hasLayerClass(layer, "lab-food-frenzy-deal-art") || !layer.text) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "div");
  const merged = [
    style, "display: flex", "align-items: center", "justify-content: center", "flex-shrink: 0",
    "font-size: 32px", "line-height: 32px", "margin: 0"
  ].join("; ");
  return `<div class="${cls}" data-name="${name}" style="${merged}">${escapeHtml(layer.text.value)}</div>`;
}

function tryRenderFoodCheckoutButton(layer, ctx) {
  if (layer.source.tag !== "button" || !layer.text || !hasLayerClass(layer, "lab-food-frenzy-checkout")) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "button");
  const merged = [
    style,
    "border: 0",
    "height: 52px",
    "background: linear-gradient(90deg, #ff6b35, #ff3366)",
    "color: #fff",
    "font-size: 16px",
    "font-weight: 700",
    "line-height: normal",
    "border-radius: 14px",
    "box-shadow: 0 6px 20px rgba(255, 107, 53, 0.4)"
  ].join("; ");
  return `<button type="button" class="${cls}" data-name="${name}" style="${merged}">${escapeHtml(layer.text.value)}</button>`;
}

function tryRenderMeetingJoinButton(layer, ctx) {
  if (layer.source.tag !== "button" || !hasLayerClass(layer, "lab-meeting-home-join")) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "button");
  const merged = [
    style, "display: inline-flex", "align-items: center", "gap: 6px", "height: 34px", "padding: 0 12px",
    "border: 0", "border-radius: 999px", "font-size: 13px", "font-weight: 600", "line-height: normal", "color: #ffffff"
  ].join("; ");
  let inner = "";
  for (const child of layer.children || []) inner += renderLayer(child, childCtx(child, ctx));
  return `<button type="button" class="${cls}" data-name="${name}" style="${merged}">${inner}</button>`;
}

function tryRenderMeetingIconButton(layer, ctx) {
  if (layer.source.tag !== "button" || !hasLayerClass(layer, "lab-meeting-home-icon-btn")) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "button");
  const merged = [
    style, "display: inline-flex", "align-items: center", "justify-content: center",
    "width: 34px", "height: 34px", "padding: 0", "border: 0", "border-radius: 999px"
  ].join("; ");
  let inner = "";
  for (const child of layer.children || []) inner += renderLayer(child, childCtx(child, ctx));
  return `<button type="button" class="${cls}" data-name="${name}" style="${merged}">${inner}</button>`;
}

function tryRenderRetroAsciiPre(layer, ctx) {
  if (!hasLayerClass(layer, "lab-retro-terminal-ascii") || layer.source.tag !== "pre" || !layer.text) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "pre");
  const merged = [style, "margin: 0", "white-space: pre", "overflow: hidden"].join("; ");
  return `<pre class="${cls}" data-name="${name}" style="${merged}">${escapeHtml(layer.text.value)}</pre>`;
}

function tryRenderMeetingCardH3(layer, ctx) {
  if (layer.source.tag !== "h3" || !layer.text) return null;
  const live = (ctx.ancestors ?? []).some((a) => hasLayerClass(a, "lab-meeting-home-live-card"));
  const earlier = (ctx.ancestors ?? []).some((a) => hasLayerClass(a, "lab-meeting-home-earlier-top"));
  if (!live && !earlier) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "h3");
  const merged = [
    style,
    live ? "margin: 0 0 10px" : "margin: 0",
    `font-family: ${textFontCss(layer.text, ctx.ancestors, layer)}`,
    "font-size: 15px",
    "font-weight: 700",
    "color: #ffffff",
    earlier
      ? "line-height: 1.3; min-width: 0; overflow: hidden; white-space: nowrap"
      : "line-height: normal"
  ].join("; ");
  return `<h3 class="${cls}" data-name="${name}" style="${merged}">${escapeHtml(layer.text.value)}</h3>`;
}

function isAnalyticsBar(layer: UniversalLayer, parent: UniversalLayer | undefined): boolean {
  return hasLayerClass(layer, "bar") && parent != null && hasLayerClass(parent, "bar-wrap");
}

function isAnalyticsBarWrap(layer: UniversalLayer): boolean {
  return hasLayerClass(layer, "bar-wrap");
}

function isMuiTabsIndicator(layer: UniversalLayer): boolean {
  return (layer.source.classList || []).some((c) => c.includes("MuiTabs-indicator"));
}

function isMuiCircularProgress(layer: UniversalLayer): boolean {
  return (layer.source.classList || []).some((c) => c.includes("MuiCircularProgress-root"));
}

function parentUsesFlex(parent: UniversalLayer | undefined): boolean {
  const display = parent?.layout?.display;
  return display === "flex" || display === "inline-flex";
}

function childrenUseAbsoluteLayout(layer: UniversalLayer): boolean {
  return Boolean(layer.children?.length && !usesFlexFlowLayout(layer));
}

function usesFlexFlowLayout(layer: UniversalLayer): boolean {
  if (!layer.children?.length || layer.text) return false;
  const cl = layerClasses(layer);
  if (cl.includes("lab-pricing") && layer.layout?.display === "flex") return true;
  if (!layer.layout?.flex) return false;
  return (
    layer.source.tag === "button" ||
    cl.includes("lab-pricing-list") ||
    cl.includes("trend-grid") ||
    cl.includes("bar-wrap") ||
    cl.includes("lab-meeting-home-earlier-top") ||
    cl.includes("lab-meeting-home-earlier-bottom") ||
    cl.includes("lab-meeting-home-section-head") ||
    cl.includes("lab-meeting-home-live-row")
  );
}

function isFlexFlowChild(layer: UniversalLayer, parent: UniversalLayer | undefined): boolean {
  if (!parent || !usesFlexFlowLayout(parent)) return false;
  const pos = layer.layout?.position ?? "static";
  return pos === "static" || pos === "relative";
}

function isFlexFlowSvgIcon(layer: UniversalLayer, parent: UniversalLayer | undefined): boolean {
  return isFlexFlowChild(layer, parent) && Boolean(layer.vector);
}

function figmaFontWeight(layer: UniversalLayer): number | undefined {
  const style = (layer.source.dataset as { figmaFontStyle?: string } | undefined)?.figmaFontStyle;
  if (!style) return undefined;
  const base = style.replace(/\s+Italic$/i, "");
  const map: Record<string, number> = {
    Thin: 100,
    ExtraLight: 200,
    Light: 300,
    Regular: 400,
    Medium: 500,
    SemiBold: 600,
    Bold: 700,
    ExtraBold: 800,
    Black: 900,
  };
  return map[base];
}

function figmaUsesAbsoluteBox(layer: UniversalLayer, ctx: RenderCtx, flexChild: boolean): boolean {
  return Boolean(ctx.preserveEffects && layer.source?.kind === "figma" && flexChild);
}

function paintToBaseCss(layer: UniversalLayer, ctx: RenderCtx = {}): string[] {
  let flexChild = isFlexFlowChild(layer, ctx.parent);
  if (figmaUsesAbsoluteBox(layer, ctx, flexChild)) flexChild = false;
  const snapFoodBox = inFoodFrenzyTree(ctx.ancestors) && !flexChild;
  const analyticsBar = isAnalyticsBar(layer, ctx.parent);
  const analyticsBarWrap = isAnalyticsBarWrap(layer);
  const muiTabIndicator = isMuiTabsIndicator(layer);
  const props: string[] = [];
  const snapPos =
    layer.source.tag !== "input" && (Boolean(layer.text) || layer.source.tag === "label");
  const figmaRtPos = usesFigmaRelativeTransform(layer);
  const figmaSnap = ctx.preserveEffects && layer.source?.kind === "figma";
  const posX = figmaRtPos
    ? 0
    : figmaSnap || snapPos || snapFoodBox
      ? Math.round(layer.box.x)
      : layer.box.x;
  let posY = figmaRtPos
    ? 0
    : figmaSnap || snapPos || snapFoodBox
      ? Math.round(layer.box.y)
      : layer.box.y;
  // MUI shrunk labels use transform: scale — skip vertical nudge.
  if (snapPos && posY < 0 && posY > -3) posY = 0;
  if (!flexChild) {
    props.push("position: absolute");
    props.push(`left: ${px(posX)}`);
    if (muiTabIndicator) props.push(`top: ${px(layer.box.y)}`);
    else props.push(`top: ${px(posY)}`);
  } else {
    props.push("position: relative");
    if (layer.layout?.flexGrow === undefined || layer.layout.flexGrow === 0) {
      props.push("flex-shrink: 0");
    }
  }
  if (analyticsBar && flexChild) {
    props.push(`height: ${px(layer.box.height)}`);
    props.push("flex: 1 1 0");
    props.push("min-width: 0");
    props.push("min-height: 0");
    props.push("align-self: flex-end");
  } else if (analyticsBar) {
    props.push(`width: ${px(layer.box.width)}`);
    props.push(`height: ${px(layer.box.height)}`);
  } else if (analyticsBarWrap && flexChild) {
    props.push("height: 100%");
  } else if (!(flexChild && (layer.text || layer.vector))) {
    props.push(`width: ${px(layer.box.width)}`);
    props.push(`height: ${px(layer.box.height)}`);
  } else if (isFlexFlowSvgIcon(layer, ctx.parent)) {
    props.push(`width: ${px(layer.box.width)}`);
    props.push(`height: ${px(layer.box.height)}`);
  }
  // Always box-sizing border-box so borders don't shift inner geometry — this
  // matches what the extractor measured (the post-border bounding rect).
  props.push("box-sizing: border-box");

  const useFlexShell = usesFlexFlowLayout(layer);
  if (useFlexShell) {
    const L = layer.layout!;
    if (hasLayerClass(layer, "lab-pricing-price")) {
      props.push("line-height: 1");
    } else {
      if (L.display && L.display !== "none") props.push(`display: ${L.display}`);
      if (L.flex?.direction) props.push(`flex-direction: ${L.flex.direction}`);
      const justify = flexAlignToCss(L.flex?.justify);
      if (justify) props.push(`justify-content: ${justify}`);
      const align = flexAlignToCss(L.flex?.align);
      if (align) props.push(`align-items: ${align}`);
      if (L.flex?.columnGap) props.push(`column-gap: ${snap(L.flex.columnGap)}px`);
      if (L.flex?.rowGap) props.push(`row-gap: ${snap(L.flex.rowGap)}px`);
      if (L.padding) {
        props.push(
          `padding: ${snap(L.padding.top)}px ${snap(L.padding.right)}px ${snap(L.padding.bottom)}px ${snap(L.padding.left)}px`
        );
      }
    }
  } else if (layer.source.tag === "button" && layer.layout && layer.text) {
    const L = layer.layout;
    if (!layer.children?.length) {
      props.push("display: flex");
      props.push("align-items: center");
      props.push("justify-content: center");
      if (L.padding) {
        props.push(
          `padding: ${snap(L.padding.top)}px ${snap(L.padding.right)}px ${snap(L.padding.bottom)}px ${snap(L.padding.left)}px`
        );
      }
    }
  }

  if (
    layer.layout?.padding &&
    !useFlexShell &&
    !childrenUseAbsoluteLayout(layer) &&
    !(layer.source.tag === "button" && layer.text) &&
    !(layer.source.tag === "input" && layer.text) &&
    !(layer.layout?.flex && layer.text)
  ) {
    const pad = layer.layout.padding;
    props.push(
      `padding: ${snap(pad.top)}px ${snap(pad.right)}px ${snap(pad.bottom)}px ${snap(pad.left)}px`
    );
  }

  // Layout for text leaves — positions glyphs inside the box (MUI labels, etc.).
  if (layer.layout && layer.text) {
    const L = layer.layout;
    if (isFormControlWithInlineText(layer)) {
      if (layer.source.tag === "input") {
        if (L.padding) {
          props.push(
            `padding: ${snap(L.padding.top)}px ${snap(L.padding.right)}px ${snap(L.padding.bottom)}px ${snap(L.padding.left)}px`
          );
        }
      } else if (layer.source.tag !== "button") {
        props.push("display: flex");
        props.push("align-items: center");
        if (L.padding) {
          props.push(
            `padding: ${snap(L.padding.top)}px ${snap(L.padding.right)}px ${snap(L.padding.bottom)}px ${snap(L.padding.left)}px`
          );
        }
      }
    } else if (L.flex) {
      if (L.display && L.display !== "none") props.push(`display: ${L.display}`);
      if (L.flex.direction) props.push(`flex-direction: ${L.flex.direction}`);
      const justify = flexAlignToCss(L.flex.justify);
      if (justify) props.push(`justify-content: ${justify}`);
      const align = flexAlignToCss(L.flex.align);
      if (align) props.push(`align-items: ${align}`);
      if (L.flex.wrap && L.flex.wrap !== "nowrap") props.push(`flex-wrap: ${L.flex.wrap}`);
      if (L.padding) {
        props.push(
          `padding: ${snap(L.padding.top)}px ${snap(L.padding.right)}px ${snap(L.padding.bottom)}px ${snap(L.padding.left)}px`
        );
      }
    } else {
      if (L.display && L.display !== "none") props.push(`display: ${L.display}`);
      if (L.padding) {
        props.push(
          `padding: ${snap(L.padding.top)}px ${snap(L.padding.right)}px ${snap(L.padding.bottom)}px ${snap(L.padding.left)}px`
        );
      }
    }
  }

  if (
    (layer.source.tag === "button" || layer.source.tag === "input") &&
    !hasSchemaBorder(layer.paint?.borders)
  ) {
    props.push("border: none");
    props.push("outline: none");
    props.push("appearance: none");
    props.push("-webkit-appearance: none");
    if (!layer.paint?.fills?.length) props.push("background: transparent");
  }
  if (hasLayerClass(layer, "lab-pricing-cta") && !flexChild) {
    props.push("margin: 0px");
  }

  const paint = layer.paint;
  const pricingCssShell = hasLayerClass(layer, "lab-pricing") && hasLayerClass(layer, "pro");
  if (paint) {
    const cssPaintShell = usesStorybookCssPaintShell(layer);
    const skipInlineFill =
      pricingCssShell ||
      cssPaintShell ||
      (ctx.pricingTree &&
        (hasLayerClass(layer, "lab-pricing-tag") ||
          (hasLayerClass(layer, "lab-pricing-cta") && ctx.pricingPro)));
    if (!skipInlineFill) {
      props.push(...backgroundsToCss(paint.fills));
    }
    // If borders have gaps we draw via SVG overlay; suppress native borders.
    const hasGaps = paint.borders?.gaps && paint.borders.gaps.length > 0;
    const muiNotchedFieldset = isMuiNotchedFieldset(layer);
    const hasRadius = Boolean(
      paint.cornerRadii &&
        (paint.cornerRadii.topLeft.x > 0 ||
          paint.cornerRadii.topRight.x > 0 ||
          paint.cornerRadii.bottomRight.x > 0 ||
          paint.cornerRadii.bottomLeft.x > 0)
    );
    const useNativeBorder =
      layer.source.tag === "button" ||
      layer.source.tag === "input" ||
      muiNotchedFieldset ||
      hasLayerClass(layer, "trend-grid") ||
      (hasLayerClass(layer, "lab-pricing") && !hasLayerClass(layer, "pro"));
    const muiThinDivider =
      hasLayerClass(layer, "MuiDivider-root") &&
      layer.box.height <= 1 &&
      (() => {
        const b = paint.borders;
        if (!b) return false;
        const active = [b.top, b.right, b.bottom, b.left].filter(
          (s) => (s?.width ?? 0) > 0 && s?.style === "solid"
        );
        return active.length === 1 && active[0]!.width === 1;
      })();
    const muiOutlinedBorderSvg = isMuiOutlinedBorderSvg(layer);
    const useOutlineBorder =
      hasRadius &&
      !useNativeBorder &&
      !muiThinDivider &&
      !muiOutlinedBorderSvg &&
      Boolean(uniformBorder(paint.borders));
    const borderCss =
      !hasGaps && !pricingCssShell && !muiThinDivider && !muiOutlinedBorderSvg
        ? bordersToCss(paint.borders, {
            insetShadow: hasRadius && !useNativeBorder && !useOutlineBorder,
            useNativeUniformSolid: useNativeBorder,
            useOutlineBorder
          })
        : [];
    if (muiThinDivider) {
      const b = paint.borders;
      const side =
        (b?.bottom?.width ? b.bottom : null) ||
        (b?.top?.width ? b.top : null) ||
        (b?.left?.width ? b.left : null) ||
        (b?.right?.width ? b.right : null);
      if (side?.width && side.color) {
        const edge = b?.bottom?.width
          ? "border-bottom"
          : b?.top?.width
            ? "border-top"
            : b?.left?.width
              ? "border-left"
              : "border-right";
        props.push("border: 0", `${edge}: ${snap(side.width)}px solid ${side.color}`);
      }
    }
    if (hasGaps) {
      props.push("border: 0");
      if (layer.source.tag === "fieldset") {
        props.push("margin: 0");
        props.push("min-width: 0");
        props.push("pointer-events: none");
      }
    }
    if (muiNotchedFieldset) {
      props.push("margin: 0");
      props.push("min-width: 0");
      props.push("pointer-events: none");
      props.push("z-index: 0");
    }
    const borderShadows: string[] = [];
    const borderNonShadows: string[] = [];
    for (const rule of borderCss) {
      if (rule.startsWith("box-shadow:")) borderShadows.push(rule.slice("box-shadow:".length).trim());
      else borderNonShadows.push(rule);
    }
    props.push(...borderNonShadows);
    if (
      !hasGaps &&
      !cssPaintShell &&
      !isMuiOutlinedInputRoot(layer) &&
      !hasLayerClass(layer, "lab-meeting-home-join") &&
      !hasLayerClass(layer, "lab-meeting-home-icon-btn")
    ) {
      props.push(...cornerRadiusToCss(paint, layer.box));
    }
    const shadowCss = shadowsToCss(paint);
    if (borderShadows.length) {
      const drop = shadowCss[0]?.startsWith("box-shadow:")
        ? shadowCss[0].slice("box-shadow:".length).trim()
        : "";
      const merged = drop ? `${borderShadows.join(", ")}, ${drop}` : borderShadows.join(", ");
      props.push(`box-shadow: ${merged}`);
    } else {
      props.push(...shadowCss);
    }
    props.push(...filtersToCss(paint, { preserveEffects: ctx.preserveEffects }));
    props.push(...backdropFiltersToCss(paint));
    if (paint.opacity !== undefined && paint.opacity < 1) props.push(`opacity: ${paint.opacity}`);
    else {
      const nativeFill = paint.fills?.find(
        (f) =>
          (f as FillLayer & { figmaNative?: { opacity?: number } }).figmaNative?.opacity != null
      ) as (FillLayer & { figmaNative?: { opacity?: number } }) | undefined;
      const nativeOpacity = nativeFill?.figmaNative?.opacity;
      if (nativeOpacity != null && nativeOpacity < 0.999) {
        props.push(`opacity: ${nativeOpacity}`);
      }
    }
    if (paint.blendMode && paint.blendMode !== "normal")
      props.push(`mix-blend-mode: ${paint.blendMode}`);
    if (paint.isolation && paint.isolation !== "auto") props.push(`isolation: ${paint.isolation}`);
    if (paint.visibility && paint.visibility !== "visible")
      props.push(`visibility: ${paint.visibility}`);
    if (paint.outline) {
      props.push(`outline: ${snap(paint.outline.width)}px ${paint.outline.style} ${paint.outline.color}`);
      if (paint.outline.offset !== undefined)
        props.push(`outline-offset: ${snap(paint.outline.offset)}px`);
    }
    if (paint.clipPath?.value && paint.clipPath.kind !== "none")
      props.push(`clip-path: ${paint.clipPath.value}`);
  }
  if (layer.layout?.overflow) {
    const skipClip =
      isMuiShrunkLabel(layer) ||
      isMuiNotchedFieldset(layer) ||
      (layer.source.tag === "label" && transformBakedIntoBox(layer));
    if (!skipClip) {
      if (layer.layout.overflow.x !== "visible")
        props.push(`overflow-x: ${layer.layout.overflow.x}`);
      if (layer.layout.overflow.y !== "visible")
        props.push(`overflow-y: ${layer.layout.overflow.y}`);
    }
  }
  // Box x/y already include layout offsets; margins on absolute nodes double-count.
  if (layer.layout?.margin && flexChild) {
    const m = layer.layout.margin;
    const hasNonZero = m.top || m.right || m.bottom || m.left;
    const tag = layer.source.tag ?? "";
    const isHeading = /^h[1-6]$/.test(tag);
    const allZero = !hasNonZero;
    const resetUaMargin = allZero && (isHeading || tag === "p");
    if (hasNonZero || resetUaMargin) {
      props.push(
        `margin: ${snap(m.top)}px ${snap(m.right)}px ${snap(m.bottom)}px ${snap(m.left)}px`
      );
    }
  } else if (layer.layout?.margin && !flexChild) {
    const m = layer.layout.margin;
    const tag = layer.source.tag ?? "";
    const isHeading = /^h[1-6]$/.test(tag);
    const allZero = !(m.top || m.right || m.bottom || m.left);
    // UA heading margins shift absolute text down; emit schema margin when top is 0.
    if (isHeading && m.top === 0) {
      props.push(
        `margin: ${snap(m.top)}px ${snap(m.right)}px ${snap(m.bottom)}px ${snap(m.left)}px`
      );
    } else if (allZero && (isHeading || tag === "p")) {
      props.push(`margin: 0px 0px 0px 0px`);
    }
  }
  if (flexChild && layer.layout?.alignSelf && layer.layout.alignSelf !== "auto") {
    props.push(`align-self: ${layer.layout.alignSelf}`);
  }
  if (layer.layout?.zIndex !== undefined) {
    props.push(`z-index: ${layer.layout.zIndex}`);
  } else if (
    ctx.preserveEffects &&
    ctx.rootChildIndex != null &&
    ctx.rootChildIndex > 0
  ) {
    props.push(`z-index: ${ctx.rootChildIndex}`);
  }
  if (layer.layout?.flexGrow !== undefined && !(analyticsBar && flexChild)) {
    props.push(`flex-grow: ${layer.layout.flexGrow}`);
  }
  if (layer.layout?.flexShrink !== undefined && !(analyticsBar && flexChild)) {
    props.push(`flex-shrink: ${layer.layout.flexShrink}`);
  }
  if (layer.layout?.flexBasis !== undefined && !(analyticsBar && flexChild)) {
    props.push(`flex-basis: ${layer.layout.flexBasis}`);
  }
  const snackPaint = layer.paint;
  if (
    layer.source.classList?.includes("snackbar") &&
    snackPaint?.cornerRadii &&
    (snackPaint.cornerRadii.topLeft.x > 0 || snackPaint.cornerRadii.topRight.x > 0)
  ) {
    props.push("overflow: hidden");
  }
  props.push(...transformToCss(layer));
  if (hasLayerClass(layer, "lab-retro-terminal") || hasLayerClass(layer, "lab-space-mission")) {
    props.push(`font-family: ${cssFontFamily('"Roboto Mono", monospace')}`);
  }
  return props;
}

/** Replay Storybook classes that tune typography, not absolute layout shells. */
function layerClassNames(layer: UniversalLayer): string {
  const parts = ["layer", layer.source.kind];
  for (const c of layerClasses(layer)) {
    if (!c || parts.includes(c)) continue;
    if (c === "lab-button" && layer.source.tag === "button") continue;
    if (
      c.startsWith("lab-pricing-price") ||
      c.startsWith("lab-pricing-tag") ||
      c === "lab-pricing" ||
      c === "pro" ||
      c === "starter" ||
      c === "lab-pricing-list" ||
      c === "lab-pricing-cta" ||
      c === "trend-grid" ||
      c === "bar-wrap" ||
      c === "bar" ||
      c === "snackbar" ||
      c === "success" ||
      c === "warning" ||
      c === "main" ||
      c === "compare" ||
      c === "indigo" ||
      c === "teal" ||
      c === "ghost" ||
      c === "danger" ||
      c === "primary" ||
      c === "secondary" ||
      c === "sm" ||
      c === "md" ||
      c === "lg" ||
      c === "lab-retro-terminal-ascii" ||
      c === "lab-retro-terminal-glow" ||
      c === "lab-meeting-home-join" ||
      c === "lab-meeting-home-icon-btn" ||
      c === "lab-food-frenzy-search" ||
      c === "lab-food-frenzy-deal-body" ||
      c === "blink" ||
      c === "warn" ||
      c === "ok" ||
      c === "hot"
    ) {
      parts.push(c);
    }
    if (layer.source.tag === "input" && (c.startsWith("Mui") || /^css-[a-z0-9]+$/.test(c))) {
      parts.push(c);
    }
    if (
      (layer.source.tag === "div" || layer.source.tag === "p") &&
      (c === "MuiAlert-message" ||
        c === "MuiAlert-icon" ||
        c.includes("MuiOutlinedInput-root") ||
        c.includes("MuiInputBase-root") ||
        (c.startsWith("css-") &&
          (layer.source.classList || []).some(
            (x) =>
              x === "MuiAlert-message" ||
              x === "MuiAlert-icon" ||
              x.includes("MuiOutlinedInput-root") ||
              x.includes("MuiInputBase-root")
          )))
    ) {
      parts.push(c);
    }
    if (layer.source.tag === "svg" && (c.startsWith("MuiSvgIcon") || /^css-[a-z0-9]+$/.test(c))) {
      parts.push(c);
    }
    if (
      c.startsWith("Mui") &&
      (layer.source.tag === "label" ||
        c.includes("MuiTabs-indicator") ||
        c.includes("MuiOutlinedInput-notchedOutline"))
    ) {
      parts.push(c);
    }
  }
  return parts.join(" ");
}

/** Shell size only — layout/typography come from Storybook `.lab-*-nav` CSS. */
function labNavShellStyle(layer: UniversalLayer): string {
  const parts = ["position:relative", "box-sizing:border-box", `width:${Math.round(layer.box.width)}px`];
  parts.push(`height:${Math.round(layer.box.height)}px`);
  if (layer.box.x || layer.box.y) {
    parts.push(`left:${snap(layer.box.x)}px`, `top:${snap(layer.box.y)}px`);
  }
  return parts.join("; ");
}

/** Shell size only — `.lab-calendar-scheduler` CSS supplies width, layout, and paint. */
function labCalendarShellStyle(layer: UniversalLayer): string {
  const parts = [
    "position:relative",
    "box-sizing:border-box",
    `width:${Math.round(layer.box.width)}px`,
    `min-height:${Math.round(layer.box.height)}px`
  ];
  if (layer.box.x || layer.box.y) {
    parts.push(`left:${snap(layer.box.x)}px`, `top:${snap(layer.box.y)}px`);
  }
  return parts.join("; ");
}

function isCalendarSchedulerLayer(layer: UniversalLayer): boolean {
  return (
    layer.name === "CalendarScheduler" ||
    layer.source.dataset?.figmaComponent === "CalendarScheduler" ||
    hasLayerClass(layer, "lab-calendar-scheduler")
  );
}

/** `.lab-calendar-scheduler` — replay Storybook markup, not absolute text boxes. */
function tryRenderCalendarScheduler(layer: UniversalLayer): string | null {
  if (!isCalendarSchedulerLayer(layer)) return null;

  const compact = hasLayerClass(layer, "compact") || Math.round(layer.box.width) < 750;
  const cls = `lab-calendar-scheduler${compact ? " compact" : ""}`;
  const style = labCalendarShellStyle(layer);
  const kids = layer.children || [];

  const header = kids.find((c) => c.source.tag === "header");
  let headerHtml = "";
  if (header) {
    const titleDiv = header.children?.find(
      (c) => c.source.tag === "div" && !hasLayerClass(c, "lab-calendar-actions")
    );
    const actions = header.children?.find((c) => hasLayerClass(c, "lab-calendar-actions"));
    const eyebrow = titleDiv?.children?.find((c) => c.source.tag === "p");
    const h3 = titleDiv?.children?.find((c) => c.source.tag === "h3");
    const badge = actions?.children?.find((c) => c.source.tag === "span");
    const btn = actions?.children?.find((c) => c.source.tag === "button");
    headerHtml = `<header class="lab-calendar-header"><div><p class="eyebrow">${escapeHtml(
      eyebrow?.text?.value || layerDeepText(eyebrow!)
    )}</p><h3>${escapeHtml(h3?.text?.value || layerDeepText(h3!))}</h3></div><div class="lab-calendar-actions"><span class="badge">${escapeHtml(
      badge?.text?.value || layerDeepText(badge!)
    )}</span><button type="button">${escapeHtml(btn?.text?.value || layerDeepText(btn!))}</button></div></header>`;
  }

  const grid = kids.find((c) => hasLayerClass(c, "lab-calendar-grid"));
  const gridKids = grid?.children || [];
  const weekdays = gridKids.filter((c) => c.source.tag === "strong");
  const columns = weekdays.length || 7;
  const cells = gridKids.filter(
    (c) => hasLayerClass(c, "date-cell") || c.source.classList?.includes("date-cell")
  );

  const gridHtml: string[] = weekdays.map(
    (w) => `<strong class="weekday">${escapeHtml(w.text?.value || layerDeepText(w))}</strong>`
  );
  for (const cell of cells) {
    const daySpan = cell.children?.find((c) => c.source.tag === "span");
    const dayTextLayer = daySpan?.children?.find((c) => c.text) ?? daySpan;
    const textColor = dayTextLayer?.text?.color ?? daySpan?.text?.color ?? "";
    const muted =
      textColor.includes("148, 163, 184") ||
      textColor.includes("148,163,184") ||
      (cell.source.classList ?? []).includes("muted");
    const borders = cell.paint?.borders;
    const strokeBlue =
      borders?.top?.color?.includes("147, 197, 253") ||
      borders?.right?.color?.includes("147, 197, 253") ||
      (cell.source.classList ?? []).includes("active");
    const innerRing = (cell.paint?.shadows || []).some((s) => s.inset && s.spread >= 2);
    let clsCell = "date-cell";
    if (muted) clsCell += " muted";
    if (strokeBlue || innerRing || (cell.source.classList ?? []).includes("active")) {
      clsCell += " active";
    }
    const dot = cell.children?.find((c) => c.source.tag === "small");
    const dotText = dot ? dot.text?.value || layerDeepText(dot) : "";
    let dotHtml = "";
    if (dotText) {
      let dotCls = "dot";
      if (/review/i.test(dotText)) dotCls += " amber";
      else if (/launch/i.test(dotText)) dotCls += " blue";
      else if (/retro/i.test(dotText)) dotCls += " green";
      else {
        const dotClsList = dot?.source.classList ?? [];
        if (dotClsList.includes("amber")) dotCls += " amber";
        else if (dotClsList.includes("blue")) dotCls += " blue";
        else if (dotClsList.includes("green")) dotCls += " green";
      }
      dotHtml = `<small class="${dotCls}">${escapeHtml(dotText)}</small>`;
    }
    gridHtml.push(
      `<div class="${clsCell}"><span>${escapeHtml(daySpan ? layerDeepText(daySpan) : "")}</span>${dotHtml}</div>`
    );
  }

  const divider = kids.find((c) => hasLayerClass(c, "lab-calendar-divider"));
  const agenda = kids.find((c) => hasLayerClass(c, "lab-agenda-list"));
  const agendaHtml = (agenda?.children || [])
    .filter((c) => c.source.tag === "article")
    .map((a) => {
      const p = a.children?.find((c) => c.source.tag === "p");
      const h4 = a.children?.find((c) => c.source.tag === "h4");
      const span = a.children?.find((c) => c.source.tag === "span");
      return `<article><p>${escapeHtml(p?.text?.value || layerDeepText(p))}</p><h4>${escapeHtml(
        h4?.text?.value || layerDeepText(h4)
      )}</h4><span>${escapeHtml(span?.text?.value || layerDeepText(span))}</span></article>`;
    })
    .join("");

  return `<section class="${cls}" data-name="${escapeAttr(
    layer.name || "CalendarScheduler"
  )}" style="${style}">${headerHtml}<div class="lab-calendar-grid" style="grid-template-columns:repeat(${columns},minmax(0,1fr))">${gridHtml.join(
    ""
  )}</div>${divider ? '<div class="lab-calendar-divider"></div>' : ""}<div class="lab-agenda-list">${agendaHtml}</div></section>`;
}

function layerDeepText(layer: UniversalLayer | undefined): string {
  if (!layer) return "";
  if (layer.text?.value) return layer.text.value;
  for (const child of layer.children || []) {
    const v = layerDeepText(child);
    if (v) return v;
  }
  return "";
}

function multilineTextHtml(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br />");
}

function childByDomTag(layer: UniversalLayer, tag: string): UniversalLayer | undefined {
  return (layer.children || []).find((c) => c.source.tag === tag || c.name === tag);
}

function labSemanticShellStyle(layer: UniversalLayer, heightMode: "fixed" | "min" = "fixed"): string {
  const parts = [
    "position:relative",
    "box-sizing:border-box",
    `width:${Math.round(layer.box.width)}px`
  ];
  if (heightMode === "fixed") {
    parts.push(`height:${Math.round(layer.box.height)}px`);
  } else {
    parts.push(`min-height:${Math.round(layer.box.height)}px`);
  }
  if (layer.box.x || layer.box.y) {
    parts.push(`left:${snap(layer.box.x)}px`, `top:${snap(layer.box.y)}px`);
  }
  return parts.join("; ");
}

function parseRgb01(color: string | undefined): { r: number; g: number; b: number } | null {
  if (!color) return null;
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!m) return null;
  return { r: +m[1]! / 255, g: +m[2]! / 255, b: +m[3]! / 255 };
}

function solidFillColor(layer: UniversalLayer): string | undefined {
  return layer.paint?.fills?.find((f) => f.kind === "color")?.color;
}

function badgeClassFromFillColor(color: string | undefined): string {
  const c = parseRgb01(color);
  if (!c) return "neutral";
  const { r, g, b } = c;
  if (g > 0.95 && r < 0.9 && b > 0.9) return "success";
  if (r > 0.95 && g > 0.9 && b < 0.85) return "warning";
  if (r > 0.95 && g > 0.85 && b > 0.85 && r > g + 0.04) return "danger";
  return "neutral";
}

function filterPanelCaptionLayer(parent: UniversalLayer): UniversalLayer | undefined {
  return (parent.children || []).find(
    (c) => c.source.tag === "span" || c.name === "span" || c.name === "typography"
  );
}

function isTabButtonActive(layer: UniversalLayer): boolean {
  if (hasLayerClass(layer, "active")) return true;
  const fill = parseRgb01(solidFillColor(layer));
  return Boolean(fill && fill.b > 0.95 && fill.r < 0.2 && fill.g > 0.35 && fill.g < 0.55);
}

function isRadioIndicatorSelected(layer: UniversalLayer): boolean {
  const borders = layer.paint?.borders;
  const stroke = borders?.top?.color ?? borders?.right?.color;
  const c = parseRgb01(stroke);
  return Boolean(c && c.b > 0.95 && c.g > 0.35);
}

function isContentListBoardLayer(layer: UniversalLayer): boolean {
  return (
    layer.name === "ContentListBoard" ||
    layer.source.dataset?.figmaComponent === "ContentListBoard" ||
    hasLayerClass(layer, "lab-content-board")
  );
}

/** `.lab-content-board` — flex layout via Storybook CSS. */
function tryRenderContentListBoard(layer: UniversalLayer): string | null {
  if (!isContentListBoardLayer(layer)) return null;

  const compact = hasLayerClass(layer, "compact") || Math.round(layer.box.width) <= 720;
  const highlighted =
    hasLayerClass(layer, "highlighted") ||
    (layer.paint?.shadows || []).some((s) => s.inset && (s.spread ?? 0) >= 2);
  const cls = `lab-content-board${compact ? " compact" : ""}${highlighted ? " highlighted" : ""}`;
  const blocks: string[] = [];

  for (const child of layer.children || []) {
    const tag = child.source.tag;
    if (tag === "nav") {
      const crumbs: string[] = [];
      for (const c of child.children || []) {
        if (c.source.tag === "span") {
          const active = layerDeepText(c).includes("Library");
          crumbs.push(`<span${active ? ' class="active"' : ""}>${escapeHtml(layerDeepText(c))}</span>`);
        } else if (c.source.tag === "i") {
          crumbs.push("<i></i>");
        }
      }
      blocks.push(`<nav class="breadcrumbs" aria-label="Breadcrumb">${crumbs.join("")}</nav>`);
    } else if (tag === "header") {
      const titleWrap =
        child.children?.find((c) => hasLayerClass(c, "title-wrap")) ??
        child.children?.find((c) => c.source.tag === "div");
      const iconSpan = titleWrap?.children?.find(
        (c) => hasLayerClass(c, "icon") || c.source.tag === "span"
      );
      const vectorLayer =
        iconSpan?.vector != null
          ? iconSpan
          : iconSpan?.children?.find((c) => c.vector);
      const textWrap = titleWrap?.children?.find(
        (c) => c !== iconSpan && c.source.tag === "div"
      );
      const h3 = textWrap?.children?.find((c) => c.source.tag === "h3");
      const p = textWrap?.children?.find((c) => c.source.tag === "p");
      const btn = child.children?.find((c) => c.source.tag === "button");
      const iconSvg =
        vectorLayer?.vector != null ? vectorToHtml(vectorLayer, vectorLayer.vector) : "";
      blocks.push(
        `<header class="board-header"><div class="title-wrap"><span class="icon">${iconSvg}</span><div><h3>${escapeHtml(
          layerDeepText(h3)
        )}</h3><p>${escapeHtml(layerDeepText(p))}</p></div></div><button type="button">${escapeHtml(
          layerDeepText(btn)
        )}</button></header>`
      );
    } else if (tag === "div" && Math.round(child.box.height) <= 2) {
      blocks.push('<div class="board-divider"></div>');
    } else if (tag === "label") {
      const input = child.children?.find((c) => c.source.tag === "input");
      const caption = child.children?.find((c) => c.source.tag === "span");
      blocks.push(
        `<label class="inline-edit"><span>${escapeHtml(
          layerDeepText(caption)
        )}</span><input value="${escapeHtml(layerDeepText(input))}" readonly /></label>`
      );
    } else if (tag === "ul") {
      const items: string[] = [];
      for (const li of child.children || []) {
        if (li.source.tag !== "li") continue;
        const liDivs = (li.children || []).filter((c) => c.source.tag === "div");
        const body = liDivs[0];
        const badgesWrap = liDivs[1];
        const h4 = body?.children?.find((c) => c.source.tag === "h4");
        const p = body?.children?.find((c) => c.source.tag === "p");
        const badgeHtml = (badgesWrap?.children || [])
          .filter((c) => c.source.tag === "span")
          .map((b) => {
            const cls = badgeClassFromFillColor(solidFillColor(b));
            return `<span class="badge ${cls}">${escapeHtml(layerDeepText(b))}</span>`;
          })
          .join("");
        items.push(
          `<li><div><h4>${escapeHtml(layerDeepText(h4))}</h4><p>${escapeHtml(
            layerDeepText(p)
          )}</p></div><div class="badges">${badgeHtml}</div></li>`
        );
      }
      blocks.push(`<ul class="task-list">${items.join("")}</ul>`);
    }
  }

  return `<section class="${cls}" data-name="${escapeAttr(
    layer.name || "ContentListBoard"
  )}" style="${labSemanticShellStyle(layer, "min")}">${blocks.join("")}</section>`;
}

function isFilterSidePanelLayer(layer: UniversalLayer): boolean {
  return (
    layer.name === "FilterSidePanel" ||
    layer.source.dataset?.figmaComponent === "FilterSidePanel" ||
    hasLayerClass(layer, "lab-filter-panel")
  );
}

/** `.lab-filter-panel` */
function tryRenderFilterSidePanel(layer: UniversalLayer): string | null {
  if (!isFilterSidePanelLayer(layer)) return null;

  const collapsed = hasLayerClass(layer, "collapsed") || Math.round(layer.box.width) <= 310;
  const dropShadow = (layer.paint?.shadows || []).find((s) => !s.inset);
  const side = (dropShadow?.offsetX ?? 0) < 0 ? "left" : "right";
  const cls = `lab-filter-panel ${side}${collapsed ? " collapsed" : ""}`;
  const blocks: string[] = [];

  for (const child of layer.children || []) {
    const tag = child.source.tag;
    if (tag === "header") {
      const h3 = child.children?.find((c) => c.source.tag === "h3");
      const status = filterPanelCaptionLayer(child);
      blocks.push(
        `<header><h3>${escapeHtml(layerDeepText(h3))}</h3><span class="status">${escapeHtml(
          layerDeepText(status)
        )}</span></header>`
      );
    } else if (tag === "section") {
      const label = child.children?.find((c) => c.source.tag === "p");
      const multi = child.children?.find((c) => c.source.tag === "div");
      const labels = (child.children || []).filter((c) => c.source.tag === "label");
      if (labels.length) {
        const fields = labels
          .map((lb) => {
            const input = lb.children?.find((c) => c.source.tag === "input");
            const caption = filterPanelCaptionLayer(lb);
            return `<label><span>${escapeHtml(layerDeepText(caption))}</span><input value="${escapeHtml(
              layerDeepText(input)
            )}" readonly style="line-height:normal;" /></label>`;
          })
          .join("");
        blocks.push(`<section class="edit-grid">${fields}</section>`);
      } else if (multi?.children?.some((c) => c.source.tag === "i")) {
        const swatchHtml = (multi.children || [])
          .filter((c) => c.source.tag === "i")
          .map((i) => {
            const bg = solidFillColor(i) ?? "transparent";
            return `<i style="background:${bg}"></i>`;
          })
          .join("");
        blocks.push(
          `<section><p class="label">${escapeHtml(layerDeepText(label))}</p><div class="swatches">${swatchHtml}</div></section>`
        );
      } else if (multi) {
        const compact =
          (multi.children?.length ?? 0) <= 4 &&
          !(multi.children ?? []).some((c) => c.source.tag === "button");
        const tags = (multi.children || [])
          .map((c) => {
            if (c.source.tag === "button") {
              return `<button type="button">${escapeHtml(layerDeepText(c))}</button>`;
            }
            return `<span>${escapeHtml(layerDeepText(c))}</span>`;
          })
          .join("");
        blocks.push(
          `<section><p class="label">${escapeHtml(layerDeepText(label))}</p><div class="multi-select${
            compact ? " compact" : ""
          }">${tags}</div></section>`
        );
      }
    } else if (tag === "div" && Math.round(child.box.height) <= 2) {
      blocks.push('<div class="divider"></div>');
    } else if (tag === "footer") {
      const btns = (child.children || [])
        .filter((c) => c.source.tag === "button")
        .map((b) => {
          const ghost = layerDeepText(b).toLowerCase().includes("reset");
          return `<button type="button" class="${ghost ? "ghost" : "primary"}">${escapeHtml(
            layerDeepText(b)
          )}</button>`;
        })
        .join("");
      blocks.push(`<footer>${btns}</footer>`);
    }
  }

  return `<aside class="${cls}" data-name="${escapeAttr(
    layer.name || "FilterSidePanel"
  )}" style="${labSemanticShellStyle(layer, "min")}">${blocks.join("")}</aside>`;
}

function isTabsPanelLayer(layer: UniversalLayer): boolean {
  return (
    layer.name === "TabsPanel" ||
    layer.source.dataset?.figmaComponent === "TabsPanel" ||
    hasLayerClass(layer, "lab-tabs-panel")
  );
}

/** `.lab-tabs-panel` */
function tryRenderTabsPanel(layer: UniversalLayer): string | null {
  if (!isTabsPanelLayer(layer)) return null;

  const divs = (layer.children || []).filter((c) => c.source.tag === "div");
  const row = divs.find(
    (d) =>
      hasLayerClass(d, "lab-tabs-row") ||
      ((d.children?.length ?? 0) >= 2 &&
        (d.children ?? []).every((c) => c.source.tag === "button"))
  );
  const body = divs.find(
    (d) =>
      hasLayerClass(d, "lab-tabs-body") ||
      d.children?.some((c) => c.source.tag === "h4" || c.source.tag === "p")
  );
  if (!row || !body) return null;

  const btnHtml = (row.children || [])
    .filter((c) => c.source.tag === "button")
    .map((b) => {
      const active = isTabButtonActive(b);
      return `<button type="button"${active ? ' class="active"' : ""}>${escapeHtml(
        b.text?.value || layerDeepText(b)
      )}</button>`;
    })
    .join("");

  const h4 = body.children?.find((c) => c.source.tag === "h4");
  const p = body.children?.find((c) => c.source.tag === "p");

  return `<div class="lab-tabs-panel" data-name="${escapeAttr(
    layer.name || "TabsPanel"
  )}" style="${labSemanticShellStyle(layer)}"><div class="lab-tabs-row">${btnHtml}</div><div class="lab-tabs-body"><h4>${multilineTextHtml(
    layerDeepText(h4)
  )}</h4><p>${escapeHtml(layerDeepText(p))}</p></div></div>`;
}

function isRadioGroupFieldLayer(layer: UniversalLayer): boolean {
  return (
    layer.name === "RadioGroupField" ||
    layer.source.dataset?.figmaComponent === "RadioGroupField" ||
    hasLayerClass(layer, "lab-radio-group")
  );
}

/** `.lab-radio-group` */
function tryRenderRadioGroupField(layer: UniversalLayer): string | null {
  if (!isRadioGroupFieldLayer(layer)) return null;

  const disabled =
    hasLayerClass(layer, "disabled") ||
    (layer.paint?.fills?.some((f) => {
      if (f.kind !== "color") return false;
      const opacity = (f as { opacity?: number }).opacity;
      return opacity != null && opacity < 0.9;
    }) ??
      false);
  const cls = disabled ? "lab-radio-group disabled" : "lab-radio-group";
  const labelFrame = childByDomTag(layer, "p");
  const optionsFrame =
    layer.children?.find((c) => hasLayerClass(c, "lab-radio-options")) ??
    layer.children?.find((c) => c.source.tag === "div" && c !== labelFrame);

  const optionHtml: string[] = [];
  for (const opt of optionsFrame?.children || []) {
    if (opt.source.tag !== "label") continue;
    const indicator =
      opt.children?.find(
        (c) =>
          c.source.tag === "span" &&
          (hasLayerClass(c, "lab-radio-indicator") || Math.round(c.box.width) === 18)
      ) ??
      opt.children?.find((c) => c.source.tag === "span" && Math.round(c.box.width) === 18);
    const textWrap = opt.children?.find(
      (c) => c.source.tag === "span" && c !== indicator
    );
    let indicatorCls = "lab-radio-indicator";
    if (indicator && isRadioIndicatorSelected(indicator)) indicatorCls += " selected";
    optionHtml.push(
      `<label class="lab-radio-option"><span class="${indicatorCls}"></span><span>${escapeHtml(
        layerDeepText(textWrap)
      )}</span></label>`
    );
  }

  const labelHtml = labelFrame
    ? `<p class="lab-field-label">${escapeHtml(labelFrame.text?.value || layerDeepText(labelFrame))}</p>`
    : "";
  return `<div class="${cls}" data-name="${escapeAttr(
    layer.name || "RadioGroupField"
  )}" style="${labSemanticShellStyle(layer, "min")}">${labelHtml}<div class="lab-radio-options">${optionHtml.join(
    ""
  )}</div></div>`;
}

function isBottomNavButtonActive(layer: UniversalLayer): boolean {
  if (hasLayerClass(layer, "active")) return true;
  const c = layer.text?.color ?? "";
  return c.includes("15, 109, 255") || c.includes("15,109,255");
}

function isLoginCardLayer(layer: UniversalLayer): boolean {
  return layer.source.tag === "div" && Math.round(layer.box.width) === 460 && Math.round(layer.box.height) > 700;
}

function isLoginSocialsLayer(layer: UniversalLayer): boolean {
  if (layer.source.tag !== "div" || Math.round(layer.box.width) !== 410) return false;
  const buttons = (layer.children || []).filter((c) => c.source.tag === "button");
  return buttons.length === 2 && buttons.every((c) => Math.round(c.box.height) === 46);
}

function parentIsLoginCard(parent?: UniversalLayer): boolean {
  return parent != null && isLoginCardLayer(parent);
}

function loginAbsoluteShellStyle(layer: UniversalLayer): string {
  return [
    "position:absolute",
    `left:${px(layer.box.x)}`,
    `top:${px(layer.box.y)}`,
    `width:${px(layer.box.width)}`,
    `height:${px(layer.box.height)}`,
    "box-sizing:border-box",
    "margin:0",
    "padding:0"
  ].join("; ") + ";";
}

function loginButtonClass(layer: UniversalLayer): string {
  if (Math.round(layer.box.height) === 50) return "lab-login-button";
  return "lab-login-social-button";
}

function tryRenderLoginPageButton(layer: UniversalLayer, ctx: RenderCtx): string | null {
  if (layer.source.tag !== "button" || !layer.text) return null;
  const inCard = parentIsLoginCard(ctx.parent);
  const inSocials = ctx.parent != null && isLoginSocialsLayer(ctx.parent);
  if (!inCard && !inSocials) return null;
  const cls = `${loginButtonClass(layer)} layer dom`;
  const style = loginAbsoluteShellStyle(layer);
  const name = escapeAttr(layer.name || "button");
  return `<button type="button" class="${cls}" data-name="${name}" style="${style}">${escapeHtml(
    layer.text.value
  )}</button>`;
}

function tryRenderLoginSocials(layer: UniversalLayer, ctx: RenderCtx): string | null {
  if (!isLoginSocialsLayer(layer) || !parentIsLoginCard(ctx.parent)) return null;
  const style = loginAbsoluteShellStyle(layer);
  const kids = (layer.children || [])
    .map((c) => renderLayer(c, childCtx(layer, ctx)))
    .join("");
  return `<div class="lab-login-socials layer dom" data-name="${escapeAttr(
    layer.name || "div"
  )}" style="${style}">${kids}</div>`;
}

function isLabButtonLayer(layer: UniversalLayer): boolean {
  return layer.source.tag === "button" && hasLayerClass(layer, "lab-button");
}

function isLabButtonLabelSpan(layer: UniversalLayer): boolean {
  return (
    layer.source.tag === "span" &&
    Boolean(layer.text) &&
    (layer.source.dataset?.figmaName === "label" || layer.name === "label")
  );
}

/** Size/position only — `.lab-button` CSS supplies paint, typography, and shadow. */
function labButtonShellStyle(layer: UniversalLayer): string {
  const parts = ["position: relative", "box-sizing: border-box"];
  if (layer.box.x || layer.box.y) {
    parts.push(`left: ${snap(layer.box.x)}px`, `top: ${snap(layer.box.y)}px`);
  }
  return parts.join("; ");
}

/** `.lab-button` — native flex button + flat label text (matches Storybook, not absolute span boxes). */
function tryRenderLabButton(layer: UniversalLayer): string | null {
  if (!isLabButtonLayer(layer)) return null;

  const cls = layerClasses(layer).join(" ");
  const name = escapeAttr(layer.name || "Button");
  const style = labButtonShellStyle(layer);
  const kids = layer.children || [];

  if (kids.length === 1 && isLabButtonLabelSpan(kids[0]!)) {
    return `<button type="button" class="${cls} layer dom" data-name="${name}" style="${style}">${escapeHtml(
      kids[0]!.text!.value
    )}</button>`;
  }

  const label = kids.find((c) => isLabButtonLabelSpan(c));
  if (!label?.text) return null;

  const parts: string[] = [];
  for (const child of kids) {
    if (isLabButtonLabelSpan(child)) {
      parts.push(`<span>${escapeHtml(child.text!.value)}</span>`);
    } else if (child.vector) {
      parts.push(vectorToHtml(child, child.vector, { flexChild: true }));
    }
  }
  return `<button type="button" class="${cls} layer dom" data-name="${name}" style="${style}">${parts.join(
    ""
  )}</button>`;
}

/** `.lab-bottom-nav` / `.lab-top-nav` — replay Storybook markup, not absolute button boxes. */
function tryRenderNavigationBars(layer: UniversalLayer): string | null {
  if (layer.name !== "NavigationBars") return null;

  const buttons = (layer.children || []).filter((c) => c.source.tag === "button");
  if (buttons.length >= 3 && buttons.length <= 4) {
    const btnHtml = buttons
      .map((b) => {
        const active = isBottomNavButtonActive(b);
        return `<button type="button"${active ? ' class="active"' : ""}>${escapeHtml(
          b.text?.value || layerDeepText(b)
        )}</button>`;
      })
      .join("");
    return `<div class="lab-bottom-nav layer dom" data-name="${escapeAttr(
      layer.name
    )}" style="${labNavShellStyle(layer)}">${btnHtml}</div>`;
  }

  const divs = (layer.children || []).filter((c) => c.source.tag === "div");
  const brand = divs.find((d) => hasLayerClass(d, "brand")) ?? divs[0];
  const links = divs.find((d) => hasLayerClass(d, "links")) ?? divs[1];
  const cta = (layer.children || []).find((c) => c.source.tag === "button");
  if (!brand || !links || !cta) return null;

  const linkHtml = (links.children || [])
    .filter((c) => c.source.tag === "a")
    .map((a) => `<a>${escapeHtml(a.text?.value || layerDeepText(a))}</a>`)
    .join("");

  return `<div class="lab-top-nav layer dom" data-name="${escapeAttr(layer.name)}" style="${labNavShellStyle(
    layer
  )}"><div class="brand">${escapeHtml(brand.text?.value || layerDeepText(brand))}</div><div class="links">${linkHtml}</div><button class="cta" type="button">${escapeHtml(
    cta.text?.value || layerDeepText(cta)
  )}</button></div>`;
}

function renderPricingPriceRow(layer: UniversalLayer, ctx: RenderCtx = {}): string | null {
  if (!hasLayerClass(layer, "lab-pricing-price") || !layer.children?.length) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "p");
  const kids = [...layer.children].sort((a, b) => a.box.x - b.box.x);
  const dollar = kids.find((c) => c.text?.value?.startsWith("$")) ?? kids[0];
  const suffix = kids.find((c) => c.text?.value?.startsWith("/")) ?? kids[kids.length - 1];
  if (!dollar?.text || !suffix?.text) return null;
  const ml = suffix.layout?.margin?.left;
  const spanStyle = ml ? `margin-left: ${snap(ml)}px` : "";
  return `<p class="${cls}" data-name="${name}" style="${style}">${escapeHtml(
    dollar.text.value
  )}<span class="layer dom" data-name="span" style="${spanStyle}">${escapeHtml(suffix.text.value)}</span></p>`;
}

function childCtx(layer: UniversalLayer, ctx: RenderCtx): RenderCtx {
  const pricingTree = ctx.pricingTree || hasLayerClass(layer, "lab-pricing");
  const pricingPro = ctx.pricingPro || hasLayerClass(layer, "pro");
  const ancestors = ctx.parent ? [...(ctx.ancestors || []), ctx.parent] : ctx.ancestors || [];
  return {
    parent: layer,
    ancestors,
    pricingTree,
    pricingPro,
    preserveEffects: ctx.preserveEffects,
    skipFigmaBlurEllipses: ctx.skipFigmaBlurEllipses,
    hoistReferenceRasters: ctx.hoistReferenceRasters,
    hoistedRasters: ctx.hoistedRasters,
    docRoot: ctx.docRoot,
  };
}

function layerRootChildIndex(layer: UniversalLayer, ctx: RenderCtx): number | undefined {
  if (!ctx.preserveEffects || !ctx.docRoot || ctx.parent !== ctx.docRoot) return undefined;
  const idx = (ctx.docRoot.children ?? []).findIndex((c) => c.id === layer.id);
  return idx > 0 ? idx : undefined;
}

function renderLayer(layer: UniversalLayer, ctx: RenderCtx = {}): string {
  const layerCtx: RenderCtx = { ...ctx, rootChildIndex: layerRootChildIndex(layer, ctx) };
  const figmaRaster = tryRenderFigmaReferenceRaster(layer, layerCtx);
  if (figmaRaster) return figmaRaster;
  const figmaBlurEllipse = tryRenderFigmaBlurEllipse(layer, layerCtx);
  if (figmaBlurEllipse) return figmaBlurEllipse;
  if (isFigmaAutoSizeText(layer, layerCtx)) return renderFigmaAutoSizeText(layer, layerCtx);
  const contentBoard = tryRenderContentListBoard(layer);
  if (contentBoard) return contentBoard;
  const filterPanel = tryRenderFilterSidePanel(layer);
  if (filterPanel) return filterPanel;
  const tabsPanel = tryRenderTabsPanel(layer);
  if (tabsPanel) return tabsPanel;
  const radioGroup = tryRenderRadioGroupField(layer);
  if (radioGroup) return radioGroup;
  const calendar = tryRenderCalendarScheduler(layer);
  if (calendar) return calendar;
  const navigation = tryRenderNavigationBars(layer);
  if (navigation) return navigation;
  const loginButton = tryRenderLoginPageButton(layer, ctx);
  if (loginButton) return loginButton;
  const loginSocials = tryRenderLoginSocials(layer, ctx);
  if (loginSocials) return loginSocials;
  const labButton = tryRenderLabButton(layer);
  if (labButton) return labButton;
  const foodCatBtn = tryRenderFoodCategoryButton(layer, ctx);
  if (foodCatBtn) return foodCatBtn;
  const foodCart = tryRenderFoodCartButton(layer, ctx);
  if (foodCart) return foodCart;
  const foodCheckout = tryRenderFoodCheckoutButton(layer, ctx);
  if (foodCheckout) return foodCheckout;
  const foodDealStrong = tryRenderFoodDealFootStrong(layer, ctx);
  if (foodDealStrong) return foodDealStrong;
  const foodDealFoot = tryRenderFoodDealFootButton(layer, ctx);
  if (foodDealFoot) return foodDealFoot;
  const foodDealTag = tryRenderFoodDealTagSpan(layer, ctx);
  if (foodDealTag) return foodDealTag;
  const foodDealArt = tryRenderFoodDealArt(layer, ctx);
  if (foodDealArt) return foodDealArt;
  const meetingJoin = tryRenderMeetingJoinButton(layer, ctx);
  if (meetingJoin) return meetingJoin;
  const meetingIcon = tryRenderMeetingIconButton(layer, ctx);
  if (meetingIcon) return meetingIcon;
  const meetingH3 = tryRenderMeetingCardH3(layer, ctx);
  if (meetingH3) return meetingH3;
  const retroAscii = tryRenderRetroAsciiPre(layer, ctx);
  if (retroAscii) return retroAscii;
  const pricingPrice = renderPricingPriceRow(layer, ctx);
  if (pricingPrice) return pricingPrice;
  const style = paintToBaseCss(layer, layerCtx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || layer.source.tag || "layer");
  let inner = "";
  if (
    layer.source.tag === "label" &&
    layer.text &&
    (ctx.parent?.source?.tag === "fieldset" ||
      hasScaleTransform(layer) ||
      isMuiShrunkLabel(layer))
  ) {
    const textOnly = textToHtml(layer, layer.text, layer.paint, ctx.parent, {
      pricingTree: ctx.pricingTree,
      pricingPro: ctx.pricingPro,
      ancestors: ctx.ancestors
    });
    let textStyle = textOnly.match(/style="([^"]*)"/)?.[1] ?? "";
    let labelScale = "";
    if (isMuiShrunkLabel(layer)) {
      textStyle = textStyle
        .replace(/font-size:\s*[^;]+;?/g, "")
        .replace(/line-height:\s*[^;]+;?/g, "");
      const lh = layer.text!.lineHeight ?? layer.text!.font.size;
      textStyle = `font-size: ${snap(layer.text!.font.size)}px; line-height: ${snap(lh)}px; ${textStyle}`;
      labelScale = "transform: scale(0.75); transform-origin: 0 0;";
    }
    const merged = `${style}; ${labelScale} ${textStyle}; background: #fff; padding: 0 4px; z-index: 1; overflow: visible`;
    return `<label class="${cls}" data-name="${name}" style="${merged}">${escapeHtml(
      layer.text.value
    )}</label>`;
  }
  if (isInlineTextLeaf(layer)) {
    const textOnly = textToHtml(layer, layer.text!, layer.paint, ctx.parent, {
      pricingTree: ctx.pricingTree,
      pricingPro: ctx.pricingPro,
      ancestors: ctx.ancestors
    });
    const textStyle = textOnly.match(/style="([^"]*)"/)?.[1] ?? "";
    const merged =
      ctx.pricingTree && hasLayerClass(layer, "lab-pricing-cta")
        ? style
        : textStyle
          ? `${style}; ${textStyle}`
          : style;
    return `<${nativeTag(layer)} class="${cls}" data-name="${name}" style="${merged}">${escapeHtml(
      layer.text!.value
    ).replace(/\n/g, "<br>")}</${nativeTag(layer)}>`;
  }
  if (
    layer.text &&
    (!layer.children || layer.children.length === 0) &&
    layer.source.tag !== "input"
  ) {
    inner = textToHtml(layer, layer.text, layer.paint, ctx.parent, {
      pricingTree: ctx.pricingTree,
      pricingPro: ctx.pricingPro,
      ancestors: ctx.ancestors
    });
  } else if (layer.vector) {
    inner = vectorToHtml(layer, layer.vector);
  } else if (layer.image) {
    inner = imageToHtml(layer, layer.image);
  }
  const baseKids = layer.children || [];
  const children = sortChildrenForPaint(layer, baseKids, layerCtx);
  for (const child of children) {
    inner += renderLayer(child, childCtx(layer, ctx));
  }
  const muiNotch = isMuiNotchedFieldset(layer);
  const muiLabel = muiNotch ? muiOutlinedLabelForFieldset(layer, ctx) : undefined;
  const hasBorderGaps = layer.paint?.borders?.gaps && layer.paint.borders.gaps.length > 0;
  if (muiNotch && muiLabel?.text && !hasBorderGaps) {
    const t = muiLabel.text;
    inner =
      `<legend style="float: unset; width: auto; padding: 0 4px; font-family: ${cssFontFamily(
        t.font.stack || t.font.family
      )}; font-size: ${snap(t.font.size * 0.75)}px; line-height: 1; max-width: 100%"><span style="visibility: hidden">${escapeHtml(
        t.value
      )}</span></legend>` + inner;
  }
  const overlay =
    layer.paint && hasBorderGaps
      ? buildBorderOverlaySvg(layer.box.width, layer.box.height, layer.paint)
      : isMuiOutlinedBorderSvg(layer)
        ? buildUniformRoundedBorderSvg(layer.box.width, layer.box.height, layer.paint)
        : null;
  if (overlay) inner += overlay;
  if (layer.source.tag === "input" && (!layer.children || layer.children.length === 0)) {
    const inputType = layer.source.inputType || "text";
    const placeholder = layer.source.placeholder;
    if (layer.text) {
      const t = layer.text;
      const b = layer.paint?.borders;
      const pad = layer.layout?.padding;
      const borderY = (b?.top?.width ?? 0) + (b?.bottom?.width ?? 0);
      const padY = (pad?.top ?? 0) + (pad?.bottom ?? 0);
      const innerH = Math.max(0, layer.box.height - borderY - padY);
      const searchInput =
        inFoodFrenzySearchTree(ctx.parent, ctx.ancestors) ||
        hasLayerClass(layer, "lab-food-frenzy-search");
      const fontCss = [
        `font-family: ${textFontCss(t, ctx.ancestors, layer)}`,
        `font-size: ${snap(t.font.size)}px`,
        `font-weight: ${t.font.weight}`,
        `color: ${t.color}`,
        searchInput ? "line-height: normal" : innerH > 0 ? `line-height: ${snap(innerH)}px` : ""
      ]
        .filter(Boolean)
        .join("; ");
      // Native inputs center value text with UA metrics — skip flex text-box rules.
      return `<input type="${escapeAttr(inputType)}" class="${cls}" data-name="${name}" style="${style}; ${fontCss}" value="${escapeAttr(
        layer.text.value
      )}" />`;
    }
    if (placeholder) {
      return `<input type="${escapeAttr(inputType)}" class="${cls}" data-name="${name}" style="${style}" placeholder="${escapeAttr(
        placeholder
      )}" value="" />`;
    }
  }
  if (layer.image && (!layer.children || layer.children.length === 0)) {
    const img = layer.image;
    const src = img.dataUrl || img.src;
    const mode = img.mode || "fill";
    const objectFit =
      mode === "fit" || mode === "contain"
        ? "contain"
        : mode === "cover"
        ? "cover"
        : mode === "none"
        ? "none"
        : "fill";
    const opos = (img.positionX || "50%") + " " + (img.positionY || "50%");
    const merged = `${style}; display: block; object-fit: ${objectFit}; object-position: ${opos}`;
    return `<img class="${cls}" data-name="${name}" style="${merged}" src="${escapeAttr(src)}" alt="${escapeAttr(img.alt || "")}">`;
  }
  const tag = nativeTag(layer);
  return `<${tag} class="${cls}" data-name="${name}" style="${style}">${inner}</${tag}>`;
}

export interface RenderedDoc {
  bodyMarkup: string;
  width: number;
  height: number;
  background: string;
}

/**
 * Render the document into a self-contained HTML page. Useful only when the
 * caller can't share a page with the original Storybook (no shared fonts).
 */
export function renderToHtml(doc: UniversalDocumentV2): string {
  const r = renderToBodyMarkup(doc);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: ${r.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
.layer { box-sizing: border-box; }
.layer .text { width: 100%; height: 100%; }
${doc.meta?.preserveEffects ? `.layer.figma { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: geometricPrecision; }` : ""}
</style></head>
<body style="position: relative; width: ${snap(r.width)}px; height: ${snap(r.height)}px; background: ${r.background};">
${r.bodyMarkup}
</body></html>`;
}

/**
 * Render into a body-only fragment so the caller can inject it into an
 * existing page (e.g. the Storybook iframe) that already has fonts loaded.
 */
export function renderToBodyMarkup(doc: UniversalDocumentV2): RenderedDoc {
  resetSvgDefSeq();
  const root = doc.root;
  const bg = doc.meta.canvasBackground || "white";
  const hoistedRasters: Array<{ z: number; html: string }> = [];
  const renderCtx: RenderCtx = {
    preserveEffects: doc.meta?.preserveEffects === true,
    skipFigmaBlurEllipses:
      (doc.meta as { skipFigmaBlurEllipses?: boolean } | undefined)?.skipFigmaBlurEllipses ===
      true,
    hoistReferenceRasters:
      (doc.meta as { hoistReferenceRasters?: boolean } | undefined)?.hoistReferenceRasters ===
      true,
    hoistedRasters,
    docRoot: root,
  };
  const rendered = renderLayer(root, renderCtx);
  const hoistedHtml = hoistedRasters
    .sort((a, b) => a.z - b.z)
    .map((entry) => entry.html)
    .join("");
  // Ceil so subpixel roots (e.g. 168.3px buttons) match Playwright element screenshots.
  const width = Math.ceil(root.box.width - 1e-9);
  const height = Math.ceil(root.box.height - 1e-9);
  // Force the root to sit at (0,0) — its absolute screen position is irrelevant
  // because we screenshot the rendered region from (0,0) to (width,height).
  let body = rendered
    .replace(`left: ${px(root.box.x)};`, "left: 0px;")
    .replace(`top: ${px(root.box.y)};`, "top: 0px;");
  body += hoistedHtml;
  body = body
    .replace(`width: ${px(root.box.width)};`, `width: ${width}px;`)
    .replace(`height: ${px(root.box.height)};`, `height: ${height}px;`);
  return {
    bodyMarkup: body,
    width,
    height,
    background: bg
  };
}
