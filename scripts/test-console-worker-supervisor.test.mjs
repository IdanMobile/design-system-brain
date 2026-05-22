#!/usr/bin/env node
/**
 * Unit tests for worker supervisor heuristics.
 * Run: node --test scripts/test-console-worker-supervisor.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyWrongFiles,
  diffWorkspaceSnapshots,
  evaluateAttempt,
  touchedSharedAdapter
} from "./test-console-worker-supervisor.mjs";

describe("touchedSharedAdapter", () => {
  it("detects code-v2", () => {
    assert.equal(
      touchedSharedAdapter(["packages/figma-importer-plugin/src/code-v2.ts"]),
      true
    );
  });
  it("ignores story files", () => {
    assert.equal(touchedSharedAdapter(["packages/ui/src/Button.tsx"]), false);
  });
});

describe("classifyWrongFiles", () => {
  it("flags code-v2 on pixel step", () => {
    const msg = classifyWrongFiles("pixel", "pixel", [
      "packages/figma-importer-plugin/src/code-v2.ts"
    ]);
    assert.ok(msg?.includes("scene-to-html"));
  });
  it("flags ui-only on figma mock", () => {
    const msg = classifyWrongFiles("figma", "emulator", [
      "packages/ui/src/foo.tsx"
    ]);
    assert.ok(msg?.includes("code-v2"));
  });
});

describe("diffWorkspaceSnapshots", () => {
  it("finds hash changes", () => {
    const changed = diffWorkspaceSnapshots({ a: "1" }, { a: "2", b: "3" });
    assert.deepEqual(changed, ["a", "b"]);
  });
});

describe("evaluateAttempt", () => {
  const base = {
    suiteId: "figma",
    mode: "emulator",
    storyId: "lab-button--primary",
    attempt: 2,
    beforeAttempt: { status: "fail", percent: 0.5, maxRegionPercent: 1.2 },
    afterTest: { status: "fail", percent: 0.5, maxRegionPercent: 1.2 },
    agentExitCode: 0,
    pluginBuildFailed: false,
    filesChanged: ["packages/figma-importer-plugin/src/code-v2.ts"],
    priorRuns: [],
    repoRoot: null
  };

  it("detects STUCK_LOOP when metrics unchanged", () => {
    const r = evaluateAttempt(base);
    assert.ok(r.verdicts.includes("STUCK_LOOP"));
    assert.equal(r.nextWorkerMode, "investigate_first");
  });

  it("detects WORSE_METRICS", () => {
    const r = evaluateAttempt({
      ...base,
      afterTest: { status: "fail", percent: 0.8, maxRegionPercent: 1.2 }
    });
    assert.equal(r.verdict, "WORSE_METRICS");
    assert.equal(r.nextWorkerMode, "narrow_scope");
  });

  it("detects NO_EDIT", () => {
    const r = evaluateAttempt({
      ...base,
      attempt: 1,
      filesChanged: [],
      beforeAttempt: { status: "fail", percent: 0.5, maxRegionPercent: 1.2 },
      afterTest: { status: "fail", percent: 0.5, maxRegionPercent: 1.2 }
    });
    assert.equal(r.verdict, "NO_EDIT");
  });

  it("flags SHARED_ADAPTER", () => {
    const r = evaluateAttempt({
      ...base,
      afterTest: { status: "fail", percent: 0.4, maxRegionPercent: 1.0 },
      filesChanged: ["packages/figma-importer-plugin/src/code-v2.ts"]
    });
    assert.ok(r.tierCRequired);
  });
});
