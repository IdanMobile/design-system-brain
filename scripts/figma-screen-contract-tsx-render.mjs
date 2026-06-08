/**
 * Contract → codegen React TSX screenshot (playwright + Babel standalone).
 */

import {
  collectFontFamilies,
  contractUsesRtl,
  googleFontsCssUrl
} from "./figma-screen-contract-render.mjs";

/**
 * @param {import('playwright').Page} page
 * @param {object} doc — contract document
 * @param {string} outPath
 * @param {{ componentName: string }} opts
 */
export async function screenshotContractTsx(page, doc, outPath, { componentName }) {
  const { renderToReactComponentSource, renderToBodyMarkup } = await import(
    "../packages/pixel-test/src/render-tsx.ts"
  );
  const source = renderToReactComponentSource(doc, componentName, { moduleFormat: "eval" });
  const { width, height, background } = renderToBodyMarkup(doc);
  const rtl = contractUsesRtl(doc);
  const fontsUrl = googleFontsCssUrl(collectFontFamilies(doc.root));

  await page.setContent(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>`,
    { waitUntil: "domcontentloaded" }
  );

  await page.addScriptTag({
    url: "https://unpkg.com/react@18/umd/react.production.min.js"
  });
  await page.addScriptTag({
    url: "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"
  });
  await page.addScriptTag({
    url: "https://unpkg.com/@babel/standalone/babel.min.js"
  });

  if (fontsUrl) {
    await page.addStyleTag({ url: fontsUrl });
  }

  await page.addStyleTag({
    content: `*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important;}.lab-figma-tsx-screen,.lab-figma-tsx-screen *{-webkit-font-smoothing:subpixel-antialiased;-moz-osx-font-smoothing:auto;text-rendering:geometricPrecision;font-synthesis:none;}`
  });

  await page.evaluate(
    ({ source, componentName, width, height, background, rtl }) => {
      if (rtl) {
        document.documentElement.setAttribute("dir", "rtl");
        document.documentElement.setAttribute("lang", "he");
      }
      document.documentElement.style.margin = "0";
      document.body.style.margin = "0";
      document.body.style.padding = "0";
      document.documentElement.style.width = `${width}px`;
      document.documentElement.style.height = `${height}px`;
      document.body.style.width = `${width}px`;
      document.body.style.height = `${height}px`;
      document.body.style.overflow = "hidden";
      document.body.style.background = background;

      const wrapped = `${source}\n; window.__ScreenComponent = ${componentName};`;
      const transformed = globalThis.Babel.transform(wrapped, {
        presets: ["react"],
        filename: "screen.tsx"
      }).code;
      // eslint-disable-next-line no-eval
      eval(transformed);
      const Comp = window.__ScreenComponent;
      const rootEl = document.getElementById("root");
      const root = ReactDOM.createRoot(rootEl);
      root.render(React.createElement(Comp));
    },
    { source, componentName, width, height, background, rtl }
  );

  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.setViewportSize({ width, height });
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width, height } });
}
