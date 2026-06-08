import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildManualPreviewManifest,
  filterStorybookIndex,
  hasDeliveryPackage,
  resolveDeliveryStoryId,
  storybookTestPassed
} from "./build-manual-preview-manifest.mjs";
import { STORY_TARBALL } from "./story-package.mjs";

test("hasDeliveryPackage detects component tarball", () => {
  const repo = mkdtempSync(join(tmpdir(), "manual-preview-"));
  const dir = join(repo, "packages/developer-playground/public/downloads/stories/lab-button-primary");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, STORY_TARBALL), "fake");
  assert.equal(hasDeliveryPackage(repo, "lab-button--primary"), true);
  assert.equal(hasDeliveryPackage(repo, "lab-button--ghost"), false);
});

test("resolveDeliveryStoryId maps figma screen via meta-tsx", () => {
  const repo = mkdtempSync(join(tmpdir(), "manual-preview-"));
  const dir = join(repo, "packages/developer-playground/public/downloads/stories/screen_1");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "meta-tsx.json"),
    JSON.stringify({ deliveryStoryId: "lab-screen1--default" })
  );
  assert.equal(
    resolveDeliveryStoryId(repo, { storyId: "screen_1", entryPoint: "figma" }),
    "lab-screen1--default"
  );
});

test("storybookTestPassed requires pass status on the Storybook leg", () => {
  assert.equal(
    storybookTestPassed({ entryPoint: "figma", cells: { vsStorybook: { status: "pass" } } }),
    true
  );
  assert.equal(
    storybookTestPassed({ entryPoint: "figma", cells: { vsStorybook: { status: "fail" } } }),
    false
  );
  assert.equal(
    storybookTestPassed({ entryPoint: "storybook", cells: { structural: { status: "pass" } } }),
    true
  );
});

test("filterStorybookIndex keeps only allowlisted story ids", () => {
  const index = {
    v: 5,
    entries: {
      "lab-button--primary": { type: "story", id: "lab-button--primary" },
      "lab-button--ghost": { type: "story", id: "lab-button--ghost" }
    }
  };
  const filtered = filterStorybookIndex(index, ["lab-button--primary"]);
  assert.deepEqual(Object.keys(filtered.entries), ["lab-button--primary"]);
  assert.deepEqual(filterStorybookIndex(index, []).entries, {});
});

test("buildManualPreviewManifest writes manifest", async () => {
  const repo = join(new URL(".", import.meta.url).pathname, "..");
  const manifest = await buildManualPreviewManifest(repo);
  assert.ok(manifest.generatedAt);
  assert.ok(Array.isArray(manifest.storybook));
  assert.ok(Array.isArray(manifest.delivery));
});
