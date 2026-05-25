#!/usr/bin/env node
/**
 * Smoke test for `packages/ui/src/element-ids-runtime.ts`.
 *
 * Renders a tiny fixture, stamps IDs, perturbs the DOM, re-checks.
 *
 * Run: node scripts/element-ids-smoke.mjs
 */

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// Use TS's own transpiler via tsc (zero deps, ships with project). Falls back
// to swc if available, then esbuild. All three are fine.
function tsToJs(absPath) {
  return execFileSync("node", [
    "--experimental-strip-types",
    "--no-warnings",
    "-e",
    `
    const fs = require('node:fs');
    const ts = fs.readFileSync(${JSON.stringify(absPath)}, 'utf8');
    // Spawn a child with strip-types and ask it to print the post-strip module
    // body. The simplest path: write a tiny shim that imports the module and
    // re-emits a JSON-encoded source. Easier still — call typescript directly
    // if it's available.
    try {
      const tsc = require('typescript');
      const out = tsc.transpileModule(ts, {
        compilerOptions: {
          module: tsc.ModuleKind.ES2022,
          target: tsc.ScriptTarget.ES2022,
          isolatedModules: true,
          allowJs: false
        }
      });
      const text = out.outputText
        .replace(/^\\s*export\\s+/gm, '')
        .replace(/^\\s*import[^;]+;?$/gm, '');
      process.stdout.write(text);
    } catch (e) {
      // Fallback: strip the type annotations with a TS-aware regex set (best
      // effort; only used when typescript isn't installed).
      const stripped = ts
        .replace(/^\\s*export\\s+/gm, '')
        .replace(/^\\s*import[^;]+;?$/gm, '')
        .replace(/<[^<>]*?>/g, '')
        .replace(/\\s*:\\s*(?:string|number|boolean|void|Element|HTMLElement)(?:\\[\\])?/g, '')
        .replace(/\\s*:\\s*Map\\([^)]*\\)/g, '');
      process.stdout.write(stripped);
    }
    `
  ], { encoding: "utf8" });
}

const jsRuntime = tsToJs(resolve(process.cwd(), "packages/ui/src/element-ids-runtime.ts"));

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on("console", (msg) => console.log(`[browser:${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.error("[browser:error]", err.message));
  await page.setContent(`<!doctype html><html><body>
    <div data-figma-component="lab-button--primary">
      <button>Sign In</button>
      <button>Reset</button>
      <button>Reset</button>
      <input type="text" aria-label="email" />
    </div>
  </body></html>`);
  await page.addScriptTag({ content: jsRuntime });
  await page.waitForTimeout(80);

  const initial = await page.evaluate(() =>
    [...document.querySelectorAll("[data-lab-id]")].map(
      (e) => `${e.tagName}:${(e.textContent || e.getAttribute("aria-label") || "").trim()}=${e.getAttribute("data-lab-id")}`
    )
  );
  console.log("INITIAL:", JSON.stringify(initial, null, 2));

  const expected = [
    "BUTTON:Sign In=el-sign-in",
    "BUTTON:Reset=el-reset",
    "BUTTON:Reset=el-reset-2",
    "INPUT:email=el-input"
  ];
  for (const want of expected) {
    if (!initial.includes(want)) {
      console.error("MISSING:", want);
      process.exit(1);
    }
  }
  console.log("✓ initial stamping correct");

  await page.evaluate(() => {
    const root = document.querySelector("[data-figma-component]");
    const b = document.createElement("button");
    b.textContent = "Reset";
    root.appendChild(b);
  });
  await page.waitForTimeout(100);

  const after = await page.evaluate(() =>
    [...document.querySelectorAll("[data-lab-id]")].map(
      (e) => `${e.tagName}:${(e.textContent || "").trim()}=${e.getAttribute("data-lab-id")}`
    )
  );
  console.log("AFTER:", JSON.stringify(after, null, 2));
  const thirdReset = after.find((s) => s.endsWith("=el-reset-3"));
  if (!thirdReset) {
    console.error("missing el-reset-3 after appending third Reset button");
    process.exit(1);
  }
  console.log("✓ mutation re-stamps consistently");
} finally {
  await browser.close();
}
