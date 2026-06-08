#!/usr/bin/env node
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  deleteQuickGenerationRun,
  QUICK_GENERATION_DIR,
  QUICK_RUNS_DIR
} from "./quick-generation-portfolio.mjs";

describe("deleteQuickGenerationRun", () => {
  it("removes only the quick run json and rebuilds quick portfolio", () => {
    const repo = mkdtempSync(join(tmpdir(), "delete-quick-"));
    const runsDir = join(repo, QUICK_RUNS_DIR);
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(
      join(runsDir, "job-a.json"),
      JSON.stringify({ jobId: "job-a", screenId: "screen_1", stepCells: {} })
    );
    writeFileSync(
      join(runsDir, "job-b.json"),
      JSON.stringify({ jobId: "job-b", screenId: "screen_2", stepCells: {} })
    );
    mkdirSync(join(repo, "artifacts/figma-screens"), { recursive: true });
    writeFileSync(join(repo, "artifacts/figma-screens/screen_1.manifest.json"), "{}");

    const result = deleteQuickGenerationRun(repo, "job-a");
    assert.equal(result.ok, true);
    assert.equal(result.scope, "quick-generation-run-only");
    assert.equal(existsSync(join(runsDir, "job-a.json")), false);
    assert.equal(existsSync(join(runsDir, "job-b.json")), true);
    assert.equal(existsSync(join(repo, "artifacts/figma-screens/screen_1.manifest.json")), true);

    const portfolio = JSON.parse(
      readFileSync(join(repo, QUICK_GENERATION_DIR, "portfolio.json"), "utf8")
    );
    assert.equal(portfolio.storyCount, 1);
    assert.equal(portfolio.rows[0]?.jobId, "job-b");
  });
});
