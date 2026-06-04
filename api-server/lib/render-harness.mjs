/**
 * render-harness.mjs
 *
 * Writes generated React component files into packages/render-harness,
 * ensures the Storybook dev server (port 6007) is running, waits for HMR,
 * then screenshots [data-figma-component] with Playwright.
 *
 * All imports are ES-module style (api-server is "type":"module").
 * Playwright is resolved from packages/visual-gate/node_modules/playwright
 * (pnpm keeps it isolated there, not hoisted to the workspace root).
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Absolute path to the render-harness Storybook workspace.
const RENDER_HARNESS_DIR = resolve(__dirname, "../../packages/render-harness");

// Playwright lives in visual-gate's node_modules (pnpm isolated).
const PLAYWRIGHT_PATH = resolve(
  __dirname,
  "../../packages/visual-gate/node_modules/playwright"
);

const STORYBOOK_PORT = 6007;
const STORYBOOK_URL = `http://127.0.0.1:${STORYBOOK_PORT}`;

/** Handle for the Storybook child process (kept alive across requests). */
let _storybookProcess = null;

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a PascalCase or camelCase component name to the slug Storybook 8
 * uses in story IDs.  Storybook lowercases the entire title segment and strips
 * non-alphanumeric characters.
 *
 * e.g. "NewRecordingButton" → "newrecordingbutton"
 *      "MyCard"             → "mycard"
 */
