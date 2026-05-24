#!/usr/bin/env node
/**
 * Pack @lab/ui for download from the Delivery showcase (playground :6108).
 * Output: packages/developer-playground/public/downloads/
 */

import { execSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(process.cwd());
const UI_DIR = join(REPO, "packages/ui");
const OUT_DIR = join(REPO, "packages/developer-playground/public/downloads");

const pkg = JSON.parse(readFileSync(join(UI_DIR, "package.json"), "utf8"));
const version = pkg.version;
const versionedName = `lab-ui-${version}.tgz`;

mkdirSync(OUT_DIR, { recursive: true });

for (const name of readdirSync(UI_DIR)) {
  if (name.endsWith(".tgz")) unlinkSync(join(UI_DIR, name));
}

execSync("pnpm pack", { cwd: UI_DIR, stdio: "inherit" });

const packed = readdirSync(UI_DIR).find((name) => name.endsWith(".tgz"));
if (!packed) {
  console.error("✗ pnpm pack did not produce a .tgz in packages/ui");
  process.exit(1);
}

const src = join(UI_DIR, packed);
const versionedPath = join(OUT_DIR, versionedName);
const latestPath = join(OUT_DIR, "lab-ui.tgz");

copyFileSync(src, versionedPath);
copyFileSync(src, latestPath);
rmSync(src);

const meta = {
  name: pkg.name,
  version,
  description: pkg.description ?? "",
  files: {
    versioned: versionedName,
    latest: "lab-ui.tgz"
  },
  peerDependencies: pkg.peerDependencies ?? {},
  dependencies: pkg.dependencies ?? {}
};

writeFileSync(join(OUT_DIR, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);

const installSnippet = `pnpm add ./${versionedName}
# or: npm install ./${versionedName}`;

writeFileSync(
  join(OUT_DIR, "INSTALL.txt"),
  [
    `${pkg.name} v${version}`,
    "",
    "1. Download lab-ui.tgz (or the versioned tarball).",
    "2. In your React app:",
    `   ${installSnippet}`,
    "3. Import styles once (e.g. in main.tsx):",
    '   import "@lab/ui/styles.css";',
    "4. Use components:",
    '   import { FeatureCard, Button } from "@lab/ui";',
    "",
    "Peer deps: react, react-dom (^18.3).",
    "MUI-based components also need @mui/material and @emotion/* (see package.json)."
  ].join("\n")
);

console.log(`✓ Packed ${pkg.name}@${version}`);
console.log(`  → ${versionedPath}`);
console.log(`  → ${latestPath}`);
