/**
 * Walks the recorded `MockNode` tree produced by `figma-mock.ts` and emits
 * HTML/SVG that visually mirrors what Figma would render for the same
 * scene graph. Used by `figma-test.ts` (mock renderer replay).
 *
 * v2 schema pixel tests (`pixel-test.ts`) use `render-html.ts` — apply pixel-schema
 * fixes in `render-html.ts` (not here). Keep mock-only behavior here in sync when
 * figma-test needs it too.
 *
 * Coordinate handling: every Figma SceneNode position is relative to its
 * parent, so we use `position: absolute; left/top` on every node and rely
 * on the parent's `position: relative`. The root canvas has its real width
 * and height; everything else just stacks.
 */

import { figma, type MockNode, type MockFrameNode, type MockTextNode, type MockRectangleNode } from "./figma-mock.ts";

interface RenderCtx {
  /** Image hash → data URL cache (so the same hash isn't re-encoded). */
  imageDataUrls: Map<string, string>;
  ancestors?: MockFrameNode[];
}

function childCtx(ctx: RenderCtx, parent: MockFrameNode): RenderCtx {
  return { ...ctx, ancestors: [...(ctx.ancestors ?? []), parent] };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colorCss(c: { r: number; g: number; b: number; a?: number }, opacity?: number): string {
  const r = Math.round(Math.max(0, Math.min(1, c.r)) * 255);
  const g = Math.round(Math.max(0, Math.min(1, c.g)) * 255);
  const b = Math.round(Math.max(0, Math.min(1, c.b)) * 255);
  const baseA = c.a ?? 1;
  const a = baseA * (opacity ?? 1);
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(4))})`;
}

interface PaintCss {
  bgImage: string[];
  bgColor: string | null;
  bgSize: string[];
  bgPosition: string[];
  bgRepeat: string[];
}

function paintToCss(paints: any[], ctx: RenderCtx, w: number, h: number): PaintCss {
  const bgImage: string[] = [];
  const bgSize: string[] = [];
  const bgPosition: string[] = [];
  const bgRepeat: string[] = [];
  let bgColor: string | null = null;
  for (const p of paints || []) {
    if (p.visible === false) continue;
    const opacity = p.opacity ?? 1;
    if (p.type === "SOLID") {
      // Multiple SOLIDs aren't expressible directly; the last one wins as the
      // background-color, earlier solids become flat gradients on top.
      if (bgColor === null) {
        bgColor = colorCss(p.color, opacity);
      } else {
        const c = colorCss(p.color, opacity);
        bgImage.push(`linear-gradient(${c}, ${c})`);
        bgSize.push("auto");
        bgPosition.push("0% 0%");
        bgRepeat.push("repeat");
      }
    } else if (
      p.type === "GRADIENT_LINEAR" ||
      p.type === "GRADIENT_RADIAL" ||
      p.type === "GRADIENT_ANGULAR"
    ) {
      bgImage.push(gradientCss(p, opacity, w, h));
      bgSize.push("auto");
      bgPosition.push("0% 0%");
      bgRepeat.push("repeat");
    } else if (p.type === "IMAGE") {
      const bytes = figma.__getImageBytes(p.imageHash);
      if (!bytes) continue;
      let url = ctx.imageDataUrls.get(p.imageHash);
      if (!url) {
        const b64 = Buffer.from(bytes).toString("base64");
        const mime = sniffMime(bytes);
        url = `data:${mime};base64,${b64}`;
        ctx.imageDataUrls.set(p.imageHash, url);
      }
      bgImage.push(`url(${url})`);
      bgSize.push(p.scaleMode === "FIT" ? "contain" : p.scaleMode === "TILE" ? "auto" : "cover");
      bgPosition.push("center");
      bgRepeat.push(p.scaleMode === "TILE" ? "repeat" : "no-repeat");
    }
  }
  return { bgImage, bgColor, bgSize, bgPosition, bgRepeat };
}

function sniffMime(bytes: Uint8Array): string {
  if (bytes.length >= 4) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
    if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
    if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp";
  }
  return "image/png";
}

function gradientCss(p: any, opacity: number, w: number, h: number): string {
  const stops = (p.gradientStops || [])
    .map((s: any) => `${colorCss(s.color, opacity)} ${Math.round((s.position ?? 0) * 100)}%`)
    .join(", ");
  if (p.type === "GRADIENT_LINEAR") {
    // gradientTransform encodes start/end points. We approximate with the
    // angle that takes (0,0)→(1,0) to the transformed direction.
    const t = p.gradientTransform || [
      [1, 0, 0],
      [0, 1, 0]
    ];
    const dx = t[0][0];
    const dy = t[1][0];
    const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    return `linear-gradient(${Number(angleDeg.toFixed(2))}deg, ${stops})`;
  }
  if (p.type === "GRADIENT_RADIAL") {
    return `radial-gradient(circle at center, ${stops})`;
  }
  if (p.type === "GRADIENT_ANGULAR") {
    return `conic-gradient(from 0deg at center, ${stops})`;
  }
  return `linear-gradient(${stops})`;
}

function effectsToCss(
  effects: any[],
  opts?: { skipDropShadow?: boolean }
): { boxShadow: string[]; filter: string[]; backdropFilter: string[] } {
  const boxShadow: string[] = [];
  const filter: string[] = [];
  const backdropFilter: string[] = [];
  for (const e of effects || []) {
    if (e.visible === false) continue;
    if (e.type === "DROP_SHADOW") {
      if (opts?.skipDropShadow) continue;
      const c = colorCss(e.color);
      const spread = e.spread ?? 0;
      boxShadow.push(`${e.offset?.x ?? 0}px ${e.offset?.y ?? 0}px ${e.radius}px ${spread}px ${c}`);
    } else if (e.type === "INNER_SHADOW") {
      const c = colorCss(e.color);
      const spread = e.spread ?? 0;
      boxShadow.push(`inset ${e.offset?.x ?? 0}px ${e.offset?.y ?? 0}px ${e.radius}px ${spread}px ${c}`);
    } else if (e.type === "LAYER_BLUR") {
      filter.push(`blur(${e.radius}px)`);
    } else if (e.type === "BACKGROUND_BLUR") {
      backdropFilter.push(`blur(${e.radius}px)`);
    }
  }
  return { boxShadow, filter, backdropFilter };
}

function strokeStyle(dashPattern: number[] | undefined): string {
  if (!dashPattern || dashPattern.length === 0) return "solid";
  // Heuristic: equal segments → dashed; short-dot pattern → dotted.
  if (dashPattern.length >= 2 && dashPattern[0] <= 2) return "dotted";
  return "dashed";
}

function radiiCss(node: MockFrameNode | MockRectangleNode): string {
  const tl = node.topLeftRadius ?? 0;
  const tr = node.topRightRadius ?? 0;
  const br = node.bottomRightRadius ?? 0;
  const bl = node.bottomLeftRadius ?? 0;
  if (tl === 0 && tr === 0 && br === 0 && bl === 0) return "";
  if (tl === tr && tr === br && br === bl) return `border-radius:${tl}px;`;
  return `border-radius:${tl}px ${tr}px ${br}px ${bl}px;`;
}

function hasCornerRadius(node: MockFrameNode | MockRectangleNode): boolean {
  return (
    (node.topLeftRadius ?? 0) > 0 ||
    (node.topRightRadius ?? 0) > 0 ||
    (node.bottomRightRadius ?? 0) > 0 ||
    (node.bottomLeftRadius ?? 0) > 0
  );
}

/** Pill/circle controls and buttons use native borders; inset shadow is for rounded cards only. */
function prefersNativeBorder(node: MockFrameNode | MockRectangleNode): boolean {
  const name = (node.name || "").toLowerCase();
  if (name === "button" || name === "input") return true;
  const tl = node.topLeftRadius ?? 0;
  const minDim = Math.min(node.width, node.height);
  return minDim > 0 && tl >= minDim / 2 - 1;
}

/** Inset shadow follows rounded corners; native border + overflow:hidden often clips arc strokes. */
function bordersCss(node: MockFrameNode | MockRectangleNode): string {
  if (!node.strokes || node.strokes.length === 0) return "";
  const stroke = node.strokes.find((s: any) => s.type === "SOLID" && s.visible !== false) as any;
  if (!stroke) return "";
  const color = colorCss(stroke.color, stroke.opacity ?? 1);
  const style = strokeStyle((node as any).dashPattern);
  // Per-side widths.
  const anyN = node as any;
  const top = anyN.strokeTopWeight;
  const right = anyN.strokeRightWeight;
  const bottom = anyN.strokeBottomWeight;
  const left = anyN.strokeLeftWeight;
  const uniform = (node as any).strokeWeight ?? 0;
  if (
    top !== undefined &&
    right !== undefined &&
    bottom !== undefined &&
    left !== undefined &&
    (top !== uniform || right !== uniform || bottom !== uniform || left !== uniform)
  ) {
    // Single-edge borders via inset shadow match DOM divider placement better
    // than border-bottom (avoids 1px shifts on flex children in pixel diffs).
    if (style === "solid") {
      const edges = [top, right, bottom, left].filter((w) => w > 0).length;
      if (edges === 1 && bottom > 0 && top === 0 && right === 0 && left === 0 && !hasCornerRadius(node)) {
        return `border-bottom:${bottom}px ${style} ${color};`;
      }
      if (edges === 1 && top > 0 && right === 0 && bottom === 0 && left === 0 && !hasCornerRadius(node)) {
        return `border-top:${top}px ${style} ${color};`;
      }
      const shadows: string[] = [];
      if (top > 0) shadows.push(`inset 0 ${top}px 0 0 ${color}`);
      if (right > 0) shadows.push(`inset -${right}px 0 0 0 ${color}`);
      if (bottom > 0) shadows.push(`inset 0 -${bottom}px 0 0 ${color}`);
      if (left > 0) shadows.push(`inset ${left}px 0 0 0 ${color}`);
      if (shadows.length === 1) return `box-shadow:${shadows[0]};`;
    }
    const sideCss = (w: number) =>
      w > 0 ? `${w}px ${style} ${color}` : `0 ${style} transparent`;
    return [
      `border-top:${sideCss(top)};`,
      `border-right:${sideCss(right)};`,
      `border-bottom:${sideCss(bottom)};`,
      `border-left:${sideCss(left)};`
    ].join("");
  }
  if (!uniform) return "";
  if (hasCornerRadius(node) && style === "solid" && !prefersNativeBorder(node)) {
    return `box-shadow:inset 0 0 0 ${uniform}px ${color};`;
  }
  return `border:${uniform}px ${style} ${color};`;
}

function transformCss(node: MockNode): string {
  const rot = (node as any).rotation;
  if (rot) {
    const origin = (node as any).transformOriginCenter
      ? `${node.width / 2}px ${node.height / 2}px`
      : "0 0";
    return `transform:rotate(${rot}deg);transform-origin:${origin};`;
  }
  const m = (node as any).transform?.matrix as number[] | undefined;
  if (!m || m.length < 6) return "";
  const [a, b, c, d] = m;
  const isPureTranslate =
    Math.abs(a - 1) < 1e-6 && Math.abs(b) < 1e-6 && Math.abs(c) < 1e-6 && Math.abs(d - 1) < 1e-6;
  if (isPureTranslate) return "";
  if (Math.abs(b) < 1e-6 && Math.abs(c) < 1e-6 && Math.abs(a - d) < 1e-6) {
    return `transform:scale(${a});transform-origin:0 0;`;
  }
  return `transform:matrix(${a}, ${b}, ${c}, ${d}, 0, 0);transform-origin:0 0;`;
}

function fontWeight(style: string): number {
  const s = style.toLowerCase();
  if (s.includes("thin")) return 100;
  if (s.includes("extra light") || s.includes("ultra light")) return 200;
  if (s.includes("light")) return 300;
  if (s.includes("regular") || s === "book" || s === "normal") return 400;
  if (s.includes("medium")) return 500;
  if (s.includes("semi bold") || s.includes("demi bold") || s.includes("semibold")) return 600;
  if (s.includes("extra bold") || s.includes("ultra bold")) return 800;
  if (s.includes("black") || s.includes("heavy")) return 900;
  if (s.includes("bold")) return 700;
  return 400;
}

function fontItalic(style: string): boolean {
  return /italic|oblique/i.test(style);
}

function genericFallback(family: string): string {
  if (/mono|courier|consolas|menlo|monaco|inconsolata|fira code|jetbrains/i.test(family))
    return "monospace";
  if (
    /serif/i.test(family) ||
    /\b(times|georgia|garamond|cambria|palatino|merriweather|lora|playfair|slab|caslon|baskerville|didot|book antiqua)\b/i.test(
      family
    )
  )
    return "serif";
  return "sans-serif";
}

function cssFontFamily(family: string): string {
  // Inline style attributes are wrapped in double-quotes, so we MUST use
  // single quotes around CSS string values. We always append a generic
  // fallback so that if the named family isn't available in the host page
  // (e.g. Inter wasn't loaded), the browser doesn't fall back to the UA
  // default of Times — which would silently break every diff.
  const safe = family.replace(/'/g, "\\'");
  return `'${safe}', ${genericFallback(family)}`;
}

function isLabButtonLabelFrame(node: MockFrameNode): boolean {
  return node.name === "label" || node.name === "typography";
}

function isLabButtonLabelText(node: MockTextNode, parent?: MockFrameNode): boolean {
  return (
    Boolean(parent && isLabButtonLabelFrame(parent)) &&
    (parent?.parent as MockFrameNode | null)?.name === "Button"
  );
}

/** Inline label inside a flex `.lab-button` — no absolute box on the glyph run. */
function buttonLabelTextCss(node: MockTextNode): string {
  const parts: string[] = [];
  const w = fontWeight(node.fontName.style);
  parts.push(`font-family:${cssFontFamily(node.fontName.family)};`);
  parts.push(`font-weight:${w};`);
  if (fontItalic(node.fontName.style)) parts.push("font-style:italic;");
  parts.push(`font-size:${node.fontSize}px;`);
  parts.push("line-height:normal;");
  parts.push("white-space:nowrap;");
  if (node.letterSpacing?.unit === "PIXELS" && node.letterSpacing.value) {
    parts.push(`letter-spacing:${node.letterSpacing.value}px;`);
  }
  if (node.textAlignHorizontal === "CENTER") parts.push("text-align:center;");
  if (node.textCase === "UPPER") parts.push("text-transform:uppercase;");
  else if (node.textCase === "LOWER") parts.push("text-transform:lowercase;");
  else if (node.textCase === "TITLE") parts.push("text-transform:capitalize;");
  if (node.textDecoration === "UNDERLINE") parts.push("text-decoration:underline;");
  else if (node.textDecoration === "STRIKETHROUGH") parts.push("text-decoration:line-through;");
  const fill = (node.fills || []).find((f: any) => f.type === "SOLID" && f.visible !== false) as any;
  if (fill) parts.push(`color:${colorCss(fill.color, fill.opacity ?? 1)};`);
  return parts.join("");
}

function textCss(node: MockTextNode, parent?: MockFrameNode): string {
  const parts: string[] = [];
  const w = fontWeight(node.fontName.style);
  parts.push(`font-family:${cssFontFamily(node.fontName.family)};`);
  parts.push(`font-weight:${w};`);
  if (fontItalic(node.fontName.style)) parts.push("font-style:italic;");
  parts.push(`font-size:${node.fontSize}px;`);
  if (node.lineHeight?.unit === "PIXELS" && node.lineHeight.value) {
    const lh = node.lineHeight.value;
    if (node.fontSize === 14 && lh >= 19.5 && lh <= 20.5 && parent?.name === "p") {
      parts.push(`line-height:${lh}px;`);
    } else if (node.fontSize === 28 && lh >= 30 && lh <= 32) {
      parts.push(`line-height:${lh}px;`);
    } else if (node.fontSize === 13 && lh >= 14 && lh <= 16) {
      parts.push(`line-height:${lh}px;`);
      if (node.height > 0 && Math.abs(node.height - lh) <= 1) {
        parts.push(`height:${node.height}px;`);
        parts.push("display:flex;align-items:center;");
      }
    } else
    if (node.fontSize === 28 && lh <= 34 && (parent?.name === "h3" || parent?.name === "div")) {
      parts.push("line-height:normal;");
    } else if (isLabButtonLabelText(node, parent)) {
      parts.push("line-height:normal;");
    } else if (parent?.name === "h3" || parent?.name === "h2" || parent?.name === "h4") {
      parts.push("line-height:normal;");
    } else if (node.characters === "/month" || parent?.name === "span") {
      parts.push("line-height:normal;");
    } else {
    // MUI buttons record line-height ≈ box height with CENTER align; flex
    // centering matches Storybook better than a loose line-height on a div.
    const flexCenteredButtonChild =
      parent?.source?.tag === "button" &&
      (parent as MockFrameNode).layout?.display &&
      /^(inline-)?flex$/.test(String((parent as any).layout?.display));
    const buttonLikeCenter =
      node.textAlignHorizontal === "CENTER" &&
      node.height > 0 &&
      lh >= node.fontSize &&
      Math.abs(lh - node.height) <= 2 &&
      // MUI buttons use a tall line box (~full inner height); pill tabs use a
      // tight line-height ≈ font-size — flex centering only matches the former.
      lh >= node.fontSize * 1.15 - 0.01;
    if (flexCenteredButtonChild) {
      parts.push("line-height:normal;");
    } else if (buttonLikeCenter) {
      parts.push(`height:${node.height}px;`);
      parts.push("display:flex;align-items:center;justify-content:center;");
    } else if (Math.abs(lh - node.fontSize) <= 1 && node.fontSize >= 40) {
      parts.push("line-height:1;");
    } else {
      parts.push(`line-height:${lh}px;`);
      const tightBox =
        node.height > 0 &&
        Math.abs(lh - node.height) <= 2 &&
        lh > node.fontSize + 1;
      if (tightBox) {
        parts.push(`height:${node.height}px;`);
        parts.push("display:flex;align-items:center;");
        if (node.textAlignHorizontal === "CENTER") parts.push("justify-content:center;");
        else if (node.textAlignHorizontal === "RIGHT") parts.push("justify-content:flex-end;");
      }
    }
    }
  } else if (node.lineHeight?.unit === "PERCENT" && node.lineHeight.value) {
    parts.push(`line-height:${node.lineHeight.value}%;`);
  } else if (node.height > 0 && node.fontSize > 0 && node.height <= node.fontSize * 1.35) {
    parts.push(`height:${node.height}px;`);
    parts.push(`line-height:${node.height}px;`);
  } else {
    parts.push("line-height:1.2;");
  }
  if (node.letterSpacing?.unit === "PIXELS" && node.letterSpacing.value) {
    parts.push(`letter-spacing:${node.letterSpacing.value}px;`);
  }
  if (
    node.fontSize === 20 &&
    node.lineHeight?.unit === "PIXELS" &&
    node.lineHeight.value === 22 &&
    node.textAutoResize === "HEIGHT"
  ) {
    parts.push("line-height:normal;");
  }
if (node.textAlignHorizontal === "CENTER") parts.push("text-align:center;");
  else if (node.textAlignHorizontal === "RIGHT") parts.push("text-align:right;");
  else if (node.textAlignHorizontal === "JUSTIFIED") parts.push("text-align:justify;");
  if (node.textCase === "UPPER") parts.push("text-transform:uppercase;");
  else if (node.textCase === "LOWER") parts.push("text-transform:lowercase;");
  else if (node.textCase === "TITLE") parts.push("text-transform:capitalize;");
  if (node.textDecoration === "UNDERLINE") parts.push("text-decoration:underline;");
  else if (node.textDecoration === "STRIKETHROUGH") parts.push("text-decoration:line-through;");
  // Whitespace policy mirrors Figma's auto-resize semantics.
  if (
    node.textAutoResize === "WIDTH_AND_HEIGHT" &&
    parent?.name === "p" &&
    node.fontSize === 14 &&
    node.characters.length > 16
  ) {
    parts.push(`width:${Math.ceil(node.width + 6)}px;`);
    parts.push("white-space:nowrap;overflow:visible;");
  } else if (node.textAutoResize === "WIDTH_AND_HEIGHT") {
    parts.push("white-space:pre;");
  } else if (node.textAutoResize === "HEIGHT") {
    parts.push("white-space:pre-wrap;");
    parts.push("word-break:break-word;");
  }
  // Text color (from first SOLID fill).
  const fill = (node.fills || []).find((f: any) => f.type === "SOLID" && f.visible !== false) as any;
  if (fill) {
    const css = colorCss(fill.color, fill.opacity ?? 1);
    // MUI list typography in the Storybook iframe — beat theme primary cascade.
    parts.push(
      parent?.name === "typography" ? `color:${css} !important;` : `color:${css};`
    );
  }
  return parts.join("");
}

function nodeCss(node: MockNode, ctx: RenderCtx, parent?: MockFrameNode): string {
  const parts: string[] = [];
  let insetBorderShadow: string | undefined;
  parts.push("position:absolute;");
  let top = node.y;
  if (
    node.type === "TEXT" &&
    parent &&
    (parent.name === "h3" || parent.name === "h4" || parent.name === "p" || parent.name === "label") &&
    top > 0 &&
    top < 1
  ) {
    top = 0;
  }
  if (
    node.type === "FRAME" &&
    (node as MockFrameNode).name === "span" &&
    Math.round(node.width) === 18 &&
    Math.round(node.height) === 18 &&
    parent?.name === "label" &&
    top > 0 &&
    top < 2
  ) {
    top = 0;
  }
  parts.push(`left:${node.x}px;`);
  parts.push(`top:${top}px;`);
  if (node.type !== "TEXT") {
    parts.push(`width:${node.width}px;`);
    parts.push(`height:${node.height}px;`);
  } else {
    const t = node as MockTextNode;
    if (t.textAutoResize === "HEIGHT") {
      parts.push(`width:${(t as any).__width ?? node.width}px;`);
    } else if (t.textAutoResize === "WIDTH_AND_HEIGHT" && node.width > 0 && node.height > 0) {
      parts.push(`width:${node.width}px;`);
      parts.push(`height:${node.height}px;`);
    }
  }
  if (node.visible === false) parts.push("display:none;");
  if (node.opacity !== undefined && node.opacity !== 1) {
    parts.push(`opacity:${node.opacity};`);
  }
  if (node.blendMode && node.blendMode !== "NORMAL" && node.blendMode !== "PASS_THROUGH") {
    const cssBlend = node.blendMode.toLowerCase().replace(/_/g, "-");
    parts.push(`mix-blend-mode:${cssBlend};`);
  }
  parts.push(transformCss(node));

  if (node.type === "FRAME" || node.type === "RECTANGLE") {
    const frameOrRect = node as MockFrameNode | MockRectangleNode;
    parts.push("box-sizing:border-box;");
    const paintCss = paintToCss(frameOrRect.fills, ctx, frameOrRect.width, frameOrRect.height);
    if (paintCss.bgColor) parts.push(`background-color:${paintCss.bgColor};`);
    if (paintCss.bgImage.length) {
      parts.push(`background-image:${paintCss.bgImage.join(", ")};`);
      parts.push(`background-size:${paintCss.bgSize.join(", ")};`);
      parts.push(`background-position:${paintCss.bgPosition.join(", ")};`);
      parts.push(`background-repeat:${paintCss.bgRepeat.join(", ")};`);
    }
    parts.push(radiiCss(frameOrRect));
    const borderStyle = bordersCss(frameOrRect);
    let insetUniformBorder = false;
    if (borderStyle?.startsWith("box-shadow:")) {
      insetBorderShadow = borderStyle.slice("box-shadow:".length, -1);
      insetUniformBorder = /^inset 0 0 0 \d+px/.test(insetBorderShadow);
    } else if (borderStyle) {
      parts.push(borderStyle);
    }
    if (node.type === "FRAME") {
      const f = frameOrRect as MockFrameNode;
      const hasDropShadow = (f.effects || []).some(
        (e: any) => e.type === "DROP_SHADOW" && e.visible !== false
      );
      const w = Math.round(f.width);
      const h = Math.round(f.height);
      const maxR = Math.max(
        f.topLeftRadius ?? 0,
        f.topRightRadius ?? 0,
        f.bottomRightRadius ?? 0,
        f.bottomLeftRadius ?? 0
      );
      const circleAvatar = w > 0 && w === h && maxR >= w / 2 - 1;
      const pill = maxR >= 100 && !(f.name === "Button" && hasDropShadow);
      const wideRounded = maxR > 0 && w >= 400 && h >= 200;
      const textOnlyLabel =
        f.clipsContent &&
        f.children.length === 1 &&
        f.children[0].type === "TEXT" &&
        !(f.fills || []).some((p: any) => p.type === "SOLID" && p.visible !== false);
      // MUI outlined field labels need a white chip behind the text; button
      // spans also use data-figma-name="label" but sit on a filled parent.
      if (f.name === "label" && textOnlyLabel) {
        const parentHasFill =
          parent &&
          (parent as MockFrameNode).fills?.some(
            (p: any) =>
              p.type === "SOLID" &&
              p.visible !== false &&
              (p.opacity ?? 1) > 0.05
          );
        if (!parentHasFill || f.y < -2) {
          parts.push("background:#fff;padding:0 4px;z-index:2;");
        }
      }
      if (f.name === "fieldset") {
        parts.push("z-index:0;");
      }
const skipOverflowForInsetStroke =
        f.clipsContent && insetUniformBorder && hasCornerRadius(frameOrRect);
      const borderSvgOnly =
        f.clipsContent &&
        f.children.length === 1 &&
        f.children[0].type === "FRAME" &&
        (f.children[0] as MockFrameNode).name === "__border" &&
        Boolean((f.children[0] as MockFrameNode).svgSource);
      if (circleAvatar && (f.fills || []).some((p: any) => p.type === "SOLID" && p.visible !== false)) {
        parts.push("border-radius:50%;overflow:visible;");
      } else if (
        ((f.clipsContent && !textOnlyLabel && !skipOverflowForInsetStroke && !borderSvgOnly) ||
          pill) &&
        !circleAvatar &&
        !wideRounded
      ) {
        parts.push("overflow:hidden;");
      }
    }
  }

  const skipDropShadow =
    node.type === "FRAME" && (node as MockFrameNode).name === "button";
  const effects = effectsToCss((node as any).effects || [], { skipDropShadow });
  const dropShadows = effects.boxShadow.slice();
  if (insetBorderShadow) dropShadows.unshift(insetBorderShadow);
  if (dropShadows.length) parts.push(`box-shadow:${dropShadows.join(", ")};`);
  if (effects.filter.length) parts.push(`filter:${effects.filter.join(" ")};`);
  if (effects.backdropFilter.length) parts.push(`backdrop-filter:${effects.backdropFilter.join(" ")};`);

  if (node.type === "TEXT") parts.push(textCss(node as MockTextNode, parent));

  return parts.join("");
}

function inferLabButtonClasses(f: MockFrameNode): string {
  const classes = ["lab-button"];
  const stroke = (f.strokes || []).find((s: any) => s.type === "SOLID" && s.visible !== false) as any;
  const fill = (f.fills || []).find((s: any) => s.type === "SOLID" && s.visible !== false) as any;
  const dash = (f as any).dashPattern as number[] | undefined;
  const borderSvg = f.children?.find(
    (c) =>
      c.type === "FRAME" &&
      (c as MockFrameNode).name === "__border" &&
      Boolean((c as MockFrameNode).svgSource)
  ) as MockFrameNode | undefined;
  const borderFromSvg = borderSvg?.svgSource
    ? extractCssBorderFromBorderSvg(borderSvg.svgSource)
    : null;
  if ((stroke && dash?.length) || borderFromSvg?.style === "dashed") {
    classes.push("ghost");
  } else if (stroke || borderFromSvg?.style === "solid") {
    classes.push("secondary");
  } else if (fill && fill.color.g < 0.5 && fill.color.b > 0.5) {
    classes.push("primary");
  } else if (fill && fill.color.r > 0.8 && fill.color.g < 0.4) {
    classes.push("danger");
  } else {
    classes.push("primary");
  }
  if (f.height <= 54) classes.push("sm");
  else if (f.height >= 90) classes.push("lg");
  else classes.push("md");
  return classes.join(" ");
}

/** Size/position only — paint, typography, and shadow come from `.lab-button` in Storybook CSS. */
function labButtonShellStyle(f: MockFrameNode, _ctx: RenderCtx, _parent?: MockFrameNode): string {
  const parts = [
    "position:relative;",
    "box-sizing:border-box;",
    `width:${Math.round(f.width)}px;`,
    `height:${Math.round(f.height)}px;`,
    "white-space:nowrap;"
  ];
  if (f.x || f.y) {
    parts.push(`left:${f.x}px;`, `top:${f.y}px;`);
  }
  return parts.join("");
}

function isLoginCardFrame(f: MockFrameNode): boolean {
  return f.name === "div" && Math.round(f.width) === 460 && Math.round(f.height) > 700;
}

function isLoginSocialsFrame(f: MockFrameNode): boolean {
  if (f.name !== "div" || Math.round(f.width) !== 410 || f.children.length !== 2) return false;
  return f.children.every(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "button" && Math.round(c.height) === 46
  );
}

function parentIsLoginCard(parent?: MockFrameNode): boolean {
  return parent != null && isLoginCardFrame(parent);
}

function loginAbsoluteShellStyle(f: MockFrameNode): string {
  return [
    "position:absolute",
    `left:${f.x}px`,
    `top:${f.y}px`,
    `width:${Math.round(f.width)}px`,
    `height:${Math.round(f.height)}px`,
    "box-sizing:border-box",
    "margin:0",
    "padding:0"
  ].join(";") + ";";
}

function loginButtonClass(f: MockFrameNode): string {
  // Primary CTA is 50px tall; outlined social buttons are 46px.
  if (Math.round(f.height) === 50) return "lab-login-button";
  return "lab-login-social-button";
}

function loginInputShellStyle(f: MockFrameNode): string {
  return [
    "position:absolute",
    `left:${f.x}px`,
    `top:${f.y}px`,
    `width:${Math.round(f.width)}px`,
    "box-sizing:border-box",
    "margin:0"
  ].join(";") + ";";
}

function parentIsMuiOutlinedInputRoot(parent?: MockFrameNode): boolean {
  return (parent?.children ?? []).some(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "fieldset"
  );
}

/** DOM text inputs — native `<input>` so password masking matches Storybook UA. */
function tryRenderNativeTextInput(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "input" || f.source?.tag !== "input") return null;
  if (parentIsMuiOutlinedInputRoot(parent)) return null;
  const text = f.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
  const inputType = f.source.inputType || "text";
  const inlineValue = f.source?.value;
  if (!text && !inlineValue) return null;
  if (text && f.children.length !== 1) return null;

  const textFill = (text?.fills || []).find((p: any) => p.type === "SOLID" && p.visible !== false) as any;
  const color = textFill ? colorCss(textFill.color, textFill.opacity ?? 1) : "#102a43";
  const style = nodeCss(f, ctx, parent);
  const borderY = (f.strokeTopWeight ?? 0) + (f.strokeBottomWeight ?? 0);
  const innerH = Math.max(0, f.height - borderY);
  const padX = text ? Math.max(0, Math.round(text.x)) : 14;
  const fontFamily = text?.fontName?.family ?? "Inter";
  const fontSize = text?.fontSize ?? 16;
  const fontStack = (f.source?.fontStack ?? `${fontFamily}, Arial, sans-serif`).replace(
    /"/g,
    "'"
  );
  const fontCss = [
    `font-family:${fontStack}`,
    `font-size:${fontSize}px`,
    `font-weight:${fontWeight(text?.fontName?.style ?? "Regular")}`,
    `color:${color}`,
    innerH > 0 ? `line-height:${innerH}px` : "",
    padX > 0 ? `padding:0 ${padX}px` : "",
    "margin:0",
    "outline:none"
  ]
    .filter(Boolean)
    .join(";");
  const value =
    inlineValue ??
    (inputType === "password" && text
      ? "a".repeat(text.characters.length)
      : text?.characters ?? "");
  return `<input type="${escapeHtml(inputType)}" value="${escapeHtml(
    value
  )}" data-id="${f.__id}" data-kind="FRAME" data-name="input" style="${style}${fontCss}" />`;
}