function toStorybookSlug(componentName) {
  return componentName.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Derive the Storybook 8 story ID from a component name.
 * Generated stories use meta title "Components/{ComponentName}" and export
 * a story named "Default".
 *
 * Format: "{title-slug}--{story-slug}"
 * e.g.  "Components/NewRecordingButton" + "Default"
 *       → "components-newrecordingbutton--default"
 */
function deriveStoryId(componentName) {
  const titleSlug = `components-${toStorybookSlug(componentName)}`;
  return `${titleSlug}--default`;
}

/**
 * Attempt a GET against the Storybook index page.
 * Returns true if HTTP 200, false on any error/non-200.
 */
async function isStorybookUp() {
  try {
    const res = await fetch(`${STORYBOOK_URL}/index.html`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Ensure the Storybook dev server is running on port 6007.
 * If it's already up this is a no-op.  Otherwise spawns `pnpm storybook`
 * inside the render-harness directory and waits up to 60 s for it to be ready.
 */
export async function ensureStorybookRunning() {
  if (await isStorybookUp()) return; // already running

  console.log("[render-harness] Starting Storybook on port 6007 …");

  _storybookProcess = spawn("pnpm", ["storybook"], {
    cwd: RENDER_HARNESS_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  _storybookProcess.stdout?.on("data", (d) =>
    process.stdout.write(`[storybook-render] ${d}`)
  );
  _storybookProcess.stderr?.on("data", (d) =>
    process.stderr.write(`[storybook-render] ${d}`)
  );

  _storybookProcess.on("exit", (code) => {
    console.log(`[render-harness] Storybook exited with code ${code}`);
    _storybookProcess = null;
  });

  // Poll up to 60 s (120 × 500 ms)
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    if (await isStorybookUp()) {
      console.log("[render-harness] Storybook is ready.");
      return;
    }
  }

  throw new Error(
    "render-harness: Storybook did not become ready within 60 seconds."
  );
}

/**
 * Write the three generated files into the render-harness workspace so
 * Storybook (via Vite HMR) picks them up.
 *
 * @param {string} componentName  PascalCase component name, e.g. "NewRecordingButton"
 * @param {{ componentSource: string, storiesSource: string, tokensCss?: string, fontsCss?: string }} files
 */
export function writeComponentFiles(componentName, { componentSource, storiesSource, tokensCss, fontsCss }) {
  // 1. Design tokens (optional override)
  if (tokensCss != null) {
    const tokensPath = resolve(
      RENDER_HARNESS_DIR,
      "src/design-tokens/tokens.css"
    );
    writeFileSync(tokensPath, tokensCss, "utf8");
  }

  // 1b. Fonts CSS (optional override)
  if (fontsCss != null) {
    const fontsPath = resolve(
      RENDER_HARNESS_DIR,
      "src/design-tokens/fonts.css"
    );
    writeFileSync(fontsPath, fontsCss, "utf8");
  }

  // 2. Component source
  const componentDir = resolve(
    RENDER_HARNESS_DIR,
    `src/components/${componentName}`
  );
  mkdirSync(componentDir, { recursive: true });

  writeFileSync(
    resolve(componentDir, `${componentName}.tsx`),
    componentSource,
    "utf8"
  );

  // 3. Stories source
  writeFileSync(
    resolve(componentDir, `${componentName}.stories.tsx`),
    storiesSource,
    "utf8"
  );
}

/**
 * Fetch /stories.json (Storybook 8) or /index.json (fallback) and find the
 * best-matching story ID for the given component name.
 *
 * Matching rules (in order):
 *   1. title contains componentName (case-insensitive) AND name === "Default"
 *   2. title contains componentName (case-insensitive), first match wins
 *
 * Returns the discovered story id, or the derived fallback if nothing matched.
 *
 * @param {string} componentName
 * @returns {Promise<string>}
 */
async function discoverStoryId(componentName) {
  const fallback = deriveStoryId(componentName);
  const nameLower = componentName.toLowerCase();

  for (const endpoint of ["/stories.json", "/index.json"]) {
    try {
      const res = await fetch(`${STORYBOOK_URL}${endpoint}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;

      const data = await res.json();
      // Storybook 8: { stories: { [id]: { id, title, name, ... } } }
      const stories = data.stories ?? data.entries ?? {};
      const entries = Object.values(stories);

      // 1. title contains componentName + name is "Default"
      const exactDefault = entries.find(
        (s) =>
          typeof s.title === "string" &&
          s.title.toLowerCase().includes(nameLower) &&
          s.name === "Default"
      );
      if (exactDefault) return exactDefault.id;

      // 2. title contains componentName, first match
      const anyMatch = entries.find(
        (s) =>
          typeof s.title === "string" &&
          s.title.toLowerCase().includes(nameLower)
      );
      if (anyMatch) return anyMatch.id;
    } catch {
      // endpoint unavailable — try next
    }
  }

  console.warn(
    `[render-harness] stories.json lookup found no match for "${componentName}"; using derived id "${fallback}"`
  );
  return fallback;
}

/**
 * Navigate to the story iframe, wait for [data-figma-component], and return
 * a base64-encoded PNG of the element screenshot.
 *
 * @param {string} componentName
 * @returns {Promise<string>} base64 PNG string
 */
export async function screenshotComponent(componentName) {
  // Load playwright via CJS require so directory resolution works correctly in ESM.
  const _requirePw = createRequire(resolve(__dirname, "../../packages/visual-gate/package.json"));
  const { chromium } = _requirePw("playwright");

  // Discover the real story ID from Storybook's /stories.json manifest;
  // fall back to the derived slug if the endpoint is unavailable.
  const storyId = await discoverStoryId(componentName);
  const url = `${STORYBOOK_URL}/iframe.html?id=${storyId}&viewMode=story`;

  const browser = await chromium.launch();
  try {
    // Capture at 2x to match Figma's 2x PNG exports, minimising scaling distortion in pixel diff.
    const ctx = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();

    // Suppress __name ReferenceErrors that appear in some Storybook/esbuild bundles.
    await page.addInitScript("var __name = (target) => target;");

    await page.goto(url, { waitUntil: "networkidle" });

    // Freeze animations so the screenshot is deterministic.
    await page.addStyleTag({
      content:
        "*,*::before,*::after{animation-play-state:paused !important;transition:none !important;}",
    });

    await page.waitForLoadState("networkidle");
    await page.waitForSelector("[data-figma-component]", {
      state: "attached",
      timeout: 15000,
    });

    // Wait for all declared fonts to load before screenshot (prevents blank/fallback font rendering)
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    // Also explicitly load any unloaded fonts to ensure they are fully available
    await page.evaluate(async () => {
      const loads = [];
      for (const font of document.fonts) {
        if (font.status !== 'loaded') {
          loads.push(document.fonts.load(`${font.style} ${font.weight} 16px ${font.family}`));
        }
      }
      await Promise.allSettled(loads);
    });

    const el = await page.$("[data-figma-component]");
    if (!el) {
      throw new Error(
        `[render-harness] [data-figma-component] not found in story "${storyId}"`
      );
    }

    const buffer = await el.screenshot({ omitBackground: false });
    return buffer.toString("base64");
  } finally {
    await browser.close();
  }
}

/**
 * High-level entry point: write files, wait for HMR, screenshot.
 *
 * @param {string} componentName
 * @param {{ componentSource: string, storiesSource: string, tokensCss?: string }} files
 * @returns {Promise<string>} base64 PNG
 */
export async function renderAndScreenshot(componentName, files) {
  await ensureStorybookRunning();
  writeComponentFiles(componentName, files);
  // Give Vite HMR time to pick up the new/changed file.
  await sleep(2500);
  return screenshotComponent(componentName);
}
