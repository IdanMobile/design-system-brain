/**
 * Contract → HTML screenshot helpers (Storybook iframe or playground shell).
 * Used by vsStorybook / vsReactHtml parity legs — no story map required.
 */

export function collectFontFamilies(node, out = new Set()) {
  if (node?.text?.font?.family) out.add(String(node.text.font.family).trim());
  for (const child of node?.children ?? []) collectFontFamilies(child, out);
  return out;
}

export function contractUsesRtl(doc) {
  const walk = (node) => {
    if (node?.text?.direction === "rtl") return true;
    if (node?.text?.value && /[\u0590-\u05FF\u0600-\u06FF]/.test(node.text.value)) return true;
    return (node?.children ?? []).some(walk);
  };
  return walk(doc.root);
}

export function googleFontsCssUrl(families) {
  const params = [...families]
    .filter((f) => f && !/^(serif|sans-serif|monospace|inherit)$/i.test(f))
    .map((f) => `family=${encodeURIComponent(f.replace(/\s+/g, " "))}:wght@400;500;600;700`)
    .join("&");
  return params ? `https://fonts.googleapis.com/css2?${params}&display=swap` : null;
}

/**
 * @param {import('playwright').Page} page
 * @param {object} doc — contract document
 * @param {string} outPath
 * @param {{ shellUrl: string }} opts
 */
export async function screenshotContractHtml(page, doc, outPath, { shellUrl }) {
  const { renderToBodyMarkup } = await import("../packages/pixel-test/src/render-html.ts");
  const {
    bodyMarkup: markup,
    width,
    height,
    background = doc.meta?.canvasBackground ?? "#ffffff",
  } = renderToBodyMarkup(doc);
  const rtl = contractUsesRtl(doc);
  const fontsUrl = googleFontsCssUrl(collectFontFamilies(doc.root));

  await page.goto(shellUrl, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  if (fontsUrl) {
    await page.addStyleTag({ url: fontsUrl });
  }
  await page.addStyleTag({
    content: `*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important;}.layer.figma{-webkit-font-smoothing:subpixel-antialiased;-moz-osx-font-smoothing:auto;text-rendering:geometricPrecision;font-synthesis:none;}`,
  });
  await page.evaluate(
    (payload) => {
      if (payload.rtl) {
        document.documentElement.setAttribute("dir", "rtl");
        document.documentElement.setAttribute("lang", "he");
      }
      document.body.innerHTML = payload.markup;
      document.body.style.margin = "0";
      document.body.style.padding = "0";
      document.body.style.background = payload.background;
      document.documentElement.style.width = `${payload.width}px`;
      document.documentElement.style.height = `${payload.height}px`;
      document.body.style.width = `${payload.width}px`;
      document.body.style.height = `${payload.height}px`;
      document.body.style.overflow = "hidden";
    },
    { markup, width, height, background, rtl }
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.setViewportSize({ width, height });
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width, height } });
}
