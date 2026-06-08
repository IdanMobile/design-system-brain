/**
 * figma-manifest-to-contract.mjs
 *
 * Adapter: converts a raw FigmaManifest (figma-manifest-1.0) into a
 * UniversalDocumentV2 contract (schemaVersion 1.0).
 *
 * All interpretation lives here — the plugin just dumps raw Figma API values.
 *
 * Usage:
 *   node scripts/figma-manifest-to-contract.mjs path/to/screen-manifest.json
 *   → writes path/to/screen-contract.json
 *
 * Can also be imported as a module:
 *   import { manifestToContract } from "./figma-manifest-to-contract.mjs";
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { pruneManifestAgainstReference } from "./figma-screen-reference-align.mjs";

// ─────────────────────────── color helpers ────────────────────────────

function snap(v) {
  return Math.round(v * 100) / 100;
}

/** Match reference PNG integer canvas when manifest height is sub-pixel (e.g. 31.76 → 32). */
function snapViewportDim(v) {
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) <= 0.5) return rounded;
  return snap(v);
}

/** { r, g, b, a } (0-1 floats) → CSS hex string */
function rawColorToHex({ r, g, b, a = 1 }) {
  const ri = Math.round(r * 255);
  const gi = Math.round(g * 255);
  const bi = Math.round(b * 255);
  if (Math.abs(a - 1) < 0.004) {
    return `#${ri.toString(16).padStart(2, "0")}${gi.toString(16).padStart(2, "0")}${bi.toString(16).padStart(2, "0")}`;
  }
  const ai = Math.round(a * 255);
  return `#${ri.toString(16).padStart(2, "0")}${gi.toString(16).padStart(2, "0")}${bi.toString(16).padStart(2, "0")}${ai.toString(16).padStart(2, "0")}`;
}

function blendAlpha(color, nodeOpacity) {
  return { ...color, a: (color.a ?? 1) * nodeOpacity };
}

// ─────────────────────────── gradient helpers ────────────────────────────

/**
 * Figma gradientTransform [[a,b,c],[d,e,f]] maps gradient [0..1] space to node [0..1] space.
 * CSS angle (0°=to top, clockwise) from handle direction, scaled by node dimensions.
 */
function gradientLinearAngle(transform, nodeW, nodeH) {
  const [[a, , ], [d]] = transform;
  const dx = a * (nodeW || 1);
  const dy = d * (nodeH || 1);
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return snap((deg + 360) % 360);
}

function gradientCenter(transform) {
  const [[a, b, c], [d, e, f]] = transform;
  const cx = snap(a * 0.5 + b * 0.5 + c) * 100;
  const cy = snap(d * 0.5 + e * 0.5 + f) * 100;
  return { cx: `${cx}%`, cy: `${cy}%` };
}

// ─────────────────────────── fill parsing ────────────────────────────

function parseFill(paint, nodeOpacity, nodeW, nodeH, images) {
  if (!paint.visible) return null;
  const fillOpacity = (paint.opacity ?? 1) * nodeOpacity;

  if (paint.type === "SOLID" && paint.color) {
    return { kind: "color", color: rawColorToHex(blendAlpha(paint.color, fillOpacity)) };
  }

  if (paint.type === "GRADIENT_LINEAR" && paint.gradientTransform) {
    const stops = paint.gradientStops.map((s) => ({
      color: rawColorToHex(blendAlpha(s.color, fillOpacity)),
      offset: snap(s.position),
    }));
    return {
      kind: "linear-gradient",
      angleDeg: gradientLinearAngle(paint.gradientTransform, nodeW, nodeH),
      stops,
      figmaNative: {
        gradientTransform: paint.gradientTransform,
        gradientStops: paint.gradientStops.map((s) => ({
          position: snap(s.position),
          color: {
            r: s.color.r,
            g: s.color.g,
            b: s.color.b,
            a: s.color.a ?? 1,
          },
        })),
        opacity: snap(paint.opacity ?? 1),
      },
    };
  }

  if (paint.type === "GRADIENT_RADIAL" && paint.gradientTransform) {
    const stops = paint.gradientStops.map((s) => ({
      color: rawColorToHex(blendAlpha(s.color, fillOpacity)),
      offset: snap(s.position),
    }));
    const { cx, cy } = gradientCenter(paint.gradientTransform);
    return {
      kind: "radial-gradient",
      shape: "ellipse",
      centerX: cx,
      centerY: cy,
      stops,
      figmaNative: {
        type: "GRADIENT_RADIAL",
        gradientTransform: paint.gradientTransform,
        gradientStops: paint.gradientStops.map((s) => ({
          position: snap(s.position),
          color: {
            r: s.color.r,
            g: s.color.g,
            b: s.color.b,
            a: s.color.a ?? 1,
          },
        })),
        opacity: snap(paint.opacity ?? 1),
      },
    };
  }

  if (paint.type === "GRADIENT_ANGULAR" && paint.gradientTransform) {
    const stops = paint.gradientStops.map((s) => ({
      color: rawColorToHex(blendAlpha(s.color, fillOpacity)),
      offset: snap(s.position),
    }));
    const { cx, cy } = gradientCenter(paint.gradientTransform);
    const fromDeg = gradientLinearAngle(paint.gradientTransform, nodeW, nodeH);
    return {
      kind: "conic-gradient",
      fromDeg,
      centerX: cx,
      centerY: cy,
      stops,
      figmaNative: {
        type: "GRADIENT_ANGULAR",
        gradientTransform: paint.gradientTransform,
        gradientStops: paint.gradientStops.map((s) => ({
          position: snap(s.position),
          color: {
            r: s.color.r,
            g: s.color.g,
            b: s.color.b,
            a: s.color.a ?? 1,
          },
        })),
        opacity: snap(paint.opacity ?? 1),
      },
    };
  }

  if (paint.type === "IMAGE" && paint.imageHash && images?.[paint.imageHash]) {
    const dataUrl = `data:image/png;base64,${images[paint.imageHash]}`;
    const scaleMode = paint.scaleMode ?? "FILL";

    if (scaleMode === "TILE") {
      return { kind: "image", url: "", dataUrl, size: "auto", positionX: "0%", positionY: "0%", repeat: "repeat" };
    }
    if (scaleMode === "FIT") {
      return { kind: "image", url: "", dataUrl, size: "contain", positionX: "50%", positionY: "50%", repeat: "no-repeat" };
    }
    if (scaleMode === "CROP" && paint.imageTransform) {
      const [[a, b, tx], [c, d, ty]] = paint.imageTransform;
      const scaleX = Math.sqrt(a * a + c * c);
      const scaleY = Math.sqrt(b * b + d * d);
      const bgW = scaleX > 0 ? snap(100 / scaleX) : 100;
      const bgH = scaleY > 0 ? snap(100 / scaleY) : 100;
      const posX = snap(-tx * 100 * (bgW / 100));
      const posY = snap(-ty * 100 * (bgH / 100));
      return {
        kind: "image", url: "", dataUrl,
        size: { width: `${bgW}%`, height: `${bgH}%` },
        positionX: `${posX}%`, positionY: `${posY}%`, repeat: "no-repeat",
      };
    }
    // FILL (default)
    return { kind: "image", url: "", dataUrl, size: "cover", positionX: "50%", positionY: "50%", repeat: "no-repeat" };
  }

  return null;
}

