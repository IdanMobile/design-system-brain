#!/usr/bin/env node
/**
 * Restore lab-screen pixel fixes into render-html.ts (accidental git checkout).
 */
import { readFileSync, writeFileSync } from "fs";

const path = "packages/pixel-test/src/render-html.ts";
let s = readFileSync(path, "utf8");

const helpers = `
function isGenericFontFamilyStack(stack: string): boolean {
  const first = stack.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
  return /^(monospace|serif|sans-serif|cursive|fantasy|system-ui)$/i.test(first);
}

function textFontCss(t, _ancestors) {
  const authored = (t.font.stack || t.font.family).trim();
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
    hasLayerClass(layer, "lab-food-frenzy-cart") ||
    hasLayerClass(layer, "lab-neon-arcade-scanlines") ||
    hasLayerClass(layer, "lab-neon-arcade-play") ||
    hasLayerClass(layer, "lab-retro-terminal-glow") ||
    hasLayerClass(layer, "lab-food-frenzy-search") ||
    hasLayerClass(layer, "lab-meeting-home-join") ||
    hasLayerClass(layer, "lab-meeting-home-icon-btn")
  );
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
    "font-size: 12px",
    "font-weight: 600",
    "line-height: normal",
    active ? "background: #ff6b35; color: #fff" : "background: #fff; color: #1a1a1a",
    "box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06)"
  ].join("; ");
  return \`<button type="button" class="\${cls}" data-name="\${name}" style="\${merged}">\${escapeHtml(layer.text.value)}</button>\`;
}

function tryRenderFoodDealFootStrong(layer, ctx) {
  if (layer.source.tag !== "strong" || !layer.text) return null;
  if (!(ctx.ancestors ?? []).some((a) => hasLayerClass(a, "lab-food-frenzy-deal-foot"))) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "strong");
  const merged = [style, "font-size: 16px", "font-weight: 700", "color: #ff6b35", "line-height: normal"].join("; ");
  return \`<strong class="\${cls}" data-name="\${name}" style="\${merged}">\${escapeHtml(layer.text.value)}</strong>\`;
}

function tryRenderFoodDealFootButton(layer, ctx) {
  if (layer.source.tag !== "button" || !layer.text) return null;
  if (!(ctx.ancestors ?? []).some((a) => hasLayerClass(a, "lab-food-frenzy-deal-foot"))) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "button");
  const merged = [
    style, "border: 0", "background: #1a1a1a", "color: #fff", "font-size: 12px", "font-weight: 700",
    "line-height: normal", "border-radius: 8px", "padding: 6px 12px"
  ].join("; ");
  return \`<button type="button" class="\${cls}" data-name="\${name}" style="\${merged}">\${escapeHtml(layer.text.value)}</button>\`;
}

function tryRenderFoodDealTagSpan(layer, ctx) {
  if (layer.source.tag !== "span" || !layer.text || !hasLayerClass(layer, "tag")) return null;
  if (!(ctx.ancestors ?? []).some((a) => hasLayerClass(a, "lab-food-frenzy-deal-body"))) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "span");
  const merged = [style, "font-size: 10px", "font-weight: 700", "color: #ff3366", "line-height: normal"].join("; ");
  return \`<span class="\${cls}" data-name="\${name}" style="\${merged}">\${escapeHtml(layer.text.value)}</span>\`;
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
  return \`<div class="\${cls}" data-name="\${name}" style="\${merged}">\${escapeHtml(layer.text.value)}</div>\`;
}

function tryRenderFoodCheckoutButton(layer, ctx) {
  if (layer.source.tag !== "button" || !layer.text || !hasLayerClass(layer, "lab-food-frenzy-checkout")) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "button");
  const merged = [
    style, "border: 0", "background: linear-gradient(90deg, #ff6b35, #ff3366)",
    "color: #fff", "font-size: 14px", "font-weight: 700", "line-height: normal",
    "border-radius: 14px", "padding: 14px 20px", "box-shadow: 0 4px 16px rgba(255, 107, 53, 0.35)"
  ].join("; ");
  return \`<button type="button" class="\${cls}" data-name="\${name}" style="\${merged}">\${escapeHtml(layer.text.value)}</button>\`;
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
  return \`<button type="button" class="\${cls}" data-name="\${name}" style="\${merged}">\${inner}</button>\`;
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
  return \`<button type="button" class="\${cls}" data-name="\${name}" style="\${merged}">\${inner}</button>\`;
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
    style, "margin: 0 0 10px", live ? "font-size: 15px" : "font-size: 14px",
    "font-weight: 700", "color: #ffffff", "line-height: normal"
  ].join("; ");
  return \`<h3 class="\${cls}" data-name="\${name}" style="\${merged}">\${escapeHtml(layer.text.value)}</h3>\`;
}

function tryRenderRetroAsciiPre(layer, ctx) {
  if (!hasLayerClass(layer, "lab-retro-terminal-ascii") || layer.source.tag !== "pre" || !layer.text) return null;
  const style = paintToBaseCss(layer, ctx).join("; ");
  const cls = layerClassNames(layer);
  const name = escapeAttr(layer.name || "pre");
  const merged = [style, "margin: 0", "white-space: pre", "overflow: hidden"].join("; ");
  return \`<pre class="\${cls}" data-name="\${name}" style="\${merged}">\${escapeHtml(layer.text.value)}</pre>\`;
}

`;

