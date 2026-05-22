import { spawnSync } from "node:child_process";

const target = process.argv[2];

if (!target) {
  console.error("Usage: pnpm extract <name>");
  console.error("Example: pnpm extract button -> extract:button");
  process.exit(1);
}

const scriptName = `extract:${target.toLowerCase()}`;
const result = spawnSync(
  "pnpm",
  ["--filter", "@lab/extractor-playwright", scriptName],
  { stdio: "inherit", shell: process.platform === "win32" }
);

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.error) {
  console.error(result.error.message);
}

process.exit(1);
