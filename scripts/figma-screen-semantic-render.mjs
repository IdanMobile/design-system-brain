/**
 * Contract → semantic React TSX screenshot (playwright + Babel + @lab/ui globals).
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectFontFamilies,
  contractUsesRtl,
  googleFontsCssUrl
} from "./figma-screen-contract-render.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string} name */
function uiComponentPath(name) {
  const flat = join(REPO, "packages/ui/src/components", `${name}.tsx`);
  if (existsSync(flat)) return flat;
  const nested = join(REPO, "packages/ui/src/components", name, `${name}.tsx`);
  if (existsSync(nested)) return nested;
  return null;
}

/** @param {string} source */
function stripModuleSyntax(source) {
  return source
    .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, "")
    .replace(/type\s+\w+\s*=\s*\{[\s\S]*?\};\s*/g, "")
    .replace(/interface\s+\w+\s*\{[\s\S]*?\}\s*/g, "")
    .replace(/^export\s+function\s+/gm, "function ")
    .replace(/^export\s+type\s+.*?;?\s*$/gm, "")
    .replace(/^export\s+/gm, "");
}

/** @param {string[]} componentNames @param {string} exportName */
function buildUiEvalBundle(componentNames, exportName) {
  const lines = [];
  for (const name of componentNames) {
    const path = uiComponentPath(name);
    if (!path) continue;
    const src = stripModuleSyntax(readFileSync(path, "utf8"));
    lines.push(`${src}\n; window.${name} = ${name};`);
    if (name === exportName) {
      lines.push(`window.Ui${name} = ${name};`);
    }
  }
  return lines.join("\n");
}

/**
 * @param {import('playwright').Page} page
 * @param {object} doc — contract document
 * @param {string} outPath
 * @param {{ componentName: string, storyId?: string, storyArgs?: Record<string, unknown> }} opts
 */
export async function screenshotSemanticTsx(page, doc, outPath, { componentName, storyId, storyArgs = {} }) {
  const { renderSemanticFromContract } = await import(
    "../packages/pixel-test/src/render-semantic-tsx.ts"
  );
  const { renderToBodyMarkup } = await import("../packages/pixel-test/src/render-html.ts");

  const { semantic, usedComponents } = renderSemanticFromContract(doc, {
    rootComponent: componentName,
    storyId,
    storyArgs,
    exportName: componentName
  });

  const { renderSemanticComponentSource } = await import(
    "../packages/pixel-test/src/render-semantic-tsx.ts"
  );
  const screenSource = renderSemanticComponentSource(semantic, componentName, { moduleFormat: "eval" });
  const uiBundle = buildUiEvalBundle(usedComponents, componentName);
  const { width, height, background } = renderToBodyMarkup(doc);
  const rtl = contractUsesRtl(doc);
  const fontsUrl = googleFontsCssUrl(collectFontFamilies(doc.root));
  const uiStyles = readFileSync(join(REPO, "packages/ui/src/styles.css"), "utf8");

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

  await page.addStyleTag({ content: uiStyles });
  await page.addStyleTag({
    content: `.lab-semantic-screen,.lab-semantic-screen *{-webkit-font-smoothing:subpixel-antialiased;text-rendering:geometricPrecision;font-synthesis:none;}`
  });

  await page.evaluate(
    ({ uiBundle, screenSource, componentName, width, height, background, rtl }) => {
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

      const uiTransformed = globalThis.Babel.transform(uiBundle, {
        presets: ["react", "typescript"],
        filename: "ui.tsx"
      }).code;
      // eslint-disable-next-line no-eval
      eval(uiTransformed);

      const wrapped = `${screenSource}\n; window.__ScreenComponent = ${componentName};`;
      const transformed = globalThis.Babel.transform(wrapped, {
        presets: ["react", "typescript"],
        filename: "screen.tsx"
      }).code;
      // eslint-disable-next-line no-eval
      eval(transformed);

      const Comp = window.__ScreenComponent;
      const rootEl = document.getElementById("root");
      const root = ReactDOM.createRoot(rootEl);
      root.render(React.createElement(Comp));
    },
    { uiBundle, screenSource, componentName, width, height, background, rtl }
  );

  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.setViewportSize({ width, height });
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width, height } });
}

/** @deprecated use screenshotSemanticTsx */
export async function screenshotContractTsx(page, doc, outPath, opts) {
  return screenshotSemanticTsx(page, doc, outPath, opts);
}
