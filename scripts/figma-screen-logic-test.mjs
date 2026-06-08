#!/usr/bin/env node
/**
 * Figma screen step 4 — Logic audit on contract HTML (interactive probe).
 *
 *   node scripts/figma-screen-logic-test.mjs
 *   node scripts/figma-screen-logic-test.mjs --artifact artifacts/figma-screens/screen_1.manifest.json
 */

import { readFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { manifestToContract } from "./figma-manifest-to-contract.mjs";
import {
  discoverFigmaScreens,
  mergeFigmaScreenReport,
  writeScreenStepResult,
  readScreenStepResult,
  safeScreenSegment
} from "./figma-screen-portfolio.mjs";
import { syncFigmaScreenStepTestReport } from "./figma-screen-test-report.mjs";

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const playwrightPkg = resolve(WORKSPACE, "packages/pixel-test/node_modules/playwright");
const { chromium } = require(existsSync(playwrightPkg) ? playwrightPkg : "playwright");

const DIFFS_DIR = join(WORKSPACE, "figma-screen-diffs");
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://127.0.0.1:6107";
const LOGIC_SPECS_DIR = join(WORKSPACE, "lab-memory/logic/specs");

function logicSpecPath(screenId) {
  return join(LOGIC_SPECS_DIR, `${screenId}.spec.json`);
}

function loadLogicSpec(screenId) {
  const path = logicSpecPath(screenId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function parseCli() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v.startsWith("--") && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) {
      args.set(v.slice(2), process.argv[i + 1]);
      i++;
    }
  }
  return { artifact: args.get("artifact") ?? null };
}

async function loadContract(manifestPath) {
  const contractPath = manifestPath
    .replace(/\.manifest\.json$/, ".contract.json")
    .replace(/-manifest\.json$/, "-contract.json");
  if (existsSync(contractPath)) {
    return JSON.parse(await readFile(contractPath, "utf8"));
  }
  const raw = JSON.parse(await readFile(manifestPath, "utf8"));
  return manifestToContract(raw);
}

function collectFontFamilies(node, out = new Set()) {
  if (node?.text?.font?.family) out.add(String(node.text.font.family).trim());
  for (const child of node?.children ?? []) collectFontFamilies(child, out);
  return out;
}

function contractUsesRtl(doc) {
  const walk = (node) => {
    if (node?.text?.direction === "rtl") return true;
    if (node?.text?.value && /[\u0590-\u05FF\u0600-\u06FF]/.test(node.text.value)) return true;
    return (node?.children ?? []).some(walk);
  };
  return walk(doc.root);
}

function googleFontsCssUrl(families) {
  const params = [...families]
    .filter((f) => f && !/^(serif|sans-serif|monospace|inherit)$/i.test(f))
    .map((f) => `family=${encodeURIComponent(f.replace(/\s+/g, " "))}:wght@400;500;600;700`)
    .join("&");
  return params ? `https://fonts.googleapis.com/css2?${params}&display=swap` : null;
}

const PROBE_SCRIPT = `
(() => {
  const sel = [
    'button',
    'a[href]',
    'input:not([type=hidden])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="tab"]',
    '[data-name="Buttons"]',
    '[data-name="Primary button"]',
    '[data-name="Secondary button"]',
    '.layer.figma[data-name*="button" i]',
  ].join(', ');
  const nodes = [...document.querySelectorAll(sel)];
  const seen = new Set();
  return nodes.filter((el) => {
    const key = el.outerHTML.slice(0, 120);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((el, index) => ({
    index,
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role') || '',
    name: el.getAttribute('data-name') || '',
    text: (el.textContent || '').trim().slice(0, 80),
    disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
    readOnly: el.readOnly === true,
  }));
})();
`;

