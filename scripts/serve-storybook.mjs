#!/usr/bin/env node
/**
 * Serve the prebuilt Storybook (`packages/storybook-lab/storybook-static/`)
 * over HTTP on port 6107. This is the URL the extractor and pixel-test
 * harness expect by default.
 *
 * If the build doesn't exist yet, this prints a clear hint and exits.
 */

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

const PORT = Number(process.env.SB_PORT ?? 6107);
const ROOT = resolve(
  process.cwd(),
  "packages/storybook-lab/storybook-static"
);

if (!existsSync(join(ROOT, "index.json"))) {
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
  console.log(`✓ Storybook served from ${ROOT}`);
  console.log(`  → http://127.0.0.1:${PORT}/`);
});
