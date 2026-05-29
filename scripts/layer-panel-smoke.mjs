#!/usr/bin/env node
/**
 * End-to-end smoke for the LayerPanel redesign.
 *
 *   1. Open the showcase.
 *   2. Confirm the preview is "as before": no overlay catcher, real button is
 *      clickable and the click does NOT cause selection in the panel.
 *   3. Open the "+ Add behaviour" tree, hover a non-interactive layer →
 *      hover-outline appears in the preview.
 *   4. Click that non-interactive layer → editor opens.
 *   5. Type a description, approve.
 *   6. Verify the spec on disk has an `ly-…` element marked approved.
 *   7. Verify it now appears in the "Approved behaviours" section.
 */

import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { logicSpecsDir } from "./lab-memory-paths.mjs";

const url = process.env.PLAYGROUND_URL ?? "http://127.0.0.1:6108";
const repoRoot = path.resolve(new URL(".", import.meta.url).pathname, "..");
const storyId = "lab-loginpage--default";

const specPath = path.join(logicSpecsDir(repoRoot), `${storyId}.spec.json`);

const originalSpec = await readFile(specPath, "utf-8").catch(() => null);
const skipRestore = process.argv.includes("--keep-spec");

async function restoreSpec() {
  if (skipRestore) {
    console.log("(keeping modified spec on disk: --keep-spec passed)");
    return;
  }
  if (originalSpec !== null) await writeFile(specPath, originalSpec);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(`${url}/?view=showcase`, { waitUntil: "networkidle" });
  await page.waitForSelector(".showcase-card", { timeout: 10_000 });
  await page.waitForTimeout(400);

  const card = await page.$(`article.showcase-card:has(code[title="${storyId}"])`);
  if (!card) throw new Error(`no card for ${storyId}`);

  // Step 2 — preview is "as before"
  const overlayCatcher = await card.$(".element-overlay__catcher");
  if (overlayCatcher) throw new Error("legacy overlay catcher still present in DOM");
  console.log("✓ no overlay catcher — preview is clean");

  // The preview must NOT trigger element selection on click. We don't click
  // a stateful component button (Login changes LoginPage's internal state);
  // we verify the preview wrapper has no click capture by inspecting the
  // synthetic events Showcase would otherwise wire up.
  const previewClickCapture = await card.$$eval(".showcase-card__preview > *", (els) =>
    els.some((el) => el.classList.contains("element-overlay__catcher") || el.hasAttribute("data-element-overlay"))
  );
  if (previewClickCapture) throw new Error("preview wrapper still owns click capture");
  console.log("✓ preview has no click capture wrappers");

  // Step 3 — Open the tree
  const addBtn = await card.$(".layer-panel__tree-toggle");
  await addBtn.click();
  await page.waitForTimeout(200);
  const tree = await card.$(".layer-tree");
  if (!tree) throw new Error("layer tree did not open");
  console.log("✓ + Add behaviour reveals the layer tree");

  // Pick a non-interactive row — first .layer-row whose icon is static
  const rows = await card.$$(".layer-row");
  let pickedRow = null;
  let pickedName = "";
  for (const row of rows) {
    const isStatic = await row.$(".layer-row__icon--static");
    if (isStatic) {
      pickedRow = row;
      pickedName = (await row.$eval(".layer-row__name", (el) => el.textContent?.trim() ?? "")) ?? "";
      break;
    }
  }
  if (!pickedRow) throw new Error("no non-interactive layer found in tree");
  console.log(`✓ found non-interactive layer in tree: ${pickedName}`);

  // Hover → hover outline appears
  await pickedRow.hover();
  await page.waitForTimeout(150);
  const outline = await card.$(".hover-outline");
  if (!outline) throw new Error("hover did not produce a hover-outline");
  console.log("✓ hover outlines the layer in the preview");

  // Click → editor opens
  await pickedRow.click();
  await page.waitForTimeout(250);
  const back = await card.$(".layer-panel__back");
  if (!back) throw new Error("clicking the layer did not open the editor");
  console.log("✓ clicking the layer opens the editor");

  // Type a description
  const textarea = await card.$('.layer-panel__field textarea');
  if (!textarea) throw new Error("editor has no description textarea");
  await textarea.fill("hover this card to show a tooltip");
  await page.waitForTimeout(100);

  // Approve
  const approveBtn = await card.$(".layer-panel__approve");
  await approveBtn.click();
  await page.waitForTimeout(600);

  // Step 6 — Verify spec on disk
  const updatedRaw = await readFile(specPath, "utf-8");
  const updated = JSON.parse(updatedRaw);
  const approvedLy = updated.elements.find((e) => e.id.startsWith("ly-") && e.status === "approved");
  if (!approvedLy) {
    throw new Error("no approved ly-… element in spec on disk");
  }
  console.log("✓ spec on disk has approved non-interactive layer:", approvedLy.id);
  if (approvedLy.description !== "hover this card to show a tooltip") {
    throw new Error(`description mismatch: ${approvedLy.description}`);
  }
  console.log("✓ description persisted");

  // Step 7 — Back in panel, the approved layer appears in detected-behaviours cards
  const backBtn = await card.$(".layer-panel__back");
  await backBtn.click();
  await page.waitForTimeout(200);
  const approvedCard = await card.$(".behaviour-card--approved");
  if (!approvedCard) throw new Error("no approved behaviour card in detected section");
  console.log("✓ approved layer shows in Detected behaviours with Approved badge");
} finally {
  await browser.close();
  await restoreSpec();
}
