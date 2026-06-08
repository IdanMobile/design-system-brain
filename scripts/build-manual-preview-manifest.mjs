/**
 * Manual preview manifest — Storybook hub + Delivery showcase filter.
 * Reflects the current Test portfolio only (not quick-generation history).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildUnifiedPortfolioState } from "./build-unified-portfolio.mjs";
import {
  loadPortfolioStoryIds,
  isStorybookOnlyStory
} from "./test-portfolio-config.mjs";
import { storyIdForScreen } from "./figma-screen-story-map.mjs";
import { storyDownloadDir, STORY_TSX_TARBALL, STORY_TARBALL, safeStorySegment } from "./story-package.mjs";

export const MANUAL_PREVIEW_DIR = "test-portfolio/manual-preview";
export const MANUAL_PREVIEW_JSON = join(MANUAL_PREVIEW_DIR, "manifest.json");

const STORYBOOK_BASE = process.env.STORYBOOK_URL ?? "http://127.0.0.1:6107";
const PLAYGROUND_BASE = process.env.PLAYGROUND_URL ?? "http://127.0.0.1:6108";

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** @param {string} repoRoot @param {{ storyId: string, entryPoint?: string }} row */
export function resolveDeliveryStoryId(repoRoot, row) {
  const dir = storyDownloadDir(repoRoot, row.storyId);
  const metaTsx = readJsonIfExists(join(dir, "meta-tsx.json"));
  if (metaTsx?.deliveryStoryId) return metaTsx.deliveryStoryId;
  const meta = readJsonIfExists(join(dir, "meta.json"));
  if (meta?.deliveryStoryId) return meta.deliveryStoryId;
  if (row.entryPoint === "figma") return storyIdForScreen(row.storyId);
  return row.storyId;
}

/** @param {string} repoRoot @param {string} portfolioStoryId */
export function hasDeliveryPackage(repoRoot, portfolioStoryId) {
  const dir = storyDownloadDir(repoRoot, portfolioStoryId);
  return (
    existsSync(join(dir, STORY_TSX_TARBALL)) || existsSync(join(dir, STORY_TARBALL))
  );
}


/** Delivery showcase: JSX/semantic package exists (logic audit output). */
function includeInDelivery(row, repoRoot) {
  return hasDeliveryPackage(repoRoot, row.storyId);
}

/** Storybook manual preview: portfolio row passed its Storybook parity leg. */
export function storybookTestPassed(row) {
  if (row.entryPoint === "figma") {
    return row.cells?.vsStorybook?.status === "pass";
  }
  return row.cells?.structural?.status === "pass";
}

/** @param {object} index Storybook index.json payload */
export function filterStorybookIndex(index, allowedStoryIds) {
  const allowed = new Set(allowedStoryIds);
  if (!index?.entries || allowed.size === 0) {
    return { ...index, entries: {} };
  }
  const entries = {};
  for (const [key, entry] of Object.entries(index.entries)) {
    const id = entry?.id ?? key;
    if (allowed.has(id)) entries[key] = entry;
  }
  return { ...index, entries };
}

/**
 * @param {string} repoRoot
 * @param {{ unified?: object }} [opts]
 */
export async function buildManualPreviewManifest(repoRoot, opts = {}) {
  const storiesModule = await import(
    pathToFileURL(join(repoRoot, "packages/contract/src/stories.ts")).href
  );
  const devStoryById = storiesModule.DEV_STORY_BY_ID ?? {};

  const storyIds = loadPortfolioStoryIds(repoRoot, readFileSync, existsSync, join);
  const unified =
    opts.unified ??
    buildUnifiedPortfolioState(repoRoot, storyIds, isStorybookOnlyStory);

  /** @type {object[]} */
  const storybook = [];
  /** @type {object[]} */
  const delivery = [];
  const seenStorybook = new Set();
  const seenDelivery = new Set();

  for (const row of unified.rows ?? []) {
    const deliveryStoryId = resolveDeliveryStoryId(repoRoot, row);
    if (!deliveryStoryId || !devStoryById[deliveryStoryId]) continue;

    const devEntry = devStoryById[deliveryStoryId];
    if (storybookTestPassed(row) && !seenStorybook.has(deliveryStoryId)) {
      storybook.push({
        portfolioId: row.storyId,
        storyId: deliveryStoryId,
        entryPoint: row.entryPoint ?? "storybook",
        component: devEntry.component ?? null,
        storybookUrl: `${STORYBOOK_BASE}/?path=/story/${encodeURIComponent(deliveryStoryId)}`
      });
      seenStorybook.add(deliveryStoryId);
    }

    if (
      includeInDelivery(row, repoRoot) &&
      !seenDelivery.has(deliveryStoryId)
    ) {
      delivery.push({
        portfolioId: row.storyId,
        storyId: deliveryStoryId,
        entryPoint: row.entryPoint ?? "storybook",
        component: devEntry.component ?? null,
        logicStatus: row.cells?.logic?.status ?? null,
        packageSegment: safeStorySegment(row.storyId),
        showcaseUrl: `${PLAYGROUND_BASE}/?story=${encodeURIComponent(deliveryStoryId)}`
      });
      seenDelivery.add(deliveryStoryId);
    }
  }

  const generatedAt = new Date().toISOString();
  const manifest = {
    generatedAt,
    storybookBase: STORYBOOK_BASE,
    playgroundBase: PLAYGROUND_BASE,
    storybookUrl: STORYBOOK_BASE,
    deliveryShowcaseUrl: `${PLAYGROUND_BASE}/?view=showcase`,
    storybook,
    delivery
  };

  const outDir = join(repoRoot, MANUAL_PREVIEW_DIR);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  return manifest;
}

export function readManualPreviewManifest(repoRoot) {
  const path = join(repoRoot, MANUAL_PREVIEW_DIR, "manifest.json");
  return readJsonIfExists(path);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildManualPreviewManifest(join(new URL(".", import.meta.url).pathname, "..")).then((m) => {
    console.log(
      `Manual preview: ${m.storybook.length} storybook · ${m.delivery.length} delivery · ${m.generatedAt}`
    );
  });
}
