/**
 * Ingest Guing screen exports into artifacts/figma-screens/ for the test console.
 *
 * POST body (JSON):
 *   { screenId?, manifest, pngBase64? | png? }
 *
 * Used by Guing Figma plugin → Tests Console /api/figma-screens/ingest
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverFigmaScreens, FIGMA_SCREENS_DIR } from "./figma-screen-portfolio.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Figma node types Guing may export for quick-component-generation (not only full FRAME screens). */
export const INGESTABLE_MANIFEST_ROOT_TYPES = new Set([
  "FRAME",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
  "GROUP",
  "SECTION"
]);

export function manifestRootType(manifest) {
  return manifest?.type ?? manifest?.root?.type ?? null;
}

export function isIngestableManifestRoot(manifest) {
  const t = manifestRootType(manifest);
  return Boolean(t && INGESTABLE_MANIFEST_ROOT_TYPES.has(t));
}

function safeScreenId(raw) {
  const slug = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!slug || /^[-_]+$/.test(slug)) return null;
  if (/^screen_\d+$/.test(slug)) return slug;
  if (/^screen-/.test(slug)) return slug.replace(/^screen-/, "screen_");
  const normalized = slug.startsWith("screen_") ? slug : `screen_${slug}`;
  if (/^screen_[-_]+$/.test(normalized)) return null;
  return normalized;
}

/** Resolve a stable screen id from plugin label or auto-assign. */
export function resolveScreenId(raw, repoRoot = ROOT) {
  return safeScreenId(raw) || suggestNextScreenId(repoRoot);
}

/** @param {string} repoRoot */
export function suggestNextScreenId(repoRoot = ROOT) {
  const existing = discoverFigmaScreens(repoRoot).map((s) => s.screenId);
  let max = 0;
  for (const id of existing) {
    const m = /^screen_(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `screen_${max + 1}`;
}

/**
 * @param {string} repoRoot
 * @param {{ screenId?: string, manifest: object, pngBase64?: string, png?: Buffer | Uint8Array }} input
 */
export function ingestFigmaScreen(repoRoot, input) {
  if (!input?.manifest || typeof input.manifest !== "object") {
    throw new Error("manifest object is required");
  }

  const manifest = input.manifest;
  if (!isIngestableManifestRoot(manifest)) {
    const got = manifestRootType(manifest) ?? "unknown";
    throw new Error(
      `manifest root must be a scene node (got ${got}). Supported: ${[...INGESTABLE_MANIFEST_ROOT_TYPES].join(", ")}`
    );
  }

  const screenId =
    resolveScreenId(input.screenId, repoRoot) ||
    resolveScreenId(manifest.name, repoRoot) ||
    suggestNextScreenId(repoRoot);

  const dir = join(repoRoot, FIGMA_SCREENS_DIR);
  mkdirSync(dir, { recursive: true });

  const manifestPath = join(dir, `${screenId}.manifest.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  let pngPath = join(dir, `${screenId}.png`);
  let pngWritten = false;

  if (input.pngBase64) {
    const buf = Buffer.from(String(input.pngBase64), "base64");
    writeFileSync(pngPath, buf);
    pngWritten = true;
  } else if (input.png) {
    writeFileSync(pngPath, Buffer.from(input.png));
    pngWritten = true;
  }

  return {
    ok: true,
    screenId,
    manifestPath: join(FIGMA_SCREENS_DIR, `${screenId}.manifest.json`),
    pngPath: pngWritten ? join(FIGMA_SCREENS_DIR, `${screenId}.png`) : null,
    pngWritten,
    discovered: discoverFigmaScreens(repoRoot).map((s) => s.screenId)
  };
}
