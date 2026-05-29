#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isInfraFailure,
  primaryFixPathForMode,
  loadLinkedPatternsFromStory,
  formatLabMemoryContextBlock,
  appendTestInvestigation
} from "./lab-memory-vault.mjs";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("isInfraFailure", () => {
  it("detects page.goto timeout", () => {
    assert.equal(
      isInfraFailure("page.goto: Timeout 30000ms exceeded.\nCall log:\n  - navigating"),
      true
    );
  });
  it("rejects visual fail reason", () => {
    assert.equal(isInfraFailure("global+hotspot"), false);
  });
});

describe("primaryFixPathForMode", () => {
  it("pixel uses render-html", () => {
    assert.match(primaryFixPathForMode("pixel"), /render-html/);
  });
  it("live uses code-v2", () => {
    assert.match(primaryFixPathForMode("live"), /code-v2/);
  });
});

describe("loadLinkedPatternsFromStory", () => {
  it("parses wiki links and reads pattern title", () => {
    const repo = join(import.meta.dirname, "..");
    const body = "## Linked patterns\n\n- [[patterns/render-html-button-appearance]]\n";
    const patterns = loadLinkedPatternsFromStory(repo, body);
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].id, "render-html-button-appearance");
    assert.ok(patterns[0].title.length > 0);
  });
});

describe("appendTestInvestigation infra", () => {
  it("writes infra root cause without pending", () => {
    const repo = mkdtempSync(join(tmpdir(), "lab-mem-"));
    try {
      const story = {
        storyId: "lab-test--infra",
        status: "error",
        percent: 100,
        paths: {
          comparePng: join(repo, "pixel-diffs/x/compare.png"),
          storybookPng: join(repo, "pixel-diffs/x/storybook.png"),
          figmaPng: join(repo, "pixel-diffs/x/rendered.png"),
          artifactPath: join(repo, "pixel-diffs/x/artifact.v2.json"),
          sceneJsonPath: join(repo, "pixel-diffs/x/scene.json")
        },
        error: "page.goto: Timeout 30000ms exceeded."
      };
      const r = appendTestInvestigation({
        repoRoot: repo,
        storyId: story.storyId,
        suiteId: "pixel",
        story,
        source: "test"
      });
      assert.equal(r.ok, true);
      const body = readFileSync(r.path, "utf8");
      assert.ok(body.includes("Infrastructure — Storybook"));
      assert.ok(!body.includes("<!-- pending — agent fills"));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("formatLabMemoryContextBlock", () => {
  it("includes pending guidance when stub only", () => {
    const lines = formatLabMemoryContextBlock(
      { hint: null, patterns: [], pendingOnly: true, primaryPath: "packages/pixel-test/src/render-html.ts" },
      "pixel"
    );
    assert.ok(lines.some((l) => l.includes("pending")));
  });
});
