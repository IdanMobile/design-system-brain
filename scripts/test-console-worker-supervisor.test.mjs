#!/usr/bin/env node
/**
 * Unit tests for worker supervisor heuristics.
 * Run: node --test scripts/test-console-worker-supervisor.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adapterFilesForMode,
  classifyWrongFiles,
  diffWorkspaceSnapshots,
  evaluateAttempt,
  investigatorGateAllowsFixer,
  workerModeInstructions,
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
    assert.ok(msg?.includes("render-html"));
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

  it("detects STUCK_LOOP when metrics unchanged at low percent → narrow_scope micro-fix", () => {
    const r = evaluateAttempt(base);
    assert.ok(r.verdicts.includes("STUCK_LOOP"));
    assert.equal(r.nextWorkerMode, "narrow_scope");
  });

  it("detects STUCK_LOOP at higher percent → investigate_first", () => {
    const r = evaluateAttempt({
      ...base,
      beforeAttempt: { status: "fail", percent: 4.5, maxRegionPercent: 5.0 },
      afterTest: { status: "fail", percent: 4.5, maxRegionPercent: 5.0 },
    });
    assert.ok(r.verdicts.includes("STUCK_LOOP"));
    assert.equal(r.nextWorkerMode, "investigate_first");
  });

  it("STUCK_LOOP with structuredDiagnosis contract-to-figma → narrow_scope + editRouting hint", () => {
    const r = evaluateAttempt({
      ...base,
      structuredDiagnosis: {
        rootCauseLayer: "contract-to-figma",
        editRouting: [{ layer: "fig-5", symbol: "createTextNode" }],
      },
    });
    assert.equal(r.nextWorkerMode, "narrow_scope");
    assert.ok(r.interventionLines.some((l) => l.includes("structuredDiagnosis")));
  });

  it("detects WORSE_METRICS", () => {
    const r = evaluateAttempt({
      ...base,
      afterTest: { status: "fail", percent: 0.8, maxRegionPercent: 1.2 }
    });
    assert.equal(r.verdict, "WORSE_METRICS");
    assert.equal(r.nextWorkerMode, "narrow_scope");
  });

  it("detects NO_ADAPTER_EDIT when only lab-memory changed", () => {
    const r = evaluateAttempt({
      suiteId: "pixel",
      mode: "pixel",
      storyId: "lab-retroterminalscreen--default",
      attempt: 2,
      beforeAttempt: { status: "fail", percent: 3.19, maxRegionPercent: null },
      afterTest: { status: "fail", percent: 3.19, maxRegionPercent: null },
      agentExitCode: 0,
      pluginBuildFailed: false,
      filesChanged: ["lab-memory/Home.md", ".cursor/rules/lab-memory.mdc"],
      priorRuns: [],
      repoRoot: null
    });
    assert.equal(r.verdict, "NO_ADAPTER_EDIT");
    assert.deepEqual(
      adapterFilesForMode("pixel", ["lab-memory/Home.md", ".cursor/rules/lab-memory.mdc"]),
      []
    );
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

  it("escalates to orchestrator review after repeated ineffective attempts", () => {
    const r = evaluateAttempt({
      ...base,
      attempt: 3,
      afterTest: { status: "fail", percent: 0.5, maxRegionPercent: 1.2 },
      priorRuns: [
        { evaluation: { verdict: "STUCK_LOOP" }, afterTest: { percent: 0.5, maxRegionPercent: 1.2 } },
        { evaluation: { verdict: "NO_ADAPTER_EDIT" }, afterTest: { percent: 0.5, maxRegionPercent: 1.2 } }
      ]
    });

    assert.equal(r.nextWorkerMode, "orchestrator_review");
    assert.match(r.interventionLines.join("\n"), /orchestrator review/i);
  });

  it("investigator gate always allows — report holds investigation", () => {
    const gate = investigatorGateAllowsFixer("/tmp/nonexistent-repo", "lab-x--default", "pixel");
    assert.equal(gate.allowed, true);
    assert.equal(gate.reason, "investigation_on_test_report");
  });
});

describe("workerModeInstructions", () => {
  it("explains orchestrator review mode", () => {
    const lines = workerModeInstructions("orchestrator_review");
    assert.ok(lines.join("\n").includes("ORCHESTRATOR REVIEW"));
  });
});
