#!/usr/bin/env node
/**
 * Contract → React TSX codegen (Tier B layout emitter).
 *
 *   node scripts/contract-to-tsx.mjs --contract path/to.contract.json --component Screen1
 *   node scripts/contract-to-tsx.mjs --component Screen1   # reads packages/ui/.../contract.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseCli() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v.startsWith("--") && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) {
      args.set(v.slice(2), process.argv[i + 1]);
      i++;
    } else if (v.startsWith("--")) {
      args.set(v.slice(2), true);
    }
  }
  return {
    contract: args.get("contract") ?? null,
    component: args.get("component") ?? null,
    out: args.get("out") ?? null
  };
}

async function main() {
  const { contract: contractArg, component, out: outArg } = parseCli();
  if (!component) {
    console.error("Usage: node scripts/contract-to-tsx.mjs --component <Name> [--contract path] [--out path]");
    process.exit(1);
  }

  const contractPath =
    contractArg ??
    join(WORKSPACE, "packages/ui/src/components", component, "contract.json");
  if (!existsSync(contractPath)) {
    console.error(`Contract not found: ${contractPath}`);
    process.exit(1);
  }

  const doc = JSON.parse(readFileSync(contractPath, "utf8"));
  const { renderToReactComponentFile } = await import(
    "../packages/pixel-test/src/render-tsx.ts"
  );
  const source = renderToReactComponentFile(doc, component);
  const outPath =
    outArg ?? join(WORKSPACE, "packages/ui/src/components", component, `${component}.codegen.tsx`);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, source, "utf8");
  console.log(`✓ Codegen TSX → ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
