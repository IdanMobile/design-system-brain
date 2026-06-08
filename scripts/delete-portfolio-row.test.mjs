#!/usr/bin/env node
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  collectStorybookArtifactDirs,
  collectFigmaScreenSourcePaths,
  loadExcludedStoryIds,
  deletePortfolioRow,
  safeStorySegment
} from "./delete-portfolio-row.mjs";
import { FIGMA_SCREENS_DIR } from "./figma-screen-portfolio.mjs";

describe("delete-portfolio-row", () => {
  it("safeStorySegment collapses double dashes", () => {
    assert.equal(safeStorySegment("lab-analyticscharts--dense"), "lab-analyticscharts-dense");
  });

  it("collectStorybookArtifactDirs includes by-story and flat dirs", () => {
    const dirs = collectStorybookArtifactDirs("/repo", "lab-button--primary");
    assert.ok(dirs.some((d) => d.endsWith("pixel-diffs/by-story/lab-button-primary")));
    assert.ok(dirs.some((d) => d.endsWith("figma-live-diffs/lab-button-primary")));
  });

  it("deletePortfolioRow excludes storybook story and removes artifacts", () => {
    const repo = mkdtempSync(join(tmpdir(), "delete-row-"));
    mkdirSync(join(repo, "pixel-diffs/by-story", safeStorySegment("lab-x--y")), { recursive: true });
    writeFileSync(join(repo, "pixel-diffs/by-story", safeStorySegment("lab-x--y"), "result.json"), "{}");
    mkdirSync(join(repo, "artifacts"), { recursive: true });
    writeFileSync(
      join(repo, "artifacts/stories.index.json"),
      JSON.stringify({ stories: [{ id: "lab-x--y" }] })
    );
    mkdirSync(join(repo, ".test-console"), { recursive: true });

    const result = deletePortfolioRow(repo, {
      storyId: "lab-x--y",
      entryPoint: "storybook",
      skipPortfolioRefresh: true
    });
    assert.equal(result.ok, true);
    assert.ok(loadExcludedStoryIds(repo).has("lab-x--y"));
    assert.equal(
      existsSync(join(repo, "pixel-diffs/by-story", safeStorySegment("lab-x--y"), "result.json")),
      false
    );
  });

  it("deletePortfolioRow removes figma screen source files", () => {
    const repo = mkdtempSync(join(tmpdir(), "delete-figma-"));
    const screensDir = join(repo, FIGMA_SCREENS_DIR);
    mkdirSync(screensDir, { recursive: true });
    writeFileSync(join(screensDir, "screen_9.manifest.json"), "{}");
    writeFileSync(join(screensDir, "screen_9.png"), "png");
    mkdirSync(join(repo, ".test-console"), { recursive: true });

    deletePortfolioRow(repo, {
      storyId: "screen_9",
      entryPoint: "figma",
      skipPortfolioRefresh: true
    });
    assert.equal(existsSync(join(screensDir, "screen_9.manifest.json")), false);
    assert.equal(existsSync(join(screensDir, "screen_9.png")), false);
    assert.equal(loadExcludedStoryIds(repo).has("screen_9"), false);
  });
});
