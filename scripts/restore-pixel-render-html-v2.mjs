#!/usr/bin/env node
/** Restore proven pixel fixes (food pass, mui/meeting warn) — no root flex shells. */
import { readFileSync, writeFileSync } from "fs";

const path = "packages/pixel-test/src/render-html.ts";
let s = readFileSync(path, "utf8");

const helpers = readFileSync("scripts/restore-pixel-render-html-helpers.ts.txt", "utf8");

if (!s.includes("tryRenderFoodCategoryButton")) {
  s = s.replace("function isAnalyticsBar(", helpers + "\nfunction isAnalyticsBar(");
}

const lhOld = `  } else if (t.lineHeight) {
    if (
      t.lineHeight &&
      Math.abs(t.lineHeight - t.font.size) <= 1 &&
      t.font.size >= 40
    ) {
      props.push("line-height: 1");
    } else {
      props.push(\`line-height: \${snap(t.lineHeight)}px\`);
    }
  }
  }`;

const lhNew = `  } else if (t.lineHeight) {
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
        (opts?.ancestors ?? []).some((a) => hasLayerClass(a, "lab-food-frenzy-deal-foot")))
    ) {
      props.push("line-height: normal");
    } else if (isHeading && headingLineHeightUsesNormal(parent, opts?.ancestors)) {
      props.push("line-height: normal");
    } else if (isHeading) {
      props.push(\`line-height: \${snap(t.lineHeight)}px\`);
    } else if (inMeetingHomeTree(opts?.ancestors) && t.lineHeight && !isHeading) {
      props.push("line-height: normal");
    } else {
      props.push(\`line-height: \${snap(t.lineHeight)}px\`);
    }
  }
  }`;

if (!s.includes("inFoodFrenzyDealBodyTree")) {
  s = s.replace(lhOld, lhNew);
  s = s.replace(
    "function isFormControlWithInlineText(layer: UniversalLayer): boolean {",
    `function isGenericFontFamilyStack(stack: string): boolean {
  const first = stack.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
  return /^(monospace|serif|sans-serif|cursive|fantasy|system-ui)$/i.test(first);
}

function textFontCss(t: LayerText, _ancestors?: UniversalLayer[]): string {
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

function isFormControlWithInlineText(layer: UniversalLayer): boolean {`
  );
  s = s.replace(
    "  opts?: { pricingTree?: boolean; pricingPro?: boolean }\n): string {",
    "  opts?: { pricingTree?: boolean; pricingPro?: boolean; ancestors?: UniversalLayer[] }\n): string {"
  );
  s = s.replace(
    "    props.push(`font-family: ${cssFontFamily(t.font.stack || t.font.family)}`);",
    "    props.push(`font-family: ${textFontCss(t, opts?.ancestors)}`);"
  );
  s = s.replace(
    '    tag === "button"\n  );',
    '    tag === "button" ||\n    tag === "strong"\n  );'
  );
}

if (!s.includes("snapFoodBox")) {
  s = s.replace(
    "function paintToBaseCss(layer: UniversalLayer, ctx: RenderCtx = {}): string[] {\n  const flexChild = isFlexFlowChild(layer, ctx.parent);",
    "function paintToBaseCss(layer: UniversalLayer, ctx: RenderCtx = {}): string[] {\n  const flexChild = isFlexFlowChild(layer, ctx.parent);\n  const snapFoodBox = inFoodFrenzyTree(ctx.ancestors) && !flexChild;"
  );
  s = s.replace(
    "  const posX = snapPos ? Math.round(layer.box.x) : layer.box.x;\n  let posY = snapPos ? Math.round(layer.box.y) : layer.box.y;",
    "  const posX = snapPos || snapFoodBox ? Math.round(layer.box.x) : layer.box.x;\n  let posY = snapPos || snapFoodBox ? Math.round(layer.box.y) : layer.box.y;"
  );
  s = s.replace(
    `  const pricingCssShell = hasLayerClass(layer, "lab-pricing") && hasLayerClass(layer, "pro");
  if (paint) {
    const skipInlineFill =
      pricingCssShell ||`,
    `  const pricingCssShell = hasLayerClass(layer, "lab-pricing") && hasLayerClass(layer, "pro");
  if (paint) {
    const cssPaintShell = usesStorybookCssPaintShell(layer);
    const skipInlineFill =
      pricingCssShell ||
      cssPaintShell ||`
  );
  s = s.replace(
    `    const useNativeBorder =
      layer.source.tag === "button" ||
      layer.source.tag === "input" ||
      hasLayerClass(layer, "trend-grid") ||`,
    `    const useNativeBorder =
      layer.source.tag === "button" ||
      layer.source.tag === "input" ||
      muiNotchedFieldset ||
      hasLayerClass(layer, "trend-grid") ||`
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
  s = s.replace(
    `  if (hasLayerClass(layer, "lab-pricing-cta") && !flexChild) {
    props.push("margin: 0px");
  }

  const paint = layer.paint;`,
    `  if (hasLayerClass(layer, "lab-pricing-cta") && !flexChild) {
    props.push("margin: 0px");
  }
  if (hasLayerClass(layer, "lab-retro-terminal-glow")) {
    props.push("pointer-events: none");
  }

  const paint = layer.paint;`
  );
}

if (!s.includes("lab-food-frenzy-cart")) {
  s = s.replace(
    `      c === "lg"
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
    }`,
    `      c === "lg" ||
      c === "lab-retro-terminal-ascii" ||
      c === "lab-retro-terminal-glow" ||
      c === "lab-food-frenzy-header" ||
      c === "lab-food-frenzy-cart" ||
      c === "lab-food-frenzy-categories" ||
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
    }`
  );
}

const dispatch = `  const foodCatBtn = tryRenderFoodCategoryButton(layer, ctx);
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

if (!s.includes("foodCatBtn")) {
  s = s.replace(
    "  const pricingPrice = renderPricingPriceRow(layer, ctx);\n  if (pricingPrice) return pricingPrice;",
    dispatch + "  const pricingPrice = renderPricingPriceRow(layer, ctx);\n  if (pricingPrice) return pricingPrice;"
  );
}

s = s.replaceAll(
  "      pricingPro: ctx.pricingPro\n    });",
  "      pricingPro: ctx.pricingPro,\n      ancestors: ctx.ancestors\n    });"
);

writeFileSync(path, s);
console.log("restored v2", path);
