#!/usr/bin/env node
/**
 * Pack @lab/ui for download (test console /downloads/, Storybook static, playground).
 * Output: lab-ui.tgz + meta.json in each downloads dir.
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
const DOWNLOAD_DIRS = [
  join(REPO, "packages/developer-playground/public/downloads"),
  join(REPO, "packages/storybook-lab/public/downloads")
];

const pkg = JSON.parse(readFileSync(join(UI_DIR, "package.json"), "utf8"));
const version = pkg.version;
const tarballName = "lab-ui.tgz";

for (const dir of DOWNLOAD_DIRS) {
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".tgz") && name !== tarballName) {
      unlinkSync(join(dir, name));
    }
  }
}

execSync("node scripts/bake-figma-screen-ui.mjs --screen screen_1 --component Screen1", {
  cwd: REPO,
  stdio: "inherit"
});

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

const meta = {
  name: pkg.name,
  version,
  description: pkg.description ?? "",
  file: tarballName,
  peerDependencies: pkg.peerDependencies ?? {},
  dependencies: pkg.dependencies ?? {}
};

const installSnippet = `pnpm add ./${tarballName}
# or: npm install ./${tarballName}`;

for (const OUT_DIR of DOWNLOAD_DIRS) {
  const tarballPath = join(OUT_DIR, tarballName);
  copyFileSync(src, tarballPath);
  writeFileSync(join(OUT_DIR, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  writeFileSync(
    join(OUT_DIR, "INSTALL.txt"),
    [
      `${pkg.name} v${version}`,
      "",
      "1. Download lab-ui.tgz from the test console (Delivery package card).",
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
  console.log(`  → ${tarballPath}`);
}

rmSync(src);

console.log(`✓ Packed ${pkg.name}@${version}`);