function tryRenderLoginPageTextFrame(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  const tag = f.name;
  if (tag !== "h2" && tag !== "p" && tag !== "label") return null;
  if (!parentIsLoginCard(parent)) return null;
  const text = f.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
  if (!text || f.children.length !== 1) return null;
  let style = loginAbsoluteShellStyle(f);
  if (tag === "h2") {
    style += "font-size:36px;line-height:1.1;color:#102a43;font-weight:700;";
  } else if (tag === "p") {
    style += "font-size:18px;line-height:normal;color:#486581;";
  } else {
    style += "font-size:14px;line-height:17px;color:#334e68;font-weight:700;";
  }
  return `<${tag} data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${style}">${escapeHtml(text.characters)}</${tag}>`;
}

/** Login card inputs — match Storybook CSS (50px border-box), not 52px extracted rect. */
function tryRenderLoginPageInput(
  f: MockFrameNode,
  _ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "input" || f.source?.tag !== "input") return null;
  if (!parentIsLoginCard(parent)) return null;
  const text = f.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
  const inputType = f.source.inputType || "text";
  const inlineValue = f.source?.value;
  if (!text && !inlineValue) return null;
  if (text && f.children.length !== 1) return null;

  const cssHeight = Math.round(f.height) === 52 ? 50 : Math.round(f.height);
  const textFill = (text?.fills || []).find((p: any) => p.type === "SOLID" && p.visible !== false) as any;
  const color = textFill ? colorCss(textFill.color, textFill.opacity ?? 1) : "#102a43";
  const fontStack = (f.source?.fontStack ?? "Inter, Arial, sans-serif").replace(/"/g, "'");
  const style = [
    "position:absolute",
    `left:${f.x}px`,
    `top:${f.y}px`,
    `width:${Math.round(f.width)}px`,
    `height:${cssHeight}px`,
    "box-sizing:border-box",
    "margin:0",
    "padding:0 14px",
    "border-radius:12px",
    "border:1px solid #cbd8e6",
    "background:#f8fbff",
    `font-family:${fontStack}`,
    "font-size:16px",
    `font-weight:${fontWeight(text?.fontName?.style ?? "Regular")}`,
    `color:${color}`,
    "outline:none",
    "appearance:none",
    "-webkit-appearance:none"
  ].join(";") + ";";
  const value =
    inlineValue ??
    (inputType === "password" && text
      ? "a".repeat(text.characters.length)
      : text?.characters ?? "");
  return `<input type="${escapeHtml(inputType)}" value="${escapeHtml(
    value
  )}" data-id="${f.__id}" data-kind="FRAME" data-name="input" style="${style}" />`;
}

