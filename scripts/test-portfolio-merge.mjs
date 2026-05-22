#!/usr/bin/env node
/**
 * Rebuild test-portfolio/portfolio.json from per-story by-story result files.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const child = spawn(
  "node",
  ["--experimental-strip-types", "src/refresh-portfolio.ts"],
  { cwd: resolve(ROOT, "packages/pixel-test"), stdio: "inherit", env: process.env }
);

child.on("close", (code) => process.exit(code ?? 1));
