#!/usr/bin/env node
/**
 * Visits a few playground stories and asserts every interactive element under
 * `[data-figma-component]` has `data-lab-id` stamped.
 */

import { chromium } from "playwright";

const url = process.env.PLAYGROUND_URL ?? "http://127.0.0.1:6108";
const stories = ["lab-button--primary", "lab-loginpage--default", "lab-featurecard--default"];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("pageerror:", err.message));
  for (const id of stories) {
    await page.goto(`${url}/?story=${encodeURIComponent(id)}`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-figma-component]", { timeout: 10_000 });
    await page.waitForTimeout(200);
    const stamped = await page.evaluate(() => {
      const SEL =
        'button, input, a[href], [role="button"], [role="tab"], [role="switch"]';
      const root = document.querySelector("[data-figma-component]");
      const set = new Set();
      if (root) {
        if (root.matches(SEL)) set.add(root);
        root.querySelectorAll(SEL).forEach((el) => set.add(el));
      }
      const interactives = [...set];
      const list = [];
      let missing = 0;
      for (const el of interactives) {
        const id = el.getAttribute("data-lab-id");
        if (!id) missing += 1;
        list.push({
          tag: el.tagName,
          text: (el.textContent ?? "").trim().slice(0, 30),
          id: id ?? "(missing)"
        });
      }
      return { count: interactives.length, missing, list };
    });
    console.log(`\n=== ${id} ===`);
    console.log(`  ${stamped.count} interactive, ${stamped.missing} unstamped`);
    for (const it of stamped.list.slice(0, 6)) {
      console.log(`  ${it.tag.padEnd(8)} "${it.text}" → ${it.id}`);
    }
    if (stamped.missing > 0) {
      console.error(`✗ ${id} has ${stamped.missing} unstamped interactive elements`);
      process.exitCode = 1;
    }
  }
} finally {
  await browser.close();
}