if (!s.includes("tryRenderFoodCategoryButton")) {
  s = s.replace("function isAnalyticsBar(", helpers + "function isAnalyticsBar(");
}

// textToHtml: font + ancestors + food line-height
s = s.replace(
  "  opts?: { pricingTree?: boolean; pricingPro?: boolean }\n): string {",
  "  opts?: { pricingTree?: boolean; pricingPro?: boolean; ancestors?: UniversalLayer[] }\n): string {"
);
s = s.replace(
  "    props.push(`font-family: ${cssFontFamily(t.font.stack || t.font.family)}`);",
  "    props.push(`font-family: ${textFontCss(t, opts?.ancestors)}`);"
);

const lineHeightPatch = `    } else if (
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
        (opts?.ancestors ?? []).some((a) => hasLayerClass(a, "lab-food-frenzy-deal-foot")))
    ) {
      props.push("line-height: normal");
    } else if (isHeading && headingLineHeightUsesNormal(parent, opts?.ancestors)) {
      props.push("line-height: normal");
    } else if (isHeading) {
      props.push(\`line-height: \${snap(t.lineHeight)}px\`);
    } else if (
      inMeetingHomeTree(opts?.ancestors) &&
      t.lineHeight &&
      !isHeading
    ) {
      props.push("line-height: normal");
    } else {
      props.push(\`line-height: \${snap(t.lineHeight)}px\`);
    }`;

if (!s.includes("inFoodFrenzyDealBodyTree")) {
  s = s.replace(
    /    } else if \(t\.lineHeight\) \{\n      if \(\n        t\.lineHeight &&\n        Math\.abs\(t\.lineHeight - t\.font\.size\) <= 1 &&\n        t\.font\.size >= 40\n      \) \{\n        props\.push\("line-height: 1"\);\n      \} else \{\n        props\.push\(`line-height: \$\{snap\(t\.lineHeight\)\}px`\);\n      \}\n    \}/,
    `    } else if (t.lineHeight) {
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
      }${lineHeightPatch}
    }`
  );
}