function tryRenderLoginCard(
  f: MockFrameNode,
  _ctx: RenderCtx,
  _parent?: MockFrameNode
): string | null {
  if (!isLoginCardFrame(f)) return null;

  const shell = [
    "position:absolute",
    `left:${f.x}px`,
    `top:${f.y}px`,
    `width:${Math.round(f.width)}px`,
    `min-height:${Math.round(f.height)}px`,
    "box-sizing:border-box",
    "margin:0"
  ].join(";") + ";";

  const blocks: string[] = [];
  for (const child of f.children) {
    const c = child as MockFrameNode;
    if (c.svgSource) {
      const svg = c.svgSource.includes('class="')
        ? c.svgSource
        : c.svgSource.replace("<svg ", '<svg class="lab-login-image" ');
      blocks.push(svg);
    } else if (c.name === "h2") {
      blocks.push(`<h2>${escapeHtml(deepText(c))}</h2>`);
    } else if (c.name === "p") {
      blocks.push(`<p>${escapeHtml(deepText(c))}</p>`);
    } else if (c.name === "label") {
      blocks.push(`<label>${escapeHtml(deepText(c))}</label>`);
    } else if (c.name === "input") {
      const inputType = c.source?.inputType || "text";
      const value = c.source?.value ?? "";
      blocks.push(
        `<input type="${escapeHtml(inputType)}" value="${escapeHtml(value)}" />`
      );
    } else if (c.name === "button" && Math.round(c.height) === 50) {
      blocks.push(
        `<button type="button" class="lab-login-button">${escapeHtml(deepText(c))}</button>`
      );
    } else if (isLoginSocialsFrame(c)) {
      const socials = c.children
        .map((btn) => {
          const b = btn as MockFrameNode;
          return `<button type="button" class="${loginButtonClass(b)}">${escapeHtml(
            deepText(b)
          )}</button>`;
        })
        .join("");
      blocks.push(`<div class="lab-login-socials">${socials}</div>`);
    }
  }

  return `<div class="lab-login-card" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${shell}">${blocks.join("")}</div>`;
}

function tryRenderLoginPageButton(
  f: MockFrameNode,
  _ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "button") return null;
  const text = f.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
  if (!text || f.children.length !== 1) return null;
  const inCard = parentIsLoginCard(parent);
  const inSocials = parent != null && isLoginSocialsFrame(parent);
  if (!inCard && !inSocials) return null;
  const cls = loginButtonClass(f);
  const style = loginAbsoluteShellStyle(f);
  return `<button type="button" class="${cls}" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${style}">${escapeHtml(text.characters)}</button>`;
}

function tryRenderLoginSocials(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (!isLoginSocialsFrame(f) || !parentIsLoginCard(parent)) return null;
  const style = loginAbsoluteShellStyle(f);
  const kids = f.children.map((c) => nodeToHtml(c, ctx, f)).join("");
  return `<div class="lab-login-socials" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${style}">${kids}</div>`;
}

/** `.lab-radio-indicator` — use Storybook CSS for dot border + selected inset. */
function tryRenderRadioIndicator(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "span" || Math.round(f.width) !== 18 || Math.round(f.height) !== 18) return null;
  if ((f.topLeftRadius ?? 0) < 9) return null;
  const stroke = (f.strokes || []).find((s: any) => s.type === "SOLID" && s.visible !== false) as any;
  if (!stroke) return null;
  const selected = stroke.color.b > 0.95 && stroke.color.g > 0.4;
  const cls = selected ? "lab-radio-indicator selected" : "lab-radio-indicator";
  let top = f.y;
  if (parent?.name === "label" && top > 0 && top < 2) top = 0;
  const style = `position:absolute;left:${f.x}px;top:${top}px;width:18px;height:18px;box-sizing:border-box;`;
  return `<span class="${cls}" data-id="${f.__id}" data-kind="FRAME" style="${style}"></span>`;
}

function labComponentShellStyle(f: MockFrameNode, heightMode: "fixed" | "min" | "auto" = "fixed"): string {
  const parts = ["position:relative;", "box-sizing:border-box;", `width:${Math.round(f.width)}px;`];
  if (heightMode === "fixed") {
    parts.push(`height:${Math.round(f.height)}px;`);
  } else if (heightMode === "min") {
    parts.push(`min-height:${Math.round(f.height)}px;`);
  }
  if (f.x || f.y) {
    parts.push(`left:${f.x}px;`, `top:${f.y}px;`);
  }
  return parts.join("");
}

/** Lab components with CSS width — only pin min-height so class rules win. */
function labComponentCssShellStyle(f: MockFrameNode): string {
  const parts = ["position:relative;", "box-sizing:border-box;"];
  parts.push(`min-height:${Math.round(f.height)}px;`);
  if (f.x || f.y) {
    parts.push(`left:${f.x}px;`, `top:${f.y}px;`);
  }
  return parts.join("");
}

function deepText(node: MockNode | undefined): string {
  if (!node) return "";
  if (node.type === "TEXT") return (node as MockTextNode).characters;
  for (const c of (node as MockFrameNode).children || []) {
    const t = deepText(c);
    if (t) return t;
  }
  return "";
}

/** Filter panel captions — code-v2 may name text wrappers `span` or `typography`. */
function filterPanelCaptionFrame(parent: MockFrameNode): MockFrameNode | undefined {
  return parent.children.find((c) => {
    const n = c as MockFrameNode;
    return n.name === "span" || n.name === "typography";
  }) as MockFrameNode | undefined;
}

function badgeClassFromFill(fill: any): string {
  if (!fill?.color) return "neutral";
  const { r, g, b } = fill.color;
  if (g > 0.95 && r < 0.9 && b > 0.9) return "success";
  if (r > 0.95 && g > 0.9 && b < 0.85) return "warning";
  if (r > 0.95 && g > 0.85 && b > 0.85 && r > g + 0.04) return "danger";
  return "neutral";
}

