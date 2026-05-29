#!/usr/bin/env node
/** NavigationBars top story should auto-detect 4 interactive layers (3 links + CTA). */

import { chromium } from "playwright";

const url = process.env.PLAYGROUND_URL ?? "http://127.0.0.1:6108";
const storyId = "lab-navigationbars--top-navigation";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${url}/?view=showcase`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".showcase-card", { timeout: 10_000 });

  const card = await page.$(`article.showcase-card:has(code[title="${storyId}"])`);
  if (!card) throw new Error(`no card for ${storyId}`);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);

  const countText = await card.$eval(
    ".layer-panel__detected .layer-panel__label",
    (el) => el.textContent?.trim() ?? ""
  );
  console.log("label:", countText);
  const m = countText.match(/\((\d+)\)/);
  const count = m ? Number(m[1]) : 0;
  if (count < 4) throw new Error(`expected ≥4 detected behaviours, got ${count}`);
  console.log(`✓ ${count} interactive layers auto-detected`);

  const propsOnly = await card.$(".layer-panel__react-details");
  if (propsOnly) throw new Error("story JSX block should be removed — props only");
  const propsCode = await card.$(".layer-panel__react-model .layer-panel__code");
  if (!propsCode) throw new Error("missing props code block");
  console.log("✓ React model shows props only");
} finally {
  await browser.close();
}
