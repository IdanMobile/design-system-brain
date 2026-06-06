import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { renderToBodyMarkup } from "../packages/pixel-test/src/render-html.ts";

const doc = JSON.parse(
  readFileSync("./pixel-diffs/lab-retroterminalscreen-default/artifact.v2.json", "utf8")
);
const rendered = renderToBodyMarkup(doc);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });

const sbPage = await ctx.newPage();
await sbPage.goto(
  "http://127.0.0.1:6107/iframe.html?id=lab-retroterminalscreen--default&viewMode=story",
  { waitUntil: "networkidle" }
);
const sbEl = await sbPage.$("[data-figma-component]");
await sbEl.screenshot({ path: "/tmp/sb.png" });

const rhPage = await ctx.newPage();
await rhPage.goto(
  "http://127.0.0.1:6107/iframe.html?id=lab-retroterminalscreen--default&viewMode=story",
  { waitUntil: "networkidle" }
);
await rhPage.evaluate(
  (payload) => {
    const styleId = "__pixel_test_reset";
    if (!document.getElementById(styleId)) {
      const s = document.createElement("style");
      s.id = styleId;
      s.textContent = `
        html, body { margin: 0 !important; padding: 0 !important; }
        #__pixel_test_root .layer :is(h1,h2,h3,h4,h5,h6,p,pre) { margin-block: 0; }
      `;
      document.head.appendChild(s);
    }
    document.body.innerHTML = `<div id="__pixel_test_root" style="position:relative;width:${payload.width}px;height:${payload.height}px;background:${payload.background};">${payload.markup}</div>`;
  },
  {
    markup: rendered.bodyMarkup,
    width: rendered.width,
    height: rendered.height,
    background: rendered.background
  }
);
await rhPage.evaluate(() => document.fonts.ready);
const rhEl = await rhPage.$("#__pixel_test_root");
await rhEl.screenshot({ path: "/tmp/rh.png" });

const a = PNG.sync.read(readFileSync("/tmp/sb.png"));
const b = PNG.sync.read(readFileSync("/tmp/rh.png"));
const diff = new PNG({ width: a.width, height: a.height });
const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.2 });
writeFileSync("/tmp/diff.png", PNG.sync.write(diff));
console.log({ w: a.width, h: a.height, diff: n, pct: ((100 * n) / (a.width * a.height)).toFixed(3) });
await browser.close();