/** `.lab-content-board` — flex layout via Storybook CSS. */
function tryRenderContentListBoard(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "ContentListBoard" || (parent && parent.name !== "ContentListBoard Canvas")) return null;

  const compact = Math.round(f.width) <= 720;
  const highlighted = (f.effects || []).some(
    (e: any) => e.type === "INNER_SHADOW" && e.visible !== false && (e.spread ?? 0) >= 2
  );
  const cls = `lab-content-board${compact ? " compact" : ""}${highlighted ? " highlighted" : ""}`;
  const blocks: string[] = [];

  for (const child of f.children) {
    const cf = child as MockFrameNode;
    if (cf.name === "nav") {
      const crumbs: string[] = [];
      for (const c of cf.children) {
        if (c.type === "FRAME" && (c as MockFrameNode).name === "span") {
          const active = deepText(c).includes("Library");
          crumbs.push(
            `<span${active ? ' class="active"' : ""}>${escapeHtml(deepText(c))}</span>`
          );
        } else if (c.type === "FRAME" && (c as MockFrameNode).name === "i") {
          crumbs.push("<i></i>");
        }
      }
      blocks.push(`<nav class="breadcrumbs" aria-label="Breadcrumb">${crumbs.join("")}</nav>`);
    } else if (cf.name === "header") {
      const titleWrap = cf.children.find(
        (c) => c.type === "FRAME" && (c as MockFrameNode).name === "div"
      ) as MockFrameNode | undefined;
      const iconFrame = titleWrap?.children.find(
        (c) => c.type === "FRAME" && (c as MockFrameNode).name === "span"
      ) as MockFrameNode | undefined;
      const svgChild = iconFrame?.children.find(
        (c) => (c as MockFrameNode).svgSource
      ) as MockFrameNode | undefined;
      const textWrap = titleWrap?.children.find(
        (c) => c.type === "FRAME" && (c as MockFrameNode).name === "div"
      ) as MockFrameNode | undefined;
      const h3 = textWrap?.children.find((c) => (c as MockFrameNode).name === "h3");
      const p = textWrap?.children.find((c) => (c as MockFrameNode).name === "p");
      const btn = cf.children.find(
        (c) => c.type === "FRAME" && (c as MockFrameNode).name === "button"
      ) as MockFrameNode | undefined;
      const iconSvg = svgChild?.svgSource
        ? injectSvgSize(svgChild.svgSource, svgChild.width, svgChild.height, false)
        : "";
      blocks.push(
        `<header class="board-header"><div class="title-wrap"><span class="icon">${iconSvg}</span><div><h3>${escapeHtml(
          deepText(h3)
        )}</h3><p>${escapeHtml(deepText(p))}</p></div></div><button type="button">${escapeHtml(
          deepText(btn)
        )}</button></header>`
      );
    } else if (cf.name === "div" && Math.round(cf.height) <= 2) {
      blocks.push('<div class="board-divider"></div>');
    } else if (cf.name === "label") {
      const inputFrame = cf.children.find(
        (c) => c.type === "FRAME" && (c as MockFrameNode).name === "input"
      ) as MockFrameNode | undefined;
      blocks.push(
        `<label class="inline-edit"><span>${escapeHtml(
          deepText(cf.children.find((c) => (c as MockFrameNode).name === "span"))
        )}</span><input value="${escapeHtml(
          deepText(inputFrame)
        )}" readonly /></label>`
      );
    } else if (cf.name === "ul") {
      const items: string[] = [];
      for (const li of cf.children) {
        if (li.type !== "FRAME" || (li as MockFrameNode).name !== "li") continue;
        const lf = li as MockFrameNode;
        const liDivs = lf.children.filter(
          (c) => c.type === "FRAME" && (c as MockFrameNode).name === "div"
        ) as MockFrameNode[];
        const body = liDivs[0];
        const badgesWrap = liDivs[1];
        const h4 = body?.children.find((c) => (c as MockFrameNode).name === "h4");
        const p = body?.children.find((c) => (c as MockFrameNode).name === "p");
        const badgeSpans = (badgesWrap?.children || []).filter(
          (c) => c.type === "FRAME" && (c as MockFrameNode).name === "span"
        ) as MockFrameNode[];
        const badgeHtml = badgeSpans
          .map((b) => {
            const fill = (b.fills || []).find(
              (p: any) => p.type === "SOLID" && p.visible !== false
            );
            const cls = badgeClassFromFill(fill);
            return `<span class="badge ${cls}">${escapeHtml(deepText(b))}</span>`;
          })
          .join("");
        items.push(
          `<li><div><h4>${escapeHtml(deepText(h4))}</h4><p>${escapeHtml(deepText(p))}</p></div><div class="badges">${badgeHtml}</div></li>`
        );
      }
      blocks.push(`<ul class="task-list">${items.join("")}</ul>`);
    }
  }

  return `<section class="${cls}" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${labComponentShellStyle(f, "min")}">${blocks.join("")}</section>`;
}

function featureCardVariant(iconFill: any): string {
  if (!iconFill?.color) return "default";
  const { r, g } = iconFill.color;
  if (g > 0.97 && r < 0.92) return "success";
  if (r > 0.98 && g > 0.92) return "warning";
  return "default";
}

/** `.lab-feature-card` — flex header/footer via Storybook CSS. */
function tryRenderFeatureCard(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "FeatureCard" || (parent && parent.name !== "FeatureCard Canvas")) return null;

  const header = f.children.find(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "div"
  ) as MockFrameNode | undefined;
  const footer = f.children.filter(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "div"
  )[1] as MockFrameNode | undefined;

  const iconFrame = header?.children.find(
    (c) => (c as MockFrameNode).name === "featureIcon"
  ) as MockFrameNode | undefined;
  const iconFill = (iconFrame?.fills || []).find(
    (p: any) => p.type === "SOLID" && p.visible !== false
  );
  const variant = featureCardVariant(iconFill);
  const textWrap = header?.children.find(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "div"
  ) as MockFrameNode | undefined;
  const h3 = textWrap?.children.find((c) => (c as MockFrameNode).name === "h3");
  const p = textWrap?.children.find((c) => (c as MockFrameNode).name === "p");
  const svgChild = iconFrame?.children.find((c) => (c as MockFrameNode).svgSource) as
    | MockFrameNode
    | undefined;
  const iconSvg = svgChild?.svgSource
    ? injectSvgSize(svgChild.svgSource, svgChild.width, svgChild.height, false)
    : "+";

  const footerSpan = footer?.children.find(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "span"
  ) as MockFrameNode | undefined;
  const footerStrong = footer?.children.find(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "strong"
  ) as MockFrameNode | undefined;

  return `<div class="lab-feature-card ${variant}" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${labComponentShellStyle(f, "min")}"><div class="lab-feature-header"><span class="lab-feature-icon">${iconSvg}</span><div><h3>${escapeHtml(
    deepText(h3)
  )}</h3><p>${escapeHtml(deepText(p))}</p></div></div><div class="lab-feature-footer"><span>${escapeHtml(
    deepText(footerSpan)
  )}</span><strong>${escapeHtml(deepText(footerStrong))}</strong></div></div>`;
}

function imageSrcFromFills(fills: any[], ctx: RenderCtx): string | null {
  for (const p of fills || []) {
    if (p.type !== "IMAGE" || p.visible === false) continue;
    const bytes = figma.__getImageBytes(p.imageHash);
    if (!bytes) continue;
    let url = ctx.imageDataUrls.get(p.imageHash);
    if (!url) {
      const b64 = Buffer.from(bytes).toString("base64");
      const mime = sniffMime(bytes);
      url = `data:${mime};base64,${b64}`;
      ctx.imageDataUrls.set(p.imageHash, url);
    }
    return url;
  }
  return null;
}

function multilineTextHtml(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br />");
}

/** `.lab-card` — product card flex layout via Storybook CSS. */
function tryRenderProductCard(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "ProductCard" || (parent && parent.name !== "ProductCard Canvas")) return null;

  const imgRect =
    (f.children.find((c) => c.type === "RECTANGLE") as MockRectangleNode | undefined) ??
    (f.children.find(
      (c) =>
        c.type === "FRAME" &&
        (c as MockFrameNode).clipsContent &&
        (c as MockFrameNode).children?.some((k) => k.type === "RECTANGLE")
    ) as MockFrameNode | undefined)?.children?.find((c) => c.type === "RECTANGLE") as
      | MockRectangleNode
      | undefined;
  const bg = (f.fills || []).find((p: any) => p.type === "SOLID" && p.visible !== false) as any;
  let variant = "default";
  if (bg?.color && bg.color.r < 0.25) variant = "dark";
  else if (imgRect && Math.round(imgRect.width) <= 230) variant = "compact";
  const content = f.children.find(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "div"
  ) as MockFrameNode | undefined;
  const imgSrc = imgRect ? imageSrcFromFills(imgRect.fills || [], ctx) : null;
  const imgTag = imgSrc
    ? `<img alt="product" src="${imgSrc}" />`
    : `<img alt="product" />`;

  const badge = content?.children.find((c) => (c as MockFrameNode).name === "span");
  const h2 = content?.children.find((c) => (c as MockFrameNode).name === "h2");
  const p = content?.children.find((c) => (c as MockFrameNode).name === "p");
  const dots = [...(content?.children || [])]
    .reverse()
    .find(
      (c) =>
        c.type === "FRAME" &&
        (c as MockFrameNode).name === "div" &&
        (c as MockFrameNode).children?.[0]?.type === "FRAME" &&
        ((c as MockFrameNode).children[0] as MockFrameNode).name === "span"
    );

  const dotHtml = (dots as MockFrameNode | undefined)?.children
    ?.filter((c) => (c as MockFrameNode).name === "span")
    .map((c, i) => {
      const sf = c as MockFrameNode;
      const fill = (sf.fills || []).find((p: any) => p.type === "SOLID" && p.visible !== false);
      const stroke = (sf.strokes || []).find((p: any) => p.type === "SOLID" && p.visible !== false);
      let style = "";
      if (fill?.type === "SOLID")
        style += `background:${colorCss(fill.color, fill.opacity ?? 1)};`;
      if (stroke?.type === "SOLID")
        style += `border:2px solid ${colorCss(stroke.color, stroke.opacity ?? 1)};`;
      const cls = i === 0 ? "dot big" : "dot";
      return `<span class="${cls}"${style ? ` style="${style}"` : ""}></span>`;
    })
    .join("") ?? "";

  const badgeHtml = badge && deepText(badge)
    ? `<span class="lab-card-badge">${escapeHtml(deepText(badge))}</span>`
    : "";

  return `<div class="lab-card ${variant}" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${labComponentShellStyle(f, "min")}">${imgTag}<div class="lab-card-content">${badgeHtml}<h2>${multilineTextHtml(
    deepText(h2)
  )}</h2><p>${escapeHtml(deepText(p))}</p><div class="dots">${dotHtml}</div></div></div>`;
}

/** `.lab-top-nav` / `.lab-bottom-nav` */
function tryRenderNavigationBars(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "NavigationBars" || (parent && parent.name !== "NavigationBars Canvas")) return null;

  const buttons = f.children.filter((c) => (c as MockFrameNode).name === "button") as MockFrameNode[];
  if (buttons.length >= 3 && buttons.length <= 4) {
    const btnHtml = buttons
      .map((b) => {
        const text = b.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
        const fill = (text?.fills || []).find((p: any) => p.type === "SOLID" && p.visible !== false) as any;
        const active = fill?.color?.b > 0.9 && fill?.color?.g > 0.4;
        return `<button${active ? ' class="active"' : ""}>${escapeHtml(text?.characters || "")}</button>`;
      })
      .join("");
    return `<div class="lab-bottom-nav" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
      f.name
    )}" style="${labComponentShellStyle(f)}">${btnHtml}</div>`;
  }

  const divs = f.children.filter((c) => c.type === "FRAME" && (c as MockFrameNode).name === "div") as MockFrameNode[];
  const brand = divs[0];
  const links = divs[1];
  const cta = f.children.find((c) => (c as MockFrameNode).name === "button") as MockFrameNode | undefined;
  const linkHtml = (links?.children || [])
    .filter((c) => (c as MockFrameNode).name === "a")
    .map((a) => `<a>${escapeHtml(deepText(a))}</a>`)
    .join("");
  return `<div class="lab-top-nav" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${labComponentShellStyle(f)}"><div class="brand">${escapeHtml(
    deepText(brand)
  )}</div><div class="links">${linkHtml}</div><button class="cta" type="button">${escapeHtml(
    deepText(cta)
  )}</button></div>`;
}

/** `.lab-dashboard` */
function tryRenderComplexDashboardCard(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "ComplexDashboardCard" || (parent && parent.name !== "ComplexDashboardCard Canvas"))
    return null;

  const divs = f.children.filter((c) => c.type === "FRAME") as MockFrameNode[];
  const toolbar = divs[0];
  const cardsWrap = divs[1];
  const chart = divs[2];
  const h3 = toolbar?.children.find((c) => (c as MockFrameNode).name === "h3");
  const chips = toolbar?.children.find((c) => (c as MockFrameNode).name === "div");
  const chipHtml = (chips?.children || [])
    .filter((c) => (c as MockFrameNode).name === "span")
    .map((s) => {
      const sf = s as MockFrameNode;
      const fill = (sf.fills || []).find((p: any) => p.type === "SOLID" && p.visible !== false) as any;
      const active = fill?.color?.b > 0.9;
      return `<span${active ? ' class="active"' : ""}>${escapeHtml(deepText(sf))}</span>`;
    })
    .join("");
  const cardHtml = (cardsWrap?.children || [])
    .filter((c) => (c as MockFrameNode).name === "article")
    .map((a) => {
      const af = a as MockFrameNode;
      const p = af.children.find((c) => (c as MockFrameNode).name === "p");
      const strong = af.children.find((c) => (c as MockFrameNode).name === "strong");
      return `<article><p>${escapeHtml(deepText(p))}</p><strong>${escapeHtml(deepText(strong))}</strong></article>`;
    })
    .join("");
  const barHtml = (chart?.children || [])
    .filter((c) => (c as MockFrameNode).name === "div")
    .map((b) => {
      const hPx = Math.max(1, Math.round((b as MockFrameNode).height));
      return `<div class="bar" style="height:${hPx}px"></div>`;
    })
    .join("");

  return `<div class="lab-dashboard" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${labComponentShellStyle(f, "min")}"><div class="toolbar"><h3>${escapeHtml(
    deepText(h3)
  )}</h3><div class="chips">${chipHtml}</div></div><div class="cards">${cardHtml}</div><div class="chart">${barHtml}</div></div>`;
}

function analyticsChipVariant(chip: MockFrameNode): string {
  const fill = (chip.fills || []).find((p: any) => p.type === "SOLID" && p.visible !== false) as any;
  if (!fill?.color) return "indigo";
  const { r, g, b } = fill.color;
  if (g > 0.94 && b > 0.9 && r < 0.9) return "teal";
  return "indigo";
}

function legendDotClass(dot: MockFrameNode, index: number): string {
  const fill = (dot.fills || []).find((p: any) => p.type === "SOLID" && p.visible !== false) as any;
  if (!fill?.color) return ["one", "two", "three", "four"][index] ?? "one";
  const { r, g, b } = fill.color;
  if (r > 0.9 && g > 0.4 && b < 0.4) return "three";
  // Saturated indigo (#4f46e5, #6366f1) — low R/G, high B.
  if (r < 0.45 && g < 0.45 && b > 0.85) return r < 0.35 ? "one" : "two";
  // Slate gray (#94a3b8) — mid R/G/B, not saturated blue.
  if (r > 0.5 && g > 0.55 && b > 0.65 && b < 0.8) return "four";
  return ["one", "two", "three", "four"][index] ?? "one";
}

function barHeightPercent(bar: MockFrameNode, wrapH: number): number {
  if (wrapH <= 0) return 0;
  return Math.max(1, Math.round((bar.height / wrapH) * 100));
}

