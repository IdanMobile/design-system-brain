#!/usr/bin/env node
/**
 * Dev mode: API on 6111 + Vite UI on 6110 (proxied).
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const api = spawn("node", ["scripts/test-console-server.mjs", "--api-only"], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env
});

const vite = spawn("pnpm", ["--filter", "@lab/test-console", "dev"], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env
});

function shutdown() {
  api.kill("SIGTERM");
  vite.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

api.on("exit", (code) => {
  if (code) vite.kill("SIGTERM");
});
vite.on("exit", (code) => {
  if (code) api.kill("SIGTERM");
});

console.log("[test-console:dev] UI → http://127.0.0.1:6110  API → http://127.0.0.1:6111");
