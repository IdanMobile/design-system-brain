#!/usr/bin/env node
/**
 * Verifies the ✨ "Improve with AI" button:
 *   1. Selects an element with a description.
 *   2. Clicks ✨, expects the runtime-behaviour card to update.
 *   3. With LAB_LLM_API_KEY unset, the panel footer should mention "not set".
 */

import { chromium } from "playwright";

const url = process.env.PLAYGROUND_URL ?? "http://127.0.0.1:6108";
const storyId = "lab-loginpage--default";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(`${url}/?view=showcase`, { waitUntil: "networkidle" });
  await page.waitForSelector(".showcase-card", { timeout: 10_000 });
  await page.waitForTimeout(400);

  const card = await page.$(`article.showcase-card:has(code[title="${storyId}"])`);
  if (!card) throw new Error(`no card for ${storyId}`);

  const loginButton = await card.$('button:has-text("Login")');
  await loginButton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const box = await loginButton.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);

  // Ensure description present
  const desc = await card.$('.element-panel__field textarea');
  await desc.fill("click to reveal a search input");

  const polishBtn = await card.$('.element-panel__polish');
  if (!polishBtn) throw new Error("polish button not rendered");
  const disabledBefore = await polishBtn.isDisabled();
  if (disabledBefore) throw new Error("polish button is disabled even with a description");
  console.log("✓ polish button is enabled");

  await polishBtn.click();
  await page.waitForTimeout(900);

  // Inspect: card body should now contain "show search input" or similar phrasing.
  const cardText = await card.$eval('.element-panel__card--behaviour', (el) => el.textContent?.trim());
  console.log("polished behaviour text:", JSON.stringify(cardText));
  if (!/click|show|search/i.test(cardText ?? "")) {
    throw new Error(`unexpected polished behaviour text: ${cardText}`);
  }
  console.log("✓ runtime-behaviour card updated by polish");

  // Note about LAB_LLM_API_KEY not set
  const note = await card.$eval('.element-panel__polish-row .element-panel__feedback', (el) => el.textContent?.trim());
  console.log("polish note:", JSON.stringify(note));
  if (!/not set|heuristic/i.test(note ?? "")) {
    throw new Error(`expected fallback note, got: ${note}`);
  }
  console.log("✓ fallback note shown (heuristic / API key not set)");
} finally {
  await browser.close();
}