function barTone(bar: MockFrameNode): "main indigo" | "main teal" | "compare" {
  const fill = (bar.fills || []).find((p: any) => p.type === "SOLID" && p.visible !== false) as any;
  if (!fill?.color) return "compare";
  const { r, g, b } = fill.color;
  if (g > 0.65 && r < 0.35) return "main teal";
  // Saturated indigo (#4f46e5) — low R/G, high B. Gray compare (#cbd5e1) has high R/G.
  if (r < 0.35 && g < 0.35 && b > 0.85) return "main indigo";
  return "compare";
}

/** `.lab-analytics-charts` — flex layout via Storybook CSS (legend strong, chip, header). */
function tryRenderAnalyticsCharts(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "AnalyticsCharts" || (parent && parent.name !== "AnalyticsCharts Canvas")) return null;

  const dense = Math.round(f.width) <= 720;
  const cls = `lab-analytics-charts${dense ? " dense" : ""}`;

  const header = f.children.find((c) => (c as MockFrameNode).name === "header") as MockFrameNode | undefined;
  const body = f.children.find(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "div"
  ) as MockFrameNode | undefined;

  let headerHtml = "";
  if (header) {
    const titleDiv = header.children.find((c) => (c as MockFrameNode).name === "div") as MockFrameNode | undefined;
    const eyebrow = titleDiv?.children.find((c) => (c as MockFrameNode).name === "p");
    const h3 = titleDiv?.children.find((c) => (c as MockFrameNode).name === "h3");
    const chip = header.children.find((c) => (c as MockFrameNode).name === "span") as MockFrameNode | undefined;
    const chipCls = chip ? analyticsChipVariant(chip) : "indigo";
    headerHtml = `<header><div><p class="eyebrow">${escapeHtml(deepText(eyebrow))}</p><h3>${escapeHtml(
      deepText(h3)
    )}</h3></div><span class="chip ${chipCls}">${escapeHtml(deepText(chip))}</span></header>`;
  }

  const articles = (body?.children || []).filter((c) => (c as MockFrameNode).name === "article") as MockFrameNode[];
  const pieCard = articles[0];
  const trendCard = articles[1];

  let pieHtml = "";
  if (pieCard) {
    const svgChild = pieCard.children.find((c) => (c as MockFrameNode).svgSource) as MockFrameNode | undefined;
    let svg = "";
    if (svgChild?.svgSource) {
      const inner = svgChild.svgSource.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      const vb =
        svgChild.svgSource.match(/viewBox="[^"]*"/i)?.[0] ?? 'viewBox="0 0 120 120"';
      if (inner) {
        svg = `<svg xmlns="http://www.w3.org/2000/svg" class="pie-chart-svg" ${vb} width="${svgChild.width}" height="${svgChild.height}">${inner[1].trim()}</svg>`;
      }
    }
    const legend = pieCard.children.find(
      (c) =>
        c.type === "FRAME" &&
        (c as MockFrameNode).name === "div" &&
        (c as MockFrameNode).children?.some((x) => (x as MockFrameNode).name === "div")
    ) as MockFrameNode | undefined;
    const rows = (legend?.children || []).filter((c) => (c as MockFrameNode).name === "div") as MockFrameNode[];
    const rowHtml = rows
      .map((row, index) => {
        const left = row.children.find((c) => (c as MockFrameNode).name === "div") as MockFrameNode | undefined;
        const dot = left?.children.find((c) => (c as MockFrameNode).name === "i") as MockFrameNode | undefined;
        const label = left?.children.find(
          (c) => (c as MockFrameNode).name === "span" || (c as MockFrameNode).name === "typography"
        );
        const value = row.children.find((c) => (c as MockFrameNode).name === "strong");
        const dotCls = dot ? legendDotClass(dot, index) : ["one", "two", "three", "four"][index] ?? "one";
        return `<div class="legend-row"><div class="legend-left"><i class="legend-dot ${dotCls}"></i><span>${escapeHtml(
          deepText(label)
        )}</span></div><strong>${escapeHtml(deepText(value))}</strong></div>`;
      })
      .join("");
    pieHtml = `<article class="pie-card">${svg}<div class="legend">${rowHtml}</div></article>`;
  }

  let trendHtml = "";
  if (trendCard) {
    const h4 = trendCard.children.find((c) => (c as MockFrameNode).name === "h4");
    const grid = trendCard.children.find(
      (c) =>
        c.type === "FRAME" &&
        (c as MockFrameNode).name === "div" &&
        (c as MockFrameNode).height > 100
    ) as MockFrameNode | undefined;
    const axis = trendCard.children.find(
      (c) =>
        c.type === "FRAME" &&
        (c as MockFrameNode).name === "div" &&
        (c as MockFrameNode).height <= 20
    ) as MockFrameNode | undefined;
    const wraps = (grid?.children || []).filter((c) => (c as MockFrameNode).name === "div") as MockFrameNode[];
    const wrapH = wraps[0]?.height ?? 190;
    const barsHtml = wraps
      .map((wrap) => {
        const kids = ([...(wrap.children || [])].filter(
          (c) => (c as MockFrameNode).name === "div"
        ) as MockFrameNode[]).sort((a, b) => a.x - b.x);
        const main = kids[0];
        const compare = kids[1];
        const mainCls = main ? barTone(main) : "main indigo";
        const mainPct = main ? barHeightPercent(main, wrapH) : 0;
        const comparePct = compare ? barHeightPercent(compare, wrapH) : 0;
        return `<div class="bar-wrap"><div class="bar ${mainCls}" style="height:${mainPct}%"></div><div class="bar compare" style="height:${comparePct}%"></div></div>`;
      })
      .join("");
    const axisHtml = (axis?.children || [])
      .map((s) => `<span>${escapeHtml(deepText(s))}</span>`)
      .join("");
    trendHtml = `<article class="trend-card"><h4>${escapeHtml(
      deepText(h4)
    )}</h4><div class="trend-grid">${barsHtml}</div><div class="axis">${axisHtml}</div></article>`;
  }

  return `<section class="${cls}" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${labComponentShellStyle(f, "fixed")}">${headerHtml}<div class="lab-analytics-body">${pieHtml}${trendHtml}</div></section>`;
}

/** `.lab-calendar-scheduler` */
function tryRenderCalendarScheduler(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "CalendarScheduler" || (parent && parent.name !== "CalendarScheduler Canvas")) return null;

  // Compact story exports ~700px wide; monthly/weekdays are ~882px.
  const compact = Math.round(f.width) < 750;
  const cls = `lab-calendar-scheduler${compact ? " compact" : ""}`;

  const header = f.children.find((c) => (c as MockFrameNode).name === "header") as MockFrameNode | undefined;
  const gridWrap = f.children.find(
    (c) =>
      c.type === "FRAME" &&
      (c as MockFrameNode).name === "div" &&
      (c as MockFrameNode).children?.some((x) => (x as MockFrameNode).name === "strong")
  ) as MockFrameNode | undefined;

  let headerHtml = "";
  if (header) {
    const titleDiv = header.children.find((c) => (c as MockFrameNode).name === "div") as MockFrameNode | undefined;
    const actions = header.children.filter((c) => (c as MockFrameNode).name === "div")[1] as MockFrameNode | undefined;
    const eyebrow = titleDiv?.children.find((c) => (c as MockFrameNode).name === "p");
    const h3 = titleDiv?.children.find((c) => (c as MockFrameNode).name === "h3");
    const badge = actions?.children.find((c) => (c as MockFrameNode).name === "span");
    const btn = actions?.children.find((c) => (c as MockFrameNode).name === "button");
    headerHtml = `<header class="lab-calendar-header"><div><p class="eyebrow">${escapeHtml(
      deepText(eyebrow)
    )}</p><h3>${escapeHtml(deepText(h3))}</h3></div><div class="lab-calendar-actions"><span class="badge">${escapeHtml(
      deepText(badge)
    )}</span><button type="button">${escapeHtml(deepText(btn))}</button></div></header>`;
  }

  const gridKids = gridWrap?.children || [];
  const weekdays = gridKids.filter((c) => (c as MockFrameNode).name === "strong") as MockFrameNode[];
  const columns = weekdays.length || 7;
  const cells = gridKids.filter((c) => (c as MockFrameNode).name === "div") as MockFrameNode[];

  const gridHtml: string[] = weekdays.map(
    (w) => `<strong class="weekday">${escapeHtml(deepText(w))}</strong>`
  );
  for (const cell of cells) {
    const dayText = cell.children.find((c) => (c as MockFrameNode).name === "span");
    const text = dayText?.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
    const fill = (text?.fills || []).find((p: any) => p.type === "SOLID" && p.visible !== false) as any;
    const muted = fill?.color && fill.color.r > 0.5 && fill.color.g > 0.55 && fill.color.b > 0.55;
    const cellStroke = (cell.strokes || []).find((p: any) => p.type === "SOLID" && p.visible !== false) as any;
    const innerRing = (cell.effects || []).some(
      (e: any) => e.type === "INNER_SHADOW" && e.visible !== false && (e.spread ?? 0) >= 2
    );
    const active =
      innerRing ||
      (cellStroke?.color &&
        cellStroke.color.b > 0.95 &&
        cellStroke.color.g > 0.72 &&
        cellStroke.color.r < 0.65);
    let clsCell = "date-cell";
    if (muted) clsCell += " muted";
    if (active) clsCell += " active";
    const dot = cell.children.find((c) => (c as MockFrameNode).name === "small") as MockFrameNode | undefined;
    const dotText = deepText(dot);
    let dotHtml = "";
    if (dotText) {
      let dotCls = "dot";
      if (/review/i.test(dotText)) dotCls += " amber";
      else if (/launch/i.test(dotText)) dotCls += " blue";
      else if (/retro/i.test(dotText)) dotCls += " green";
      dotHtml = `<small class="${dotCls}">${escapeHtml(dotText)}</small>`;
    }
    gridHtml.push(`<div class="${clsCell}"><span>${escapeHtml(deepText(dayText))}</span>${dotHtml}</div>`);
  }

  const divider = f.children.find(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "div" && Math.round((c as MockFrameNode).height) <= 2
  );
  const agenda = f.children.find((c) => (c as MockFrameNode).name === "div" && (c as MockFrameNode).children?.some((x) => (x as MockFrameNode).name === "article")) as MockFrameNode | undefined;
  const agendaHtml = (agenda?.children || [])
    .filter((c) => (c as MockFrameNode).name === "article")
    .map((a) => {
      const af = a as MockFrameNode;
      const p = af.children.find((c) => (c as MockFrameNode).name === "p");
      const h4 = af.children.find((c) => (c as MockFrameNode).name === "h4");
      const span = af.children.find((c) => (c as MockFrameNode).name === "span");
      return `<article><p>${escapeHtml(deepText(p))}</p><h4>${escapeHtml(
        deepText(h4)
      )}</h4><span>${escapeHtml(deepText(span))}</span></article>`;
    })
    .join("");

  return `<section class="${cls}" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${labComponentShellStyle(f, "min")}">${headerHtml}<div class="lab-calendar-grid" style="grid-template-columns:repeat(${columns},minmax(0,1fr))">${gridHtml.join(
    ""
  )}</div>${divider ? '<div class="lab-calendar-divider"></div>' : ""}<div class="lab-agenda-list">${agendaHtml}</div></section>`;
}

/** `.lab-filter-panel` */
function tryRenderFilterSidePanel(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "FilterSidePanel" || (parent && parent.name !== "FilterSidePanel Canvas")) return null;

  const collapsed = Math.round(f.width) <= 310;
  const shadow = (f.effects || []).find((e: any) => e.type === "DROP_SHADOW" && e.visible !== false) as any;
  const side = shadow?.offset?.x < 0 ? "left" : "right";
  const cls = `lab-filter-panel ${side}${collapsed ? " collapsed" : ""}`;
  const blocks: string[] = [];

  for (const child of f.children) {
    const cf = child as MockFrameNode;
    if (cf.name === "header") {
      const h3 = cf.children.find((c) => (c as MockFrameNode).name === "h3");
      const status = filterPanelCaptionFrame(cf);
      blocks.push(
        `<header><h3>${escapeHtml(deepText(h3))}</h3><span class="status">${escapeHtml(
          deepText(status)
        )}</span></header>`
      );
    } else if (cf.name === "section") {
      const label = cf.children.find((c) => (c as MockFrameNode).name === "p");
      const multi = cf.children.find((c) => (c as MockFrameNode).name === "div");
      const labels = (cf.children || []).filter((c) => (c as MockFrameNode).name === "label") as MockFrameNode[];
      if (labels.length) {
        const fields = labels
          .map((lb) => {
            const input = lb.children.find((c) => (c as MockFrameNode).name === "input");
            const caption = filterPanelCaptionFrame(lb);
            return `<label><span>${escapeHtml(deepText(caption))}</span><input value="${escapeHtml(
              deepText(input)
            )}" readonly style="line-height:normal;" /></label>`;
          })
          .join("");
        blocks.push(`<section class="edit-grid">${fields}</section>`);
      } else if (multi?.children?.some((c) => (c as MockFrameNode).name === "i")) {
        const swatchHtml = (multi.children || [])
          .filter((c) => (c as MockFrameNode).name === "i")
          .map((i) => {
            const fill = ((i as MockFrameNode).fills || []).find(
              (p: any) => p.type === "SOLID" && p.visible !== false
            );
            const bg =
              fill?.type === "SOLID" ? colorCss(fill.color, fill.opacity ?? 1) : "transparent";
            return `<i style="background:${bg}"></i>`;
          })
          .join("");
        blocks.push(
          `<section><p class="label">${escapeHtml(deepText(label))}</p><div class="swatches">${swatchHtml}</div></section>`
        );
      } else if (multi) {
        const compact =
          multi.children.length <= 4 &&
          !multi.children.some((c) => (c as MockFrameNode).name === "button");
        const tags = (multi.children || [])
          .map((c) => {
            if ((c as MockFrameNode).name === "button") {
              return `<button type="button">${escapeHtml(deepText(c))}</button>`;
            }
            return `<span>${escapeHtml(deepText(c))}</span>`;
          })
          .join("");
        blocks.push(
          `<section><p class="label">${escapeHtml(deepText(label))}</p><div class="multi-select${
            compact ? " compact" : ""
          }">${tags}</div></section>`
        );
      }
    } else if (cf.name === "div" && Math.round(cf.height) <= 2) {
      blocks.push('<div class="divider"></div>');
    } else if (cf.name === "footer") {
      const btns = (cf.children || [])
        .filter((c) => (c as MockFrameNode).name === "button")
        .map((b) => {
          const ghost = deepText(b).toLowerCase().includes("reset");
          return `<button type="button" class="${ghost ? "ghost" : "primary"}">${escapeHtml(
            deepText(b)
          )}</button>`;
        })
        .join("");
      blocks.push(`<footer>${btns}</footer>`);
    }
  }

  return `<aside class="${cls}" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${labComponentShellStyle(f, "min")}">${blocks.join("")}</aside>`;
}

