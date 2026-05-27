"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/code-v2.ts
  var TAU = Math.PI * 2;
  function isUniversalDocumentV2(value) {
    if (!value || typeof value !== "object") return false;
    return value.schemaVersion === "1.0";
  }
  function snap(v) {
    return Math.round(v * 100) / 100;
  }
  function snapBoxSize(layer, axis) {
    var _a;
    const v = axis === "width" ? layer.box.width : layer.box.height;
    if (((_a = layer.source.classList) != null ? _a : []).includes("lab-button")) {
      return Math.max(1, Math.round(v));
    }
    return Math.max(1, snap(v));
  }
  function clampNodeWidthToParent(node, layer, parent) {
    var _a;
    if (!parent || !("resize" in node) || node.type === "TEXT") return;
    const pos = (_a = layer.layout) == null ? void 0 : _a.position;
    if (pos === "absolute" || pos === "fixed") return;
    const maxW = Math.max(1, snap(parent.box.width - layer.box.x));
    if (node.width <= maxW + 0.5) return;
    node.resize(maxW, node.height);
    if (node.type === "FRAME") {
      const text = node.children.find((c) => c.type === "TEXT");
      if (text && text.width > maxW + 0.5) {
        if (layer.source.tag === "button" && isLabDomCenterButton(layer, parent)) return;
        if (text.textAutoResize === "HEIGHT") {
          text.resize(maxW, text.height);
        } else if (text.textAutoResize === "NONE") {
          text.resize(maxW, text.height);
        }
      }
    }
  }
  function parseColor(raw) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "transparent" || trimmed === "none")
      return { r: 0, g: 0, b: 0, a: 0 };
    const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
      const v = hex[1];
      let expanded;
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
    const rgb = trimmed.match(
      /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i
    );
    if (rgb) {
      let a = 1;
      if (rgb[4] !== void 0) {
        a = rgb[4].endsWith("%") ? Number(rgb[4].slice(0, -1)) / 100 : Number(rgb[4]);
      }
      return {
        r: Number(rgb[1]) / 255,
        g: Number(rgb[2]) / 255,
        b: Number(rgb[3]) / 255,
        a
      };
    }
    const hsl = trimmed.match(
      /^hsla?\(\s*([\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i
    );
    if (hsl) {
      const h = Number(hsl[1]) / 360;
      const s = Number(hsl[2]) / 100;
      const l = Number(hsl[3]) / 100;
      const a = hsl[4] !== void 0 ? hsl[4].endsWith("%") ? Number(hsl[4].slice(0, -1)) / 100 : Number(hsl[4]) : 1;
      const [r, g, b] = hslToRgb(h, s, l);
      return { r, g, b, a };
    }
    if (trimmed === "white") return { r: 1, g: 1, b: 1, a: 1 };
    if (trimmed === "black") return { r: 0, g: 0, b: 0, a: 1 };
    return { r: 0, g: 0, b: 0, a: 1 };
  }
  function hslToRgb(h, s, l) {
    if (s === 0) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3)];
  }
  function toFigmaRgb(c) {
    return { r: c.r, g: c.g, b: c.b };
  }
  function solidPaint(color, alphaMul = 1) {
    const c = parseColor(color);
    return { type: "SOLID", color: toFigmaRgb(c), opacity: c.a * alphaMul };
  }
  function transparentFill() {
    return { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0 };
  }
  function svgStrokeColorAttrs(color) {
    const c = parseColor(color);
    const r = Math.round(c.r * 255);
    const g = Math.round(c.g * 255);
    const b = Math.round(c.b * 255);
    if (c.a >= 0.999) return `stroke="rgb(${r}, ${g}, ${b})"`;
    return `stroke="rgb(${r}, ${g}, ${b})" stroke-opacity="${snap(c.a)}"`;
  }
  function gradientTransformForAngle(angleDeg, width, height) {
    const rad = (angleDeg - 90) * Math.PI / 180;
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
    const m = [
      [dx, -dy, 0.5 - dx / 2 + dy / 2],
      [dy, dx, 0.5 - dy / 2 - dx / 2]
    ];
    return m;
  }
  function toColorStops(stops) {
    return stops.slice().sort((a, b) => a.offset - b.offset).map((s) => {
      const c = parseColor(s.color);
      return {
        position: Math.max(0, Math.min(1, s.offset)),
        color: { r: c.r, g: c.g, b: c.b, a: c.a }
      };
    });
  }
  function reverseLinearStops(stops) {
    return stops.map((s) => __spreadProps(__spreadValues({}, s), { position: 1 - s.position })).sort((a, b) => a.position - b.position);
  }
  function figmaNativeGradientPaint(layer) {
    var _a, _b;
    const native = layer.figmaNative;
    if (!(native == null ? void 0 : native.gradientTransform) || !((_a = native.gradientStops) == null ? void 0 : _a.length)) return null;
    const gradientStops = native.gradientStops.slice().sort((a, b) => a.position - b.position).map((s) => ({
      position: Math.max(0, Math.min(1, s.position)),
      color: {
        r: s.color.r,
        g: s.color.g,
        b: s.color.b,
        a: s.color.a
      }
    }));
    const type = (_b = native.type) != null ? _b : layer.kind === "radial-gradient" ? "GRADIENT_RADIAL" : layer.kind === "conic-gradient" ? "GRADIENT_ANGULAR" : "GRADIENT_LINEAR";
    const paint = {
      type,
      gradientTransform: native.gradientTransform,
      gradientStops
    };
    if (native.opacity != null && native.opacity < 0.999) {
      paint.opacity = snap(native.opacity);
    }
    return paint;
  }
  function gradientPaint(layer, width, height) {
    const nativePaint = figmaNativeGradientPaint(layer);
    if (nativePaint) return nativePaint;
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
        ],
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
  var imageHashByDataUrl = /* @__PURE__ */ new Map();
  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function svgMarkupFromDataUrl(dataUrl) {
    if (!dataUrl.startsWith("data:image/svg+xml")) return null;
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    const meta = dataUrl.slice(0, comma);
    const payload = dataUrl.slice(comma + 1);
    if (meta.includes(";base64")) return atob(payload);
    return decodeURIComponent(payload);
  }
  var BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function bytesToBase64(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      const n = b0 << 16 | b1 << 8 | b2;
      out += BASE64_CHARS[n >> 18 & 63];
      out += BASE64_CHARS[n >> 12 & 63];
      out += i + 1 < bytes.length ? BASE64_CHARS[n >> 6 & 63] : "=";
      out += i + 2 < bytes.length ? BASE64_CHARS[n & 63] : "=";
    }
    return out;
  }
  function imageHashFromDataUrl(dataUrl) {
    const cached = imageHashByDataUrl.get(dataUrl);
    if (cached) return cached;
    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) throw new Error("Unsupported data URL");
    const bytes = base64ToBytes(match[1]);
    const hash = figma.createImage(bytes).hash;
    imageHashByDataUrl.set(dataUrl, hash);
    return hash;
  }
  function imagePaintFromFill(layer) {
    if (!layer.dataUrl) return null;
    let scaleMode = "FILL";
    if (layer.size === "contain") scaleMode = "FIT";
    else if (layer.size === "cover") scaleMode = "FILL";
    else if (layer.repeat && layer.repeat !== "no-repeat") scaleMode = "TILE";
    return { type: "IMAGE", imageHash: imageHashFromDataUrl(layer.dataUrl), scaleMode };
  }
  function imagePaintFromImage(image) {
    const dataUrl = image.dataUrl || image.src;
    if (!dataUrl) return null;
    const mode = image.mode || "fill";
    let scaleMode = "FILL";
    if (mode === "contain" || mode === "fit") scaleMode = "FIT";
    else if (mode === "cover") scaleMode = "FILL";
    else if (mode === "none") scaleMode = "CROP";
    if (svgMarkupFromDataUrl(dataUrl)) return null;
    return { type: "IMAGE", imageHash: imageHashFromDataUrl(dataUrl), scaleMode };
  }
  function bordersUniform(b) {
    if (!b) return null;
    if (b.gaps && b.gaps.length) return null;
    const sides = [b.top, b.right, b.bottom, b.left].filter(Boolean);
    if (!sides.length) return null;
    const first = sides[0];
    const allSame = sides.every(
      (s) => s.color === first.color && s.style === first.style
    );
    return allSame ? first : null;
  }
  function countActiveBorderSides(b) {
    var _a, _b, _c, _d;
    if (!b) return 0;
    let n = 0;
    if ((_a = b.top) == null ? void 0 : _a.width) n++;
    if ((_b = b.right) == null ? void 0 : _b.width) n++;
    if ((_c = b.bottom) == null ? void 0 : _c.width) n++;
    if ((_d = b.left) == null ? void 0 : _d.width) n++;
    return n;
  }
  function singleEdgeBorderSide(b) {
    var _a, _b, _c, _d;
    if (!b || b.gaps && b.gaps.length) return null;
    const active = [];
    if ((_a = b.top) == null ? void 0 : _a.width) active.push("top");
    if ((_b = b.right) == null ? void 0 : _b.width) active.push("right");
    if ((_c = b.bottom) == null ? void 0 : _c.width) active.push("bottom");
    if ((_d = b.left) == null ? void 0 : _d.width) active.push("left");
    return active.length === 1 ? active[0] : null;
  }
  function perCornerRadii(paint) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const c = paint.cornerRadii;
    return {
      tl: (_b = (_a = c == null ? void 0 : c.topLeft) == null ? void 0 : _a.x) != null ? _b : 0,
      tr: (_d = (_c = c == null ? void 0 : c.topRight) == null ? void 0 : _c.x) != null ? _d : 0,
      br: (_f = (_e = c == null ? void 0 : c.bottomRight) == null ? void 0 : _e.x) != null ? _f : 0,
      bl: (_h = (_g = c == null ? void 0 : c.bottomLeft) == null ? void 0 : _g.x) != null ? _h : 0
    };
  }
  function clampCornerRadius(r, width, height) {
    return Math.max(0, Math.min(r, width / 2 - 1, height / 2 - 1));
  }
  function borderStrokeAttrs(color, style, sw) {
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
  function edgeSegmentPath(edge, width, height, inset, cr) {
    const tl = clampCornerRadius(cr.tl, width, height);
    const tr = clampCornerRadius(cr.tr, width, height);
    const br = clampCornerRadius(cr.br, width, height);
    const bl = clampCornerRadius(cr.bl, width, height);
    if (edge === "top") return `M ${inset + tl} ${inset} L ${width - inset - tr} ${inset}`;
    if (edge === "bottom") return `M ${inset + bl} ${height - inset} L ${width - inset - br} ${height - inset}`;
    if (edge === "left") return `M ${inset} ${inset + tl} L ${inset} ${height - inset - bl}`;
    return `M ${width - inset} ${inset + tr} L ${width - inset} ${height - inset - br}`;
  }
  function buildActiveBorderSvg(width, height, paint) {
    var _a, _b, _c, _d;
    const b = paint.borders;
    if (!b) return null;
    const edges = [];
    if ((_a = b.top) == null ? void 0 : _a.width) edges.push("top");
    if ((_b = b.right) == null ? void 0 : _b.width) edges.push("right");
    if ((_c = b.bottom) == null ? void 0 : _c.width) edges.push("bottom");
    if ((_d = b.left) == null ? void 0 : _d.width) edges.push("left");
    if (!edges.length) return null;
    const ref = b[edges[0]];
    const color = ref.color || "black";
    const style = ref.style || "solid";
    const sw = Math.max(...edges.map((e) => b[e].width || 0));
    if (!sw) return null;
    const uniformStyle = edges.every(
      (e) => b[e].color === ref.color && b[e].style === ref.style
    );
    if (!uniformStyle) return null;
    const inset = sw / 2;
    const cr = perCornerRadii(paint);
    const strokeAttrs = borderStrokeAttrs(color, style, sw);
    const paths = edges.map((e) => `<path d="${edgeSegmentPath(e, width, height, inset, cr)}" ${strokeAttrs} />`).join("");
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
  }
  function buildSingleEdgeBorderSvg(width, height, paint, edge) {
    const b = paint.borders;
    const side = b == null ? void 0 : b[edge];
    if (!b || !(side == null ? void 0 : side.width)) return null;
    return buildActiveBorderSvg(width, height, paint);
  }
  function buildBorderOutlineSvg(width, height, paint) {
    var _a, _b, _c, _d, _e, _f;
    const b = paint.borders;
    if (!b) return null;
    const corners = paint.cornerRadii;
    const r = corners ? Math.max(
      corners.topLeft.x,
      corners.topRight.x,
      corners.bottomRight.x,
      corners.bottomLeft.x
    ) : 0;
    const sw = Math.max(
      ((_a = b.top) == null ? void 0 : _a.width) || 0,
      ((_b = b.right) == null ? void 0 : _b.width) || 0,
      ((_c = b.bottom) == null ? void 0 : _c.width) || 0,
      ((_d = b.left) == null ? void 0 : _d.width) || 0
    );
    const inset = sw / 2;
    const color = ((_e = b.top || b.right || b.bottom || b.left) == null ? void 0 : _e.color) || "black";
    const style = ((_f = b.top || b.right || b.bottom || b.left) == null ? void 0 : _f.style) || "solid";
    const cornerR = Math.max(0, Math.min(r, width / 2 - 1, height / 2 - 1));
    const gaps = (b.gaps || []).filter((g) => g.side === "top").sort((a, b2) => a.from - b2.from);
    if (gaps.length === 0 && bordersUniform(b)) {
      const uniform = bordersUniform(b);
      if (!uniform || cornerR <= 0 || uniform.style !== "dashed" && uniform.style !== "dotted") {
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
      const paths = [p1, p2, p3].map((d) => `<path d="${d}" ${strokeAttrs}/>`).join("");
      return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
    }
    const cmds = [];
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
  function effectsFromPaint(paint, allowSpread) {
    const out = [];
    const withSpread = (eff, spread) => allowSpread && spread !== 0 ? __spreadProps(__spreadValues({}, eff), { spread: snap(spread) }) : eff;
    for (const s of paint.shadows || []) {
      const c = parseColor(s.color);
      const eff = {
        type: s.inset ? "INNER_SHADOW" : "DROP_SHADOW",
        color: { r: c.r, g: c.g, b: c.b, a: c.a },
        offset: { x: snap(s.offsetX), y: snap(s.offsetY) },
        radius: Math.max(0, snap(s.blur)),
        blendMode: "NORMAL",
        visible: true
      };
      out.push(withSpread(eff, s.spread));
    }
    for (const f of paint.filters || []) {
      if (f.kind === "blur") {
        out.push({
          type: "LAYER_BLUR",
          radius: Math.max(0, snap(f.valuePx)),
          visible: true
        });
      } else if (f.kind === "drop-shadow") {
        const c = parseColor(f.shadow.color);
        const eff = {
          type: "DROP_SHADOW",
          color: { r: c.r, g: c.g, b: c.b, a: c.a },
          offset: { x: snap(f.shadow.offsetX), y: snap(f.shadow.offsetY) },
          radius: Math.max(0, snap(f.shadow.blur)),
          blendMode: "NORMAL",
          visible: true
        };
        out.push(withSpread(eff, f.shadow.spread));
      }
    }
    for (const f of paint.backdropFilters || []) {
      if (f.kind === "blur") {
        out.push({
          type: "BACKGROUND_BLUR",
          radius: Math.max(0, snap(f.valuePx)),
          visible: true
        });
      }
    }
    return out;
  }
  function cloneEffects(effects) {
    return effects.map((e) => JSON.parse(JSON.stringify(e)));
  }
  function clonePaints(paints) {
    return paints.map((p) => JSON.parse(JSON.stringify(p)));
  }
  var availableFonts = null;
  async function listFonts() {
    availableFonts != null ? availableFonts : availableFonts = figma.listAvailableFontsAsync();
    return availableFonts;
  }
  function liveCompensatedWeight(weight, font, layer, parent) {
    var _a;
    if (isMockFigmaRuntime()) return weight;
    if (layer && isLabDomContext(layer, parent)) return weight;
    if (layer && liveLayoutSensitiveText(layer, parent)) return weight;
    const primary = ((_a = familyCandidates(font != null ? font : { family: "" })[0]) != null ? _a : "").toLowerCase();
    if (primary === "roboto") return weight;
    if (weight >= 400 && weight <= 700) return Math.min(900, weight + 100);
    return weight;
  }
  function isLabDomContext(layer, parent) {
    var _a;
    for (const l of [layer, parent]) {
      if (!l) continue;
      if (((_a = l.source.classList) != null ? _a : []).some((c) => c.startsWith("lab-"))) return true;
    }
    return false;
  }
  function liveLayoutSensitiveText(layer, parent) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    const text = layer.text;
    if (!text) return false;
    if (text.whiteSpace === "nowrap" || text.whiteSpace === "pre") return true;
    if (isLabTightCenterButton(layer, parent)) return true;
    if (isLabButtonLabelSpan(layer, parent) && ((_b = (_a = parent == null ? void 0 : parent.source) == null ? void 0 : _a.classList) != null ? _b : []).includes("lab-button")) {
      return true;
    }
    if (isTextLeafLayer(layer) && ((_d = (_c = layer.paint) == null ? void 0 : _c.fills) == null ? void 0 : _d.length)) {
      const pad2 = (_e = layer.layout) == null ? void 0 : _e.padding;
      const innerH2 = layer.box.height - ((_f = pad2 == null ? void 0 : pad2.top) != null ? _f : 0) - ((_g = pad2 == null ? void 0 : pad2.bottom) != null ? _g : 0);
      const lh2 = text.lineHeight;
      if (lh2 != null && innerH2 > 0 && Math.abs(lh2 - innerH2) <= 2 && !text.value.includes("\n")) {
        return true;
      }
    }
    const pad = (_h = layer.layout) == null ? void 0 : _h.padding;
    const innerH = layer.box.height - ((_i = pad == null ? void 0 : pad.top) != null ? _i : 0) - ((_j = pad == null ? void 0 : pad.bottom) != null ? _j : 0);
    const lh = text.lineHeight;
    if (lh != null && innerH > 0 && Math.abs(lh - innerH) <= 2 && !text.value.includes("\n")) {
      return true;
    }
    return false;
  }
  function figmaStyleAliases(style) {
    const out = /* @__PURE__ */ new Set([style]);
    const pairs = [
      [/SemiBold/i, "Semi Bold"],
      [/Semi Bold/i, "SemiBold"],
      [/ExtraBold/i, "Extra Bold"],
      [/Extra Bold/i, "ExtraBold"],
      [/ExtraLight/i, "Extra Light"],
      [/Extra Light/i, "ExtraLight"]
    ];
    for (const [re, alt] of pairs) {
      if (re.test(style)) out.add(style.replace(re, alt));
    }
    return [...out];
  }
  function isFigmaNativeEllipse(layer) {
    var _a, _b;
    return ((_a = layer.source) == null ? void 0 : _a.kind) === "figma" && ((_b = layer.source.dataset) == null ? void 0 : _b.figmaNodeType) === "ELLIPSE";
  }
  function isFigmaNativeTextLayer(layer) {
    var _a, _b;
    return ((_a = layer.source) == null ? void 0 : _a.kind) === "figma" && ((_b = layer.source.dataset) == null ? void 0 : _b.figmaNodeType) === "TEXT";
  }
  function figmaNativeNeedsFixedTextBox(layer, text) {
    var _a, _b, _c;
    if (!isFigmaNativeTextLayer(layer)) return false;
    const resize = (_b = (_a = layer.source) == null ? void 0 : _a.dataset) == null ? void 0 : _b.figmaTextAutoResize;
    if (resize !== "WIDTH_AND_HEIGHT") return false;
    const lh = (_c = text.lineHeight) != null ? _c : text.font.size;
    if (!(layer.box.height > lh * 1.3)) return false;
    return /\s/.test(text.value.trim());
  }
  function weightToStyle(weight, italic) {
    let base;
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
  var GENERIC_FALLBACKS = {
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
  function familyCandidates(font) {
    const raw = font.stack || font.family || "";
    return raw.split(",").map((s) => s.replace(/['"]/g, "").trim()).filter(Boolean);
  }
  async function resolveFont(text, layer, parent) {
    var _a, _b, _c;
    const italic = text.font.style === "italic" || text.font.style === "oblique";
    let weight = liveCompensatedWeight(text.font.weight || 400, text.font, layer, parent);
    const tag = (_a = layer == null ? void 0 : layer.source.tag) != null ? _a : "";
    if (tag === "input" && weight < 600 && (parent == null ? void 0 : parent.name) === "inline-edit") {
      weight = liveCompensatedWeight(700, text.font, layer, parent);
    }
    const desired = weightToStyle(weight, italic);
    const fonts = await listFonts();
    if (((_b = layer == null ? void 0 : layer.source) == null ? void 0 : _b.kind) === "figma") {
      const ds = layer.source.dataset;
      if ((ds == null ? void 0 : ds.figmaFontFamily) && (ds == null ? void 0 : ds.figmaFontStyle)) {
        const families = [ds.figmaFontFamily];
        if (/[\u0590-\u05FF]/.test((_c = text.value) != null ? _c : "") && ds.figmaFontFamily === "Open Sans") {
          families.push("Open Sans Hebrew");
        }
        for (const family of families) {
          for (const style of figmaStyleAliases(ds.figmaFontStyle)) {
            const hit = fonts.find(
              (f) => f.fontName.family === family && f.fontName.style === style
            );
            if (hit) return hit.fontName;
          }
        }
      }
    }
    const candidates = familyCandidates(text.font);
    const styleWeight = (style) => {
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
    const tryFamily = (family) => {
      const exact = fonts.find((f) => f.fontName.family === family && f.fontName.style === desired);
      if (exact) return exact.fontName;
      const inFamily = fonts.filter((f) => f.fontName.family === family);
      if (!inFamily.length) return null;
      const target = weight || styleWeight(desired);
      let best = inFamily[0];
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
    const inter = fonts.find((f) => f.fontName.family === "Inter" && f.fontName.style === desired) || fonts.find((f) => f.fontName.family === "Inter" && f.fontName.style === "Regular");
    if (inter) return inter.fontName;
    return { family: "Inter", style: "Regular" };
  }
  async function preloadFonts(root, missing) {
    const fontNames = /* @__PURE__ */ new Map();
    async function walk(layer) {
      if (layer.text) {
        try {
          const fn = await resolveFont(layer.text, layer);
          fontNames.set(`${fn.family}:${fn.style}`, fn);
        } catch (e) {
        }
      }
      for (const c of layer.children || []) await walk(c);
    }
    await walk(root);
    await Promise.all(
      Array.from(fontNames.values()).map(async (fn) => {
        try {
          await figma.loadFontAsync(fn);
        } catch (e) {
          missing.add(`${fn.family} ${fn.style}`);
        }
      })
    );
  }
  function applyTransform(node, layer) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!("relativeTransform" in node)) return;
    const rt = (_b = (_a = layer.source) == null ? void 0 : _a.dataset) == null ? void 0 : _b.figmaRelativeTransform;
    if (((_c = layer.source) == null ? void 0 : _c.kind) === "figma" && layer.vector && (rt == null ? void 0 : rt.length) === 2 && ((_d = rt[0]) == null ? void 0 : _d.length) === 3 && ((_e = rt[1]) == null ? void 0 : _e.length) === 3) {
      node.relativeTransform = [
        [snap(rt[0][0]), snap(rt[0][1]), snap(rt[0][2])],
        [snap(rt[1][0]), snap(rt[1][1]), snap(rt[1][2])]
      ];
      return;
    }
    let x = snap(layer.box.x);
    const y = snap(layer.box.y);
    if (isMuiShrunkInputLabel(layer) && isMockFigmaRuntime()) {
      x = snap(x - 3);
    }
    const t = (_f = layer.transform) == null ? void 0 : _f.matrix;
    if (!t || isIdentity(t)) {
      node.x = x;
      node.y = y;
      return;
    }
    const a = t[0], b = t[1], c = t[2], d = t[3];
    const scaleX = Math.hypot(a, b);
    const scaleY = Math.hypot(c, d);
    if (Math.abs(scaleX - 1) < 1e-3 && Math.abs(scaleY - 1) < 1e-3 && Math.abs(a * d - b * c - 1) < 1e-3) {
      if ("rotation" in node) {
        const isCircularProgress = isMockFigmaRuntime() && ((_g = layer.source.classList) != null ? _g : []).some((c2) => c2.includes("MuiCircularProgress-root"));
        if (!isCircularProgress) {
          const rotDeg = Math.atan2(b, a) * 180 / Math.PI;
          if (Math.abs(rotDeg) > 0.01) {
            node.rotation = snap(rotDeg);
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
  function isIdentity(m) {
    return Math.abs(m[0] - 1) < 1e-6 && Math.abs(m[1]) < 1e-6 && Math.abs(m[2]) < 1e-6 && Math.abs(m[3] - 1) < 1e-6 && Math.abs(m[4]) < 1e-6 && Math.abs(m[5]) < 1e-6;
  }
  function isMockFigmaRuntime() {
    return typeof figma.__reset === "function";
  }
  function buildFills(paint, width, height) {
    var _a;
    if (!((_a = paint == null ? void 0 : paint.fills) == null ? void 0 : _a.length)) return void 0;
    const out = [];
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
  function applyCornerRadii(node, paint) {
    if (!(paint == null ? void 0 : paint.cornerRadii)) return;
    if (!("topLeftRadius" in node)) return;
    const c = paint.cornerRadii;
    node.topLeftRadius = snap(c.topLeft.x);
    node.topRightRadius = snap(c.topRight.x);
    node.bottomRightRadius = snap(c.bottomRight.x);
    node.bottomLeftRadius = snap(c.bottomLeft.x);
  }
  function applyBorders(node, paint, width, height, layer) {
    var _a, _b, _c, _d;
    if (!(paint == null ? void 0 : paint.borders)) return null;
    const uniform = bordersUniform(paint.borders);
    const singleEdge = singleEdgeBorderSide(paint.borders);
    const activeCount = countActiveBorderSides(paint.borders);
    if (!isMockFigmaRuntime() && activeCount >= 1 && activeCount < 4) {
      const svg2 = buildActiveBorderSvg(width, height, paint);
      if (svg2) {
        const vector2 = figma.createNodeFromSvg(svg2);
        vector2.name = "__border";
        vector2.x = 0;
        vector2.y = 0;
        vector2.resize(Math.max(1, snap(width)), Math.max(1, snap(height)));
        if ("fills" in vector2) vector2.fills = [];
        return vector2;
      }
    }
    if (singleEdge && !isMockFigmaRuntime()) {
      const edgeSvg = buildSingleEdgeBorderSvg(width, height, paint, singleEdge);
      if (edgeSvg) {
        const vector2 = figma.createNodeFromSvg(edgeSvg);
        vector2.name = "__border";
        vector2.x = 0;
        vector2.y = 0;
        vector2.resize(Math.max(1, snap(width)), Math.max(1, snap(height)));
        if ("fills" in vector2) vector2.fills = [];
        return vector2;
      }
    }
    const sides = paint.borders;
    const cornerR = paint.cornerRadii ? Math.max(
      paint.cornerRadii.topLeft.x,
      paint.cornerRadii.topRight.x,
      paint.cornerRadii.bottomRight.x,
      paint.cornerRadii.bottomLeft.x
    ) : 0;
    const useSvgOutline = Boolean(uniform) && cornerR > 0 && (uniform.style === "dotted" || uniform.style === "dashed");
    if (uniform && !("strokes" in node)) {
      return null;
    }
    if (uniform && "strokes" in node && !useSvgOutline) {
      node.strokes = [solidPaint(uniform.color)];
      if ("strokeAlign" in node) node.strokeAlign = "INSIDE";
      if ("strokeTopWeight" in node) {
        const f = node;
        f.strokeTopWeight = snap(((_a = sides.top) == null ? void 0 : _a.width) || 0);
        f.strokeRightWeight = snap(((_b = sides.right) == null ? void 0 : _b.width) || 0);
        f.strokeBottomWeight = snap(((_c = sides.bottom) == null ? void 0 : _c.width) || 0);
        f.strokeLeftWeight = snap(((_d = sides.left) == null ? void 0 : _d.width) || 0);
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
    const svg = buildBorderOutlineSvg(width, height, paint);
    if (!svg) return null;
    const vector = figma.createNodeFromSvg(svg);
    vector.name = "__border";
    vector.x = 0;
    vector.y = 0;
    vector.resize(Math.max(1, snap(width)), Math.max(1, snap(height)));
    if ("fills" in vector) vector.fills = [];
    return vector;
  }
  function escapeAttr(v) {
    return v.replace(/"/g, "&quot;").replace(/&/g, "&amp;");
  }
  function rotationDegFromTransform(transform) {
    const rot = transform.match(/rotate\(\s*([-\d.e]+)/);
    if (rot) return parseFloat(rot[1]);
    const m = transform.match(
      /matrix\(\s*([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)/
    );
    if (m) {
      const a = parseFloat(m[1]);
      const b = parseFloat(m[2]);
      return Math.atan2(b, a) * 180 / Math.PI;
    }
    return -90;
  }
  function circleDashToArcPath(attrs) {
    var _a, _b, _c, _d, _e, _f, _g;
    const cx = parseFloat((_a = attrs.cx) != null ? _a : "");
    const cy = parseFloat((_b = attrs.cy) != null ? _b : "");
    const r = parseFloat((_c = attrs.r) != null ? _c : "");
    const dashRaw = attrs["stroke-dasharray"];
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || !dashRaw) {
      return null;
    }
    const dashLen = parseFloat((_d = dashRaw.split(/[\s,]+/)[0]) != null ? _d : "");
    if (!(dashLen > 0)) return null;
    const strokeWidth = parseFloat((_e = attrs["stroke-width"]) != null ? _e : "0");
    if (!(strokeWidth > 0)) return null;
    const innerR = r - strokeWidth / 2;
    const outerR = r + strokeWidth / 2;
    if (!(innerR > 0 && outerR > innerR)) return null;
    const circ = 2 * Math.PI * r;
    const dashOffset = parseFloat((_f = attrs["stroke-dashoffset"]) != null ? _f : "0");
    const offsetPx = -dashOffset;
    const rotDeg = attrs.transform ? rotationDegFromTransform(attrs.transform) : -90;
    const startDeg = rotDeg + offsetPx / circ * 360;
    const endDeg = rotDeg + (offsetPx + dashLen) / circ * 360;
    const toRad = (d) => d * Math.PI / 180;
    const onCircle = (radius, deg) => ({
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
    const out = __spreadValues({}, attrs);
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
    out.fill = (_g = attrs.stroke) != null ? _g : "none";
    out.d = `M ${snap(outerStart.x)} ${snap(outerStart.y)} A ${snap(outerR)} ${snap(outerR)} 0 ${largeArc} 1 ${snap(outerEnd.x)} ${snap(outerEnd.y)} L ${snap(innerEnd.x)} ${snap(innerEnd.y)} A ${snap(innerR)} ${snap(innerR)} 0 ${largeArc} 0 ${snap(innerStart.x)} ${snap(innerStart.y)} Z`;
    const attrStr = Object.keys(out).map((k) => `${k}="${escapeAttr(out[k])}"`).join(" ");
    return `<path ${attrStr} />`;
  }
  function ensureCircleStrokeDashPair(map) {
    var _a;
    const raw = map["stroke-dasharray"];
    if (!raw) return;
    const parts = String(raw).trim().split(/[\s,]+/).filter(Boolean);
    if (parts.length !== 1) return;
    const r = parseFloat((_a = map.r) != null ? _a : "");
    if (!Number.isFinite(r)) return;
    const circ = 2 * Math.PI * r;
    map["stroke-dasharray"] = `${parts[0]} ${circ}`;
  }
  function shapeToSvg(shape) {
    var _a, _b;
    const map = {};
    for (const k in shape.attrs || {}) {
      if (Object.prototype.hasOwnProperty.call(shape.attrs, k)) {
        map[k] = String(shape.attrs[k]);
      }
    }
    const p = shape.paint;
    if (p) {
      if (p.fill !== void 0) map.fill = String(p.fill);
      if (p.stroke !== void 0) map.stroke = String(p.stroke);
      if (p.strokeWidth !== void 0 && !(p.fill && p.fill !== "none")) {
        map["stroke-width"] = String(snap(p.strokeWidth));
      }
      if (p.dashArray && p.dashArray.length && !map["stroke-dasharray"]) {
        map["stroke-dasharray"] = p.dashArray.join(" ");
      }
      if (p.dashOffset !== void 0 && map["stroke-dashoffset"] === void 0) {
        map["stroke-dashoffset"] = String(p.dashOffset);
      }
      if (p.lineCap) map["stroke-linecap"] = p.lineCap;
      if (p.lineJoin) map["stroke-linejoin"] = p.lineJoin;
      if (p.miterLimit !== void 0) map["stroke-miterlimit"] = String(p.miterLimit);
      if (p.fillRule) map["fill-rule"] = p.fillRule;
      if (p.opacity !== void 0) map.opacity = String(p.opacity);
      if (p.fillOpacity !== void 0) map["fill-opacity"] = String(p.fillOpacity);
      if (p.strokeOpacity !== void 0) map["stroke-opacity"] = String(p.strokeOpacity);
    }
    if (shape.primitive === "circle") ensureCircleStrokeDashPair(map);
    if (((_a = shape.transform) == null ? void 0 : _a.matrix) && !map.transform) {
      map.transform = `matrix(${shape.transform.matrix.join(" ")})`;
    }
    if (shape.primitive === "circle" && map["stroke-dasharray"] && !isMockFigmaRuntime()) {
      const arc = circleDashToArcPath(map);
      if (arc) return arc;
    }
    const attrs = Object.keys(map).map((k) => `${k}="${escapeAttr(map[k])}"`).join(" ");
    if (shape.primitive === "group") {
      const inner = (shape.shapes || []).map((s) => shapeToSvg(s)).join("");
      return `<g ${attrs}>${inner}</g>`;
    }
    if (shape.primitive === "text") {
      const txt = ((_b = shape.text) == null ? void 0 : _b.value) || "";
      return `<text ${attrs}>${escapeAttr(txt)}</text>`;
    }
    return `<${shape.primitive} ${attrs} />`;
  }
  function reconstructSvg(vector, box) {
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
  function centerLabButtonVector(_node, _layer, _parent, _w, _h) {
  }
  function createFigmaNativeVectorNode(layer) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const native = (_a = layer.vector) == null ? void 0 : _a.figmaNative;
    if (((_b = layer.source) == null ? void 0 : _b.kind) !== "figma" || !((_c = native == null ? void 0 : native.vectorPaths) == null ? void 0 : _c.length)) return null;
    const v = figma.createVector();
    v.vectorPaths = native.vectorPaths.map((p) => ({
      windingRule: p.windingRule === "EVENODD" ? "EVENODD" : "NONZERO",
      data: p.data
    }));
    const fills = [];
    if (native.fill) fills.push(solidPaint(native.fill));
    v.fills = fills;
    if (native.stroke && ((_d = native.strokeWeight) != null ? _d : 0) > 0) {
      v.strokes = [solidPaint(native.stroke)];
      v.strokeWeight = snap(native.strokeWeight);
      if (native.strokeAlign && "strokeAlign" in v) {
        v.strokeAlign = native.strokeAlign;
      }
    } else {
      v.strokes = [];
      v.strokeWeight = 0;
    }
    const shapeOpacity = (_h = (_g = (_f = (_e = layer.vector) == null ? void 0 : _e.shapes) == null ? void 0 : _f[0]) == null ? void 0 : _g.paint) == null ? void 0 : _h.opacity;
    if (shapeOpacity != null && shapeOpacity < 0.999) {
      v.opacity = Math.max(0, Math.min(1, snap(shapeOpacity)));
    }
    const w = Math.max(1, snap(layer.box.width));
    const h = Math.max(1, snap(layer.box.height));
    v.resize(w, h);
    v.name = layer.name || "vector";
    return v;
  }
  function createVectorNode(layer, parent) {
    const nativeVector = createFigmaNativeVectorNode(layer);
    if (nativeVector) return nativeVector;
    const v = layer.vector;
    const w = Math.max(1, snap(layer.box.width));
    const h = Math.max(1, snap(layer.box.height));
    const svg = reconstructSvg(v, { width: w, height: h });
    try {
      const imported = figma.createNodeFromSvg(svg);
      if (isMockFigmaRuntime()) {
        if ("rescale" in imported && imported.width > 0 && imported.height > 0) {
          const scale = Math.min(w / imported.width, h / imported.height);
          if (Math.abs(scale - 1) > 1e-3) imported.rescale(scale);
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
        if (Math.abs(scale - 1) > 1e-3) imported.rescale(scale);
      }
      if ("resize" in imported) imported.resize(w, h);
      imported.x = 0;
      imported.y = 0;
      wrap.appendChild(imported);
      centerLabButtonVector(wrap, layer, parent, w, h);
      return wrap;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      figma.notify(`SVG layer "${layer.name}" failed to import: ${reason}`, {
        timeout: 4e3
      });
      const fallback = figma.createFrame();
      fallback.name = `${layer.name} (svg-failed)`;
      fallback.resize(w, h);
      fallback.fills = [];
      fallback.clipsContent = false;
      return fallback;
    }
  }
  function createImageNode(layer) {
    var _a;
    const w = Math.max(1, snap(layer.box.width));
    const h = Math.max(1, snap(layer.box.height));
    const img = layer.image;
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
          const scale = mode === "contain" || mode === "fit" ? Math.min(sx, sy) : mode === "none" ? 1 : Math.max(sx, sy);
          if (Math.abs(scale - 1) > 1e-3) node.rescale(scale);
        }
        return node;
      } catch (e) {
      }
    }
    const paint = imagePaintFromImage(img);
    const fill = paint ? [paint] : [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
    const r = figma.createRectangle();
    r.resize(w, h);
    r.fills = fill;
    if ((_a = layer.paint) == null ? void 0 : _a.cornerRadii) applyCornerRadii(r, layer.paint);
    return r;
  }
  function textDisplayValue(layer, value) {
    var _a;
    const inputType = layer.source.inputType;
    if (((_a = layer.source) == null ? void 0 : _a.tag) === "input" && inputType === "password" && value.length > 0) {
      return "\u2022".repeat(value.length);
    }
    return value;
  }
  async function createTextNode(layer, parent) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D;
    const text = layer.text;
    const displayValue = textDisplayValue(layer, text.value);
    const labLabel = isLabButtonLabelSpan(layer, parent);
    const labBtnLabel = labLabel && ((_a = parent == null ? void 0 : parent.source) == null ? void 0 : _a.tag) === "button" && ((_b = parent.source.classList) != null ? _b : []).includes("lab-button");
    const fontName = await resolveFont(text, layer, parent);
    await figma.loadFontAsync(fontName);
    const t = figma.createText();
    t.fontName = fontName;
    t.characters = displayValue;
    t.fontSize = Math.max(1, snap(text.font.size));
    if (((_c = layer.source) == null ? void 0 : _c.tag) === "input") {
      const b = (_d = layer.paint) == null ? void 0 : _d.borders;
      const pad2 = (_e = layer.layout) == null ? void 0 : _e.padding;
      const borderY = ((_g = (_f = b == null ? void 0 : b.top) == null ? void 0 : _f.width) != null ? _g : 0) + ((_i = (_h = b == null ? void 0 : b.bottom) == null ? void 0 : _h.width) != null ? _i : 0);
      const padY = ((_j = pad2 == null ? void 0 : pad2.top) != null ? _j : 0) + ((_k = pad2 == null ? void 0 : pad2.bottom) != null ? _k : 0);
      const innerH2 = Math.max(0, layer.box.height - borderY - padY);
      const fs = Math.max(1, snap(text.font.size));
      if (innerH2 > 0) {
        t.lineHeight = {
          unit: "PIXELS",
          value: !isMockFigmaRuntime() ? fs : snap(innerH2)
        };
      }
    } else if (text.letterSpacing !== void 0 && text.letterSpacing !== 0) {
      t.letterSpacing = { unit: "PIXELS", value: snap(text.letterSpacing) };
    }
    const figmaNativeText = isFigmaNativeTextLayer(layer);
    if (figmaNativeText) {
      if (text.lineHeight !== void 0 && text.lineHeight > 0) {
        t.lineHeight = { unit: "PIXELS", value: snap(text.lineHeight) };
      }
    } else if (labBtnLabel) {
      const lhPx2 = text.lineHeight != null && text.lineHeight > 0 ? snap(text.lineHeight) : Math.max(1, snap(text.font.size));
      t.lineHeight = { unit: "PIXELS", value: lhPx2 };
    } else if (/^h[1-6]$/.test((_m = (_l = layer.source) == null ? void 0 : _l.tag) != null ? _m : "") && text.lineHeight !== void 0 && text.lineHeight > 0) {
      t.lineHeight = { unit: "PIXELS", value: snap(text.lineHeight) };
    } else if (labLabel && text.lineHeight !== void 0 && text.lineHeight > 0) {
      t.lineHeight = { unit: "PIXELS", value: snap(text.lineHeight) };
    } else {
      const glyphLh = liveGlyphLineHeightPx(text, layer);
      if (glyphLh != null) {
        t.lineHeight = { unit: "PIXELS", value: glyphLh };
      }
    }
    if (!figmaNativeText && !labLabel && !labBtnLabel && !/^h[1-6]$/.test((_o = (_n = layer.source) == null ? void 0 : _n.tag) != null ? _o : "") && liveGlyphLineHeightPx(text, layer) == null && text.lineHeight !== void 0 && text.lineHeight > 0) {
      const lh = snap(text.lineHeight);
      const fs = Math.max(1, snap(text.font.size));
      const boxH2 = layer.box.height;
      let capped;
      if (lh <= fs * 1.05 && boxH2 > 0 && boxH2 <= fs * 1.25) {
        capped = Math.min(lh, boxH2);
      } else if (boxH2 > 0 && lh >= fs && lh <= fs * 1.15 && Math.abs(lh - boxH2) <= 2) {
        capped = lh;
      } else if (boxH2 > 0 && lh > boxH2 && (((_p = layer.layout) == null ? void 0 : _p.display) === "inline" || ((_q = layer.layout) == null ? void 0 : _q.display) === "inline-block")) {
        capped = boxH2;
      } else {
        const minLh = fs * 1.15;
        capped = boxH2 > 0 && lh >= boxH2 - 0.5 ? Math.max(lh, boxH2) : lh <= fs * 1.05 ? lh : boxH2 > 0 && lh <= boxH2 + 1 ? lh : Math.max(lh, minLh);
      }
      t.lineHeight = { unit: "PIXELS", value: capped };
    }
    const align = text.align === "center" ? "CENTER" : text.align === "right" || text.align === "end" ? "RIGHT" : text.align === "justify" ? "JUSTIFIED" : "LEFT";
    t.textAlignHorizontal = align;
    if (text.direction === "rtl") {
      try {
        t.textDirection = "RTL";
      } catch (e) {
      }
    }
    t.fills = [solidPaint(text.color)];
    if ((_r = text.decoration) == null ? void 0 : _r.lines.includes("underline")) t.textDecoration = "UNDERLINE";
    else if ((_s = text.decoration) == null ? void 0 : _s.lines.includes("line-through")) t.textDecoration = "STRIKETHROUGH";
    const figmaTextCase = (_u = (_t = layer.source) == null ? void 0 : _t.dataset) == null ? void 0 : _u.figmaTextCase;
    if (figmaTextCase) {
      try {
        t.textCase = figmaTextCase;
      } catch (e) {
      }
    } else if (text.transform && text.transform !== "none") {
      const map = {
        uppercase: "UPPER",
        lowercase: "LOWER",
        capitalize: "TITLE"
      };
      const mockMuiButton = isMockFigmaRuntime() && layer.source.tag === "button" && text.transform === "uppercase";
      if (!mockMuiButton) {
        t.textCase = map[text.transform] || "ORIGINAL";
      }
    }
    const multiline = displayValue.includes("\n");
    const lhPx = text.lineHeight;
    const boxH = layer.box.height;
    const tightLineBox = lhPx != null && boxH > 0 && Math.abs(lhPx - boxH) <= 2;
    const labTightBtn = isLabTightCenterButton(layer, parent);
    const blockTight = isBlockTypoTightLineBox(layer);
    try {
      const skipLeadingTrim = !isMockFigmaRuntime() || ((_v = layer.source) == null ? void 0 : _v.kind) === "figma" || labLabel && !labBtnLabel || multiline || blockTight || ((_w = layer.source) == null ? void 0 : _w.tag) === "input" || isLabTightCenterButton(layer, parent) || ((_x = text.font.weight) != null ? _x : 400) >= 500 && !labTightBtn && !blockTight || tightLineBox && !labTightBtn && !blockTight || text.transform === "uppercase";
      if (!skipLeadingTrim) {
        try {
          t.leadingTrim = "CAP_HEIGHT";
        } catch (e) {
        }
      }
    } catch (e) {
    }
    const figmaResize = (_z = (_y = layer.source) == null ? void 0 : _y.dataset) == null ? void 0 : _z.figmaTextAutoResize;
    if (((_A = layer.source) == null ? void 0 : _A.kind) === "figma" && figmaResize) {
      const resizeMap = {
        WIDTH_AND_HEIGHT: "WIDTH_AND_HEIGHT",
        HEIGHT: "HEIGHT",
        NONE: "NONE",
        TRUNCATE: "TRUNCATE"
      };
      let mode = resizeMap[figmaResize];
      if (mode === "WIDTH_AND_HEIGHT" && figmaNativeNeedsFixedTextBox(layer, text)) {
        mode = "NONE";
      }
      if (mode) {
        t.textAutoResize = mode;
        if (text.verticalAlign === "middle") {
          t.textAlignVertical = "CENTER";
        } else if (text.verticalAlign === "bottom") {
          t.textAlignVertical = "BOTTOM";
        } else if (text.verticalAlign === "top") {
          t.textAlignVertical = "TOP";
        }
        if (mode !== "WIDTH_AND_HEIGHT") {
          if (mode === "NONE" && text.verticalAlign === "middle" && text.lineHeight != null && text.lineHeight > layer.box.height + 0.25) {
            t.lineHeight = {
              unit: "PIXELS",
              value: Math.max(1, snap(layer.box.height))
            };
          }
          t.resize(
            Math.max(1, Math.ceil(snap(layer.box.width))),
            Math.max(1, Math.ceil(snap(layer.box.height)))
          );
        }
        return t;
      }
    }
    const labPillButton = layer.source.tag === "button" && isLabDomCenterButton(layer, parent);
    const noWrapCss = text.whiteSpace === "nowrap" || text.whiteSpace === "pre" || labBtnLabel || labPillButton;
    const hasWrappableWhitespace = /\s/.test(displayValue.trim());
    const pad = (_B = layer.layout) == null ? void 0 : _B.padding;
    const innerH = layer.box.height - ((_C = pad == null ? void 0 : pad.top) != null ? _C : 0) - ((_D = pad == null ? void 0 : pad.bottom) != null ? _D : 0);
    const singleLineTextBox = lhPx != null && innerH > 0 && Math.abs(lhPx - innerH) <= 2 && !noWrapCss && !displayValue.includes("\n");
    if (noWrapCss || !hasWrappableWhitespace || isMuiAlertMessageText(layer) || singleLineTextBox) {
      t.textAutoResize = "WIDTH_AND_HEIGHT";
    } else {
      t.textAutoResize = "HEIGHT";
      t.resize(Math.max(1, Math.ceil(snap(layer.box.width))), 1);
    }
    return t;
  }
  function isLayerVisible(layer) {
    var _a, _b;
    if (((_a = layer.paint) == null ? void 0 : _a.visibility) === "hidden" || ((_b = layer.paint) == null ? void 0 : _b.visibility) === "collapse") return false;
    if (isHiddenA11yShell(layer)) return false;
    return true;
  }
  function isHiddenA11yShell(layer) {
    var _a, _b, _c, _d, _e;
    if (layer.box.width > 0.5) return false;
    if (layer.source.tag !== "label") return false;
    const clip = ((_b = (_a = layer.layout) == null ? void 0 : _a.overflow) == null ? void 0 : _b.x) === "hidden" || ((_d = (_c = layer.layout) == null ? void 0 : _c.overflow) == null ? void 0 : _d.y) === "hidden";
    return ((_e = layer.layout) == null ? void 0 : _e.position) === "absolute" && clip;
  }
  function isTextLeafLayer(layer) {
    return Boolean(layer.text && (!layer.children || layer.children.length === 0));
  }
  function isMuiFormControlLabelCaption(layer) {
    var _a;
    return ((_a = layer.source.classList) != null ? _a : []).includes("MuiFormControlLabel-label");
  }
  function isMuiBadgeDot(layer) {
    var _a;
    return ((_a = layer.source.classList) != null ? _a : []).some((c) => c.includes("MuiBadge-badge"));
  }
  function isMuiPaginationItemButton(layer) {
    var _a;
    return ((_a = layer.source.classList) != null ? _a : []).some((c) => c.includes("MuiPaginationItem-root"));
  }
  function isMuiFlexCenterGlyphFrame(layer) {
    var _a, _b;
    if (isMuiBadgeDot(layer)) return false;
    if (!layer.text || layer.children && layer.children.length > 0) return false;
    if (!((_b = (_a = layer.paint) == null ? void 0 : _a.fills) == null ? void 0 : _b.length)) return false;
    const w = Math.round(layer.box.width);
    const h = Math.round(layer.box.height);
    const c = layer.paint.cornerRadii;
    const maxR = c ? Math.max(c.topLeft.x, c.topRight.x, c.bottomRight.x, c.bottomLeft.x) : 0;
    const circle = w > 0 && w === h && maxR >= w / 2 - 1;
    const badge = w > 0 && w <= 24 && h <= 24 && maxR >= 50;
    return circle || badge;
  }
  function isMuiAlertMessageText(layer) {
    var _a;
    return ((_a = layer.source.classList) != null ? _a : []).some((c) => c.includes("MuiAlert-message"));
  }
  function isMuiShrunkInputLabel(layer) {
    var _a;
    return layer.source.tag === "label" && Boolean(layer.text) && ((_a = layer.source.classList) != null ? _a : []).some((c) => c.startsWith("MuiInputLabel"));
  }
  function muiShrunkLabelScale(layer) {
    var _a;
    const m = (_a = layer.transform) == null ? void 0 : _a.matrix;
    if (!m) return 0.75;
    const sx = Math.hypot(m[0], m[1]);
    const sy = Math.hypot(m[2], m[3]);
    const scale = Math.min(sx, sy);
    return scale > 0.01 && scale < 0.999 ? scale : 0.75;
  }
  function mockMuiShrunkLabelFrameSize(layer) {
    const scale = muiShrunkLabelScale(layer);
    const visualW = snap(layer.box.width);
    const visualH = snap(layer.box.height);
    return {
      width: Math.max(8, snap(visualW / scale - 8)),
      height: Math.max(1, snap(visualH / scale))
    };
  }
  function muiShrunkLabelForInputRoot(outlinedInput, formControl) {
    var _a, _b;
    if (formControl) {
      const label = ((_a = formControl.children) != null ? _a : []).find(isMuiShrunkInputLabel);
      if (label) return label;
    }
    if (outlinedInput) {
      return ((_b = outlinedInput.children) != null ? _b : []).find(isMuiShrunkInputLabel);
    }
    return void 0;
  }
  function tightenMuiNotchGapPaint(paint, outlinedInput, formControl) {
    var _a;
    const gaps = (_a = paint == null ? void 0 : paint.borders) == null ? void 0 : _a.gaps;
    if (!(paint == null ? void 0 : paint.borders) || !(gaps == null ? void 0 : gaps.length)) return paint;
    const label = muiShrunkLabelForInputRoot(outlinedInput, formControl);
    if (!label) return paint;
    const g = gaps[0];
    const labelEnd = snap(label.box.x + label.box.width);
    const to = Math.min(g.to, labelEnd);
    if (to <= g.from + 1) return paint;
    const borders = paint.borders;
    return __spreadProps(__spreadValues({}, paint), {
      borders: __spreadProps(__spreadValues({}, borders), {
        gaps: [__spreadProps(__spreadValues({}, g), { to })]
      })
    });
  }
  function isMuiOutlinedInputRoot(layer) {
    var _a;
    return ((_a = layer.source.classList) != null ? _a : []).some((c) => c.includes("MuiOutlinedInput-root"));
  }
  function isMuiOutlinedValueField(layer, parent) {
    var _a;
    if (!parent || !isMuiOutlinedInputRoot(parent)) return false;
    if (layer.source.tag === "input" && Boolean(layer.text)) return true;
    return layer.source.tag === "div" && Boolean(layer.text) && ((_a = layer.children) != null ? _a : []).length === 1 && Boolean(layer.children[0].text);
  }
  function isMuiCompactCenterButton(layer) {
    if (layer.source.tag !== "button" || !layer.text) return false;
    const lh = layer.text.lineHeight;
    const fs = layer.text.font.size;
    if (lh == null || fs == null) return false;
    return layer.text.align === "center" && Math.round(layer.box.height) < 40 && lh > fs * 1.5;
  }
  function isMuiLinearProgressBarLayer(layer) {
    var _a;
    return ((_a = layer.source.classList) != null ? _a : []).some((c) => c.includes("MuiLinearProgress-bar"));
  }
  function applyMuiLinearProgressBarPlacement(node, layer) {
    if (!isMuiLinearProgressBarLayer(layer)) return;
    const left = snap(layer.box.x);
    if (left >= 0) return;
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
  function isMuiNotchedOutlineFieldset(layer) {
    var _a;
    return layer.source.tag === "fieldset" && ((_a = layer.source.classList) != null ? _a : []).some((c) => c.includes("MuiOutlinedInput-notchedOutline"));
  }
  function hasNotchedOutlineChild(layer) {
    var _a;
    return ((_a = layer.children) != null ? _a : []).some(
      (c) => isMuiNotchedOutlineFieldset(c) && c.box.y < 0
    );
  }
  function shouldApplyCornerRadii(layer, parent) {
    var _a, _b, _c, _d;
    if (isFigmaNativeEllipse(layer)) return false;
    if (hasNotchedOutlineChild(layer)) {
      const cl = (_a = layer.source.classList) != null ? _a : [];
      if (cl.some((c) => c.includes("MuiOutlinedInput-root"))) {
        return Boolean((_b = layer.paint) == null ? void 0 : _b.cornerRadii);
      }
      return false;
    }
    const parentCl = (_c = parent == null ? void 0 : parent.source.classList) != null ? _c : [];
    if (parentCl.some((c) => c.includes("MuiOutlinedInput-root")) && layer.source.tag !== "fieldset") {
      return false;
    }
    return Boolean((_d = layer.paint) == null ? void 0 : _d.cornerRadii);
  }
  function parentUsesFlexColumn(parent) {
    var _a, _b;
    if (((_a = parent == null ? void 0 : parent.layout) == null ? void 0 : _a.display) !== "flex") return false;
    const dir = (_b = parent.layout.flex) == null ? void 0 : _b.direction;
    return dir === "column" || dir === "column-reverse";
  }
  function preserveDomLineBoxHeight(layer, parent) {
    var _a, _b, _c, _d, _e, _f;
    if (!parentUsesFlexColumn(parent)) return false;
    const lh = (_a = layer.text) == null ? void 0 : _a.lineHeight;
    const pad = (_b = layer.layout) == null ? void 0 : _b.padding;
    const innerH = layer.box.height - ((_c = pad == null ? void 0 : pad.top) != null ? _c : 0) - ((_d = pad == null ? void 0 : pad.bottom) != null ? _d : 0);
    if (lh == null || innerH <= 0) return false;
    if (Math.abs(lh - innerH) > 2) return false;
    if (isTextLeafLayer(layer)) return true;
    return !((_f = (_e = layer.paint) == null ? void 0 : _e.fills) == null ? void 0 : _f.length);
  }
  function isLabDomCenterButton(layer, parent) {
    var _a, _b, _c;
    const cl = (_a = layer.source.classList) != null ? _a : [];
    if (cl.includes("lab-button") || cl.includes("lab-login-social-button") || cl.includes("lab-pricing-cta") || cl.includes("lab-tab")) {
      return true;
    }
    return layer.source.tag === "button" && ((_c = (_b = parent == null ? void 0 : parent.source) == null ? void 0 : _b.classList) != null ? _c : []).includes("lab-tabs-row");
  }
  function isLabTightCenterButton(layer, parent) {
    return layer.source.tag === "button" && isLabDomCenterButton(layer, parent);
  }
  function isBlockTypoTightLineBox(layer) {
    var _a, _b, _c, _d, _e;
    const tag = (_a = layer.source.tag) != null ? _a : "";
    if (!/^h[1-6]$/.test(tag) && tag !== "p") return false;
    const lh = (_b = layer.text) == null ? void 0 : _b.lineHeight;
    const pad = (_c = layer.layout) == null ? void 0 : _c.padding;
    const innerH = layer.box.height - ((_d = pad == null ? void 0 : pad.top) != null ? _d : 0) - ((_e = pad == null ? void 0 : pad.bottom) != null ? _e : 0);
    if (lh == null || innerH <= 0) return false;
    return Math.abs(lh - innerH) <= 2;
  }
  function textUsesTightLineBox(layer) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (isMuiFormControlLabelCaption(layer)) return false;
    if (isMuiShrunkInputLabel(layer)) return false;
    const lh = (_a = layer.text) == null ? void 0 : _a.lineHeight;
    const fs = (_c = (_b = layer.text) == null ? void 0 : _b.font) == null ? void 0 : _c.size;
    const pad = (_d = layer.layout) == null ? void 0 : _d.padding;
    const innerH = layer.box.height - ((_e = pad == null ? void 0 : pad.top) != null ? _e : 0) - ((_f = pad == null ? void 0 : pad.bottom) != null ? _f : 0);
    if (lh == null || innerH <= 0) return false;
    if (/^h[1-6]$/.test((_g = layer.source.tag) != null ? _g : "")) {
      return Math.abs(lh - innerH) <= 2;
    }
    if (fs == null) return false;
    return Math.abs(lh - innerH) <= 2 && lh > fs + 1;
  }
  function textFramePinsToTop(layer, parent) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t;
    if (isMuiFormControlLabelCaption(layer)) return false;
    if (isMuiShrunkInputLabel(layer)) return false;
    if (((_a = layer.layout) == null ? void 0 : _a.display) === "table-cell") return false;
    if (layer.source.tag === "th" || layer.source.tag === "td") return false;
    const parentFlex = (_c = (_b = parent == null ? void 0 : parent.layout) == null ? void 0 : _b.flex) == null ? void 0 : _c.align;
    if (parentFlex === "center" || parentFlex === "end") return false;
    if (textUsesTightLineBox(layer)) {
      const pad2 = (_d = layer.layout) == null ? void 0 : _d.padding;
      const innerH2 = layer.box.height - ((_e = pad2 == null ? void 0 : pad2.top) != null ? _e : 0) - ((_f = pad2 == null ? void 0 : pad2.bottom) != null ? _f : 0);
      const lh2 = (_g = layer.text) == null ? void 0 : _g.lineHeight;
      if (lh2 != null && innerH2 > 0 && Math.abs(lh2 - innerH2) <= 2) return false;
      return true;
    }
    if (((_h = layer.layout) == null ? void 0 : _h.display) === "inline") {
      const lh2 = (_i = layer.text) == null ? void 0 : _i.lineHeight;
      const pad2 = (_j = layer.layout) == null ? void 0 : _j.padding;
      const innerH2 = layer.box.height - ((_k = pad2 == null ? void 0 : pad2.top) != null ? _k : 0) - ((_l = pad2 == null ? void 0 : pad2.bottom) != null ? _l : 0);
      if (lh2 != null && innerH2 > 0 && lh2 > innerH2 + 0.5) return false;
      return true;
    }
    if (layer.source.kind === "synthetic") return true;
    const flexAlign = (_n = (_m = layer.layout) == null ? void 0 : _m.flex) == null ? void 0 : _n.align;
    if (flexAlign === "center" || flexAlign === "end") return false;
    const lh = (_o = layer.text) == null ? void 0 : _o.lineHeight;
    const fs = (_q = (_p = layer.text) == null ? void 0 : _p.font) == null ? void 0 : _q.size;
    const pad = (_r = layer.layout) == null ? void 0 : _r.padding;
    const innerH = layer.box.height - ((_s = pad == null ? void 0 : pad.top) != null ? _s : 0) - ((_t = pad == null ? void 0 : pad.bottom) != null ? _t : 0);
    if (layer.source.tag === "button" && fs != null && innerH > fs * 1.3) {
      return false;
    }
    if (lh != null && fs != null && lh <= fs * 1.1) return true;
    return false;
  }
  function clampMockTextToDomBox(text, innerW, innerH, layer, parent) {
    if (layer && isLabTightCenterButton(layer, parent)) return;
    if (innerH <= 0) return;
    if (isMockFigmaRuntime()) {
      const mock = text;
      if (text.height > innerH + 1) {
        mock.__height = snap(innerH);
      }
      if (text.textAutoResize === "HEIGHT" && innerW > 0) {
        mock.__width = snap(Math.max(1, Math.ceil(innerW)));
      }
      return;
    }
    if (text.textAutoResize === "HEIGHT" && innerW > 0 && text.width > innerW + 0.5 && !liveTextPreferWidthAndHeight(layer, parent)) {
      text.resize(Math.max(1, Math.ceil(snap(innerW))), text.height);
    }
    if (text.height > innerH + 1 && text.textAutoResize !== "WIDTH_AND_HEIGHT") {
      text.resize(text.width, Math.max(1, snap(innerH)));
    }
  }
  function shouldUseInlineRowLayout(layer) {
    var _a, _b, _c;
    const kids = (_a = layer.children) != null ? _a : [];
    if (kids.length < 2) return false;
    if (((_b = layer.layout) == null ? void 0 : _b.display) === "flex" || ((_c = layer.layout) == null ? void 0 : _c.display) === "grid") return false;
    if (!kids.every(isTextLeafLayer)) return false;
    return kids.some(
      (c) => {
        var _a2;
        return ((_a2 = c.layout) == null ? void 0 : _a2.display) === "inline" || c.source.tag === "span" || c.source.kind === "synthetic";
      }
    );
  }
  function expandInlineTextFrame(node) {
    if (node.type !== "FRAME" || !("resize" in node)) return;
    const text = node.children.find((c) => c.type === "TEXT");
    if (!text || text.width <= node.width + 0.5) return;
    node.resize(Math.max(1, snap(text.width)), node.height);
  }
  function textNodeIn(node) {
    var _a;
    if (node.type === "TEXT") return node;
    if (node.type === "FRAME") {
      return (_a = node.children.find((c) => c.type === "TEXT")) != null ? _a : null;
    }
    return null;
  }
  function alignInlineRowSiblings(built) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    if (!built.length) return;
    for (const { node } of built) {
      expandInlineTextFrame(node);
    }
    if (!isMockFigmaRuntime()) {
      for (const { node, layer } of built) {
        node.x = snap(layer.box.x);
        node.y = snap(layer.box.y);
      }
      return;
    }
    const rows = built.map(({ node, layer }) => ({ node, layer, text: textNodeIn(node) })).filter(
      (r) => Boolean(r.text)
    );
    if (rows.length >= 2) {
      const primary = rows.reduce(
        (a, b) => {
          var _a2, _b2, _c2, _d2, _e2, _f2;
          return ((_c2 = (_b2 = (_a2 = a.layer.text) == null ? void 0 : _a2.font) == null ? void 0 : _b2.size) != null ? _c2 : 0) >= ((_f2 = (_e2 = (_d2 = b.layer.text) == null ? void 0 : _d2.font) == null ? void 0 : _e2.size) != null ? _f2 : 0) ? a : b;
        }
      );
      primary.node.x = snap(primary.layer.box.x);
      primary.node.y = snap(primary.layer.box.y);
      const primaryLh = (_e = (_d = (_a = primary.layer.text) == null ? void 0 : _a.lineHeight) != null ? _d : (_c = (_b = primary.layer.text) == null ? void 0 : _b.font) == null ? void 0 : _c.size) != null ? _e : primary.text.height;
      const baselineBottom = primary.layer.box.y + primaryLh;
      for (const row of rows) {
        if (row === primary) continue;
        const rowLh = (_j = (_i = (_f = row.layer.text) == null ? void 0 : _f.lineHeight) != null ? _i : (_h = (_g = row.layer.text) == null ? void 0 : _g.font) == null ? void 0 : _h.size) != null ? _j : row.text.height;
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
  function isRadioIndicatorLayer(layer) {
    var _a;
    const r = (_a = layer.paint) == null ? void 0 : _a.cornerRadii;
    return layer.name === "span" && Math.round(layer.box.width) === 18 && Math.round(layer.box.height) === 18 && Boolean(r && Math.max(r.topLeft.x, r.topRight.x, r.bottomRight.x, r.bottomLeft.x) >= 100);
  }
  function isRadioOptionLabelTextSpan(layer, parent) {
    var _a, _b;
    if (!layer.text || layer.source.tag !== "span") return false;
    return ((_b = (_a = parent == null ? void 0 : parent.source) == null ? void 0 : _a.classList) != null ? _b : []).includes("lab-radio-option");
  }
  function isCalendarDateDaySpan(layer, parent) {
    var _a, _b;
    if (!layer.text || layer.source.tag !== "span") return false;
    return ((_b = (_a = parent == null ? void 0 : parent.source) == null ? void 0 : _a.classList) != null ? _b : []).includes("date-cell");
  }
  function isLabButtonLabelSpan(layer, parent) {
    var _a, _b;
    if (((_a = parent == null ? void 0 : parent.source) == null ? void 0 : _a.tag) !== "button") return false;
    if (layer.source.tag !== "span") return false;
    return ((_b = layer.source.dataset) == null ? void 0 : _b.figmaName) === "label" || layer.name === "label" || Boolean(layer.text);
  }
  function isLiveLabButtonBareLabel(_layer, _parent) {
    return false;
  }
  function shouldUseLabButtonAutoLayout(_layer) {
    return false;
  }
  function centerLabButtonSoleChild(_frame, _layer) {
  }
  function liveGlyphLineHeightPx(_text, _layer) {
    return null;
  }
  function liveTightLineHeightPx(text, _layer, _innerH) {
    const domLh = text.lineHeight;
    if (domLh != null && domLh > 0) return snap(domLh);
    return Math.max(1, snap(text.font.size));
  }
  function figmaTextAlignHorizontal(layer) {
    var _a;
    const align = (_a = layer.text) == null ? void 0 : _a.align;
    if (align === "center") return "CENTER";
    if (align === "right" || align === "end") return "RIGHT";
    if (align === "justify") return "JUSTIFIED";
    return "LEFT";
  }
  function liveTextPreferWidthAndHeight(layer, parent) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const text = layer.text;
    if (!text) return false;
    if (text.whiteSpace === "nowrap" || text.whiteSpace === "pre") return true;
    if (isLabTightCenterButton(layer, parent)) return true;
    if (((_a = layer.source.classList) != null ? _a : []).some((c) => c.includes("MuiChip-label"))) return true;
    const pillR = (_b = layer.paint) == null ? void 0 : _b.cornerRadii;
    const maxPillR = pillR ? Math.max(pillR.topLeft.x, pillR.topRight.x, pillR.bottomRight.x, pillR.bottomLeft.x) : 0;
    if (isTextLeafLayer(layer) && maxPillR >= 100) return true;
    if (isLabButtonLabelSpan(layer, parent) && ((_d = (_c = parent == null ? void 0 : parent.source) == null ? void 0 : _c.classList) != null ? _d : []).includes("lab-button")) {
      return true;
    }
    const pad = (_e = layer.layout) == null ? void 0 : _e.padding;
    const innerH = layer.box.height - ((_f = pad == null ? void 0 : pad.top) != null ? _f : 0) - ((_g = pad == null ? void 0 : pad.bottom) != null ? _g : 0);
    const lh = text.lineHeight;
    const singleLine = lh != null && innerH > 0 && Math.abs(lh - innerH) <= 2 && !text.value.includes("\n");
    if (singleLine) return true;
    if (!/\s/.test(text.value.trim())) return true;
    if (isTextLeafLayer(layer) && ((_i = (_h = layer.paint) == null ? void 0 : _h.fills) == null ? void 0 : _i.length)) return true;
    return false;
  }
  function applyLiveNativeTextBoxCenter(text, layer, innerW, innerH, pad, frame, parent) {
    var _a, _b;
    const lhPx = (_b = liveTightLineHeightPx(layer.text, layer, innerH)) != null ? _b : ((_a = layer.text) == null ? void 0 : _a.lineHeight) != null && layer.text.lineHeight > 0 ? snap(layer.text.lineHeight) : Math.max(1, snap(layer.text.font.size));
    text.lineHeight = { unit: "PIXELS", value: lhPx };
    const hAlign = figmaTextAlignHorizontal(layer);
    if (frame) frame.clipsContent = false;
    if (liveTextPreferWidthAndHeight(layer, parent)) {
      text.textAutoResize = "WIDTH_AND_HEIGHT";
      text.textAlignHorizontal = hAlign;
      try {
        text.textAlignVertical = "CENTER";
      } catch (e) {
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
    } catch (e) {
    }
    return { x: pad.left, y: pad.top };
  }
  function enforceLiveUnwrappedTextFrame(frame, text, layer, parent) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (isMockFigmaRuntime()) return;
    if (!liveTextPreferWidthAndHeight(layer, parent)) return;
    const pad = (_b = (_a = layer.layout) == null ? void 0 : _a.padding) != null ? _b : { top: 0, right: 0, bottom: 0, left: 0 };
    const innerW = frame.width - pad.left - pad.right;
    const innerH = frame.height - pad.top - pad.bottom;
    frame.clipsContent = false;
    if (isLabButtonLabelSpan(layer, parent) && ((_d = (_c = parent == null ? void 0 : parent.source) == null ? void 0 : _c.classList) != null ? _d : []).includes("lab-button")) {
      const domLh = (_e = layer.text) == null ? void 0 : _e.lineHeight;
      const lhPx = domLh != null && domLh > 0 ? snap(domLh) : Math.max(1, snap(layer.text.font.size));
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
    if ((_g = (_f = layer.paint) == null ? void 0 : _f.fills) == null ? void 0 : _g.length) {
      const neededW = snap(text.x + text.width + pad.right);
      if (neededW > frame.width + 0.5) {
        frame.resize(neededW, frame.height);
      }
    }
  }
  function reaffirmChildBoxPositions(built, parent) {
    var _a, _b;
    if (isMockFigmaRuntime()) return;
    for (const { node, layer } of built) {
      if (isLiveLabButtonBareLabel(layer, parent) && node.type === "TEXT") {
        const text = node;
        text.textAlignHorizontal = "CENTER";
        text.textAutoResize = "WIDTH_AND_HEIGHT";
        text.x = snap(layer.box.x);
        text.y = snap(layer.box.y);
        continue;
      }
      if (((_a = layer.source) == null ? void 0 : _a.kind) === "figma" && ((_b = layer.source.dataset) == null ? void 0 : _b.figmaRelativeTransform)) {
        continue;
      }
      node.x = snap(layer.box.x);
      node.y = snap(layer.box.y);
    }
  }
  function shouldRenameSpanFrameToTypography(layer, parent) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
    if (isLabButtonLabelSpan(layer, parent)) return false;
    if (isRadioOptionLabelTextSpan(layer, parent)) return false;
    if (isCalendarDateDaySpan(layer, parent)) return false;
    if (layer.source.tag !== "span") return false;
    if (((_a = layer.layout) == null ? void 0 : _a.display) === "inline" || ((_b = layer.layout) == null ? void 0 : _b.display) === "inline-block") return false;
    if (layer.name && layer.name !== "span") return false;
    if ((_d = (_c = layer.paint) == null ? void 0 : _c.fills) == null ? void 0 : _d.length) return false;
    const parentName = parent == null ? void 0 : parent.name;
    if (parentName === "nav") return false;
    if ((parentName === "label" || ((_e = parent == null ? void 0 : parent.source) == null ? void 0 : _e.tag) === "label") && !isMuiFormControlLabelCaption(layer)) {
      return false;
    }
    if ((parentName === "header" || ((_f = parent == null ? void 0 : parent.source) == null ? void 0 : _f.tag) === "header") && ((_g = layer.source.classList) != null ? _g : []).includes("status")) {
      return false;
    }
    if (((_h = parent == null ? void 0 : parent.source) == null ? void 0 : _h.tag) === "button") return false;
    if (((_i = layer.source.dataset) == null ? void 0 : _i.figmaName) === "label") return false;
    const classes = (_j = layer.source.classList) != null ? _j : [];
    if (classes.includes("badge") || classes.includes("active")) return false;
    if (classes.includes("chip")) return false;
    if (((_l = (_k = parent == null ? void 0 : parent.source) == null ? void 0 : _k.classList) != null ? _l : []).includes("lab-select-field")) return false;
    if (((_n = (_m = parent == null ? void 0 : parent.source) == null ? void 0 : _m.classList) != null ? _n : []).includes("chips")) return false;
    if (((_p = (_o = parent == null ? void 0 : parent.source) == null ? void 0 : _o.classList) != null ? _p : []).includes("lab-feature-footer")) return false;
    return textUsesTightLineBox(layer);
  }
  function isFigmaFlipFrame(layer) {
    var _a, _b, _c;
    const rt = (_b = (_a = layer.source) == null ? void 0 : _a.dataset) == null ? void 0 : _b.figmaRelativeTransform;
    return Boolean(((_c = rt == null ? void 0 : rt[0]) == null ? void 0 : _c[0]) != null && rt[0][0] < -0.5);
  }
  function isPrevNextGroup(layer) {
    var _a;
    const ds = (_a = layer.source) == null ? void 0 : _a.dataset;
    return layer.name === "prev-next" || (ds == null ? void 0 : ds.name) === "prev-next" || (ds == null ? void 0 : ds.figmaNodeType) === "GROUP" && layer.name === "prev-next";
  }
  function isPrevNextGroupChild(parent) {
    return Boolean(parent && isPrevNextGroup(parent));
  }
  function normalizeAbsoluteGroupChildren(layer) {
    var _a;
    if (!((_a = layer.children) == null ? void 0 : _a.length)) return;
    if (isPrevNextGroup(layer)) {
      const ox = layer.box.x;
      const oy = layer.box.y;
      const minChildX = Math.min(...layer.children.map((c) => c.box.x));
      const maxChildR = Math.max(...layer.children.map((c) => c.box.x + c.box.width));
      const needsRebase = minChildX + 0.5 >= ox || maxChildR > ox + layer.box.width + 0.5;
      if (needsRebase) {
        for (const child of layer.children) {
          child.box = __spreadProps(__spreadValues({}, child.box), {
            x: snap(child.box.x - ox),
            y: snap(child.box.y - oy)
          });
        }
      }
      let maxR = 0;
      let maxB = 0;
      for (const child of layer.children) {
        maxR = Math.max(maxR, child.box.x + child.box.width);
        maxB = Math.max(maxB, child.box.y + child.box.height);
      }
      layer.box = __spreadProps(__spreadValues({}, layer.box), {
        width: Math.max(layer.box.width, maxR),
        height: Math.max(layer.box.height, maxB)
      });
    }
    for (const child of layer.children) normalizeAbsoluteGroupChildren(child);
  }
  function shouldClipContent(layer, parent) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
    if (isPrevNextGroup(layer)) return false;
    if (isFigmaFlipFrame(layer)) return false;
    if (hasNotchedOutlineChild(layer)) return false;
    if (isMuiShrunkInputLabel(layer)) return false;
    const parentCl = (_a = parent == null ? void 0 : parent.source.classList) != null ? _a : [];
    if (parentCl.some((c2) => c2.includes("MuiOutlinedInput-root"))) return false;
    const cl = (_b = layer.source.classList) != null ? _b : [];
    if (cl.includes("lab-button")) {
      const shadows = ((_c = layer.paint) == null ? void 0 : _c.shadows) || [];
      const needsClip = shadows.some((s) => s.inset || s.spread !== 0);
      if (!needsClip) return false;
    }
    const explicitClip = ((_e = (_d = layer.layout) == null ? void 0 : _d.overflow) == null ? void 0 : _e.x) === "hidden" || ((_g = (_f = layer.layout) == null ? void 0 : _f.overflow) == null ? void 0 : _g.y) === "hidden" || ((_i = (_h = layer.layout) == null ? void 0 : _h.overflow) == null ? void 0 : _i.x) === "clip" || ((_k = (_j = layer.layout) == null ? void 0 : _j.overflow) == null ? void 0 : _k.y) === "clip";
    const hasSpreadShadow = (((_l = layer.paint) == null ? void 0 : _l.shadows) || []).some((s) => s.spread !== 0);
    if (isTextLeafLayer(layer) && !explicitClip && !hasSpreadShadow) {
      return false;
    }
    const c = (_m = layer.paint) == null ? void 0 : _m.cornerRadii;
    const w = Math.round(layer.box.width);
    const h = Math.round(layer.box.height);
    const maxR = c ? Math.max(c.topLeft.x, c.topRight.x, c.bottomRight.x, c.bottomLeft.x) : 0;
    const circleAvatar = w > 0 && w === h && maxR >= w / 2 - 1;
    const hasFill = Boolean((_o = (_n = layer.paint) == null ? void 0 : _n.fills) == null ? void 0 : _o.length);
    if (circleAvatar && hasFill) return false;
    const pill = c && maxR >= 100;
    const rounded = c && !circleAvatar && layer.box.width < 400 && layer.box.height < 400 && (c.topLeft.x > 0 || c.topRight.x > 0 || c.bottomRight.x > 0 || c.bottomLeft.x > 0);
    return explicitClip || hasSpreadShadow || Boolean(pill) || Boolean(rounded);
  }
  function frameRequiresClipContent(layer) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (isFigmaFlipFrame(layer)) return false;
    return ((_b = (_a = layer.layout) == null ? void 0 : _a.overflow) == null ? void 0 : _b.x) === "hidden" || ((_d = (_c = layer.layout) == null ? void 0 : _c.overflow) == null ? void 0 : _d.y) === "hidden" || ((_f = (_e = layer.layout) == null ? void 0 : _e.overflow) == null ? void 0 : _f.x) === "clip" || ((_h = (_g = layer.layout) == null ? void 0 : _g.overflow) == null ? void 0 : _h.y) === "clip";
  }
  async function buildLayer(layer, parent, grandparent) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L, _M, _N, _O, _P, _Q, _R, _S, _T, _U, _V, _W, _X, _Y, _Z, __, _$, _aa, _ba, _ca, _da, _ea, _fa, _ga, _ha, _ia, _ja, _ka, _la, _ma, _na, _oa, _pa, _qa, _ra, _sa, _ta;
    if (!isLayerVisible(layer)) return null;
    let node;
    let textChildToPlace = null;
    const isTextLeaf = layer.text && (!layer.children || layer.children.length === 0);
    const figmaBareText = isTextLeaf && isFigmaNativeTextLayer(layer) && !((_a = layer.paint) == null ? void 0 : _a.borders) && !((_c = (_b = layer.paint) == null ? void 0 : _b.shadows) == null ? void 0 : _c.length);
    if (figmaBareText) {
      const t = await createTextNode(layer, parent);
      t.name = layer.name || "text";
      return t;
    }
    if (isTextLeaf) {
      if (isLiveLabButtonBareLabel(layer, parent)) {
        const t = await createTextNode(layer, parent);
        t.name = layer.name || ((_d = layer.source.dataset) == null ? void 0 : _d.figmaName) || "label";
        return t;
      }
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
      f.clipsContent = shouldClipContent(layer, parent);
      node = f;
    }
    node.name = layer.name || layer.source.tag || "layer";
    if (isMuiOutlinedValueField(layer, parent) && isMockFigmaRuntime()) {
      node.name = layer.source.tag === "input" ? "outlined-value" : "outlined-select-value";
    }
    if (isMockFigmaRuntime() && isMuiCompactCenterButton(layer) && !((_f = (_e = layer.paint) == null ? void 0 : _e.fills) == null ? void 0 : _f.length)) {
      node.name = "mui-action-btn";
    }
    if (((_g = layer.source) == null ? void 0 : _g.tag) === "input") {
      const inputType = layer.source.inputType;
      const src = {
        tag: "input",
        inputType: inputType || "text"
      };
      if ((_h = layer.text) == null ? void 0 : _h.value) {
        src.value = layer.text.value;
      }
      if ((_j = (_i = layer.text) == null ? void 0 : _i.font) == null ? void 0 : _j.stack) {
        src.fontStack = layer.text.font.stack;
      }
      if (isMockFigmaRuntime() && !isMuiOutlinedValueField(layer, parent)) {
        node.source = src;
      }
    }
    if (node.type === "FRAME" && "fills" in node && !((_l = (_k = layer.paint) == null ? void 0 : _k.fills) == null ? void 0 : _l.length)) {
      node.fills = [];
    }
    if ("resize" in node && node.type !== "TEXT") {
      const w = snapBoxSize(layer, "width");
      let h = snapBoxSize(layer, "height");
      if (((_m = layer.source) == null ? void 0 : _m.tag) === "input" && ((_o = (_n = parent == null ? void 0 : parent.source) == null ? void 0 : _n.classList) == null ? void 0 : _o.includes("lab-login-card")) && Math.round(layer.box.height) === 52) {
        h = 50;
      }
      node.resize(w, h);
      clampNodeWidthToParent(node, layer, parent);
    }
    applyTransform(node, layer);
    applyMuiLinearProgressBarPlacement(node, layer);
    if (textChildToPlace) {
      const frame = node;
      const text = textChildToPlace;
      if (isLabButtonLabelSpan(layer, parent)) {
        const fw = Math.max(1, snap(layer.box.width));
        const fh = Math.max(1, snap(layer.box.height));
        frame.resize(fw, fh);
        frame.name = layer.name || ((_p = layer.source.dataset) == null ? void 0 : _p.figmaName) || "label";
        const labBtn = ((_r = (_q = parent == null ? void 0 : parent.source) == null ? void 0 : _q.classList) != null ? _r : []).includes("lab-button");
        if (labBtn) {
          if (!isMockFigmaRuntime()) {
            frame.appendChild(text);
            enforceLiveUnwrappedTextFrame(frame, text, layer, parent);
          } else {
            const lhPx = (_s = liveTightLineHeightPx(layer.text, layer, fh)) != null ? _s : Math.max(1, snap(layer.text.font.size));
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
          const lh = (_t = layer.text) == null ? void 0 : _t.lineHeight;
          if (lh != null && lh > 0) {
            text.lineHeight = { unit: "PIXELS", value: snap(lh) };
          }
          text.textAlignHorizontal = "LEFT";
          text.textAutoResize = "WIDTH_AND_HEIGHT";
          const tw = text.width;
          const th = text.height;
          let tx = 0;
          if (((_u = layer.text) == null ? void 0 : _u.align) === "center" && fw > tw + 0.5) {
            tx = (fw - tw) / 2;
          }
          text.x = snap(Math.max(0, tx));
          text.y = snap(Math.max(0, (fh - th) / 2));
          if (text.y > 0 && text.y < 1) text.y = 0;
          frame.appendChild(text);
        }
      } else {
        const matrix = (_v = layer.transform) == null ? void 0 : _v.matrix;
        const skipScaleBake = isMuiShrunkInputLabel(layer) && isMockFigmaRuntime();
        if (matrix && !skipScaleBake) {
          const sx = Math.hypot(matrix[0], matrix[1]);
          const sy = Math.hypot(matrix[2], matrix[3]);
          if (Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01) {
            const baseSize = typeof text.fontSize === "number" ? text.fontSize : 16;
            text.fontSize = Math.max(1, snap(baseSize * sy));
            const lh = text.lineHeight;
            if (lh !== figma.mixed && typeof lh === "object" && lh.unit === "PIXELS" && lh.value) {
              text.lineHeight = { unit: "PIXELS", value: snap(lh.value * sy) };
            }
            const ls = text.letterSpacing;
            if (ls !== figma.mixed && typeof ls === "object" && ls.unit === "PIXELS" && ls.value) {
              text.letterSpacing = { unit: "PIXELS", value: snap(ls.value * sx) };
            }
            const fn = text.fontName;
            if (fn !== figma.mixed) await figma.loadFontAsync(fn);
          }
        }
        if (isMuiShrunkInputLabel(layer)) {
          if (!isMockFigmaRuntime()) {
            const fs = typeof text.fontSize === "number" ? text.fontSize : layer.text.font.size;
            text.lineHeight = { unit: "PIXELS", value: Math.max(1, snap(fs)) };
            const ls = layer.text.letterSpacing;
            if (ls != null) {
              text.letterSpacing = { unit: "PIXELS", value: snap(ls) };
            }
          } else {
            const mockSize = mockMuiShrunkLabelFrameSize(layer);
            frame.resize(mockSize.width, mockSize.height);
          }
          frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
          frame.clipsContent = false;
        }
        const fw = frame.width;
        const fh = frame.height;
        const pad = (_x = (_w = layer.layout) == null ? void 0 : _w.padding) != null ? _x : { top: 0, right: 0, bottom: 0, left: 0 };
        const justify = (_A = (_z = (_y = layer.layout) == null ? void 0 : _y.flex) == null ? void 0 : _z.justify) != null ? _A : "normal";
        const align = (_D = (_C = (_B = layer.layout) == null ? void 0 : _B.flex) == null ? void 0 : _C.align) != null ? _D : "normal";
        const innerW = fw - pad.left - pad.right;
        const innerH = fh - pad.top - pad.bottom;
        clampMockTextToDomBox(text, innerW, innerH, layer, parent);
        const tw = text.width;
        const th = text.height;
        const textAlign = (_E = layer.text) == null ? void 0 : _E.align;
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
          } catch (e) {
          }
          x = pad.left;
        } else if (isMuiFormControlLabelCaption(layer)) {
          text.textAutoResize = "HEIGHT";
          text.resize(Math.max(1, snap(innerW)), Math.max(1, snap(innerH)));
          try {
            text.textAlignVertical = "CENTER";
          } catch (e) {
          }
        } else if (!isMockFigmaRuntime() && ((_F = layer.source) == null ? void 0 : _F.tag) === "input") {
          const b = (_G = layer.paint) == null ? void 0 : _G.borders;
          const borderL = (_I = (_H = b == null ? void 0 : b.left) == null ? void 0 : _H.width) != null ? _I : 0;
          const borderR = (_K = (_J = b == null ? void 0 : b.right) == null ? void 0 : _J.width) != null ? _K : 0;
          const borderT = (_M = (_L = b == null ? void 0 : b.top) == null ? void 0 : _L.width) != null ? _M : 0;
          const borderB = (_O = (_N = b == null ? void 0 : b.bottom) == null ? void 0 : _N.width) != null ? _O : 0;
          const contentW = Math.max(1, snap(innerW - borderL - borderR));
          const contentH = Math.max(1, snap(innerH - borderT - borderB));
          text.textAutoResize = "NONE";
          text.resize(contentW, contentH);
          text.textAlignHorizontal = "LEFT";
          try {
            text.textAlignVertical = "CENTER";
          } catch (e) {
          }
          x = pad.left + borderL;
          y = pad.top + borderT;
          usedNativeTextAlign = true;
          usedNativeVerticalAlign = true;
        }
        const tableCell = layer.source.tag === "th" || layer.source.tag === "td";
        const blockButtonCenter = layer.source.tag === "button" && textAlign === "center";
        const wideBlockButton = blockButtonCenter && !isLabDomCenterButton(layer, parent) && (innerW > tw + 12 && innerH > 40);
        if (tableCell && (textAlign === "right" || textAlign === "end" || textAlign === "center") || isMuiPaginationItemButton(layer) || blockButtonCenter || (textAlign === "center" || textAlign === "right" || textAlign === "end") && innerW > tw + 2) {
          if (wideBlockButton) {
            const btnLh = (_P = layer.text) == null ? void 0 : _P.lineHeight;
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
                const lhPx = (_Q = liveTightLineHeightPx(layer.text, layer, innerH)) != null ? _Q : Math.max(1, snap(layer.text.font.size));
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
              } catch (e) {
              }
              x = pad.left;
              y = pad.top;
            }
            usedNativeTextAlign = true;
            usedNativeVerticalAlign = true;
          } else if (isMuiPaginationItemButton(layer)) {
            const fs = (_T = (_S = (_R = layer.text) == null ? void 0 : _R.font) == null ? void 0 : _S.size) != null ? _T : 14;
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
                const lhPx = (_U = liveTightLineHeightPx(layer.text, layer, innerH)) != null ? _U : Math.max(1, snap(layer.text.font.size));
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
                const btnLh = (_V = layer.text) == null ? void 0 : _V.lineHeight;
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
        } else if (!usedNativeTextAlign && !isMuiFlexCenterGlyphFrame(layer) && (justify === "center" || textAlign === "center")) {
          x = pad.left + (innerW - tw) / 2;
        } else if (justify === "end" || textAlign === "right" || textAlign === "end") {
          x = fw - tw - pad.right;
        }
        if (!usedNativeVerticalAlign) {
          const blockFlowPinTop = !isMockFigmaRuntime() && ((_W = parent == null ? void 0 : parent.layout) == null ? void 0 : _W.display) === "block" && (layer.source.tag === "p" || /^h[1-6]$/.test((_X = layer.source.tag) != null ? _X : "") || layer.source.tag === "span");
          if (blockFlowPinTop) {
            y = pad.top;
            try {
              text.textAlignVertical = "TOP";
            } catch (e) {
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
            } catch (e) {
            }
          } else if (isMuiShrunkInputLabel(layer)) {
            y = pad.top + Math.max(0, (innerH - th) / 2);
          } else if (((_Y = layer.source) == null ? void 0 : _Y.tag) === "input") {
            const b = (_Z = layer.paint) == null ? void 0 : _Z.borders;
            const borderTop = (_$ = (__ = b == null ? void 0 : b.top) == null ? void 0 : __.width) != null ? _$ : 0;
            const borderBottom = (_ba = (_aa = b == null ? void 0 : b.bottom) == null ? void 0 : _aa.width) != null ? _ba : 0;
            const contentInnerH = innerH - borderTop - borderBottom;
            y = pad.top + borderTop + Math.max(0, (contentInnerH - th) / 2);
            try {
              text.textAlignVertical = "CENTER";
            } catch (e) {
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
              } catch (e) {
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
          } catch (e) {
          }
        }
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
        if (!isMockFigmaRuntime() && /^h[1-6]$/.test((_ca = layer.source.tag) != null ? _ca : "") && text.textAutoResize === "HEIGHT") {
          const neededH = snap(text.y + text.height + pad.bottom);
          const domH = snap(layer.box.height);
          if (neededH > frame.height + 0.5 || domH > frame.height + 0.5) {
            frame.resize(frame.width, Math.max(domH, neededH));
          }
        }
        if (textFramePinsToTop(layer, parent) && !((_ea = (_da = layer.paint) == null ? void 0 : _da.fills) == null ? void 0 : _ea.length) && layer.box.width <= snap(text.width) + 2) {
          frame.resize(
            Math.max(1, snap(text.width)),
            Math.max(1, snap(text.height))
          );
        } else if (textFramePinsToTop(layer, parent) && !((_ga = (_fa = layer.paint) == null ? void 0 : _fa.fills) == null ? void 0 : _ga.length) && (/^h[1-6]$/.test((_ha = layer.source.tag) != null ? _ha : "") || preserveDomLineBoxHeight(layer, parent))) {
          frame.resize(fw, Math.max(1, snap(layer.box.height)));
        }
      }
    }
    if (layer.paint) {
      const paint = layer.paint;
      if ("fills" in node && node.type !== "TEXT") {
        if (layer.image) {
          const bgFills = ((_ia = paint.fills) == null ? void 0 : _ia.length) ? buildFills(paint, layer.box.width, layer.box.height) : void 0;
          if (bgFills == null ? void 0 : bgFills.length) {
            node.fills = [
              ...clonePaints(bgFills),
              ...clonePaints(node.fills || [])
            ];
          }
        } else {
          const fills = ((_ja = paint.fills) == null ? void 0 : _ja.length) ? buildFills(paint, layer.box.width, layer.box.height) : void 0;
          if (fills == null ? void 0 : fills.length) {
            node.fills = clonePaints(fills);
          } else if (((_ka = layer.source) == null ? void 0 : _ka.kind) === "figma" && node.type === "FRAME" && !isMockFigmaRuntime()) {
            node.fills = [transparentFill()];
          } else {
            node.fills = [];
          }
        }
      }
      if (node.type !== "TEXT" && shouldApplyCornerRadii(layer, parent)) applyCornerRadii(node, paint);
      if ("effects" in node) {
        const skipMockContainedButtonShadow = isMockFigmaRuntime() && layer.source.tag === "button" && Boolean((_ma = (_la = layer.paint) == null ? void 0 : _la.fills) == null ? void 0 : _ma.length);
        if (!skipMockContainedButtonShadow) {
          const allowSpread = isMockFigmaRuntime() || node.type !== "TEXT" && (node.clipsContent === true || node.type !== "FRAME");
          const effects = effectsFromPaint(paint, allowSpread);
          if (effects.length) node.effects = cloneEffects(effects);
        }
      }
      if (paint.opacity !== void 0 && "opacity" in node) {
        node.opacity = Math.max(0, Math.min(1, paint.opacity));
      }
      if (paint.blendMode && paint.blendMode !== "normal" && "blendMode" in node) {
        const bm = paint.blendMode.toUpperCase().replace(/-/g, "_");
        try {
          node.blendMode = bm;
        } catch (e) {
        }
      }
    }
    const borderPaint = isMuiNotchedOutlineFieldset(layer) && parent ? tightenMuiNotchGapPaint(layer.paint, parent, grandparent) : layer.paint;
    const borderOverlay = applyBorders(node, borderPaint, layer.box.width, layer.box.height, layer);
    if (layer.children && "appendChild" in node) {
      if (shouldUseLabButtonAutoLayout(layer) && node.type === "FRAME") {
        const frame = node;
        const pad = (_oa = (_na = layer.layout) == null ? void 0 : _na.padding) != null ? _oa : { top: 0, right: 0, bottom: 0, left: 0 };
        const flex = (_pa = layer.layout) == null ? void 0 : _pa.flex;
        const gap = (_ra = (_qa = flex == null ? void 0 : flex.columnGap) != null ? _qa : flex == null ? void 0 : flex.rowGap) != null ? _ra : 0;
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
        const kids = (_sa = layer.children) != null ? _sa : [];
        const childLayers = [...kids].sort((a, b) => a.box.x - b.box.x);
        for (const child of childLayers) {
          const childNode = await buildLayer(child, layer, parent);
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
        const inlineRow = node.type === "FRAME" && shouldUseInlineRowLayout(layer);
        const childLayers = inlineRow ? [...layer.children].sort((a, b) => a.box.x - b.box.x) : layer.children;
        if (inlineRow) {
          node.clipsContent = false;
        }
        const positionedBuilt = [];
        const inlineBuilt = [];
        for (const child of childLayers) {
          const childNode = await buildLayer(child, layer, parent);
          if (!childNode) continue;
          if (layer.name === "label" && isRadioIndicatorLayer(child)) {
            childNode.y = 0;
          }
          if (layer.name === "label" && child.text && childNode.type === "FRAME") {
            const textKid = childNode.children.find((c) => c.type === "TEXT");
            if (textKid && textKid.y > 0 && textKid.y < 1) textKid.y = 0;
          }
          node.appendChild(childNode);
          positionedBuilt.push({ node: childNode, layer: child });
          if (inlineRow) inlineBuilt.push({ node: childNode, layer: child });
        }
        if (inlineRow) {
          alignInlineRowSiblings(inlineBuilt);
        } else {
          reaffirmChildBoxPositions(positionedBuilt, layer);
          for (const { node: childNode, layer: childLayer } of positionedBuilt) {
            applyMuiLinearProgressBarPlacement(childNode, childLayer);
          }
          if (!isMockFigmaRuntime() && node.type === "FRAME" && ((_ta = layer.source.classList) != null ? _ta : []).includes("lab-button") && !shouldUseLabButtonAutoLayout(layer)) {
            centerLabButtonSoleChild(node, layer);
          }
        }
      }
    }
    if (borderOverlay && "appendChild" in node) {
      node.appendChild(borderOverlay);
      if ("clipsContent" in node && !frameRequiresClipContent(layer)) {
        node.clipsContent = false;
      }
    }
    if (node.type === "FRAME" && frameRequiresClipContent(layer)) {
      node.clipsContent = true;
    }
    return node;
  }
  async function renderDocumentV2(doc) {
    const rootLayer = JSON.parse(JSON.stringify(doc.root));
    normalizeAbsoluteGroupChildren(rootLayer);
    await preloadFonts(rootLayer, /* @__PURE__ */ new Set());
    const root = await buildLayer(rootLayer);
    if (!root) throw new Error("Root layer produced no node");
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
      canvas.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    }
    if (doc.meta.preserveEffects) {
      try {
        canvas.setPluginData("preserveEffects", "1");
      } catch (e) {
      }
    }
    root.x = padding;
    root.y = padding;
    canvas.appendChild(root);
    return canvas;
  }
  function contentFrameFromCanvas(canvas) {
    if (canvas.type === "FRAME" && canvas.children.length > 0) {
      return canvas.children[0];
    }
    return canvas;
  }
  function stripEffectsForExport(root) {
    const saved = [];
    const walk = (node) => {
      if ("effects" in node) {
        const blend = node;
        if (blend.effects.length) {
          saved.push({ node, effects: blend.effects });
          try {
            blend.effects = [];
          } catch (e) {
          }
        }
      }
      if ("children" in node) {
        for (const child of node.children) walk(child);
      }
    };
    walk(root);
    return saved;
  }
  async function exportContentPng(canvas, _canvasBackground) {
    var _a;
    const target = contentFrameFromCanvas(canvas);
    const settings = {
      format: "PNG",
      constraint: { type: "SCALE", value: isMockFigmaRuntime() ? 2 : 1 },
      useAbsoluteBounds: false,
      colorProfile: "SRGB"
    };
    const preserveEffects = canvas.type === "FRAME" && ((_a = canvas.getPluginData) == null ? void 0 : _a.call(canvas, "preserveEffects")) === "1";
    const stripped = preserveEffects ? [] : stripEffectsForExport(target);
    try {
      return await target.exportAsync(settings);
    } finally {
      for (const { node, effects } of stripped) {
        try {
          node.effects = cloneEffects(effects);
        } catch (e) {
        }
      }
    }
  }

  // src/code.ts
  figma.showUI(__html__, { width: 520, height: 600 });
  function sortBatchItems(items) {
    var _a;
    const manifest = items.find((item) => {
      const normalized = item.name.replace(/\\/g, "/");
      return normalized === "stories.index.json" || normalized.endsWith("/stories.index.json");
    });
    if (!manifest) return [...items].sort((a, b) => a.name.localeCompare(b.name));
    try {
      const parsed = JSON.parse(manifest.json);
      const order = /* @__PURE__ */ new Map();
      ((_a = parsed.stories) != null ? _a : []).forEach((s, index) => {
        if (!s.output) return;
        const normalized = s.output.replace(/\\/g, "/");
        order.set(normalized, index);
        order.set(normalized.split("/").pop() || normalized, index);
      });
      return [...items].filter((item) => {
        const normalized = item.name.replace(/\\/g, "/");
        return normalized !== "stories.index.json" && !normalized.endsWith("/stories.index.json");
      }).sort((a, b) => {
        var _a2, _b, _c, _d;
        const aScore = (_b = (_a2 = order.get(a.name.replace(/\\/g, "/"))) != null ? _a2 : order.get(a.name.split("/").pop() || a.name)) != null ? _b : Number.MAX_SAFE_INTEGER;
        const bScore = (_d = (_c = order.get(b.name.replace(/\\/g, "/"))) != null ? _c : order.get(b.name.split("/").pop() || b.name)) != null ? _d : Number.MAX_SAFE_INTEGER;
        return aScore - bScore || a.name.localeCompare(b.name);
      });
    } catch (_error) {
      return [...items].filter((item) => {
        const normalized = item.name.replace(/\\/g, "/");
        return normalized !== "stories.index.json" && !normalized.endsWith("/stories.index.json");
      }).sort((a, b) => a.name.localeCompare(b.name));
    }
  }
  function argsLabel(argsUsed) {
    if (!argsUsed) return "default";
    const entries = Object.entries(argsUsed);
    if (!entries.length) return "default";
    return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
  }
  async function importDocument(json) {
    const parsed = JSON.parse(json);
    if (!isUniversalDocumentV2(parsed)) {
      throw new Error(
        `Unsupported schema. Expected UniversalLayer v1.0 ("schemaVersion": "1.0").`
      );
    }
    const doc = JSON.parse(JSON.stringify(parsed));
    const node = await renderDocumentV2(doc);
    return {
      node,
      name: doc.meta.componentName,
      canvasBackground: doc.meta.canvasBackground
    };
  }
  figma.ui.onmessage = async (msg) => {
    var _a, _b, _c, _d;
    if (msg.type === "import-and-export-png") {
      let canvas = null;
      try {
        const result = await importDocument(msg.json);
        canvas = result.node;
        const target = contentFrameFromCanvas(canvas);
        const bytes = await exportContentPng(canvas, result.canvasBackground);
        figma.ui.postMessage({
          type: "export-png",
          requestId: msg.requestId,
          ok: true,
          pngBase64: bytesToBase64(bytes),
          width: Math.round(target.width),
          height: Math.round(target.height),
          name: result.name
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown error";
        figma.ui.postMessage({
          type: "export-png",
          requestId: msg.requestId,
          ok: false,
          error: reason
        });
      } finally {
        if (canvas) canvas.remove();
      }
      return;
    }
    if (msg.type === "import-json") {
      try {
        const result = await importDocument(msg.json);
        figma.currentPage.appendChild(result.node);
        figma.viewport.scrollAndZoomIntoView([result.node]);
        figma.notify(`Imported ${result.name}`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown error";
        figma.notify(`Import failed: ${reason}`, { error: true });
      }
      return;
    }
    if (msg.type === "import-json-batch") {
      const rawItems = (_a = msg.items) != null ? _a : [];
      const items = sortBatchItems(rawItems).filter(
        (item) => item.name.toLowerCase().endsWith(".json")
      );
      if (!items.length) {
        figma.notify("No JSON files selected.");
        return;
      }
      const imported = [];
      const errors = [];
      const parsed = [];
      for (const item of items) {
        try {
          const doc = JSON.parse(JSON.stringify(JSON.parse(item.json)));
          if (!isUniversalDocumentV2(doc)) {
            errors.push(`${item.name}: Not a UniversalLayer v1.0 artifact.`);
            continue;
          }
          parsed.push({ name: item.name, doc });
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Unknown error";
          errors.push(`${item.name}: ${reason}`);
        }
      }
      const byComponent = /* @__PURE__ */ new Map();
      for (const item of parsed) {
        const key = item.doc.meta.componentName || "UnknownComponent";
        const list = (_b = byComponent.get(key)) != null ? _b : [];
        list.push(item);
        byComponent.set(key, list);
      }
      let sectionY = 0;
      const sectionGap = 120;
      const rowGap = 40;
      const itemGap = 28;
      for (const [componentName, componentItems] of byComponent.entries()) {
        try {
          const byStory = /* @__PURE__ */ new Map();
          for (const item of componentItems) {
            const storyKey = (_c = item.doc.meta.storyId) != null ? _c : item.name;
            const storyItems = (_d = byStory.get(storyKey)) != null ? _d : [];
            storyItems.push(item);
            byStory.set(storyKey, storyItems);
          }
          const sectionMarker = figma.createFrame();
          sectionMarker.name = `${componentName} Variants`;
          sectionMarker.layoutMode = "NONE";
          sectionMarker.fills = [];
          sectionMarker.resize(1, 1);
          sectionMarker.x = 0;
          sectionMarker.y = sectionY;
          figma.currentPage.appendChild(sectionMarker);
          imported.push(sectionMarker);
          let rowY = sectionY + 24;
          for (const [storyId, storyItems] of byStory.entries()) {
            let rowX = 0;
            let rowHeight = 0;
            for (const item of storyItems) {
              const doc = JSON.parse(JSON.stringify(item.doc));
              const node = await renderDocumentV2(doc);
              node.name = `${componentName} / ${storyId} \u2014 ${argsLabel(item.doc.meta.argsUsed)}`;
              node.x = rowX;
              node.y = rowY;
              figma.currentPage.appendChild(node);
              imported.push(node);
              rowX += node.width + itemGap;
              rowHeight = Math.max(rowHeight, node.height);
            }
            rowY += rowHeight + rowGap;
          }
          sectionY = rowY + sectionGap;
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Unknown error";
          errors.push(`${componentName}: ${reason}`);
        }
      }
      if (imported.length) figma.viewport.scrollAndZoomIntoView(imported);
      if (errors.length) {
        figma.notify(`Imported ${imported.length}/${items.length}. Some files failed.`);
        figma.ui.postMessage({ type: "batch-import-errors", errors });
      } else {
        figma.notify(`Imported ${imported.length} files.`);
      }
      return;
    }
  };
})();
