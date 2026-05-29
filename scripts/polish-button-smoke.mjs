#!/usr/bin/env node
/**
 * Verifies the ✨ "Improve with AI" button on the new LayerPanel:
 *   1. Open showcase → loginpage card.
 *   2. + Add behaviour → pick an interactive layer (the Login button).
 *   3. Type a description, click ✨, expect the runtime-behaviour card to update.
 *   4. With LAB_LLM_API_KEY unset, the panel footer mentions "not set".
 */

import { chromium } from "playwright";

const url = process.env.PLAYGROUND_URL ?? "http://127.0.0.1:6108";
const storyId = "lab-loginpage--default";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(`${url}/?view=showcase`, { waitUntil: "networkidle" });
  await page.waitForSelector(".showcase-card", { timeout: 10_000 });
  await page.waitForTimeout(400);

  const card = await page.$(`article.showcase-card:has(code[title="${storyId}"])`);
  if (!card) throw new Error(`no card for ${storyId}`);

  await card.$eval(".layer-panel__tree-toggle", (b) => b.click());
  await page.waitForTimeout(200);

  // Pick the first interactive row in the tree
  const rows = await card.$$(".layer-row");
  let pickedRow = null;
  for (const row of rows) {
    if (await row.$(".layer-row__icon--interactive")) {
      pickedRow = row;
      break;
    }
  }
  if (!pickedRow) throw new Error("no interactive layer in tree");
  await pickedRow.click();
  await page.waitForTimeout(300);

  const desc = await card.$('.layer-panel__field textarea');
  if (!desc) throw new Error("editor textarea missing");
  await desc.fill("click to reveal a search input");

  const polishBtn = await card.$(".layer-panel__polish");
  if (!polishBtn) throw new Error("polish button not rendered");
  if (await polishBtn.isDisabled()) throw new Error("polish button disabled even with description");
  console.log("✓ polish button enabled");

  await polishBtn.click();
  await page.waitForTimeout(900);

  const cardText = await card.$eval(".layer-panel__card--behaviour", (el) => el.textContent?.trim());
  console.log("polished behaviour text:", JSON.stringify(cardText));
  if (!/click|show|search/i.test(cardText ?? "")) {
    throw new Error(`unexpected polished behaviour text: ${cardText}`);
  }
  console.log("✓ runtime-behaviour card updated by polish");

  const note = await card.$eval(".layer-panel__polish-row .layer-panel__feedback", (el) => el.textContent?.trim());
  console.log("polish note:", JSON.stringify(note));
  if (!/not set|heuristic/i.test(note ?? "")) {
    throw new Error(`expected fallback note, got: ${note}`);
  }
  console.log("✓ fallback note shown (heuristic / API key not set)");
} finally {
  await browser.close();
}