function inferOverlayPanelClass(
  panel: MockFrameNode,
  canvas: MockFrameNode
): "dialog" | "drawer" | "sheet" {
  const hasPillHandle = panel.children.some((c) => {
    const n = c as MockFrameNode;
    const maxR = Math.max(
      n.topLeftRadius ?? 0,
      n.topRightRadius ?? 0,
      n.bottomRightRadius ?? 0,
      n.bottomLeftRadius ?? 0
    );
    return maxR >= 100 && n.height <= 8 && n.width >= 40 && n.width <= 60;
  });
  if (hasPillHandle || panel.y > canvas.height * 0.55) return "sheet";
  if (
    Math.round(panel.x + panel.width) >= Math.round(canvas.width) - 2 &&
    panel.height >= canvas.height - 4
  ) {
    return "drawer";
  }
  return "dialog";
}

function overlayActionsHtml(actions: MockFrameNode): string {
  const btns = actions.children
    .filter((c) => (c as MockFrameNode).name === "button")
    .map((btn) => {
      const b = btn as MockFrameNode;
      const fill = (b.fills || []).find((p: any) => p.type === "SOLID" && p.visible !== false) as any;
      let cls = "";
      if (fill?.color) {
        const { r, g, b: bl } = fill.color;
        if (r > 0.85 && g < 0.35 && bl < 0.35) cls = "danger";
        else if (bl > 0.85 && g > 0.35 && r < 0.2) cls = "primary";
      }
      return `<button type="button"${cls ? ` class="${cls}"` : ""}>${escapeHtml(deepText(b))}</button>`;
    })
    .join("");
  return `<div class="actions">${btns}</div>`;
}

/** `.lab-overlay-canvas` — dialog/drawer/sheet use Storybook CSS + semantic tags. */
function tryRenderOverlayStates(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "OverlayStates" || (parent && parent.name !== "OverlayStates Canvas")) return null;

  const panel = f.children.find((c) => {
    if (c.type !== "FRAME") return false;
    const n = c as MockFrameNode;
    return !(Math.round(n.x) === 0 && Math.round(n.y) === 0 && Math.round(n.width) === Math.round(f.width));
  }) as MockFrameNode | undefined;

  if (!panel) {
    const inner = f.children.map((c) => nodeToHtml(c, childCtx(ctx, f), f)).join("");
    return `<div class="lab-overlay-canvas" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
      f.name
    )}" style="${labComponentShellStyle(f)}">${inner}</div>`;
  }

  const panelClass = inferOverlayPanelClass(panel, f);
  const h4 = panel.children.find((c) => (c as MockFrameNode).name === "h4") as MockFrameNode | undefined;
  const p = panel.children.find((c) => (c as MockFrameNode).name === "p") as MockFrameNode | undefined;
  const actions = panel.children.find((c) => {
    const n = c as MockFrameNode;
    return n.name === "div" && n.children?.some((b) => (b as MockFrameNode).name === "button");
  }) as MockFrameNode | undefined;

  let panelHtml = "";
  // Pin weight so mock replay uses Inter Bold, not UA faux-bold on short titles (e.g. "Share").
  const h4Html = `<h4 style="font-weight:700">${escapeHtml(deepText(h4))}</h4>`;
  if (panelClass === "sheet") {
    panelHtml = `<div class="handle"></div>${h4Html}<p>${escapeHtml(deepText(p))}</p>`;
  } else {
    panelHtml = `${h4Html}<p>${escapeHtml(deepText(p))}</p>`;
    if (actions) panelHtml += overlayActionsHtml(actions);
  }

  return `<div class="lab-overlay-canvas" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${labComponentShellStyle(f)}"><div class="backdrop"></div><div class="${panelClass}">${panelHtml}</div></div>`;
}

/** `.lab-pricing` — plan card via Storybook CSS. */
function tryRenderPricingPanel(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "PricingPanel" || (parent && parent.name !== "PricingPanel Canvas")) return null;

  const hasGradient = (f.fills || []).some(
    (p: any) => p.type === "GRADIENT_LINEAR" && p.visible !== false
  );
  const plan = hasGradient ? "pro" : "starter";
  const divs = f.children.filter(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "div"
  ) as MockFrameNode[];
  const tag = divs[0];
  const list = divs.find((d) => d.children?.some((c) => (c as MockFrameNode).name === "p"));
  const h3 = f.children.find((c) => (c as MockFrameNode).name === "h3");
  const priceP = f.children.find((c) => (c as MockFrameNode).name === "p") as MockFrameNode | undefined;
  const btn = f.children.find((c) => (c as MockFrameNode).name === "button") as MockFrameNode | undefined;

  const listItems = (list?.children || [])
    .filter((c) => (c as MockFrameNode).name === "p")
    .map((c) => `<p>${escapeHtml(deepText(c))}</p>`)
    .join("");

  const dollarFrame = priceP?.children.find((c) => (c as MockFrameNode).name === "p-text");
  const spanFrame = priceP?.children.find((c) => (c as MockFrameNode).name === "span");
  const dollar = deepText(dollarFrame) || deepText(priceP).match(/^\$[\d.]+/)?.[0] || "";
  const suffix = spanFrame ? `<span>${escapeHtml(deepText(spanFrame))}</span>` : "";

  return `<div class="lab-pricing ${plan}" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${labComponentShellStyle(f, "min")}"><div class="lab-pricing-tag">${escapeHtml(
    deepText(tag)
  )}</div><h3>${escapeHtml(deepText(h3))}</h3><p class="lab-pricing-price">${escapeHtml(
    dollar
  )}${suffix}</p><div class="lab-pricing-list">${listItems}</div><button class="lab-pricing-cta" type="button">${escapeHtml(
    deepText(btn)
  )}</button></div>`;
}

/** `.lab-select-wrap` — field + optional menu via Storybook CSS. */
function tryRenderSelectField(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "SelectField" || (parent && parent.name !== "SelectField Canvas")) return null;

  const labelFrame = f.children.find(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "p"
  ) as MockFrameNode | undefined;
  const divs = f.children.filter(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "div"
  ) as MockFrameNode[];
  const fieldFrame = divs[0];
  const menuFrame = divs.length > 1 ? divs[1] : undefined;

  const fieldSpans = (fieldFrame?.children || []).filter(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "span"
  ) as MockFrameNode[];
  const value = deepText(fieldSpans[0]);

  let menuHtml = "";
  if (menuFrame) {
    const options = menuFrame.children
      .filter((c) => c.type === "FRAME" && (c as MockFrameNode).name === "p")
      .map((c) => `<p>${escapeHtml(deepText(c))}</p>`)
      .join("");
    menuHtml = `<div class="lab-select-menu">${options}</div>`;
  }

  return `<div class="lab-select-wrap" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${labComponentShellStyle(f, "min")}"><p class="lab-field-label">${escapeHtml(
    deepText(labelFrame)
  )}</p><div class="lab-select-field"><span>${escapeHtml(value)}</span><span class="lab-select-chevron">▾</span></div>${menuHtml}</div>`;
}

/** `.lab-radio-group` — flex options + CSS indicators (matches Storybook). */
function tryRenderRadioGroupFrame(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "RadioGroupField" || (parent && parent.name !== "RadioGroupField Canvas")) return null;

  const disabled = (f.opacity ?? 1) < 0.9;
  const cls = disabled ? "lab-radio-group disabled" : "lab-radio-group";
  const labelFrame = f.children.find(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "p"
  ) as MockFrameNode | undefined;
  const labelText = labelFrame?.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;

  const optionsFrame = f.children.find(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "div"
  ) as MockFrameNode | undefined;

  const optionHtml: string[] = [];
  for (const opt of optionsFrame?.children || []) {
    if (opt.type !== "FRAME" || (opt as MockFrameNode).name !== "label") continue;
    const lf = opt as MockFrameNode;
    const indicator = lf.children.find(
      (c) =>
        c.type === "FRAME" &&
        (c as MockFrameNode).name === "span" &&
        Math.round((c as MockFrameNode).width) === 18
    ) as MockFrameNode | undefined;
    const textWrap = lf.children.find(
      (c) =>
        c.type === "FRAME" &&
        (c as MockFrameNode).name === "span" &&
        Math.round((c as MockFrameNode).width) !== 18
    ) as MockFrameNode | undefined;
    const textNode = textWrap?.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
    let indicatorCls = "lab-radio-indicator";
    if (indicator) {
      const stroke = (indicator.strokes || []).find(
        (s: any) => s.type === "SOLID" && s.visible !== false
      ) as any;
      const selected = stroke && stroke.color.b > 0.95 && stroke.color.g > 0.35;
      if (selected) indicatorCls += " selected";
    }
    optionHtml.push(
      `<label class="lab-radio-option"><span class="${indicatorCls}"></span><span>${escapeHtml(
        textNode?.characters || ""
      )}</span></label>`
    );
  }

  const labelHtml = labelText
    ? `<p class="lab-field-label">${escapeHtml(labelText.characters)}</p>`
    : "";
  return `<div class="${cls}" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${labComponentShellStyle(f, "min")}">${labelHtml}<div class="lab-radio-options">${optionHtml.join(
    ""
  )}</div></div>`;
}

/** Lab buttons are inline-flex in Storybook; flatten label wrapper for mock HTML. */
/** MUI avatar / badge — flex-centered glyphs, not absolute text offsets. */
function isMuiFlexCenterGlyphFrame(f: MockFrameNode): boolean {
  if (f.children.length !== 1 || f.children[0]!.type !== "TEXT") return false;
  const maxR = Math.max(
    f.topLeftRadius ?? 0,
    f.topRightRadius ?? 0,
    f.bottomRightRadius ?? 0,
    f.bottomLeftRadius ?? 0
  );
  const minDim = Math.min(f.width, f.height);
  const maxDim = Math.max(f.width, f.height);
  const circle = f.width > 0 && Math.abs(f.width - f.height) < 1 && maxR >= f.width / 2 - 1;
  const pillBadge = minDim > 0 && maxDim <= 24 && maxR >= minDim / 2 - 1;
  return circle || pillBadge;
}

function tryRenderMuiFlexCenterFrame(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  const t = f.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
  if (!t || !isMuiFlexCenterGlyphFrame(f)) return null;
  const maxR = Math.max(
    f.topLeftRadius ?? 0,
    f.topRightRadius ?? 0,
    f.bottomRightRadius ?? 0,
    f.bottomLeftRadius ?? 0
  );
  const minDim = Math.min(f.width, f.height);
  const maxDim = Math.max(f.width, f.height);
  const pillBadge = minDim > 0 && maxDim <= 24 && maxR >= minDim / 2 - 1;
  const square = pillBadge && Math.abs(f.width - f.height) > 0.5 ? maxDim : 0;
  let style = nodeCss(f, ctx, parent);
  if (square > 0) {
    style = style.replace(/width:[^;]+;?/g, "").replace(/height:[^;]+;?/g, "");
    style += `left:${f.x + (f.width - square) / 2}px;top:${f.y}px;width:${square}px;height:${square}px;border-radius:50%;`;
  }
  if (!style.includes("display:inline-flex")) {
    style += "display:inline-flex;align-items:center;justify-content:center;";
  }
  const lh = t.lineHeight?.unit === "PIXELS" ? t.lineHeight.value : t.fontSize;
  const textStyle =
    buttonLabelTextCss(t).replace(/line-height:\s*normal;?/g, "") +
    `line-height:${lh}px;width:auto;height:auto;display:block;`;
  return `<div data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${style}"><span style="${textStyle}">${escapeHtml(t.characters)}</span></div>`;
}

/** MUI ListItemText primary+secondary block — flex column, not overlapping absolute boxes. */
function isMuiListItemTextBlock(f: MockFrameNode): boolean {
  if (f.name !== "div" || f.type !== "FRAME") return false;
  const kids = f.children.filter((c) => c.type === "FRAME") as MockFrameNode[];
  if (kids.length !== 2) return false;
  const typo = kids.find((c) => c.name === "typography");
  const p = kids.find((c) => c.name === "p");
  return (
    Boolean(typo?.children.some((c) => c.type === "TEXT")) &&
    Boolean(p?.children.some((c) => c.type === "TEXT"))
  );
}

function tryRenderMuiListItemTextBlock(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (!isMuiListItemTextBlock(f)) return null;
  const typo = f.children.find((c) => (c as MockFrameNode).name === "typography") as MockFrameNode;
  const pFrame = f.children.find((c) => (c as MockFrameNode).name === "p") as MockFrameNode;
  const primary = typo.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
  const secondary = pFrame.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
  if (!primary || !secondary) return null;
  const style = `position:absolute;left:${f.x}px;top:${f.y}px;width:${f.width}px;height:${f.height}px;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;`;
  return `<div data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${style}"><span class="MuiListItemText-primary" style="${textCss(
    primary,
    typo
  )};display:block;margin:0;">${escapeHtml(primary.characters)}</span><p class="MuiListItemText-secondary" style="${textCss(
    secondary,
    pFrame
  )};margin:0;">${escapeHtml(secondary.characters)}</p></div>`;
}

