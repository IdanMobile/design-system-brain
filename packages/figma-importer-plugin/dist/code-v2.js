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
const TAU = Math.PI * 2;
export function isUniversalDocumentV2(value) {
    if (!value || typeof value !== "object")
        return false;
    return value.schemaVersion === "1.0";
}
function snap(v) {
    return Math.round(v * 100) / 100;
}
function parseColor(raw) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "transparent" || trimmed === "none")
        return { r: 0, g: 0, b: 0, a: 0 };
    // Hex
    const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
        const v = hex[1];
        let expanded;
        if (v.length === 3 || v.length === 4) {
            expanded = v.split("").map((c) => c + c).join("");
        }
        else {
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
    const rgb = trimmed.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i);
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
    const hsl = trimmed.match(/^hsla?\(\s*([\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i);
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
    if (trimmed === "white")
        return { r: 1, g: 1, b: 1, a: 1 };
    if (trimmed === "black")
        return { r: 0, g: 0, b: 0, a: 1 };
    return { r: 0, g: 0, b: 0, a: 1 };
}
function hslToRgb(h, s, l) {
    if (s === 0)
        return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t) => {
        if (t < 0)
            t += 1;
        if (t > 1)
            t -= 1;
        if (t < 1 / 6)
            return p + (q - p) * 6 * t;
        if (t < 1 / 2)
            return q;
        if (t < 2 / 3)
            return p + (q - p) * (2 / 3 - t) * 6;
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
// ─────────────────────────── gradient → Figma Paint ───────────────────────────
function gradientTransformForAngle(angleDeg) {
    // CSS gradient: 0deg = bottom→top, increases clockwise.
    // Figma GradientTransform: a 2×3 matrix that maps unit gradient space
    // ((0,0) start, (1,0) end) into the node's normalized space.
    //
    // For 0deg we want start = (0.5, 1) (bottom) → end = (0.5, 0) (top).
    // The gradient vector direction is at (angleDeg) clockwise from "up".
    const rad = ((angleDeg - 90) * Math.PI) / 180; // convert CSS angle to math angle
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    // Start at (0.5 - dx/2, 0.5 - dy/2), end at (0.5 + dx/2, 0.5 + dy/2).
    // Gradient transform maps (0,0) → start, (1, 0) → end, (0, 1) → 90°-rotated point.
    // a*0 + c*0 + e = startX → e = startX
    // a*1 + c*0 + e = endX → a = endX - startX = dx
    // b*1 + d*0 + f = endY → b = dy
    // We pick c, d so the perpendicular has length 1: c = -dy, d = dx.
    const m = [
        [dx, -dy, 0.5 - dx / 2],
        [dy, dx, 0.5 - dy / 2]
    ];
    return m;
}
function toColorStops(stops) {
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
function gradientPaint(layer) {
    if (layer.kind === "linear-gradient") {
        return {
            type: "GRADIENT_LINEAR",
            gradientTransform: gradientTransformForAngle(layer.angleDeg),
            gradientStops: toColorStops(layer.stops)
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
            gradientTransform: gradientTransformForAngle(layer.fromDeg),
            gradientStops: toColorStops(layer.stops)
        };
    }
    return null;
}
// ─────────────────────────── images ───────────────────────────
const imageHashByDataUrl = new Map();
function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1)
        bytes[i] = binary.charCodeAt(i);
    return bytes;
}
function imageHashFromDataUrl(dataUrl) {
    const cached = imageHashByDataUrl.get(dataUrl);
    if (cached)
        return cached;
    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!match)
        throw new Error("Unsupported data URL");
    const bytes = base64ToBytes(match[1]);
    const hash = figma.createImage(bytes).hash;
    imageHashByDataUrl.set(dataUrl, hash);
    return hash;
}
function imagePaintFromFill(layer) {
    if (!layer.dataUrl)
        return null;
    let scaleMode = "FILL";
    if (layer.size === "contain")
        scaleMode = "FIT";
    else if (layer.size === "cover")
        scaleMode = "FILL";
    else if (layer.repeat && layer.repeat !== "no-repeat")
        scaleMode = "TILE";
    return { type: "IMAGE", imageHash: imageHashFromDataUrl(layer.dataUrl), scaleMode };
}
function imagePaintFromImage(image) {
    if (!image.dataUrl)
        return null;
    const mode = image.mode || "fill";
    let scaleMode = "FILL";
    if (mode === "contain" || mode === "fit")
        scaleMode = "FIT";
    else if (mode === "cover")
        scaleMode = "FILL";
    else if (mode === "none")
        scaleMode = "CROP";
    return { type: "IMAGE", imageHash: imageHashFromDataUrl(image.dataUrl), scaleMode };
}
// ─────────────────────────── borders ───────────────────────────
function bordersUniform(b) {
    if (!b)
        return null;
    if (b.gaps && b.gaps.length)
        return null;
    const sides = [b.top, b.right, b.bottom, b.left].filter(Boolean);
    if (!sides.length)
        return null;
    const first = sides[0];
    const allSame = sides.every((s) => s.color === first.color &&
        s.style === first.style);
    return allSame ? first : null;
}
function buildBorderOutlineSvg(width, height, paint) {
    var _a, _b, _c, _d, _e, _f;
    const b = paint.borders;
    if (!b)
        return null;
    const corners = paint.cornerRadii;
    // Use inset = strokeWidth / 2 so the stroke sits inside the node bounds.
    const r = corners
        ? Math.max(corners.topLeft.x, corners.topRight.x, corners.bottomRight.x, corners.bottomLeft.x)
        : 0;
    const sw = Math.max(((_a = b.top) === null || _a === void 0 ? void 0 : _a.width) || 0, ((_b = b.right) === null || _b === void 0 ? void 0 : _b.width) || 0, ((_c = b.bottom) === null || _c === void 0 ? void 0 : _c.width) || 0, ((_d = b.left) === null || _d === void 0 ? void 0 : _d.width) || 0);
    const inset = sw / 2;
    const color = ((_e = (b.top || b.right || b.bottom || b.left)) === null || _e === void 0 ? void 0 : _e.color) || "black";
    const style = ((_f = (b.top || b.right || b.bottom || b.left)) === null || _f === void 0 ? void 0 : _f.style) || "solid";
    const cornerR = Math.max(0, Math.min(r, width / 2 - 1, height / 2 - 1));
    // Build sequenced path with optional gaps on the top side. We support gaps
    // only on top in the schema right now; extend as needed.
    const gaps = (b.gaps || []).filter((g) => g.side === "top").sort((a, b2) => a.from - b2.from);
    // If there are no gaps and borders are uniform we don't need a vector outline.
    if (gaps.length === 0 && bordersUniform(b))
        return null;
    const cmds = [];
    cmds.push(`M ${inset} ${inset + cornerR}`);
    cmds.push(`A ${cornerR} ${cornerR} 0 0 1 ${inset + cornerR} ${inset}`);
    // Top edge with possible gaps
    let cursor = inset + cornerR;
    for (const g of gaps) {
        const from = Math.max(cursor, g.from);
        const to = Math.min(width - inset - cornerR, g.to);
        if (to <= from)
            continue;
        cmds.push(`L ${from} ${inset}`);
        cmds.push(`M ${to} ${inset}`);
        cursor = to;
    }
    cmds.push(`L ${width - inset - cornerR} ${inset}`);
    cmds.push(`A ${cornerR} ${cornerR} 0 0 1 ${width - inset} ${inset + cornerR}`);
    cmds.push(`L ${width - inset} ${height - inset - cornerR}`);
    cmds.push(`A ${cornerR} ${cornerR} 0 0 1 ${width - inset - cornerR} ${height - inset}`);
    cmds.push(`L ${inset + cornerR} ${height - inset}`);
    cmds.push(`A ${cornerR} ${cornerR} 0 0 1 ${inset} ${height - inset - cornerR}`);
    cmds.push(`Z`);
    let dashAttr = "";
    if (style === "dashed") {
        const dash = Math.max(2, Math.round(sw * 3));
        dashAttr = ` stroke-dasharray="${dash} ${dash}"`;
    }
    else if (style === "dotted") {
        const dot = Math.max(1, Math.round(sw));
        const gap = Math.max(2, Math.round(sw * 2));
        dashAttr = ` stroke-dasharray="${dot} ${gap}" stroke-linecap="round"`;
    }
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><path d="${cmds.join(" ")}" fill="none" stroke="${color}" stroke-width="${sw}"${dashAttr}/></svg>`;
}
// ─────────────────────────── shadows / filters ───────────────────────────
function effectsFromPaint(paint) {
    const out = [];
    for (const s of paint.shadows || []) {
        const c = parseColor(s.color);
        const eff = {
            type: s.inset ? "INNER_SHADOW" : "DROP_SHADOW",
            color: { r: c.r, g: c.g, b: c.b, a: c.a },
            offset: { x: snap(s.offsetX), y: snap(s.offsetY) },
            radius: Math.max(0, snap(s.blur)),
            spread: snap(s.spread),
            blendMode: "NORMAL",
            visible: true
        };
        out.push(eff);
    }
    for (const f of paint.filters || []) {
        if (f.kind === "blur") {
            out.push({
                type: "LAYER_BLUR",
                radius: Math.max(0, snap(f.valuePx)),
                visible: true
            });
        }
        else if (f.kind === "drop-shadow") {
            const c = parseColor(f.shadow.color);
            out.push({
                type: "DROP_SHADOW",
                color: { r: c.r, g: c.g, b: c.b, a: c.a },
                offset: { x: snap(f.shadow.offsetX), y: snap(f.shadow.offsetY) },
                radius: Math.max(0, snap(f.shadow.blur)),
                spread: snap(f.shadow.spread),
                blendMode: "NORMAL",
                visible: true
            });
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
// ─────────────────────────── fonts ───────────────────────────
let availableFonts = null;
async function listFonts() {
    availableFonts !== null && availableFonts !== void 0 ? availableFonts : (availableFonts = figma.listAvailableFontsAsync());
    return availableFonts;
}
function weightToStyle(weight, italic) {
    let base;
    if (weight >= 900)
        base = "Black";
    else if (weight >= 800)
        base = "Extra Bold";
    else if (weight >= 700)
        base = "Bold";
    else if (weight >= 600)
        base = "Semi Bold";
    else if (weight >= 500)
        base = "Medium";
    else if (weight >= 400)
        base = "Regular";
    else if (weight >= 300)
        base = "Light";
    else if (weight >= 200)
        base = "Extra Light";
    else
        base = "Thin";
    return italic ? `${base} Italic` : base;
}
async function resolveFont(text) {
    var _a;
    const family = ((_a = text.font.family.split(",")[0]) === null || _a === void 0 ? void 0 : _a.replace(/['"]/g, "").trim()) || "Inter";
    const italic = text.font.style === "italic" || text.font.style === "oblique";
    const desired = weightToStyle(text.font.weight || 400, italic);
    const fonts = await listFonts();
    const exact = fonts.find((f) => f.fontName.family === family && f.fontName.style === desired);
    if (exact)
        return exact.fontName;
    const family404 = fonts.find((f) => f.fontName.family === family);
    if (family404)
        return family404.fontName;
    if (/roboto/i.test(family)) {
        const roboto = fonts.find((f) => f.fontName.family === "Roboto" && f.fontName.style === desired) ||
            fonts.find((f) => f.fontName.family === "Roboto" && f.fontName.style === "Regular");
        if (roboto)
            return roboto.fontName;
    }
    const inter = fonts.find((f) => f.fontName.family === "Inter" && f.fontName.style === desired)
        || fonts.find((f) => f.fontName.family === "Inter" && f.fontName.style === "Regular");
    if (inter)
        return inter.fontName;
    return { family: "Inter", style: "Regular" };
}
async function preloadFonts(root, missing) {
    const fontNames = new Map();
    async function walk(layer) {
        if (layer.text) {
            try {
                const fn = await resolveFont(layer.text);
                fontNames.set(`${fn.family}:${fn.style}`, fn);
            }
            catch {
                // skip
            }
        }
        for (const c of layer.children || [])
            await walk(c);
    }
    await walk(root);
    await Promise.all(Array.from(fontNames.values()).map(async (fn) => {
        try {
            await figma.loadFontAsync(fn);
        }
        catch {
            missing.add(`${fn.family} ${fn.style}`);
        }
    }));
}
// ─────────────────────────── transforms ───────────────────────────
function applyTransform(node, layer) {
    var _a;
    if (!("relativeTransform" in node))
        return;
    const x = snap(layer.box.x);
    const y = snap(layer.box.y);
    const t = (_a = layer.transform) === null || _a === void 0 ? void 0 : _a.matrix;
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
        node.x = x;
        node.y = y;
        return;
    }
    node.x = x;
    node.y = y;
}
function isIdentity(m) {
    return (Math.abs(m[0] - 1) < 1e-6 &&
        Math.abs(m[1]) < 1e-6 &&
        Math.abs(m[2]) < 1e-6 &&
        Math.abs(m[3] - 1) < 1e-6 &&
        Math.abs(m[4]) < 1e-6 &&
        Math.abs(m[5]) < 1e-6);
}
// ─────────────────────────── fills ───────────────────────────
function buildFills(paint) {
    var _a;
    if (!((_a = paint === null || paint === void 0 ? void 0 : paint.fills) === null || _a === void 0 ? void 0 : _a.length))
        return undefined;
    const out = [];
    // Schema order is back-to-front (array order). Figma's `fills` paints in the
    // SAME order: index 0 paints first (behind), last index paints last (front).
    for (const f of paint.fills) {
        if (f.kind === "color") {
            out.push(solidPaint(f.color));
        }
        else if (f.kind === "linear-gradient" || f.kind === "radial-gradient" || f.kind === "conic-gradient") {
            const p = gradientPaint(f);
            if (p)
                out.push(p);
        }
        else if (f.kind === "image") {
            const p = imagePaintFromFill(f);
            if (p)
                out.push(p);
        }
    }
    return out;
}
// ─────────────────────────── corner radii ───────────────────────────
function applyCornerRadii(node, paint) {
    if (!(paint === null || paint === void 0 ? void 0 : paint.cornerRadii))
        return;
    if (!("topLeftRadius" in node))
        return;
    const c = paint.cornerRadii;
    node.topLeftRadius = snap(c.topLeft.x);
    node.topRightRadius = snap(c.topRight.x);
    node.bottomRightRadius = snap(c.bottomRight.x);
    node.bottomLeftRadius = snap(c.bottomLeft.x);
}
// ─────────────────────────── borders ───────────────────────────
function applyBorders(node, paint, width, height) {
    var _a, _b, _c, _d;
    if (!(paint === null || paint === void 0 ? void 0 : paint.borders))
        return null;
    const uniform = bordersUniform(paint.borders);
    const sides = paint.borders;
    if (uniform && (!("strokes" in node))) {
        return null;
    }
    if (uniform && "strokes" in node) {
        node.strokes = [solidPaint(uniform.color)];
        if ("strokeAlign" in node)
            node.strokeAlign = "INSIDE";
        // Per-side widths (Figma natively supports this on rect+frame).
        if ("strokeTopWeight" in node) {
            const f = node;
            f.strokeTopWeight = snap(((_a = sides.top) === null || _a === void 0 ? void 0 : _a.width) || 0);
            f.strokeRightWeight = snap(((_b = sides.right) === null || _b === void 0 ? void 0 : _b.width) || 0);
            f.strokeBottomWeight = snap(((_c = sides.bottom) === null || _c === void 0 ? void 0 : _c.width) || 0);
            f.strokeLeftWeight = snap(((_d = sides.left) === null || _d === void 0 ? void 0 : _d.width) || 0);
            // strokeWeight is required even when individuals set.
            node.strokeWeight = snap(uniform.width);
        }
        else {
            node.strokeWeight = snap(uniform.width);
        }
        if ("dashPattern" in node) {
            if (uniform.style === "dashed") {
                const d = Math.max(2, Math.round(uniform.width * 3));
                node.dashPattern = [d, d];
            }
            else if (uniform.style === "dotted") {
                const dot = Math.max(1, Math.round(uniform.width));
                const gap = Math.max(2, Math.round(uniform.width * 2));
                node.dashPattern = [dot, gap];
            }
            else {
                node.dashPattern = [];
            }
        }
        return null;
    }
    // Gaps or per-side mismatch → emit a vector outline overlay.
    const svg = buildBorderOutlineSvg(width, height, paint);
    if (!svg)
        return null;
    const vector = figma.createNodeFromSvg(svg);
    vector.name = "__border";
    vector.x = 0;
    vector.y = 0;
    return vector;
}
// ─────────────────────────── vector reconstruction ───────────────────────────
function escapeAttr(v) {
    return v.replace(/"/g, "&quot;").replace(/&/g, "&amp;");
}
function shapeToSvg(shape) {
    var _a, _b;
    const attrs = [];
    for (const [k, v] of Object.entries(shape.attrs || {})) {
        attrs.push(`${k}="${escapeAttr(String(v))}"`);
    }
    const p = shape.paint;
    if (p) {
        if (p.fill !== undefined)
            attrs.push(`fill="${escapeAttr(String(p.fill))}"`);
        if (p.stroke !== undefined)
            attrs.push(`stroke="${escapeAttr(String(p.stroke))}"`);
        if (p.strokeWidth !== undefined)
            attrs.push(`stroke-width="${p.strokeWidth}"`);
        if (p.dashArray && p.dashArray.length)
            attrs.push(`stroke-dasharray="${p.dashArray.join(" ")}"`);
        if (p.dashOffset !== undefined)
            attrs.push(`stroke-dashoffset="${p.dashOffset}"`);
        if (p.lineCap)
            attrs.push(`stroke-linecap="${p.lineCap}"`);
        if (p.lineJoin)
            attrs.push(`stroke-linejoin="${p.lineJoin}"`);
        if (p.fillRule)
            attrs.push(`fill-rule="${p.fillRule}"`);
        if (p.opacity !== undefined)
            attrs.push(`opacity="${p.opacity}"`);
        if (p.fillOpacity !== undefined)
            attrs.push(`fill-opacity="${p.fillOpacity}"`);
        if (p.strokeOpacity !== undefined)
            attrs.push(`stroke-opacity="${p.strokeOpacity}"`);
    }
    if ((_a = shape.transform) === null || _a === void 0 ? void 0 : _a.matrix) {
        const m = shape.transform.matrix;
        attrs.push(`transform="matrix(${m.join(" ")})"`);
    }
    const tag = shape.primitive === "group" ? "g" : shape.primitive === "text" ? "text" : shape.primitive;
    if (shape.primitive === "group") {
        const inner = (shape.shapes || []).map(shapeToSvg).join("");
        return `<g ${attrs.join(" ")}>${inner}</g>`;
    }
    if (shape.primitive === "text") {
        const txt = ((_b = shape.text) === null || _b === void 0 ? void 0 : _b.value) || "";
        return `<text ${attrs.join(" ")}>${txt}</text>`;
    }
    return `<${tag} ${attrs.join(" ")} />`;
}
function reconstructSvg(vector, box) {
    const vb = vector.viewBox || { x: 0, y: 0, width: box.width, height: box.height };
    const par = vector.preserveAspectRatio ? ` preserveAspectRatio="${vector.preserveAspectRatio}"` : "";
    const body = vector.shapes.map(shapeToSvg).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}"${par}>${body}</svg>`;
}
function createVectorNode(layer) {
    const v = layer.vector;
    const w = Math.max(1, snap(layer.box.width));
    const h = Math.max(1, snap(layer.box.height));
    const svg = reconstructSvg(v, { width: w, height: h });
    const node = figma.createNodeFromSvg(svg);
    node.resize(w, h);
    return node;
}
// ─────────────────────────── images ───────────────────────────
function createImageNode(layer) {
    var _a;
    const r = figma.createRectangle();
    const w = Math.max(1, snap(layer.box.width));
    const h = Math.max(1, snap(layer.box.height));
    r.resize(w, h);
    const paint = imagePaintFromImage(layer.image);
    r.fills = paint
        ? [paint]
        : [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
    if ((_a = layer.paint) === null || _a === void 0 ? void 0 : _a.cornerRadii)
        applyCornerRadii(r, layer.paint);
    return r;
}
// ─────────────────────────── text ───────────────────────────
async function createTextNode(layer) {
    var _a, _b;
    const text = layer.text;
    const fontName = await resolveFont(text);
    await figma.loadFontAsync(fontName);
    const t = figma.createText();
    t.fontName = fontName;
    t.characters = text.value;
    t.fontSize = Math.max(1, snap(text.font.size));
    if (text.letterSpacing !== undefined && text.letterSpacing !== 0) {
        t.letterSpacing = { unit: "PIXELS", value: snap(text.letterSpacing) };
    }
    if (text.lineHeight !== undefined && text.lineHeight > 0) {
        t.lineHeight = { unit: "PIXELS", value: snap(text.lineHeight) };
    }
    const align = text.align === "center"
        ? "CENTER"
        : text.align === "right" || text.align === "end"
            ? "RIGHT"
            : text.align === "justify"
                ? "JUSTIFIED"
                : "LEFT";
    t.textAlignHorizontal = align;
    t.fills = [solidPaint(text.color)];
    if ((_a = text.decoration) === null || _a === void 0 ? void 0 : _a.lines.includes("underline"))
        t.textDecoration = "UNDERLINE";
    else if ((_b = text.decoration) === null || _b === void 0 ? void 0 : _b.lines.includes("line-through"))
        t.textDecoration = "STRIKETHROUGH";
    if (text.transform && text.transform !== "none") {
        const map = {
            uppercase: "UPPER",
            lowercase: "LOWER",
            capitalize: "TITLE"
        };
        t.textCase = (map[text.transform] || "ORIGINAL");
    }
    // Resize to the measured box so text wraps the same way it did in the DOM.
    t.textAutoResize = "NONE";
    t.resize(Math.max(1, snap(layer.box.width)), Math.max(1, snap(layer.box.height)));
    return t;
}
// ─────────────────────────── visibility ───────────────────────────
function isLayerVisible(layer) {
    var _a, _b;
    if (((_a = layer.paint) === null || _a === void 0 ? void 0 : _a.visibility) === "hidden" || ((_b = layer.paint) === null || _b === void 0 ? void 0 : _b.visibility) === "collapse")
        return false;
    return true;
}
// ─────────────────────────── main builder ───────────────────────────
async function buildLayer(layer) {
    var _a, _b, _c, _d, _e;
    if (!isLayerVisible(layer))
        return null;
    let node;
    if (layer.text && (!layer.children || layer.children.length === 0)) {
        // Pure text leaf — produce a TextNode and let the parent paint behind it.
        node = await createTextNode(layer);
    }
    else if (layer.vector) {
        node = createVectorNode(layer);
    }
    else if (layer.image) {
        node = createImageNode(layer);
    }
    else {
        const f = figma.createFrame();
        f.layoutMode = "NONE";
        f.clipsContent = ((_b = (_a = layer.layout) === null || _a === void 0 ? void 0 : _a.overflow) === null || _b === void 0 ? void 0 : _b.x) === "hidden" || ((_d = (_c = layer.layout) === null || _c === void 0 ? void 0 : _c.overflow) === null || _d === void 0 ? void 0 : _d.y) === "hidden" || false;
        node = f;
    }
    node.name = layer.name || layer.source.tag || "layer";
    if ("resize" in node && node.type !== "TEXT") {
        node.resize(Math.max(1, snap(layer.box.width)), Math.max(1, snap(layer.box.height)));
    }
    applyTransform(node, layer);
    // Paint: fills / radii / borders / shadows / opacity / blend
    if (layer.paint) {
        const paint = layer.paint;
        if ("fills" in node && ((_e = paint.fills) === null || _e === void 0 ? void 0 : _e.length)) {
            const fills = buildFills(paint);
            if (fills) {
                // For text nodes we already set fills to the text color; keep that and
                // do NOT overwrite with background-color fills.
                if (node.type !== "TEXT") {
                    node.fills = fills;
                }
            }
        }
        if (node.type !== "TEXT")
            applyCornerRadii(node, paint);
        if ("effects" in node) {
            const effects = effectsFromPaint(paint);
            if (effects.length)
                node.effects = effects;
        }
        if (paint.opacity !== undefined && "opacity" in node) {
            node.opacity = Math.max(0, Math.min(1, paint.opacity));
        }
        if (paint.blendMode && paint.blendMode !== "normal" && "blendMode" in node) {
            const bm = paint.blendMode.toUpperCase().replace(/-/g, "_");
            try {
                node.blendMode = bm;
            }
            catch {
                // Unsupported blend modes are silently skipped.
            }
        }
    }
    // Borders: native individualStrokes OR vector overlay for gaps.
    const borderOverlay = applyBorders(node, layer.paint, layer.box.width, layer.box.height);
    // Recurse children before the border overlay so the overlay paints on top.
    if (layer.children && "appendChild" in node) {
        for (const child of layer.children) {
            const childNode = await buildLayer(child);
            if (childNode)
                node.appendChild(childNode);
        }
    }
    if (borderOverlay && "appendChild" in node) {
        node.appendChild(borderOverlay);
    }
    return node;
}
export async function renderDocumentV2(doc) {
    var _a;
    const missing = new Set();
    await preloadFonts(doc.root, missing);
    if (missing.size && doc.diagnostics) {
        const list = (_a = doc.diagnostics.missingFonts) !== null && _a !== void 0 ? _a : [];
        for (const m of missing)
            list.push(m);
        doc.diagnostics.missingFonts = list;
    }
    const root = await buildLayer(doc.root);
    if (!root)
        throw new Error("Root layer produced no node");
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
    }
    else {
        canvas.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    }
    root.x = padding;
    root.y = padding;
    canvas.appendChild(root);
    return canvas;
}
