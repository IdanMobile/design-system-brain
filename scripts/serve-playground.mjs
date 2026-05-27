#!/usr/bin/env node
/**
 * Serve the built developer playground (`packages/developer-playground/dist/`)
 * on port 6108 — used by the delivery pixel-diff harness AND the inline
 * spec approval flow. Spec routes are mounted at /api/specs.
 */

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { createSpecRoutes } from "./specs-server.mjs";
import { createLlmExtractRoute } from "./specs-llm.mjs";
import { logicSpecsDir } from "./lab-memory-paths.mjs";

const PORT = Number(process.env.PLAYGROUND_PORT ?? 6108);
const ROOT = resolve(process.cwd(), "packages/developer-playground/dist");
const REPO_ROOT = resolve(process.cwd());

const VAULT = logicSpecsDir(process.cwd());

if (!existsSync(join(ROOT, "index.html"))) {
  console.error(
    `\n✗ No playground build found at ${ROOT}\n` +
      `  Build it first:\n` +
      `      pnpm playground:build\n`
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
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const specRoutes = createSpecRoutes({ vaultDir: VAULT });
const llmExtractRoute = createLlmExtractRoute({ repoRoot: REPO_ROOT });
const server = createServer();

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`\n✗ Port ${PORT} is already in use.\n`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

server.on("request", async (req, res) => {
  if (llmExtractRoute.matches(req)) {
    await llmExtractRoute.handle(req, res);
    return;
  }
  if (specRoutes.matches(req)) {
    await specRoutes.handle(req, res);
    return;
  }
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
  console.log(`✓ Developer playground served from ${ROOT}`);
  console.log(`  → http://127.0.0.1:${PORT}/?view=showcase  (Delivery showcase — approve specs inline)`);
  console.log(`  → http://127.0.0.1:${PORT}/?story=lab-pricingpanel--pro  (single story)`);
  console.log(`  → http://127.0.0.1:${PORT}/api/specs  (spec inventory JSON, read/write via PUT)`);
  console.log(`  → http://127.0.0.1:${PORT}/api/specs/extract  (POST → AI/heuristic extraction)`);
});