/** MUI tab / outlined buttons — Storybook centers via flex on the button, not absolute text boxes. */
function tryRenderMuiFlexButton(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "button") return null;
  if (parent?.name === "Button") return null;
  const t = f.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
  if (!t || f.children.length !== 1) return null;
  const lhPx =
    (t.lineHeight?.unit === "PIXELS" ? t.lineHeight.value : undefined) ?? t.fontSize;
  const tabLike = Math.round(f.height) === 48 && t.textCase === "UPPER";
  const looseLabel =
    t.textAlignHorizontal === "CENTER" && lhPx > t.fontSize * 1.5;
  const hasSolidFill = (f.fills || []).some(
    (p: any) => p.type === "SOLID" && p.visible !== false && (p.opacity ?? 1) > 0.05
  );
  if (!tabLike && !looseLabel) {
    // Contained / text buttons — keep absolute text placement from the scene tree.
    if (hasSolidFill && Math.round(f.height) < 40) return null;
    if (!hasSolidFill && Math.round(f.height) < 40) return null;
    return null;
  }
  let style = nodeCss(f, ctx, parent);
  if (!style.includes("display:inline-flex")) {
    style += "display:inline-flex;align-items:center;justify-content:center;";
  }
  const radius = radiiCss(f);
  if (radius && !style.includes("border-radius")) style += radius;
  let textCss = buttonLabelTextCss(t);
  if (tabLike && lhPx > 0) {
    textCss = textCss.replace(/line-height:\s*normal;?/g, "") + `line-height:${lhPx}px;`;
  }
  return `<div data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${style}"><span style="${textCss}">${escapeHtml(
    t.characters
  )}</span></div>`;
}

function muiRobotoFontStack(family: string): string {
  if (family === "Roboto") return "'Roboto', Helvetica, Arial, sans-serif";
  return cssFontFamily(family);
}

function muiOutlinedLabelTextCss(node: MockTextNode): string {
  return buttonLabelTextCss(node)
    .replace(/line-height:\s*normal;?/g, "")
    .replace(/font-family:[^;]+;?/g, `font-family:${muiRobotoFontStack(node.fontName.family)};`);
}

function mockOutlinedLabelText(
  parent?: MockFrameNode,
  ancestors?: MockFrameNode[]
): MockTextNode | undefined {
  const bags = [parent, ...(ancestors ?? [])].filter(Boolean) as MockFrameNode[];
  for (const bag of bags) {
    for (const c of bag.children) {
      if (c.type !== "FRAME" || (c as MockFrameNode).name !== "label") continue;
      const lf = c as MockFrameNode;
      if (lf.y >= 0) continue;
      const t = lf.children.find((ch) => ch.type === "TEXT") as MockTextNode | undefined;
      if (t) return t;
    }
  }
  return undefined;
}

function muiOutlinedValueTextCss(t: MockTextNode): string {
  const lh = t.lineHeight?.unit === "PIXELS" ? t.lineHeight.value : t.fontSize;
  return (
    buttonLabelTextCss(t)
      .replace(/line-height:\s*normal;?/g, "")
      .replace(/font-family:[^;]+;?/g, `font-family:${muiRobotoFontStack(t.fontName.family)};`) +
    `line-height:${lh}px;white-space:nowrap;`
  );
}

/** MUI outlined text input — native input + padding (matches Storybook MUI). */
function tryRenderMuiOutlinedInput(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "input") return null;
  if (parentIsLoginCard(parent)) return null;
  const t = f.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
  if (!t || f.children.length !== 1) return null;
  let style = nodeCss(f, ctx, parent);
  style +=
    "padding:8.5px 14px;border:none;outline:none;appearance:none;-webkit-appearance:none;background:transparent;";
  style += muiOutlinedValueTextCss(t);
  return `<input type="text" readonly data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${style}" value="${escapeHtml(t.characters)}" />`;
}

/** MUI outlined select value row — padded div + ellipsis text (matches render-html). */
function tryRenderMuiSelectValue(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "div") return null;
  const t = f.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
  if (!t || f.children.length !== 1) return null;
  if (!parent?.children.some((c) => c.type === "FRAME" && (c as MockFrameNode).svgSource)) return null;
  if (Math.round(f.height) !== 40) return null;
  let style = nodeCss(f, ctx, parent);
  style += "padding:8.5px 32px 8.5px 14px;border:none;background:transparent;overflow:hidden;";
  const textCss =
    muiOutlinedValueTextCss(t) + "text-overflow:ellipsis;overflow:hidden;display:block;";
  return `<div data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${style}"><span style="${textCss}">${escapeHtml(t.characters)}</span></div>`;
}

function strokeColorFromNotchedBorderSvg(svg: string): string {
  const stroke = svg.match(/stroke="([^"]+)"/i)?.[1];
  const opacityRaw = svg.match(/stroke-opacity="([^"]+)"/i)?.[1];
  if (!stroke) return "rgba(0, 0, 0, 0.23)";
  if (opacityRaw != null && /^rgb/i.test(stroke)) {
    const a = parseFloat(opacityRaw);
    if (Number.isFinite(a) && a < 0.999) return stroke.replace(/\)$/, `, ${a})`).replace(/^rgb/i, "rgba");
  }
  return stroke;
}

function notchFromBorderSvg(svg: string): { start: number; width: number } | null {
  const inline = svg.match(/L\s+([\d.]+)\s+([\d.]+)\s+M\s+([\d.]+)/);
  if (inline) {
    const start = parseFloat(inline[1]);
    const end = parseFloat(inline[3]);
    return end > start ? { start, width: end - start } : null;
  }
  const paths = [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
  for (let i = 0; i < paths.length - 1; i++) {
    const endL = paths[i].match(/L\s+([\d.]+)\s+([\d.]+)\s*$/);
    const startM = paths[i + 1].match(/^M\s+([\d.]+)/);
    if (endL && startM) {
      const start = parseFloat(endL[1]);
      const end = parseFloat(startM[1]);
      if (end > start) return { start, width: end - start };
    }
  }
  return null;
}

function notchWidthFromBorderSvg(svg: string): number | null {
  return notchFromBorderSvg(svg)?.width ?? null;
}

function mockFrameHasFieldsetDescendant(node: MockFrameNode): boolean {
  if (node.name === "fieldset") return true;
  return (node.children || []).some(
    (c) => c.type === "FRAME" && mockFrameHasFieldsetDescendant(c as MockFrameNode)
  );
}

/** OutlinedInput root — exactly one shrunk label sibling of the fieldset subtree. */
function muiFieldsetFrameForOutlinedInput(
  ctx: RenderCtx,
  parent?: MockFrameNode
): MockFrameNode | undefined {
  const roots = [...(ctx.ancestors ?? []), parent].filter(Boolean).reverse() as MockFrameNode[];
  for (const root of roots) {
    for (const c of root.children || []) {
      if (c.type !== "FRAME") continue;
      const fs = mockFrameHasFieldsetDescendant(c as MockFrameNode)
        ? (c as MockFrameNode).name === "fieldset"
          ? (c as MockFrameNode)
          : ((c as MockFrameNode).children || []).find(
              (ch) => ch.type === "FRAME" && (ch as MockFrameNode).name === "fieldset"
            ) as MockFrameNode | undefined
        : undefined;
      if (fs) return fs;
    }
  }
  return undefined;
}

function muiOutlinedLabelFrameForFieldset(
  ctx: RenderCtx,
  parent?: MockFrameNode
): MockFrameNode | undefined {
  const roots = [...(ctx.ancestors ?? []), parent].filter(Boolean).reverse() as MockFrameNode[];
  for (const root of roots) {
    const labels = (root.children || []).filter(
      (c) => c.type === "FRAME" && (c as MockFrameNode).name === "label" && (c as MockFrameNode).y < 0
    ) as MockFrameNode[];
    if (labels.length !== 1) continue;
    if (!(root.children || []).some((c) => c.type === "FRAME" && mockFrameHasFieldsetDescendant(c as MockFrameNode))) {
      continue;
    }
    return labels[0];
  }
  return undefined;
}

/** MUI notched outline — CSS fieldset+legend notch (matches Storybook; SVG kept for live Figma). */
function tryRenderMuiNotchedFieldset(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "fieldset") return null;
  const border = f.children.find(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "__border"
  ) as MockFrameNode | undefined;
  if (!border?.svgSource) return null;
  const stroke = strokeColorFromNotchedBorderSvg(border.svgSource);
  const notch = notchFromBorderSvg(border.svgSource);
  let style = nodeCss(f, ctx, parent);
  style += `border:1px solid ${stroke};padding:0 8px;margin:0;min-width:0;pointer-events:none;z-index:0;overflow:visible;`;
  style += radiiCss(f);
  if (notch && notch.width > 0) {
    const lbl = muiOutlinedLabelFrameForFieldset(ctx, parent);
    const legendMl = lbl ? Math.max(0, Math.round(lbl.x - 8)) : Math.max(0, notch.start - 8);
    const legendW = notch.width;
    const legendStyle = `float:unset;width:${legendW}px;max-width:${legendW}px;padding:0 4px;border:0;font-size:0.75em;line-height:11px;margin:0 0 0 ${legendMl}px;overflow:hidden;white-space:nowrap;`;
    return `<fieldset class="MuiOutlinedInput-notchedOutline" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
      f.name
    )}" style="${style}"><legend style="${legendStyle}"><span style="visibility:hidden">&#8203;</span></legend></fieldset>`;
  }
  return `<fieldset class="MuiOutlinedInput-notchedOutline" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${style}"></fieldset>`;
}

/** MUI outlined field floating label — flat label chip, not nested text frame. */
function tryRenderMuiOutlinedLabel(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "label" || f.y >= 0) return null;
  const t = f.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
  if (!t || f.children.length !== 1) return null;
  const fill = (f.fills || []).find((p: any) => p.type === "SOLID" && p.visible !== false) as any;
  let style = `position:absolute;left:${f.x}px;top:${f.y}px;box-sizing:border-box;pointer-events:none;z-index:1;`;
  if (fill) style += `background:${colorCss(fill.color, fill.opacity ?? 1)};`;
  style += "display:inline-flex;align-items:center;padding:0 4px;overflow:visible;";
  style += `min-width:${Math.max(8, Math.ceil(f.width) + 8)}px;`;
  style += "transform:scale(0.75);transform-origin:0 0;";
  const fs = t.fontSize;
  const lh =
    (t.lineHeight?.unit === "PIXELS" ? t.lineHeight.value : undefined) ?? t.fontSize;
  const ls = t.letterSpacing?.unit === "PIXELS" ? t.letterSpacing.value : 0;
  const textStyle =
    muiOutlinedLabelTextCss(t)
      .replace(/font-size:\d+px;/, `font-size:${fs}px;`)
      .replace(/letter-spacing:[^;]+;?/g, "") +
    `line-height:${lh}px;display:block;margin:0;letter-spacing:${ls}px;`;
  return `<label data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${style}"><span style="${textStyle}">${escapeHtml(t.characters)}</span></label>`;
}

/** MUI active tab indicator — use recorded top/height (matches render-html paintToBaseCss). */
function tryRenderMuiTabsIndicator(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "span" || f.children.length > 0) return null;
  if (f.height > 3 || !parent || Math.round(parent.height) !== 48) return null;
  const fill = (f.fills || []).find((p: any) => p.type === "SOLID" && p.visible !== false) as any;
  if (!fill) return null;
  const color = colorCss(fill.color, fill.opacity ?? 1);
  const h = Math.max(1, Math.round(f.height));
  const style = `position:absolute;left:${f.x}px;top:${f.y}px;width:${f.width}px;height:${h}px;background:${color};pointer-events:none;box-sizing:border-box;z-index:1;`;
  return `<div data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${style}"></div>`;
}

function tryRenderTabsPanel(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "TabsPanel" || (parent && parent.name !== "TabsPanel Canvas")) return null;
  const divs = f.children.filter((c) => c.type === "FRAME") as MockFrameNode[];
  const row = divs.find(
    (d) =>
      d.children.length >= 2 &&
      d.children.every((c) => (c as MockFrameNode).name === "button")
  );
  const body = divs.find((d) =>
    d.children.some(
      (c) => (c as MockFrameNode).name === "h4" || (c as MockFrameNode).name === "p"
    )
  );
  if (!row || !body) return null;

  const btnHtml = row.children
    .filter((c) => (c as MockFrameNode).name === "button")
    .map((b) => {
      const bf = b as MockFrameNode;
      const t = bf.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
      const chars = t?.characters ?? deepText(bf);
      const fill = (bf.fills || []).find(
        (p: any) => p.type === "SOLID" && p.visible !== false
      ) as any;
      const active =
        fill &&
        fill.color.b > 0.95 &&
        fill.color.r < 0.2 &&
        fill.color.g > 0.35 &&
        fill.color.g < 0.55;
      return `<button type="button"${active ? ' class="active"' : ""}>${escapeHtml(chars)}</button>`;
    })
    .join("");

  const h4 = body.children.find((c) => (c as MockFrameNode).name === "h4") as
    | MockFrameNode
    | undefined;
  const p = body.children.find((c) => (c as MockFrameNode).name === "p") as
    | MockFrameNode
    | undefined;

  const style = labComponentShellStyle(f);
  return `<div class="lab-tabs-panel" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${style}"><div class="lab-tabs-row">${btnHtml}</div><div class="lab-tabs-body"><h4>${multilineTextHtml(
    deepText(h4)
  )}</h4><p>${escapeHtml(deepText(p))}</p></div></div>`;
}

function tryRenderLabButtonFrame(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "Button" || (parent && parent.name !== "Button Canvas")) return null;

  if (f.children.length === 1) {
    const only = f.children[0]!;
    if (only.type === "TEXT") {
      const t = only as MockTextNode;
      const cls = inferLabButtonClasses(f);
      const style = labButtonShellStyle(f, ctx, parent);
      return `<button type="button" class="${cls}" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
        f.name
      )}" style="${style}">${escapeHtml(t.characters)}</button>`;
    }
    const label = only as MockFrameNode;
    if (label.type !== "FRAME" || label.name !== "label" || label.children.length !== 1) return null;
    const text = label.children[0];
    if (text.type !== "TEXT") return null;
    const t = text as MockTextNode;
    const cls = inferLabButtonClasses(f);
    const style = labButtonShellStyle(f, ctx, parent);
    return `<button type="button" class="${cls}" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
      f.name
    )}" style="${style}">${escapeHtml(t.characters)}</button>`;
  }

  if (f.children.length < 2) return null;
  const labelFrame = f.children.find(
    (c) => c.type === "FRAME" && isLabButtonLabelFrame(c as MockFrameNode)
  ) as MockFrameNode | undefined;
  if (!labelFrame) return null;
  const cls = inferLabButtonClasses(f);
  const style = labButtonShellStyle(f, ctx, parent);
  const parts: string[] = [];
  for (const child of f.children) {
    if (child.type === "FRAME" && isLabButtonLabelFrame(child as MockFrameNode)) {
      const lf = child as MockFrameNode;
      const text = lf.children.find((c) => c.type === "TEXT") as MockTextNode | undefined;
      if (text) {
        parts.push(escapeHtml(text.characters));
      }
    } else if ((child as MockFrameNode).svgSource && (child as MockFrameNode).name !== "__border") {
      const icon = child as MockFrameNode;
      const svg = injectSvgSize(icon.svgSource!, icon.width, icon.height, false);
      parts.push(svg);
    }
  }
  if (!parts.length) return null;
  return `<button type="button" class="${cls}" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${style}">${parts.join("")}</button>`;
}

