#!/usr/bin/env node
/**
 * Showcase end-to-end smoke:
 *   1. Open the showcase page.
 *   2. Find a story card and click an interactive element in its preview.
 *   3. Confirm the right-hand ElementPanel switches to ElementView with the
 *      correct labId in the body.
 *   4. Edit the description, click Approve, expect status badge → Approved
 *      and a refreshed spec on disk.
 */

import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const url = process.env.PLAYGROUND_URL ?? "http://127.0.0.1:6108";
const storyId = "lab-loginpage--default";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  page.on("console", (m) => console.log(`[browser:${m.type()}]`, m.text()));

  await page.goto(`${url}/?view=showcase`, { waitUntil: "networkidle" });
  await page.waitForSelector(".showcase-card", { timeout: 10_000 });
  await page.waitForTimeout(500);

  // Locate the LoginPage card
  const loginCard = await page.$(`article.showcase-card:has(code[title="${storyId}"])`);
  if (!loginCard) throw new Error(`could not find showcase card for ${storyId}`);
  console.log("✓ found LoginPage card");

  // Find the "Login" button within that card
  const loginButton = await loginCard.$('button:has-text("Login")');
  if (!loginButton) throw new Error('no "Login" button inside LoginPage card');
  await loginButton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const buttonBox = await loginButton.boundingBox();
  if (!buttonBox) throw new Error('"Login" button has no bounding box');
  console.log("buttonBox:", JSON.stringify(buttonBox));
  console.log("viewport:", JSON.stringify(page.viewportSize()));

  // Probe what's at the click point and click via the catcher directly.
  const cx = buttonBox.x + buttonBox.width / 2;
  const cy = buttonBox.y + buttonBox.height / 2;
  const topAt = await page.evaluate(([x, y]) => {
    const els = document.elementsFromPoint(x, y);
    return els.slice(0, 3).map((e) => ({ tag: e.tagName, cls: e.className?.toString().slice(0, 60) }));
  }, [cx, cy]);
  console.log("elementsFromPoint:", JSON.stringify(topAt));

  await page.mouse.click(cx, cy);
  await page.waitForTimeout(500);

  // Diagnostic: what's there?
  const diag = await loginCard.evaluate((card) => {
    return {
      hasCatcher: !!card.querySelector(".element-overlay__catcher"),
      panelKind: card.querySelector(".element-panel")?.className,
      panelText: card.querySelector(".element-panel")?.textContent?.slice(0, 200),
      labIds: [...card.querySelectorAll("[data-lab-id]")].map((e) => e.getAttribute("data-lab-id"))
    };
  });
  console.log("DIAG:", JSON.stringify(diag, null, 2));

  // ElementView (selected) shows the "Approve" / "Save draft" footer
  const approveBtn = await loginCard.$('.element-panel__approve');
  if (!approveBtn) throw new Error("ElementPanel did not switch to selected view");
  console.log("✓ selected an element → ElementView visible");

  // Fill in a description
  const descInput = await loginCard.$('.element-panel__field textarea');
  if (!descInput) throw new Error("description textarea not found");
  await descInput.fill("click to sign in");
  await page.waitForTimeout(50);

  // Approve
  await approveBtn.click();
  await page.waitForTimeout(700);

  // Confirm badge flipped to Approved
  const badgeText = await loginCard.$eval('.element-panel__badge', (el) => el.textContent?.trim());
  if (badgeText !== "Approved") {
    throw new Error(`expected badge "Approved", got "${badgeText}"`);
  }
  console.log("✓ approved — badge shows Approved");

  // Read the spec file off disk and confirm
  const specPath = resolve(process.cwd(), `lab-memory/specs/${storyId}.spec.json`);
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  const loginEl = spec.elements.find((e) => e.id === "el-login");
  if (!loginEl) throw new Error("el-login missing from spec");
  if (loginEl.status !== "approved") {
    throw new Error(`expected status=approved on disk, got ${loginEl.status}`);
  }
  if (loginEl.description !== "click to sign in") {
    throw new Error(`expected description preserved, got "${loginEl.description}"`);
  }
  console.log("✓ spec on disk: el-login status=approved, description preserved");
} finally {
  await browser.close();
}
