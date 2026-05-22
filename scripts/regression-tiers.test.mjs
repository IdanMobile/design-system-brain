import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadStoryFamilyRegistry,
  storiesInComponentFamily,
  componentUiPathFromTitle,
  touchedStoryComponentPackage,
  touchedSharedAdapter
} from "./regression-tiers.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("regression-tiers", () => {
  it("groups button variants by Storybook title", () => {
    const registry = loadStoryFamilyRegistry(ROOT);
    const family = storiesInComponentFamily("lab-button--danger", registry);
    assert.ok(family.includes("lab-button--danger"));
    assert.ok(family.includes("lab-button--primary"));
    assert.ok(family.includes("lab-button--compact"));
    assert.ok(family.length >= 5);
  });

  it("maps Lab/Button title to UI component path", () => {
    assert.equal(componentUiPathFromTitle("Lab/Button"), "packages/ui/src/components/Button.tsx");
  });

  it("detects shared adapter paths", () => {
    assert.equal(
      touchedSharedAdapter(["packages/figma-importer-plugin/src/code-v2.ts"]),
      true
    );
    assert.equal(touchedSharedAdapter(["packages/storybook-lab/foo.ts"]), false);
  });

  it("detects component package edits for Tier B", () => {
    const registry = loadStoryFamilyRegistry(ROOT);
    assert.equal(
      touchedStoryComponentPackage(
        ["packages/ui/src/components/Button.tsx"],
        "lab-button--danger",
        registry
      ),
      true
    );
    assert.equal(
      touchedStoryComponentPackage(
        ["packages/figma-importer-plugin/src/code-v2.ts"],
        "lab-button--danger",
        registry
      ),
      false
    );
  });
});