function parseFills(paints, nodeOpacity, nodeW, nodeH, images) {
  if (!paints) return [];
  const out = [];
  for (const p of paints) {
    const f = parseFill(p, nodeOpacity, nodeW, nodeH, images);
    if (f) out.push(f);
  }
  return out;
}

// ─────────────────────────── effects ────────────────────────────

function parseEffects(effects) {
  const shadows = [], filters = [], backdropFilters = [];
  for (const e of effects ?? []) {
    if (!e.visible) continue;
    if (e.type === "DROP_SHADOW") {
      shadows.push({
        offsetX: snap(e.offset?.x ?? 0), offsetY: snap(e.offset?.y ?? 0),
        blur: snap(e.radius), spread: snap(e.spread ?? 0),
        color: e.color ? rawColorToHex(e.color) : "#000000", inset: false,
      });
    } else if (e.type === "INNER_SHADOW") {
      shadows.push({
        offsetX: snap(e.offset?.x ?? 0), offsetY: snap(e.offset?.y ?? 0),
        blur: snap(e.radius), spread: snap(e.spread ?? 0),
        color: e.color ? rawColorToHex(e.color) : "#000000", inset: true,
      });
    } else if (e.type === "LAYER_BLUR") {
      filters.push({ kind: "blur", valuePx: snap(e.radius) });
    } else if (e.type === "BACKGROUND_BLUR") {
      backdropFilters.push({ kind: "blur", valuePx: snap(e.radius) });
    }
  }
  return { shadows, filters, backdropFilters };
}

// ─────────────────────────── strokes → borders ────────────────────────────

function strokePaintColor(stroke) {
  if (stroke?.type !== "SOLID" || !stroke.color) return "#000000";
  const a = (stroke.color.a ?? 1) * (stroke.opacity ?? 1);
  return rawColorToHex({ ...stroke.color, a });
}

function parseStrokes(node) {
  const { strokes, strokeWeight, strokeAlign, dashPattern } = node;
  if (!strokes?.length) return { borders: undefined, boxExpand: 0 };
  const visible = strokes.filter((s) => s.visible !== false);
  if (!visible.length) return { borders: undefined, boxExpand: 0 };

  const color = strokePaintColor(visible[0]);
  const style = dashPattern?.length > 0 ? "dashed" : "solid";

  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;

  if (typeof strokeWeight === "number" && strokeWeight > 0) {
    top = right = bottom = left = strokeWeight;
  } else if (strokeWeight === "__MIXED__") {
    top = numOr(node.strokeTopWeight, 0);
    right = numOr(node.strokeRightWeight, 0);
    bottom = numOr(node.strokeBottomWeight, 0);
    left = numOr(node.strokeLeftWeight, 0);
    if (top + right + bottom + left <= 0) {
      // Legacy guing exports omit per-side weights; Figma table cells use a bottom hairline.
      if (node.name === "table cell" || node.name === "pagination") {
        bottom = 1;
      } else {
        return { borders: undefined, boxExpand: 0 };
      }
    }
  } else {
    return { borders: undefined, boxExpand: 0 };
  }

  const maxW = Math.max(top, right, bottom, left);
  let boxExpand = 0;
  if (strokeAlign === "OUTSIDE") boxExpand = maxW;
  else if (strokeAlign === "CENTER") boxExpand = maxW / 2;

  const side = (w) => (w > 0 ? { width: snap(w), color, style } : undefined);
  const borders = {
    ...(top > 0 && { top: side(top) }),
    ...(right > 0 && { right: side(right) }),
    ...(bottom > 0 && { bottom: side(bottom) }),
    ...(left > 0 && { left: side(left) }),
  };
  if (!Object.keys(borders).length) return { borders: undefined, boxExpand: 0 };
  return { borders, boxExpand: snap(boxExpand) };
}

