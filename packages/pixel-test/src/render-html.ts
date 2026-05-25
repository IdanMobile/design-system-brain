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
    return `radial-gradient(${layer.shape} at ${layer.centerX} ${layer.centerY}, ${stops})`;
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
  opts?: { insetShadow?: boolean; useNativeUniformSolid?: boolean }
): string[] {
  if (!b) return [];
  const uniform = uniformBorder(b);
  if (uniform && uniform.style === "solid" && uniform.width > 0) {
    if (opts?.useNativeUniformSolid) {
      return [`border: ${snap(uniform.width)}px solid ${uniform.color}`];
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

function cornerRadiusToCss(paint: LayerPaint | undefined): string[] {
  if (!paint?.cornerRadii) return [];
  const c = paint.cornerRadii;
  const tl = snap(c.topLeft.x);
  const tr = snap(c.topRight.x);
  const br = snap(c.bottomRight.x);
  const bl = snap(c.bottomLeft.x);
  const tly = snap(c.topLeft.y);
  const try_ = snap(c.topRight.y);
  const bry = snap(c.bottomRight.y);
  const bly = snap(c.bottomLeft.y);
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

function filtersToCss(paint: LayerPaint | undefined): string[] {
  if (!paint?.filters?.length) return [];
  const fns = paint.filters
    .map((f) => {
      if (f.kind === "blur") return `blur(${snap(f.valuePx)}px)`;
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

function transformToCss(layer: UniversalLayer): string[] {
  if (!layer.transform?.matrix || transformBakedIntoBox(layer) || isMuiShrunkLabel(layer)) return [];
  const [a, b, c, d, e, f] = layer.transform.matrix;
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
  opts?: { pricingTree?: boolean; pricingPro?: boolean }
): string {
  const props: string[] = [];
  if (!opts?.pricingTree) {
    props.push(`font-family: ${cssFontFamily(t.font.stack || t.font.family)}`);
    props.push(`font-size: ${snap(t.font.size)}px`);
    props.push(`font-weight: ${t.font.weight}`);
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
      t.lineHeight &&
      Math.abs(t.lineHeight - t.font.size) <= 1 &&
      t.font.size >= 40
    ) {
      props.push("line-height: 1");
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
    props.push("white-space: pre-line");
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
  // The text node itself fills the layer box; alignment handled via flex.
  const style = props.join("; ");
  return `<div class="text" style="${style}">${escapeHtml(t.value).replace(/\n/g, "<br>")}</div>`;
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
    const strokeOnly =
      p.stroke !== undefined &&
      p.strokeWidth !== undefined &&
      p.strokeWidth > 0 &&
      (!shape.attrs?.fill || shape.attrs.fill === "none");
    if (p.fill !== undefined && !strokeOnly) map.fill = String(p.fill);
    else if (strokeOnly) map.fill = "none";
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
    if (p.opacity !== undefined) map.opacity = String(p.opacity);
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
};

function layerClasses(layer: UniversalLayer): string[] {
  return layer.source.classList || [];
}

function hasLayerClass(layer: UniversalLayer, name: string): boolean {
  return layerClasses(layer).includes(name);
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
    cl.includes("bar-wrap")
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

function paintToBaseCss(layer: UniversalLayer, ctx: RenderCtx = {}): string[] {
  const flexChild = isFlexFlowChild(layer, ctx.parent);
  const analyticsBar = isAnalyticsBar(layer, ctx.parent);
  const analyticsBarWrap = isAnalyticsBarWrap(layer);
  const muiTabIndicator = isMuiTabsIndicator(layer);
  const props: string[] = [];
  const snapPos =
    layer.source.tag !== "input" && (Boolean(layer.text) || layer.source.tag === "label");
  const posX = snapPos ? Math.round(layer.box.x) : layer.box.x;
  let posY = snapPos ? Math.round(layer.box.y) : layer.box.y;
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
    const skipInlineFill =
      pricingCssShell ||
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
      hasLayerClass(layer, "trend-grid") ||
      (hasLayerClass(layer, "lab-pricing") && !hasLayerClass(layer, "pro"));
    const borderCss =
      !hasGaps && !pricingCssShell
        ? bordersToCss(paint.borders, {
            insetShadow: hasRadius && !useNativeBorder && !muiNotchedFieldset,
            useNativeUniformSolid: useNativeBorder
          })
        : [];
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
    if (!hasGaps) props.push(...cornerRadiusToCss(paint));
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
    props.push(...filtersToCss(paint));
    props.push(...backdropFiltersToCss(paint));
    if (paint.opacity !== undefined && paint.opacity < 1) props.push(`opacity: ${paint.opacity}`);
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
      c === "lg"
    ) {
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
  return { parent: layer, ancestors, pricingTree, pricingPro };
}

function renderLayer(layer: UniversalLayer, ctx: RenderCtx = {}): string {
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
  const pricingPrice = renderPricingPriceRow(layer, ctx);
  if (pricingPrice) return pricingPrice;
  const style = paintToBaseCss(layer, ctx).join("; ");
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
      pricingPro: ctx.pricingPro
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
      pricingPro: ctx.pricingPro
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
      pricingPro: ctx.pricingPro
    });
  } else if (layer.vector) {
    inner = vectorToHtml(layer, layer.vector);
  } else if (layer.image) {
    inner = imageToHtml(layer, layer.image);
  }
  const sortKids = (layer.source.classList || []).includes("lab-pricing-price");
  const baseKids = layer.children || [];
  const sortByZ =
    !sortKids &&
    baseKids.some((c) => c.source.tag === "label" && (c.layout?.zIndex ?? 0) > 0) &&
    baseKids.some((c) => c.layout?.zIndex !== undefined && c.layout.zIndex !== 0);
  const children = sortKids
    ? [...baseKids].sort((a, b) => (a.box.y !== b.box.y ? a.box.y - b.box.y : a.box.x - b.box.x))
    : sortByZ
      ? [...baseKids].sort((a, b) => (a.layout?.zIndex ?? 0) - (b.layout?.zIndex ?? 0))
      : baseKids;
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
      const fontCss = [
        `font-family: ${cssFontFamily(t.font.stack || t.font.family)}`,
        `font-size: ${snap(t.font.size)}px`,
        `font-weight: ${t.font.weight}`,
        `color: ${t.color}`,
        innerH > 0 ? `line-height: ${snap(innerH)}px` : ""
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
  const root = doc.root;
  const bg = doc.meta.canvasBackground || "white";
  const rendered = renderLayer(root);
  // Ceil so subpixel roots (e.g. 168.3px buttons) match Playwright element screenshots.
  const width = Math.ceil(root.box.width - 1e-9);
  const height = Math.ceil(root.box.height - 1e-9);
  // Force the root to sit at (0,0) — its absolute screen position is irrelevant
  // because we screenshot the rendered region from (0,0) to (width,height).
  let body = rendered
    .replace(`left: ${px(root.box.x)};`, "left: 0px;")
    .replace(`top: ${px(root.box.y)};`, "top: 0px;");
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