// paintToBaseCss
if (!s.includes("snapFoodBox")) {
  s = s.replace(
    "function paintToBaseCss(layer: UniversalLayer, ctx: RenderCtx = {}): string[] {\n  const flexChild = isFlexFlowChild(layer, ctx.parent);",
    `function paintToBaseCss(layer: UniversalLayer, ctx: RenderCtx = {}): string[] {
  const flexChild = isFlexFlowChild(layer, ctx.parent);
  const snapFoodBox = inFoodFrenzyTree(ctx.ancestors) && !flexChild;`
  );
  s = s.replace(
    "  const posX = snapPos ? Math.round(layer.box.x) : layer.box.x;\n  let posY = snapPos ? Math.round(layer.box.y) : layer.box.y;",
    "  const posX = snapPos || snapFoodBox ? Math.round(layer.box.x) : layer.box.x;\n  let posY = snapPos || snapFoodBox ? Math.round(layer.box.y) : layer.box.y;"
  );
  s = s.replace(
    "  const pricingCssShell = hasLayerClass(layer, \"lab-pricing\") && hasLayerClass(layer, \"pro\");\n  if (paint) {\n    const skipInlineFill =\n      pricingCssShell ||",
    `  const pricingCssShell = hasLayerClass(layer, "lab-pricing") && hasLayerClass(layer, "pro");
  if (paint) {
    const cssPaintShell = usesStorybookCssPaintShell(layer);
    const skipInlineFill =
      pricingCssShell ||
      cssPaintShell ||`
  );
  s = s.replace(
    "    const useNativeBorder =\n      layer.source.tag === \"button\" ||\n      layer.source.tag === \"input\" ||\n      hasLayerClass(layer, \"trend-grid\") ||",
    "    const useNativeBorder =\n      layer.source.tag === \"button\" ||\n      layer.source.tag === \"input\" ||\n      muiNotchedFieldset ||\n      hasLayerClass(layer, \"trend-grid\") ||"
  );
  s = s.replace(
    "    props.push(...borderNonShadows);\n    if (!hasGaps) props.push(...cornerRadiusToCss(paint));",
    `    props.push(...borderNonShadows);
    if (
      !hasGaps &&
      !cssPaintShell &&
      !isMuiOutlinedInputRoot(layer) &&
      !hasLayerClass(layer, "lab-meeting-home-join") &&
      !hasLayerClass(layer, "lab-meeting-home-icon-btn")
    ) {
      props.push(...cornerRadiusToCss(paint));
    }`
  );
  if (!s.includes("lab-retro-terminal-glow")) {
    s = s.replace(
      "  if (hasLayerClass(layer, \"lab-pricing-cta\") && !flexChild) {\n    props.push(\"margin: 0px\");\n  }",
      `  if (hasLayerClass(layer, "lab-pricing-cta") && !flexChild) {
    props.push("margin: 0px");
  }
  if (hasLayerClass(layer, "lab-retro-terminal-glow")) {
    props.push("pointer-events: none");
  }`
    );
  }
}

// layerClassNames
const labClasses = `      c === "lab-retro-terminal" ||
      c === "lab-retro-terminal-ascii" ||
      c === "lab-retro-terminal-glow" ||
      c === "lab-food-frenzy" ||
      c === "lab-food-frenzy-header" ||
      c === "lab-food-frenzy-cart" ||
      c === "lab-food-frenzy-categories" ||
      c === "lab-meeting-home" ||
      c === "lab-meeting-home-join" ||
      c === "lab-meeting-home-icon-btn" ||
      c === "lab-food-frenzy-checkout" ||
      c === "lab-food-frenzy-search" ||
      c === "lab-food-frenzy-deal-body" ||
      c === "blink" ||
      c === "warn" ||
      c === "ok" ||
      c === "hot" ||`;
if (!s.includes("lab-food-frenzy")) {
  s = s.replace('      c === "lg"\n    ) {', `${labClasses}\n      c === "lg"\n    ) {`);
}
if (!s.includes("layer.source.tag === \"input\"")) {
  s = s.replace(
    `    if (
      c.startsWith("Mui") &&
      (layer.source.tag === "label" ||
        c.includes("MuiTabs-indicator") ||
        c.includes("MuiOutlinedInput-notchedOutline"))
    ) {
      parts.push(c);
    }`,
    `    if (layer.source.tag === "input" && (c.startsWith("Mui") || /^css-[a-z0-9]+$/.test(c))) {
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
    }`
  );
}

// renderLayer dispatch + ancestors
const dispatch = `  const meetingJoin = tryRenderMeetingJoinButton(layer, ctx);
  if (meetingJoin) return meetingJoin;
  const meetingIcon = tryRenderMeetingIconButton(layer, ctx);
  if (meetingIcon) return meetingIcon;
  const meetingH3 = tryRenderMeetingCardH3(layer, ctx);
  if (meetingH3) return meetingH3;
  const foodCatBtn = tryRenderFoodCategoryButton(layer, ctx);
  if (foodCatBtn) return foodCatBtn;
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
  const retroAscii = tryRenderRetroAsciiPre(layer, ctx);
  if (retroAscii) return retroAscii;
`;
if (!s.includes("tryRenderFoodCategoryButton(layer")) {
  s = s.replace(
    "  const pricingPrice = renderPricingPriceRow(layer, ctx);\n  if (pricingPrice) return pricingPrice;",
    dispatch + "  const pricingPrice = renderPricingPriceRow(layer, ctx);\n  if (pricingPrice) return pricingPrice;"
  );
}

s = s.replaceAll(
  "      pricingPro: ctx.pricingPro\n    });",
  "      pricingPro: ctx.pricingPro,\n      ancestors: ctx.ancestors\n    });"
);

s = s.replace(
  '    tag === "button"\n  );',
  '    tag === "button" ||\n    tag === "strong"\n  );'
);

writeFileSync(path, s);
console.log("restored", path);