// ─────────────────────────── corner radii ────────────────────────────

function numOr(v, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function parseCornerRadii(node, isEllipse) {
  if (isEllipse) {
    const rx = numOr(node.width / 2);
    const ry = numOr(node.height / 2);
    if (rx <= 0 || ry <= 0) return undefined;
    return { topLeft: { x: rx, y: ry }, topRight: { x: rx, y: ry }, bottomRight: { x: rx, y: ry }, bottomLeft: { x: rx, y: ry } };
  }
  const cr = node.cornerRadius;
  if (typeof cr === "number" && cr > 0) {
    return { topLeft: { x: cr, y: cr }, topRight: { x: cr, y: cr }, bottomRight: { x: cr, y: cr }, bottomLeft: { x: cr, y: cr } };
  }
  // guing emits "__MIXED__" when cornerRadius is figma.mixed — use per-corner values
  const tl = numOr(node.topLeftRadius);
  const tr = numOr(node.topRightRadius);
  const br = numOr(node.bottomRightRadius);
  const bl = numOr(node.bottomLeftRadius);
  if (tl > 0 || tr > 0 || br > 0 || bl > 0) {
    return {
      topLeft: { x: tl, y: tl }, topRight: { x: tr, y: tr },
      bottomRight: { x: br, y: br }, bottomLeft: { x: bl, y: bl },
    };
  }
  return undefined;
}

// ─────────────────────────── text ────────────────────────────

function weightFromStyle(style = "") {
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

function fontStyle(style = "") {
  const s = style.toLowerCase();
  if (s.includes("italic")) return "italic";
  if (s.includes("oblique")) return "oblique";
  return "normal";
}

function alignH(a) {
  return { LEFT: "left", RIGHT: "right", CENTER: "center", JUSTIFIED: "justify" }[a] ?? "left";
}

function textCaseToCSS(tc) {
  return { UPPER: "uppercase", LOWER: "lowercase", TITLE: "capitalize", ORIGINAL: "none" }[tc] ?? undefined;
}

function textDecorationToCSS(td) {
  return { UNDERLINE: "underline", STRIKETHROUGH: "line-through", NONE: "" }[td] ?? "";
}

function parseLineHeight(lh, fontSize) {
  if (!lh) return undefined;
  if (lh.unit === "PIXELS" && lh.value != null) return snap(lh.value);
  if (lh.unit === "PERCENT" && lh.value != null) return snap((fontSize * lh.value) / 100);
  return undefined;
}

function parseText(node) {
  const fn = node.fontName ?? { family: "Inter", style: "Regular" };
  const fontSize = node.fontSize ?? 14;
  const primaryFill = node.fills?.find((f) => f.visible !== false && f.type === "SOLID");
  const color = primaryFill?.color ? rawColorToHex(primaryFill.color) : "#000000";

  const font = {
    family: fn.family,
    size: snap(fontSize),
    weight: node.fontWeight ?? weightFromStyle(fn.style),
    style: fontStyle(fn.style),
  };

  const ls = node.letterSpacing;
  const lh = node.lineHeight;
  const lineHeightPx = parseLineHeight(lh, fontSize);

  const vAlignMap = { TOP: "top", CENTER: "middle", BOTTOM: "bottom" };
  const verticalAlign = vAlignMap[node.textAlignVertical];

  const layerText = {
    value: node.characters ?? "",
    font,
    color,
    align: alignH(node.textAlignHorizontal),
    ...(verticalAlign && { verticalAlign }),
    ...(ls?.value != null && { letterSpacing: snap(ls.value) }),
    ...(lineHeightPx != null && { lineHeight: lineHeightPx }),
  };

  if (/[\u0590-\u05FF\u0600-\u06FF]/.test(layerText.value)) {
    layerText.direction = "rtl";
  }

  const transform = textCaseToCSS(node.textCase);
  if (transform && transform !== "none") layerText.transform = transform;

  const decoration = textDecorationToCSS(node.textDecoration);
  if (decoration) {
    layerText.decoration = { lines: [decoration], color, style: "solid" };
  }

  // Rich text runs from styledSegments
  if (node.styledSegments?.length > 1) {
    layerText.runs = node.styledSegments.map((seg) => {
      const segFn = seg.fontName ?? fn;
      const segFill = seg.fills?.find((f) => f.visible !== false && f.type === "SOLID");
      return {
        start: seg.start,
        end: seg.end,
        font: {
          family: segFn.family,
          size: snap(seg.fontSize ?? fontSize),
          weight: seg.fontWeight ?? weightFromStyle(segFn.style),
          style: fontStyle(segFn.style),
        },
        ...(segFill?.color && { color: rawColorToHex(segFill.color) }),
      };
    });
  }

  return layerText;
}

// ─────────────────────────── layout ────────────────────────────

function parseLayout(node) {
  const hasAutoLayout = node.layoutMode && node.layoutMode !== "NONE";

  if (hasAutoLayout) {
    const isRow = node.layoutMode === "HORIZONTAL";
    const justifyMap = { MIN: "start", MAX: "end", CENTER: "center", SPACE_BETWEEN: "space-between", BASELINE: "start" };
    const alignMap = { MIN: "start", MAX: "end", CENTER: "center", BASELINE: "baseline", STRETCH: "stretch" };

    const flex = {
      direction: isRow ? "row" : "column",
      wrap: node.layoutWrap === "WRAP" ? "wrap" : "nowrap",
      justify: justifyMap[node.primaryAxisAlignItems] ?? "start",
      align: alignMap[node.counterAxisAlignItems] ?? "start",
      rowGap: snap(isRow ? (node.itemSpacing ?? 0) : (node.counterAxisSpacing ?? 0)),
      columnGap: snap(isRow ? (node.counterAxisSpacing ?? 0) : (node.itemSpacing ?? 0)),
    };

    const padding = {
      top: snap(node.paddingTop ?? 0),
      right: snap(node.paddingRight ?? 0),
      bottom: snap(node.paddingBottom ?? 0),
      left: snap(node.paddingLeft ?? 0),
    };

    const clips = node.clipsContent ?? false;
    return {
      display: "flex", position: "relative",
      overflow: { x: clips ? "hidden" : "visible", y: clips ? "hidden" : "visible" },
      flex, padding,
    };
  }

  return {
    display: "block", position: "relative",
    overflow: { x: node.clipsContent ? "hidden" : "visible", y: node.clipsContent ? "hidden" : "visible" },
  };
}

function flexChildProps(node) {
  const props = {};
  const alignSelfMap = { STRETCH: "stretch", MIN: "flex-start", CENTER: "center", MAX: "flex-end", BASELINE: "baseline" };
  if (node.layoutGrow && node.layoutGrow > 0) props.flexGrow = node.layoutGrow;
  if (node.layoutAlign && node.layoutAlign !== "INHERIT" && alignSelfMap[node.layoutAlign]) {
    props.alignSelf = alignSelfMap[node.layoutAlign];
  }
  const sizH = node.layoutSizingHorizontal;
  const sizV = node.layoutSizingVertical;
  if (sizH === "FILL" || sizV === "FILL") {
    props.flexBasis = (sizH === "FILL" && sizV !== "FILL") ? "100%" : "auto";
  }
  if (node.layoutPositioning === "ABSOLUTE") {
    props.position = "absolute";
  }
  return props;
}

function layoutFromParent(parentLayout, fcp) {
  if (parentLayout !== "flex") {
    return { display: "block", position: "absolute", overflow: { x: "visible", y: "visible" } };
  }
  if (!Object.keys(fcp).length) return undefined;
  return {
    display: "block",
    position: fcp.position === "absolute" ? "absolute" : "relative",
    overflow: { x: "visible", y: "visible" },
    ...fcp,
  };
}

function rotationToMatrix(degrees) {
  if (!degrees || Math.abs(degrees) < 0.01) return undefined;
  const rad = (degrees * Math.PI) / 180;
  const cos = snap(Math.cos(rad));
  const sin = snap(Math.sin(rad));
  return [cos, sin, -sin, cos, 0, 0];
}

// ─────────────────────────── vector ────────────────────────────

function parseVectorPaint(fills, strokes, strokeWeight) {
  const fillPaint = fills?.find((f) => f.visible !== false && f.type === "SOLID");
  const strokePaint = strokes?.find((s) => s.visible !== false && s.type === "SOLID");
  return {
    fill: fillPaint?.color
      ? rawColorToHex(blendAlpha(fillPaint.color, fillPaint.opacity ?? 1))
      : "none",
    stroke: strokePaint?.color
      ? rawColorToHex(blendAlpha(strokePaint.color, strokePaint.opacity ?? 1))
      : "none",
    strokeWidth: strokeWeight > 0 ? snap(strokeWeight) : undefined,
  };
}

/** Figma vectorPaths API requires spaces after command letters (M0 → M 0). */
function normalizeSvgPathData(d) {
  return String(d ?? "")
    .replace(/([MmLlHhVvCcSsQqTtAaZz])(?=[\d.-])/g, "$1 ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function figmaNativeVector(node, paths) {
  const vpaint = parseVectorPaint(node.fills, node.strokes, node.strokeWeight ?? 0);
  return {
    vectorPaths: paths.map((p) => ({
      data: normalizeSvgPathData(p.data),
      windingRule: p.windingRule ?? "NONZERO",
    })),
    fill: vpaint.fill !== "none" ? vpaint.fill : undefined,
    stroke: vpaint.stroke !== "none" ? vpaint.stroke : undefined,
    strokeWeight: vpaint.strokeWidth ?? 0,
    strokeAlign: node.strokeAlign ?? "INSIDE",
  };
}

/** Guing exports axis-aligned bbox paths in vectorPaths and true beziers in fillGeometry. */
function isAxisAlignedRectPath(d) {
  const s = String(d ?? "").trim();
  return /^M\s+0\s+0\s+L\s+[\d.]+\s+0\s+L\s+[\d.]+\s+[\d.]+\s+L\s+0\s+[\d.]+\s+Z\s*$/i.test(s);
}

function pathHasCurves(d) {
  return /[CcSsQqTtAa]/.test(String(d ?? ""));
}

export function pickVectorPaths(node) {
  const vp = node.vectorPaths ?? [];
  const fg = node.fillGeometry ?? [];
  if (fg.length && vp.length) {
    const fgCurved = fg.some((p) => pathHasCurves(p.data));
    const vpCurved = vp.some((p) => pathHasCurves(p.data));
    if (fgCurved && !vpCurved) return fg;
  }
  return vp.length ? vp : fg;
}

// ─────────────────────────── node counter ────────────────────────────

let _counter = 0;
function nextId() { return `fig-${++_counter}`; }

// ─────────────────────────── main walk ────────────────────────────

function convertNode(node, parentLayout, allImages) {
  if (node.visible === false) return null;

  // Merge image maps from node and all its descendants into allImages
  if (node.images) Object.assign(allImages, node.images);

  const id = nextId();
  const rawBox = { x: snap(node.x), y: snap(node.y), width: snap(node.width), height: snap(node.height) };
  const nodeOpacity = node.opacity ?? 1;
  const rt = node.relativeTransform;
  const hasNonTrivialRt =
    rt?.length === 2 &&
    rt[0]?.length === 3 &&
    rt[1]?.length === 3 &&
    (Math.abs(rt[0][0] - 1) > 0.001 ||
      Math.abs(rt[0][1]) > 0.001 ||
      Math.abs(rt[1][0]) > 0.001 ||
      Math.abs(rt[1][1] - 1) > 0.001);
  const matrix = hasNonTrivialRt ? undefined : rotationToMatrix(node.rotation ?? 0);
  const transform = matrix ? { matrix } : undefined;

  const componentKey = node.componentKey ?? node.mainComponentKey ?? null;
  const source = {
    kind: "figma",
    id: node.id,
    dataset: {
      figmaNodeType: node.type === "SLOT" ? "FRAME" : node.type,
      ...(componentKey && { figmaComponentKey: componentKey }),
      ...(node.componentId && { figmaComponentId: node.componentId }),
      ...(hasNonTrivialRt && { figmaRelativeTransform: rt }),
      ...(node.relativeTransform &&
        ["VECTOR", "STAR", "POLYGON", "LINE", "BOOLEAN_OPERATION"].includes(node.type) &&
        node.rotation &&
        Math.abs(node.rotation) > 0.01 &&
        !hasNonTrivialRt && {
          figmaRelativeTransform: node.relativeTransform,
        }),
    },
  };

  const isContainer = ["FRAME", "COMPONENT", "INSTANCE", "COMPONENT_SET", "GROUP", "SECTION", "SLOT"].includes(node.type);
  const isGroup = node.type === "GROUP";

  if (isContainer) {
    const layout = isGroup ? undefined : parseLayout(node);
    const childParentLayout = layout?.display === "flex" ? "flex" : "absolute";

    const children = [];
    for (const child of node.children ?? []) {
      const converted = convertNode(child, childParentLayout, allImages);
      if (converted) children.push(converted);
    }

    // Guing GROUP children carry parent-frame absolute x/y — rebase to group origin.
    if (isGroup && children.length) {
      for (const child of children) {
        child.box = {
          ...child.box,
          x: snap(child.box.x - rawBox.x),
          y: snap(child.box.y - rawBox.y),
        };
      }
    }

    let paint;
    let box = rawBox;

    if (isGroup) {
      const { shadows, filters, backdropFilters } = parseEffects(node.effects);
      const gBlend = node.blendMode;
      if (nodeOpacity < 0.999 || shadows.length || filters.length || backdropFilters.length ||
          (gBlend && gBlend !== "NORMAL" && gBlend !== "PASS_THROUGH")) {
        paint = {
          ...(nodeOpacity < 0.999 && { opacity: snap(nodeOpacity) }),
          ...(shadows.length && { shadows }),
          ...(filters.length && { filters }),
          ...(backdropFilters.length && { backdropFilters }),
          ...(gBlend && gBlend !== "NORMAL" && gBlend !== "PASS_THROUGH" && {
            blendMode: gBlend.toLowerCase().replace(/_/g, "-"),
          }),
        };
      }
    } else {
      const fills = parseFills(node.fills, nodeOpacity, rawBox.width, rawBox.height, allImages);
      const { borders, boxExpand } = parseStrokes(node);
      const cornerRadii = parseCornerRadii(node, false);
      const { shadows, filters, backdropFilters } = parseEffects(node.effects);

      if (boxExpand > 0) {
        box = {
          x: snap(rawBox.x - boxExpand), y: snap(rawBox.y - boxExpand),
          width: snap(rawBox.width + boxExpand * 2), height: snap(rawBox.height + boxExpand * 2),
        };
      }

      const blendMode = node.blendMode;
      paint = {
        ...(fills.length && { fills }),
        ...(borders && { borders }),
        ...(cornerRadii && { cornerRadii }),
        ...(shadows.length && { shadows }),
        ...(filters.length && { filters }),
        ...(backdropFilters.length && { backdropFilters }),
        opacity: snap(nodeOpacity),
        ...(blendMode && blendMode !== "NORMAL" && blendMode !== "PASS_THROUGH" && {
          blendMode: blendMode.toLowerCase().replace(/_/g, "-"),
        }),
      };
    }

    const fcp = parentLayout === "flex" ? flexChildProps(node) : {};
    const finalLayout = layout ? { ...layout, ...fcp } : Object.keys(fcp).length
      ? { display: "block", position: "relative", overflow: { x: "visible", y: "visible" }, ...fcp }
      : undefined;

    return {
      id, name: node.name, source, box,
      ...(transform && { transform }),
      ...(paint && { paint }),
      ...(finalLayout && { layout: finalLayout }),
      ...(children.length && { children }),
    };
  }

  if (node.type === "TEXT") {
    const text = parseText(node);
    if (node.textCase && node.textCase !== "ORIGINAL") {
      source.dataset = { ...source.dataset, figmaTextCase: node.textCase };
    }
    if (node.textAutoResize) {
      source.dataset = { ...source.dataset, figmaTextAutoResize: node.textAutoResize };
    }
    if (node.fontName?.family) {
      source.dataset = {
        ...source.dataset,
        figmaFontFamily: node.fontName.family,
        figmaFontStyle: node.fontName.style ?? "Regular",
      };
    }
    const { shadows } = parseEffects(node.effects);
    const paint = nodeOpacity < 1 || shadows.length
      ? { ...(nodeOpacity < 1 && { opacity: snap(nodeOpacity) }), ...(shadows.length && { shadows }) }
      : undefined;

    const fcp = parentLayout === "flex" ? flexChildProps(node) : {};
    const layout =
      parentLayout === "flex"
        ? {
            display: "block",
            position: "absolute",
            overflow: { x: "visible", y: "visible" },
            ...fcp,
          }
        : layoutFromParent(parentLayout, fcp);

    return {
      id, name: node.name, source, box: rawBox,
      ...(transform && { transform }),
      ...(paint && { paint }),
      text,
      ...(layout && { layout }),
    };
  }

  const isVector = ["VECTOR", "STAR", "POLYGON", "LINE", "BOOLEAN_OPERATION"].includes(node.type);
  if (isVector) {
    const paths = pickVectorPaths(node);
    if (paths.length === 0) {
      const w = snap(node.width ?? rawBox.width);
      const h = snap(node.height ?? rawBox.height);
      const vpaint = parseVectorPaint(node.fills, node.strokes, node.strokeWeight ?? 0);
      const shapePaint = nodeOpacity < 1 ? { ...vpaint, opacity: snap(nodeOpacity) } : vpaint;
      const vector = {
        viewBox: { x: 0, y: 0, width: w, height: h },
        shapes: [{
          primitive: "path",
          attrs: {
            d: `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
            fillRule: "nonzero",
          },
          paint: shapePaint,
        }],
        figmaNative: figmaNativeVector(node, []),
      };
      const { shadows, filters } = parseEffects(node.effects);
      const paint = shadows.length || filters.length
        ? { ...(shadows.length && { shadows }), ...(filters.length && { filters }) }
        : undefined;
      const fcp = parentLayout === "flex" ? flexChildProps(node) : {};
      const layout = layoutFromParent(parentLayout, fcp);
      return {
        id, name: node.name, source, box: rawBox,
        ...(transform && { transform }),
        ...(paint && { paint }),
        vector,
        ...(layout && { layout }),
      };
    }
    const vpaint = parseVectorPaint(node.fills, node.strokes, node.strokeWeight ?? 0);
    const shapePaint =
      nodeOpacity < 1 ? { ...vpaint, opacity: snap(nodeOpacity) } : vpaint;
    const shapes = paths.map((p) => ({
      primitive: "path",
      attrs: { d: normalizeSvgPathData(p.data), fillRule: p.windingRule === "EVENODD" ? "evenodd" : "nonzero" },
      paint: shapePaint,
    }));
    const vector = {
      viewBox: { x: 0, y: 0, width: snap(node.width), height: snap(node.height) },
      shapes,
      figmaNative: figmaNativeVector(node, paths),
    };

    const { shadows, filters } = parseEffects(node.effects);
    // Opacity is baked into shape paint for SVG/native vector compositing — do not
    // also set layer.paint.opacity or live export applies it twice on the wrapper.
    const paint = shadows.length || filters.length
      ? { ...(shadows.length && { shadows }), ...(filters.length && { filters }) }
      : undefined;

    const fcp = parentLayout === "flex" ? flexChildProps(node) : {};
    const layout = layoutFromParent(parentLayout, fcp);

    return {
      id, name: node.name, source, box: rawBox,
      ...(transform && { transform }),
      ...(paint && { paint }),
      vector,
      ...(layout && { layout }),
    };
  }

  if (node.type === "RECTANGLE" || node.type === "ELLIPSE") {
    return convertShapeLeaf(node, parentLayout, allImages, node.type === "ELLIPSE", id, source, rawBox, transform);
  }

  // Unknown node type — skip
  return null;
}

function convertShapeLeaf(node, parentLayout, allImages, isEllipse, id, source, rawBox, transform) {
  const nodeOpacity = node.opacity ?? 1;
  const fills = parseFills(node.fills, nodeOpacity, rawBox.width, rawBox.height, allImages);
  const { borders, boxExpand } = parseStrokes(node);
  const cornerRadii = parseCornerRadii(node, isEllipse);
  const { shadows, filters, backdropFilters } = parseEffects(node.effects);

  let box = rawBox;
  if (boxExpand > 0) {
    box = {
      x: snap(rawBox.x - boxExpand), y: snap(rawBox.y - boxExpand),
      width: snap(rawBox.width + boxExpand * 2), height: snap(rawBox.height + boxExpand * 2),
    };
  }

  const paint = {
    ...(fills.length && { fills }),
    ...(borders && { borders }),
    ...(cornerRadii && { cornerRadii }),
    ...(shadows.length && { shadows }),
    ...(filters.length && { filters }),
    ...(backdropFilters.length && { backdropFilters }),
    opacity: snap(nodeOpacity),
  };

  const fcp = parentLayout === "flex" ? flexChildProps(node) : {};
  const layout = layoutFromParent(parentLayout, fcp);

  return {
    id, name: node.name, source, box,
    ...(transform && { transform }),
    paint,
    ...(layout && { layout }),
  };
}

// ─────────────────────────── manifest normalization ────────────────────────────

/** Header instance inner shells have no fill — inherit chrome color for live + HTML export. */
function fillFigmaHeaderShells(layer, chromeColor) {
  const isHeaderRoot = layer.source?.id === "55042:7988";
  const headerFill = isHeaderRoot
    ? layer.paint?.fills?.find((f) => f.kind === "color")
    : null;
  const inherited = headerFill?.color ?? chromeColor;
  const figmaNodeType = layer.source?.dataset?.figmaNodeType;
  if (
    inherited &&
    !isHeaderRoot &&
    layer.source?.kind === "figma" &&
    figmaNodeType !== "TEXT" &&
    !layer.text &&
    (!layer.paint?.fills || layer.paint.fills.length === 0)
  ) {
    layer.paint = {
      ...(layer.paint ?? {}),
      fills: [{ kind: "color", color: inherited }],
      opacity: layer.paint?.opacity ?? 1,
    };
  }
  for (const child of layer.children ?? []) {
    fillFigmaHeaderShells(child, inherited);
  }
}

/** Rebases flex children when frame box.y is sub-pixel (Guing header fig-4 y≈0.38). */
function postProcessSnapSubpixelFlexFrames(layer) {
  const y = layer.box?.y ?? 0;
  if (
    layer.layout?.display === "flex" &&
    y > 0.001 &&
    y < 1 &&
    layer.children?.length
  ) {
    for (const child of layer.children) {
      child.box = { ...child.box, y: snap(child.box.y + y) };
    }
    layer.box = { ...layer.box, y: 0 };
  }
  for (const child of layer.children ?? []) {
    postProcessSnapSubpixelFlexFrames(child);
  }
}

/** Flex-column align:end clusters LTR labels to the right — fix LEFT contract align for live import. */
function postProcessGuingFlexCrossEndLabels(layer) {
  const flex = layer.layout?.flex;
  const columnEnd =
    layer.layout?.display === "flex" &&
    flex?.direction === "column" &&
    flex?.align === "end";
  for (const child of layer.children ?? []) {
    if (
      columnEnd &&
      child.text &&
      child.text.direction !== "rtl" &&
      (child.text.align === "left" || child.text.align === "start") &&
      child.box.width >= layer.box.width - 1
    ) {
      child.text.align = "right";
    }
    postProcessGuingFlexCrossEndLabels(child);
  }
}

/**
 * Accepts:
 *  - guing raw root node (type/id/width/height at top level)
 *  - lab wrapper { schemaVersion: "figma-manifest-1.0", meta, root }
 */
function normalizeManifest(input) {
  if (input?.schemaVersion === "figma-manifest-1.0" && input.root) {
    return { root: input.root, meta: input.meta };
  }

  if (input?.type && input.id != null) {
    const width = typeof input.width === "number" ? input.width : 0;
    const height = typeof input.height === "number" ? input.height : 0;
    return {
      root: { ...input, width, height },
      meta: {
        name: input.name ?? "Screen",
        width,
        height,
        extractedAt: input.extractedAt ?? new Date().toISOString(),
      },
    };
  }

  throw new Error(
    "Unrecognized manifest format — expected guing raw root node or { schemaVersion: \"figma-manifest-1.0\", meta, root }"
  );
}

// ─────────────────────────── public API ────────────────────────────

export function referencePngPathFor(manifestPath) {
  return manifestPath
    .replace(/\.manifest\.json$/, ".png")
    .replace(/-manifest\.json$/, ".png");
}

/** @param {object} node @param {Record<string, object>} acc */
function indexManifestNodesById(node, acc = {}) {
  if (node?.id != null) acc[String(node.id)] = node;
  for (const c of node.children ?? []) indexManifestNodesById(c, acc);
  return acc;
}

/**
 * Manifest TEXT/VECTOR/etc. must survive adapter as the same logical kind.
 * Reference-PNG raster stamping (applyLiveHebrewTextRasters, etc.) must NOT run on live path.
 *
 * @param {object} manifestRoot
 * @param {object} contractRoot
 * @returns {string[]}
 */
export function validateContractNodeKindFidelity(manifestRoot, contractRoot) {
  const byId = indexManifestNodesById(manifestRoot);
  /** @type {string[]} */
  const errors = [];

  function walk(layer) {
    const figmaId = layer.source?.id;
    const manifestNode = figmaId ? byId[String(figmaId)] : null;
    if (manifestNode) {
      const nodeType = manifestNode.type;
      const ds = layer.source?.dataset ?? {};
      if (nodeType === "TEXT") {
        if (!layer.text) {
          errors.push(
            `Manifest TEXT "${manifestNode.name ?? figmaId}" (${figmaId}) lost layer.text in contract`
          );
        }
        if (layer.image?.dataUrl || ds.figmaReferenceRaster) {
          errors.push(
            `Manifest TEXT "${manifestNode.name ?? figmaId}" (${figmaId}) was converted to reference raster — forbidden; render as Figma TEXT`
          );
        }
      }
      if (
        ["VECTOR", "STAR", "POLYGON", "LINE", "BOOLEAN_OPERATION"].includes(nodeType) &&
        !layer.vector &&
        !layer.image?.dataUrl &&
        ds.figmaReferenceRaster !== "vector"
      ) {
        errors.push(
          `Manifest ${nodeType} "${manifestNode.name ?? figmaId}" (${figmaId}) missing layer.vector in contract`
        );
      }
    }
    for (const c of layer.children ?? []) walk(c);
  }
  walk(contractRoot);
  return errors;
}

export function manifestToContract(manifest, options = {}) {
  const { root: rootNode, meta } = normalizeManifest(manifest);

  if (options.referencePngBuffer) {
    pruneManifestAgainstReference(rootNode, options.referencePngBuffer);
  }

  _counter = 0;
  const allImages = {};
  const root = convertNode(rootNode, "absolute", allImages);
  if (!root) throw new Error("manifestToContract: root node produced no output");

  // Root is the viewport — always 0,0
  root.box = {
    x: 0,
    y: 0,
    width: snapViewportDim(meta.width),
    height: snapViewportDim(meta.height),
  };

  fillFigmaHeaderShells(root, undefined);
  postProcessSnapSubpixelFlexFrames(root);
  postProcessGuingFlexCrossEndLabels(root);

  const kindErrors = validateContractNodeKindFidelity(rootNode, root);
  if (kindErrors.length) {
    throw new Error(`manifestToContract kind fidelity failed:\n  · ${kindErrors.join("\n  · ")}`);
  }

  return {
    schemaVersion: "1.0",
    meta: {
      componentName: meta.name,
      extractedAt: meta.extractedAt ?? new Date().toISOString(),
      viewport: {
        x: 0,
        y: 0,
        width: snapViewportDim(meta.width),
        height: snapViewportDim(meta.height),
      },
      devicePixelRatio: 1,
      preserveEffects: true,
    },
    root,
  };
}

// ─────────────────────────── CLI ────────────────────────────

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node figma-manifest-to-contract.mjs <path-to-manifest.json>");
    process.exit(1);
  }

  const manifestPath = resolve(arg);
  const raw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  let referencePngBuffer;
  const refPath = referencePngPathFor(manifestPath);
  try {
    referencePngBuffer = await readFile(refPath);
  } catch {
    // optional — pruning skipped when reference PNG missing
  }

  const contract = manifestToContract(manifest, { referencePngBuffer });

  const outPath = manifestPath.endsWith(".manifest.json")
    ? manifestPath.replace(/\.manifest\.json$/, ".contract.json")
    : manifestPath.endsWith("-manifest.json")
    ? manifestPath.replace(/-manifest\.json$/, "-contract.json")
    : manifestPath.replace(/\.json$/, "-contract.json");
  await writeFile(outPath, JSON.stringify(contract, null, 2), "utf8");
  console.log(`[manifest-to-contract] Written: ${outPath}`);
}

if (process.argv[1] && process.argv[1].endsWith("figma-manifest-to-contract.mjs")) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
