import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error -- no bundled types
import { PNG } from "pngjs";
// @ts-expect-error -- no bundled types
import pixelmatch from "pixelmatch";

export interface VisualGateResult {
  storyId: string;
  status: "pass" | "warn" | "fail" | "error";
  percent: number;
  diffPngPath: string;
  message?: string;
}

interface Opts {
  baseUrl: string;
  outDir: string;
  tolerance: number;
}

function safeSegment(s: string): string {
  return s.trim().replace(/[<>:"/\\|?*\s]/g, "-").replace(/-+/g, "-");
}

function cropToCommon(src: any, width: number, height: number): any {
  if (src.width === width && src.height === height) return src;
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const sStart = y * src.width * 4;
    const dStart = y * width * 4;
    src.data.copy(out.data, dStart, sStart, sStart + width * 4);
  }
  return out;
}

export async function compareStoryToRef(
  storyId: string,
  referencePngPath: string,
  opts: Opts
): Promise<VisualGateResult> {
  const safeId = safeSegment(storyId);
  const baseDir = resolve(opts.outDir, safeId);
  const actualPng = resolve(baseDir, "storybook.png");
  const diffPng = resolve(baseDir, "diff.png");

  // Guard: reference PNG must exist before expensive browser work.
  if (!existsSync(referencePngPath)) {
    return {
      storyId,
      status: "error",
      percent: 0,
      diffPngPath: "",
      message: `reference PNG not found: ${referencePngPath}`,
    };
  }

  try {
    await mkdir(baseDir, { recursive: true });

    // 1. Screenshot the story's [data-figma-component] root.
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    // Same init script pixel-test uses to suppress __name ReferenceErrors in Storybook bundles.
    await page.addInitScript("var __name = (target) => target;");
    await page.goto(
      `${opts.baseUrl}/iframe.html?id=${storyId}&viewMode=story`,
      { waitUntil: "networkidle" }
    );
    await page.addStyleTag({
      content: `*,*::before,*::after{animation-play-state:paused !important;transition:none !important;}`,
    });
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("[data-figma-component]", { state: "attached" });
    const el = await page.$("[data-figma-component]");
    if (!el) throw new Error(`[data-figma-component] not found in story ${storyId}`);
    await el.screenshot({ path: actualPng, omitBackground: false });
    await browser.close();

    // 2. Pixel-diff actual vs reference.
    const rawActual = PNG.sync.read(readFileSync(actualPng));
    const rawRef = PNG.sync.read(readFileSync(referencePngPath));
    const width = Math.min(rawActual.width, rawRef.width);
    const height = Math.min(rawActual.height, rawRef.height);
    const actual = cropToCommon(rawActual, width, height);
    const ref = cropToCommon(rawRef, width, height);
    const diff = new PNG({ width, height });
    const pixelsDiffered = pixelmatch(actual.data, ref.data, diff.data, width, height, {
      threshold: 0.2,
      includeAA: false,
      alpha: 0.1,
    });
    writeFileSync(diffPng, PNG.sync.write(diff));
    const total = width * height;
    const percent = total > 0 ? (pixelsDiffered / total) * 100 : 0;
    const status: VisualGateResult["status"] =
      percent <= opts.tolerance
        ? "pass"
        : percent <= opts.tolerance * 4
        ? "warn"
        : "fail";

    return { storyId, status, percent, diffPngPath: diffPng };
  } catch (err: any) {
    return {
      storyId,
      status: "error",
      percent: 0,
      diffPngPath: "",
      message: String(err?.message ?? err),
    };
  }
}
