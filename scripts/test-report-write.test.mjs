#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { syncStorybookSuiteTestReport, removeStorybookSuiteTestReport } = await import(
  "../packages/pixel-test/src/test-report-write.ts"
);

describe("syncStorybookSuiteTestReport", () => {
  it("writes test-report.json for failing pixel story", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "lab-report-"));
    const outDir = join(repoRoot, "pixel-diffs");
    const storyId = "lab-button--primary";
    const seg = "lab-button-primary";
    const artifactDir = join(outDir, seg);
    const resultDir = join(outDir, "by-story", seg);

    const storybookPng = join(artifactDir, "storybook.png");
    const renderedPng = join(artifactDir, "rendered.png");
    const diffPng = join(artifactDir, "diff.png");

    const path = syncStorybookSuiteTestReport({
      outDir,
      repoRoot,
      result: {
        storyId,
        status: "fail",
        percent: 1.2,
        maxRegionPercent: 2.5,
        pixelsDiffered: 100,
        pixelsTotal: 10000,
        storybookPng,
        renderedPng,
        diffPng,
        diffRegions: [
          {
            index: 1,
            rect: { x: 0, y: 0, width: 40, height: 40, pixels: 50, percent: 3.1 },
            storybook: "regions/region-01-storybook.png",
            rendered: "regions/region-01-rendered.png",
            compare: "regions/region-01-compare.png",
          },
        ],
      },
    });

    assert.ok(path);
    assert.equal(existsSync(join(resultDir, "test-report.json")), true);
    assert.equal(existsSync(join(resultDir, "test-report.html")), true);
    const report = JSON.parse(readFileSync(join(resultDir, "test-report.json"), "utf8"));
    assert.equal(report.itemId, storyId);
    assert.equal(report.failedTest.testId, "pixel");
    assert.equal(report.failedTest.primaryFixer, "contract-to-storybook");
    assert.ok(report.mismatches.length >= 1);
    assert.match(report.mismatches[0].fixPrompt, /contract-to-storybook/);

    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("removes stale test-report.json when story passes", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "lab-report-"));
    const outDir = join(repoRoot, "figma-diffs");
    const storyId = "lab-card--default";
    const seg = "lab-card-default";
    const resultDir = join(outDir, "by-story", seg);

    syncStorybookSuiteTestReport({
      outDir,
      repoRoot,
      result: {
        storyId,
        status: "fail",
        percent: 0.5,
        storybookPng: join(outDir, seg, "storybook.png"),
        renderedPng: join(outDir, seg, "rendered.png"),
        diffPng: join(outDir, seg, "diff.png"),
      },
    });
    assert.equal(existsSync(join(resultDir, "test-report.json")), true);

    syncStorybookSuiteTestReport({
      outDir,
      repoRoot,
      result: { storyId, status: "pass", percent: 0.01 },
    });
    assert.equal(existsSync(join(resultDir, "test-report.json")), false);
    assert.equal(existsSync(join(resultDir, "test-report.html")), false);

    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("routes figma live failures to contract-to-figma", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "lab-report-"));
    const outDir = join(repoRoot, "figma-live-diffs");
    const storyId = "lab-chart--dense";

    syncStorybookSuiteTestReport({
      outDir,
      repoRoot,
      result: {
        storyId,
        status: "fail",
        percent: 0.8,
        maxRegionPercent: 1.1,
        storybookPng: join(outDir, "lab-chart-dense", "storybook.png"),
        figmaPng: join(outDir, "lab-chart-dense", "figma.png"),
        diffPng: join(outDir, "lab-chart-dense", "diff.png"),
      },
    });

    const report = JSON.parse(
      readFileSync(
        join(outDir, "by-story", "lab-chart-dense", "test-report.json"),
        "utf8"
      )
    );
    assert.equal(report.failedTest.testId, "figmaLive");
    assert.equal(report.failedTest.primaryFixer, "contract-to-figma");

    rmSync(repoRoot, { recursive: true, force: true });
  });
});

describe("syncFigmaScreenStepTestReport", () => {
  it("writes test-report for manifestContract error", async () => {
    const { syncFigmaScreenStepTestReport } = await import("./figma-screen-test-report.mjs");
    const repoRoot = mkdtempSync(join(tmpdir(), "lab-figma-report-"));
    const screenId = "screen_test";
    const path = syncFigmaScreenStepTestReport(repoRoot, screenId, "manifestContract", {
      status: "error",
      percent: 0,
      error: "Contract missing meta.viewport dimensions",
      manifestPath: join(repoRoot, "artifacts/figma-screens/screen_test.manifest.json"),
    });
    assert.ok(path);
    const stepDir = join(repoRoot, "figma-screen-diffs", "by-screen", screenId, "manifestContract");
    assert.equal(existsSync(join(stepDir, "test-report.json")), true);
    assert.equal(existsSync(join(stepDir, "test-report.html")), true);
    const report = JSON.parse(readFileSync(join(stepDir, "test-report.json"), "utf8"));
    assert.equal(report.failedTest.testId, "manifestContract");
    assert.equal(report.failedTest.primaryFixer, "manifest-to-contract");
    rmSync(repoRoot, { recursive: true, force: true });
  });
});

describe("removeStorybookSuiteTestReport", () => {
  it("is safe when file missing", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "lab-report-"));
    removeStorybookSuiteTestReport(join(repoRoot, "pixel-diffs"), "lab-x--y");
    rmSync(repoRoot, { recursive: true, force: true });
  });
});
