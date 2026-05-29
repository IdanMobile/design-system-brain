#!/usr/bin/env node
/**
 * Figma screen step 1 — Manifest → Contract (adapter + schema sanity).
 *
 *   node scripts/figma-screen-manifest-test.mjs
 *   node scripts/figma-screen-manifest-test.mjs --artifact path/to.manifest.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { manifestToContract, referencePngPathFor } from "./figma-manifest-to-contract.mjs";
import {
  discoverFigmaScreens,
  mergeFigmaScreenReport,
  writeScreenStepResult,
  countLayers
} from "./figma-screen-portfolio.mjs";

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseCli() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v.startsWith("--") && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) {
      args.set(v.slice(2), process.argv[i + 1]);
      i++;
    }
  }
  return { artifact: args.get("artifact") ?? null };
}

async function testManifest(manifestPath) {
  const name = basename(manifestPath)
    .replace(/\.manifest\.json$/, "")
    .replace(/-manifest\.json$/, "");
  console.log(`\n[manifest] ${name}`);

  if (!existsSync(manifestPath)) {
    console.log("  ✗ SKIP — manifest missing");
    return { name, status: "error", error: "manifest missing" };
  }

  try {
    const raw = JSON.parse(await readFile(manifestPath, "utf8"));
    let referencePngBuffer;
    const refPath = referencePngPathFor(manifestPath);
    if (existsSync(refPath)) {
      referencePngBuffer = await readFile(refPath);
    }
    const doc = manifestToContract(raw, { referencePngBuffer });
    if (!doc?.root) throw new Error("Adapter produced empty root");
    if (!doc.meta?.viewport?.width || !doc.meta?.viewport?.height) {
      throw new Error("Contract missing meta.viewport dimensions");
    }

    const contractPath = manifestPath
      .replace(/\.manifest\.json$/, ".contract.json")
      .replace(/-manifest\.json$/, "-contract.json");
    await writeFile(contractPath, JSON.stringify(doc, null, 2), "utf8");

    const layerCount = countLayers(doc.root);
    console.log(
      `  ✓ PASS — ${layerCount} layers · ${doc.meta.viewport.width}×${doc.meta.viewport.height}`
    );
    console.log(`     contract: ${contractPath}`);

    writeScreenStepResult(WORKSPACE, name, "manifestContract", {
      status: "pass",
      percent: layerCount,
      layerCount,
      contractPath,
      manifestPath,
      viewport: doc.meta.viewport
    });

    return { name, status: "pass", layerCount, contractPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ERROR — ${message}`);
    writeScreenStepResult(WORKSPACE, name, "manifestContract", {
      status: "error",
      percent: 0,
      error: message,
      manifestPath
    });
    return { name, status: "error", error: message };
  }
}

async function main() {
  const { artifact } = parseCli();
  const targets = artifact
    ? [{ manifestPath: resolve(artifact) }]
    : discoverFigmaScreens(WORKSPACE);

  if (!targets.length) {
    console.log("[figma-screen-manifest] No manifests in artifacts/figma-screens/");
    process.exit(0);
  }

  const results = [];
  for (const { manifestPath } of targets) {
    results.push(await testManifest(manifestPath));
  }

  mergeFigmaScreenReport(WORKSPACE);
  const failed = results.filter((r) => r.status !== "pass").length;
  console.log(`\n[figma-screen-manifest] Done — ${results.length - failed}/${results.length} pass`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("[figma-screen-manifest] Fatal:", err.message);
  process.exit(1);
});
