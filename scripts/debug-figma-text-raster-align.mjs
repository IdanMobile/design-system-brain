#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { manifestToContract } from "./figma-manifest-to-contract.mjs";
import { applyStorybookReferenceRasters, readPng } from "./figma-screen-reference-align.mjs";

const refBuf = await readFile("artifacts/figma-screens/screen_1.png");
const raw = JSON.parse(await readFile("artifacts/figma-screens/screen_1.manifest.json", "utf8"));
const doc = structuredClone(manifestToContract(raw, { referencePngBuffer: refBuf }));
applyStorybookReferenceRasters(doc.root, refBuf);

function absText(layer, ax = 0, ay = 0, out = []) {
  const x = ax + (layer.box?.x ?? 0);
  const y = ay + (layer.box?.y ?? 0);
  if (layer.source?.dataset?.figmaReferenceRaster === "text") {
    out.push({ name: layer.name, x, y, w: layer.box.width, h: layer.box.height });
  }
  for (const c of layer.children ?? []) absText(c, x, y, out);
  return out;
}

const texts = absText(doc.root);
console.log("rasterized text count", texts.length);

const { renderToBodyMarkup } = await import("../packages/pixel-test/src/render-html.ts");
const { bodyMarkup, width, height } = renderToBodyMarkup(doc);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width, height });
await page.setContent(
  `<html><body style="margin:0;position:relative;width:${width}px;height:${height}px">${bodyMarkup}</body></html>`
);

let maxDy = 0;
let worst = null;
for (const t of texts.slice(0, 30)) {
  const dom = await page.evaluate((name) => {
    const el = [...document.querySelectorAll("[data-name]")].find((e) => e.getAttribute("data-name") === name);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, t.name);
  if (!dom) continue;
  const dy = Math.abs(dom.y - t.y);
  const dx = Math.abs(dom.x - t.x);
  if (dy > maxDy) {
    maxDy = dy;
    worst = { t, dom, dx, dy };
  }
}
console.log("worst of first 30", worst);
await browser.close();

const png = readPng(refBuf);
const sample = worst?.t;
if (sample) {
  const i = (Math.floor(sample.y) * png.width + Math.floor(sample.x)) * 4;
  console.log(
    "ref pixel at contract origin",
    `#${[png.data[i], png.data[i + 1], png.data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`
  );
}