async function auditContractHtml(page, doc) {
  const { renderToBodyMarkup } = await import("../packages/pixel-test/src/render-html.ts");
  const {
    bodyMarkup: markup,
    width,
    height,
    background = doc.meta?.canvasBackground ?? "#ffffff",
  } = renderToBodyMarkup(doc);
  const rtl = contractUsesRtl(doc);
  const fontsUrl = googleFontsCssUrl(collectFontFamilies(doc.root));

  await page.goto(`${STORYBOOK_URL}/iframe.html?id=lab-button--primary&viewMode=story`, {
    waitUntil: "networkidle",
    timeout: 30_000
  });
  if (fontsUrl) await page.addStyleTag({ url: fontsUrl });
  await page.evaluate(
    (payload) => {
      if (payload.rtl) {
        document.documentElement.setAttribute("dir", "rtl");
        document.documentElement.setAttribute("lang", "he");
      }
      document.body.innerHTML = payload.markup;
      document.body.style.margin = "0";
      document.body.style.padding = "0";
      document.body.style.background = payload.background;
      document.documentElement.style.width = `${payload.width}px`;
      document.documentElement.style.height = `${payload.height}px`;
      document.body.style.width = `${payload.width}px`;
      document.body.style.height = `${payload.height}px`;
      document.body.style.overflow = "hidden";
    },
    { markup, width, height, background, rtl }
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return page.evaluate(PROBE_SCRIPT);
}

async function testScreen({ manifestPath }) {
  const name = basename(manifestPath)
    .replace(/\.manifest\.json$/, "")
    .replace(/-manifest\.json$/, "");
  const itemDir = join(DIFFS_DIR, safeScreenSegment(name), "logic");
  await mkdir(itemDir, { recursive: true });

  console.log(`\n[logic] ${name}`);

  const storyStep =
    readScreenStepResult(WORKSPACE, name, "vsStorybook") ??
    readScreenStepResult(WORKSPACE, name, "storybook");
  const figmaStep =
    readScreenStepResult(WORKSPACE, name, "vsFigmaLive") ??
    readScreenStepResult(WORKSPACE, name, "contractFigma");
  if (figmaStep?.status !== "pass" && figmaStep?.status !== "warn") {
    const msg = "Blocked — Contract → Figma must pass first";
    console.log(`  ✗ ${msg}`);
    writeScreenStepResult(WORKSPACE, name, "logic", { status: "not_tested", error: msg });
    return { name, status: "error", error: msg };
  }
  if (storyStep?.status !== "pass" && storyStep?.status !== "warn") {
    console.log(`  ⚠ Storybook visual ${storyStep?.status ?? "not_tested"} — logic probe continues`);
  }

  try {
    const doc = await loadContract(manifestPath);
    const browser = await chromium.launch();
    const page = await browser.newPage();
    let controls = [];
    try {
      controls = await auditContractHtml(page, doc);
    } finally {
      await browser.close();
    }

    const interactive = controls.filter((c) => !c.disabled && !c.readOnly);
    const staticShell = controls.filter((c) => c.disabled || c.readOnly);
    const spec = loadLogicSpec(name);
    const specElements = spec?.elements?.length ?? 0;
    const status =
      interactive.length === 0
        ? "pass"
        : spec && specElements >= interactive.length
          ? "pass"
          : "warn";
    const icon = status === "pass" ? "✓" : "⚠";
    console.log(
      `  ${icon} ${status.toUpperCase()} — ${controls.length} controls (${interactive.length} interactive, ${staticShell.length} inert)${spec ? `, spec: ${specElements} elements` : ""}`
    );

    const logicPayload = {
      status,
      percent: interactive.length,
      controls,
      interactiveCount: interactive.length,
      staticCount: staticShell.length,
      specPath: spec ? logicSpecPath(name) : null,
      specElements,
      manifestPath,
    };
    let testReportPath = null;
    if (status === "warn") {
      testReportPath = syncFigmaScreenStepTestReport(WORKSPACE, name, "logic", {
        ...logicPayload,
        error: `Logic spec gap — ${interactive.length} interactive controls, spec covers ${specElements}`,
      });
    } else {
      syncFigmaScreenStepTestReport(WORKSPACE, name, "logic", { status: "pass" });
    }
    writeScreenStepResult(WORKSPACE, name, "logic", {
      ...logicPayload,
      ...(testReportPath ? { testReportPath } : {})
    });

    return { name, status, controls: controls.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ERROR — ${message}`);
    const stepPayload = { status: "error", error: message, manifestPath };
    const testReportPath = syncFigmaScreenStepTestReport(WORKSPACE, name, "logic", stepPayload);
    writeScreenStepResult(WORKSPACE, name, "logic", {
      ...stepPayload,
      ...(testReportPath ? { testReportPath } : {})
    });
    return { name, status: "error", error: message };
  }
}

async function main() {
  const { artifact } = parseCli();
  const targets = artifact
    ? [
        {
          manifestPath: resolve(artifact),
          pngPath: resolve(artifact)
            .replace(/\.manifest\.json$/, ".png")
            .replace(/-manifest\.json$/, ".png")
        }
      ]
    : discoverFigmaScreens(WORKSPACE);

  if (!targets.length) {
    console.log("[figma-screen-logic] No manifests found");
    process.exit(0);
  }

  const results = [];
  for (const screen of targets) {
    results.push(await testScreen(screen));
  }

  mergeFigmaScreenReport(WORKSPACE);
  const failed = results.filter((r) => r.status === "error").length;
  console.log(`\n[figma-screen-logic] Done — ${results.length - failed}/${results.length} complete`);
  process.exit(failed ? 1 : 0);
}

main();
