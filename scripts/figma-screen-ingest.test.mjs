#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ingestFigmaScreen, suggestNextScreenId } from "./figma-screen-ingest.mjs";

const MIN_FRAME = {
  id: "1:2",
  type: "FRAME",
  name: "Test Frame",
  width: 100,
  height: 50,
  children: []
};

describe("figma-screen-ingest", () => {
  /** @type {string} */
  let repoRoot;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "figma-ingest-"));
  });

  it("writes manifest and png", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const result = ingestFigmaScreen(repoRoot, {
      screenId: "screen_99",
      manifest: MIN_FRAME,
      png
    });
    assert.equal(result.screenId, "screen_99");
    assert.ok(existsSync(join(repoRoot, "artifacts/figma-screens/screen_99.manifest.json")));
    assert.ok(existsSync(join(repoRoot, "artifacts/figma-screens/screen_99.png")));
    const saved = JSON.parse(
      readFileSync(join(repoRoot, "artifacts/figma-screens/screen_99.manifest.json"), "utf8")
    );
    assert.equal(saved.type, "FRAME");
  });

  it("suggests next screen id", () => {
    ingestFigmaScreen(repoRoot, { screenId: "screen_1", manifest: MIN_FRAME, png: Buffer.from("x") });
    ingestFigmaScreen(repoRoot, { screenId: "screen_2", manifest: MIN_FRAME, png: Buffer.from("x") });
    assert.equal(suggestNextScreenId(repoRoot), "screen_3");
  });
});
