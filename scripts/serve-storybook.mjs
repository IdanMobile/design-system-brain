#!/usr/bin/env node
/**
 * Serve the prebuilt Storybook (`packages/storybook-lab/storybook-static/`)
 * over HTTP on port 6107. This is the URL the extractor and pixel-test
 * harness expect by default.
 *
 * Sidebar is filtered to stories that passed Storybook parity in the current
 * Test portfolio (see test-portfolio/manual-preview/manifest.json).
 */

import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import {
  filterStorybookIndex,
  readManualPreviewManifest
} from "./build-manual-preview-manifest.mjs";

const PORT = Number(process.env.SB_PORT ?? 6107);
const REPO_ROOT = resolve(process.cwd());
const ROOT = resolve(REPO_ROOT, "packages/storybook-lab/storybook-static");
const INDEX_PATH = join(ROOT, "index.json");

if (!existsSync(INDEX_PATH)) {
  console.error(
    `\n✗ No Storybook build found at ${ROOT}\n` +
      `  Build it first:\n` +
      `      pnpm --filter @lab/storybook-lab build\n`
  );
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json"
};

let cachedIndexFilter = { mtimeMs: 0, manifestAt: null, body: null };

function filteredIndexBody() {
  const indexStat = statSync(INDEX_PATH);
  const manifest = readManualPreviewManifest(REPO_ROOT);
  const manifestAt = manifest?.generatedAt ?? null;
  const allowedIds = (manifest?.storybook ?? []).map((s) => s.storyId);

  if (
    cachedIndexFilter.body &&
    cachedIndexFilter.mtimeMs === indexStat.mtimeMs &&
    cachedIndexFilter.manifestAt === manifestAt
  ) {
    return cachedIndexFilter.body;
  }

  const raw = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  const filtered = filterStorybookIndex(raw, allowedIds);
  const body = JSON.stringify(filtered);
  cachedIndexFilter = { mtimeMs: indexStat.mtimeMs, manifestAt, body };
  return body;
}

const server = createServer();

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      `\n✗ Port ${PORT} is already in use.\n` +
        `  Something else is bound to http://127.0.0.1:${PORT}\n` +
        `  (probably a Storybook server from an earlier session).\n\n` +
        `  Find and kill it:\n` +
        `      lsof -i :${PORT} -t | xargs kill\n\n` +
        `  Or pick a different port:\n` +
        `      SB_PORT=6108 pnpm storybook:serve\n` +
        `      pnpm --filter @lab/extractor-playwright extract:mui -- --url http://127.0.0.1:6108\n`
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

server.on("request", (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/index.json" || pathname.endsWith("/index.json")) {
      const body = filteredIndexBody();
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      });
      res.end(body);
      return;
    }

    if (pathname.endsWith("/")) pathname += "index.html";
    const resolved = resolve(ROOT, "." + pathname);
    if (!resolved.startsWith(ROOT + sep) && resolved !== ROOT) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    const mime = MIME[extname(resolved).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime, "Access-Control-Allow-Origin": "*" });
    createReadStream(resolved).pipe(res);
  } catch (err) {
    res.writeHead(500).end(err instanceof Error ? err.message : "Error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const manifest = readManualPreviewManifest(REPO_ROOT);
  const count = manifest?.storybook?.length ?? 0;
  console.log(`✓ Storybook served from ${ROOT}`);
  console.log(`  → http://127.0.0.1:${PORT}/  (${count} passed Storybook ${count === 1 ? "story" : "stories"} in sidebar)`);
});