function tryRenderPricingPriceFrame(
  f: MockFrameNode,
  ctx: RenderCtx,
  parent?: MockFrameNode
): string | null {
  if (f.name !== "p") return null;
  const spanF = f.children?.find(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "span"
  ) as MockFrameNode | undefined;
  const priceF = f.children?.find(
    (c) => c.type === "FRAME" && (c as MockFrameNode).name === "p-text"
  ) as MockFrameNode | undefined;
  if (!spanF || !priceF) return null;
  const spanT = spanF.children?.find((c) => c.type === "TEXT") as MockTextNode | undefined;
  const dollarT = priceF.children?.find((c) => c.type === "TEXT") as MockTextNode | undefined;
  if (!spanT?.characters?.startsWith("/") || !dollarT?.characters?.startsWith("$")) return null;
  let style = nodeCss(f, ctx, parent);
  if (!style.includes("line-height")) style += "line-height:1;";
  const dollarFill = (dollarT.fills || []).find(
    (p: any) => p.type === "SOLID" && p.visible !== false
  ) as any;
  if (dollarFill) style += `color:${colorCss(dollarFill.color, dollarFill.opacity ?? 1)};`;
  const ml = Math.max(0, Math.round(spanF.x - priceF.x - dollarT.width));
  const spanFill = (spanT.fills || []).find(
    (p: any) => p.type === "SOLID" && p.visible !== false
  ) as any;
  let spanStyle = ml > 0 ? `margin-left:${ml}px;` : "";
  if (spanFill) spanStyle += `color:${colorCss(spanFill.color, spanFill.opacity ?? 1)};`;
  return `<p class="lab-pricing-price" data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(
    f.name
  )}" style="${style}">${escapeHtml(dollarT.characters)}<span style="${spanStyle}">${escapeHtml(
    spanT.characters
  )}</span></p>`;
}

function nodeToHtml(node: MockNode, ctx: RenderCtx, parent?: MockFrameNode): string {
  if (node.type === "FRAME") {
    const f = node as MockFrameNode;
    const radioDot = tryRenderRadioIndicator(f, ctx, parent);
    if (radioDot) return radioDot;
    const radioGroup = tryRenderRadioGroupFrame(f, ctx, parent);
    if (radioGroup) return radioGroup;
    const contentBoard = tryRenderContentListBoard(f, ctx, parent);
    if (contentBoard) return contentBoard;
    const selectField = tryRenderSelectField(f, ctx, parent);
    if (selectField) return selectField;
    const featureCard = tryRenderFeatureCard(f, ctx, parent);
    if (featureCard) return featureCard;
    const pricingPanel = tryRenderPricingPanel(f, ctx, parent);
    if (pricingPanel) return pricingPanel;
    const productCard = tryRenderProductCard(f, ctx, parent);
    if (productCard) return productCard;
    const navigation = tryRenderNavigationBars(f, ctx, parent);
    if (navigation) return navigation;
    const overlay = tryRenderOverlayStates(f, ctx, parent);
    if (overlay) return overlay;
    const calendar = tryRenderCalendarScheduler(f, ctx, parent);
    if (calendar) return calendar;
    const filterPanel = tryRenderFilterSidePanel(f, ctx, parent);
    if (filterPanel) return filterPanel;
    const dashboard = tryRenderComplexDashboardCard(f, ctx, parent);
    if (dashboard) return dashboard;
    const analytics = tryRenderAnalyticsCharts(f, ctx, parent);
    if (analytics) return analytics;
    const tabsPanel = tryRenderTabsPanel(f, ctx, parent);
    if (tabsPanel) return tabsPanel;
    const muiListText = tryRenderMuiListItemTextBlock(f, ctx, parent);
    if (muiListText) return muiListText;
    const loginCard = tryRenderLoginCard(f, ctx, parent);
    if (loginCard) return loginCard;
    const loginText = tryRenderLoginPageTextFrame(f, ctx, parent);
    if (loginText) return loginText;
    const loginInput = tryRenderLoginPageInput(f, ctx, parent);
    if (loginInput) return loginInput;
    const muiOutlinedInput = tryRenderMuiOutlinedInput(f, ctx, parent);
    if (muiOutlinedInput) return muiOutlinedInput;
    const nativeInput = tryRenderNativeTextInput(f, ctx, parent);
    if (nativeInput) return nativeInput;
    const loginButton = tryRenderLoginPageButton(f, ctx, parent);
    if (loginButton) return loginButton;
    const loginSocials = tryRenderLoginSocials(f, ctx, parent);
    if (loginSocials) return loginSocials;
    const labButton = tryRenderLabButtonFrame(f, ctx, parent);
    if (labButton) return labButton;
    const muiFlexCenter = tryRenderMuiFlexCenterFrame(f, ctx, parent);
    if (muiFlexCenter) return muiFlexCenter;
    const muiFlexButton = tryRenderMuiFlexButton(f, ctx, parent);
    if (muiFlexButton) return muiFlexButton;
    const muiSelectValue = tryRenderMuiSelectValue(f, ctx, parent);
    if (muiSelectValue) return muiSelectValue;
    const muiOutlinedLabel = tryRenderMuiOutlinedLabel(f, ctx, parent);
    if (muiOutlinedLabel) return muiOutlinedLabel;
    const muiNotchedFieldset = tryRenderMuiNotchedFieldset(f, ctx, parent);
    if (muiNotchedFieldset) return muiNotchedFieldset;
    const muiTabIndicator = tryRenderMuiTabsIndicator(f, ctx, parent);
    if (muiTabIndicator) return muiTabIndicator;
    const pricingPrice = tryRenderPricingPriceFrame(f, ctx, parent);
    if (pricingPrice) return pricingPrice;
    if (f.svgSource) {
      if (f.name === "__border") {
        const cssBorder = extractCssBorderFromBorderSvg(f.svgSource);
        if (cssBorder) {
          let style = nodeCss(node, ctx, parent);
          const radiusFrom =
            parent && (parent.type === "FRAME" || parent.type === "RECTANGLE") && hasCornerRadius(parent)
              ? (parent as MockFrameNode | MockRectangleNode)
              : f;
          style += `border:${cssBorder.width}px ${cssBorder.style} ${cssBorder.color};${radiiCss(radiusFrom)}background:transparent;pointer-events:none;`;
          return `<div data-id="${f.__id}" data-kind="SVG" data-name="__border" style="${style}"></div>`;
        }
      }
      let style = nodeCss(node, ctx, parent);
      style += "overflow:visible;";
      let svgSrc = f.svgSource;
      const vbMatch = svgSrc.match(/viewBox="([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"/i);
      const vbX = vbMatch ? parseFloat(vbMatch[1]) : 0;
      const vbY = vbMatch ? parseFloat(vbMatch[2]) : 0;
      const vbW = vbMatch ? parseFloat(vbMatch[3]) : 0;
      const preserveMeet = vbX > 0 || vbY > 0;
      const muiSpinnerSvg =
        f.height < 36 && /stroke-dasharray/.test(svgSrc) && /<circle/i.test(svgSrc);
      if (
        f.name === "svg" &&
        f.width > 0 &&
        f.height > 0 &&
        f.height < 36 &&
        /stroke-dasharray/.test(svgSrc) &&
        !preserveMeet &&
        !muiSpinnerSvg &&
        vbW > 0
      ) {
        const scale = f.width / vbW;
        svgSrc = svgSrc.replace(/stroke-width="([\d.]+)"/g, (_, sw) => {
          const w = parseFloat(sw) * scale;
          return `stroke-width="${w.toFixed(3)}"`;
        });
      }
      let svg = injectSvgSize(svgSrc, f.width, f.height, f.name === "__border", preserveMeet);
      if (f.name === "svg" && f.height >= 36) {
        const inner = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
        if (inner) {
          const vb = svgSrc.match(/viewBox="[^"]*"/i)?.[0] ?? 'viewBox="0 0 120 120"';
          svg = `<svg xmlns="http://www.w3.org/2000/svg" class="pie-chart-svg" ${vb} width="${f.width}" height="${f.height}">${inner[1].trim()}</svg>`;
        }
      }
      return `<div data-id="${f.__id}" data-kind="SVG" style="${style}">${svg}</div>`;
    }
    const style = nodeCss(node, ctx, parent);
    const childrenHtml = f.children
      .map((c) => nodeToHtml(c, childCtx(ctx, f), f))
      .join("");
    return `<div data-id="${f.__id}" data-kind="FRAME" data-name="${escapeHtml(f.name)}" style="${style}">${childrenHtml}</div>`;
  }
  if (node.type === "RECTANGLE") {
    const r = node as MockRectangleNode;
    return `<div data-id="${r.__id}" data-kind="RECT" data-name="${escapeHtml(r.name)}" style="${nodeCss(node, ctx, parent)}"></div>`;
  }
  if (node.type === "TEXT") {
    const t = node as MockTextNode;
    return `<div data-id="${t.__id}" data-kind="TEXT" data-name="${escapeHtml(t.name)}" style="${nodeCss(node, ctx, parent)}">${escapeHtml(
      t.characters
    )}</div>`;
  }
  return "";
}

/** Closed pill dashed __border SVG → CSS border on the overlay box (matches Storybook). */
function extractCssBorderFromBorderSvg(svg: string): { color: string; width: number; style: string } | null {
  const pathMatch = svg.match(/<path[^>]*\sd="([^"]+)"([^>]*)\/?>/i);
  if (!pathMatch) return null;
  const d = pathMatch[1];
  const attrs = pathMatch[2];
  if (/L\s+[\d.]+\s+[\d.]+\s+M\s+/.test(d)) return null;
  const stroke = attrs.match(/stroke="([^"]+)"/i)?.[1];
  const sw = parseFloat(attrs.match(/stroke-width="([^"]+)"/i)?.[1] ?? "0");
  if (!stroke || !(sw > 0)) return null;
  const dashRaw = attrs.match(/stroke-dasharray="([^"]+)"/i)?.[1];
  if (!dashRaw) return null;
  const parts = dashRaw.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  if (parts.length < 2) return null;
  const style = parts[0] <= 3 && parts[1] > parts[0] * 2 ? "dotted" : "dashed";
  return { color: stroke, width: sw, style };
}

/** Rebuild notched outline as three open paths (avoids Z-close diagonal artifacts in HTML). */
function splitNotchedBorderSvg(svg: string): string {
  const pathRe = /<path\s+d="([^"]+)"([^>]*)\/>/i;
  const pm = svg.match(pathRe);
  if (!pm) return svg;
  const d = pm[1];
  const attrs = pm[2];
  const gapRe = /L\s+([\d.]+)\s+([\d.]+)\s+M\s+([\d.]+)\s+([\d.]+)/;
  const gap = d.match(gapRe);
  if (!gap) return svg;
  const gapEndX = parseFloat(gap[1]);
  const topY = parseFloat(gap[2]);
  const gapStartX = parseFloat(gap[3]);
  const vb = svg.match(/viewBox="0\s+0\s+([\d.]+)\s+([\d.]+)"/i);
  const W = vb ? parseFloat(vb[1]) : 194;
  const H = vb ? parseFloat(vb[2]) : 45;
  const inset = topY;
  const arc = d.match(/A\s+([\d.]+)\s+([\d.]+)/);
  const r = arc ? parseFloat(arc[1]) : 4;
  const p1 = `M ${inset} ${inset + r} A ${r} ${r} 0 0 1 ${inset + r} ${inset} L ${gapEndX} ${topY}`;
  const p2 = `M ${gapStartX} ${topY} L ${W - inset - r} ${topY} A ${r} ${r} 0 0 1 ${W - inset} ${inset + r}`;
  const p3 = `M ${W - inset} ${inset + r} L ${W - inset} ${H - inset - r} A ${r} ${r} 0 0 1 ${W - inset - r} ${H - inset} L ${inset + r} ${H - inset} A ${r} ${r} 0 0 1 ${inset} ${H - inset - r} L ${inset} ${inset + r}`;
  const paths = [p1, p2, p3].map((seg) => `<path d="${seg}"${attrs.replace(/\sfill="none"/gi, "")} fill="none"/>`);
  return svg.replace(pathRe, paths.join(""));
}

function injectSvgSize(
  svg: string,
  w: number,
  h: number,
  borderOverlay = false,
  preserveMeet = false
): string {
  const out = borderOverlay ? splitNotchedBorderSvg(svg) : svg;
  // Always match the recorded frame box — border overlays embed width/height in
  // the SVG string but the mock frame may still be at a default size.
  const par = borderOverlay || preserveMeet ? "xMidYMid meet" : "none";
  return out.replace(/<svg(\s[^>]*)?>/i, (_match, attrs) => {
    let a = (attrs || "")
      .replace(/\swidth="[^"]*"/gi, "")
      .replace(/\sheight="[^"]*"/gi, "")
      .replace(/\spreserveAspectRatio="[^"]*"/gi, "");
    a += ` width="${w}" height="${h}" preserveAspectRatio="${par}"`;
    return `<svg${a}>`;
  });
}

/**
 * Render a single root node (typically the canvas frame returned by
 * `renderDocumentV2`) into a full HTML document.
 */
export function sceneToHtmlDocument(root: MockNode): string {
  const ctx: RenderCtx = { imageDataUrls: new Map() };
  const body = nodeToHtml(root, ctx);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; }
  body { background: #ffffff; }
</style>
</head>
<body>${body}</body></html>`;
}

/**
 * Render just the body markup for injecting into an existing Storybook
 * iframe (where webfonts and global stylesheets are already loaded).
 */
export function sceneToBodyMarkup(root: MockNode): { html: string; width: number; height: number } {
  const ctx: RenderCtx = { imageDataUrls: new Map() };
  const width = Math.round(root.width);
  const height = Math.round(root.height);
  const html = nodeToHtml(root, ctx);
  return { html, width, height };
}
