#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  effectiveOrchestratorFilters,
  findFlowWorkQueue,
  findNextFlowWork,
  flowWorkCanRunInParallel,
  selectFlowWorkBatch,
  fixSuiteForCell
} from "./unified-orchestrator-work.mjs";
import { appendTestInvestigation } from "./lab-memory-vault.mjs";
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function row(storyId, cells, entryPoint = "storybook") {
  return { storyId, entryPoint, cells };
}

describe("findNextFlowWork", () => {
  it("advances a passed item to its next runnable step before draining the whole first column", () => {
    const portfolio = {
      rows: [
        row("a", {
          structural: { status: "pass" },
          vsFigmaLive: { status: "not_tested", canRun: true }
        }),
        row("b", {
          structural: { status: "fail", percent: 4 },
          vsFigmaLive: {
            status: "not_tested",
            canRun: false,
            blockedReason: "structural is fail"
          }
        })
      ]
    };

    const next = findNextFlowWork(
      portfolio,
      effectiveOrchestratorFilters({ scope: "failures_only" })
    );

    assert.deepEqual(next, {
      stepId: "vsFigmaLive",
      storyId: "a",
      entryPoint: "storybook",
      status: "not_tested",
      percent: 0,
      kind: "golden"
    });
  });

  it("never schedules blocked cells", () => {
    const portfolio = {
      rows: [
        row("a", {
          structural: { status: "fail", percent: 2 },
          vsFigmaLive: {
            status: "not_tested",
            canRun: false,
            blockedReason: "structural is fail"
          }
        })
      ]
    };

    const next = findNextFlowWork(
      portfolio,
      effectiveOrchestratorFilters({ scope: "single_step", singleStepId: "vsFigmaLive" })
    );

    assert.equal(next, null);
  });

  it("prioritizes runnable failures on an item's current step over its not-tested cells", () => {
    const portfolio = {
      rows: [
        row("a", {
          structural: { status: "warn", percent: 1.2 },
          vsFigmaLive: { status: "not_tested", canRun: false }
        }),
        row("b", {
          structural: { status: "pass" },
          vsFigmaLive: { status: "not_tested", canRun: true }
        })
      ]
    };

    const next = findNextFlowWork(
      portfolio,
      effectiveOrchestratorFilters({ scope: "failures_only" })
    );

    assert.deepEqual(next, {
      stepId: "structural",
      storyId: "a",
      entryPoint: "storybook",
      status: "warn",
      percent: 1.2,
      kind: "fix"
    });
  });
});

describe("findFlowWorkQueue", () => {
  it("returns multiple runnable item steps for parallel flow dispatch", () => {
    const portfolio = {
      rows: [
        row("a", {
          structural: { status: "pass" },
          vsFigmaLive: { status: "not_tested", canRun: true }
        }),
        row("b", {
          structural: { status: "pass" },
          vsFigmaLive: { status: "not_tested", canRun: true }
        }),
        row("c", {
          structural: { status: "fail", percent: 3 },
          vsFigmaLive: { status: "not_tested", canRun: false }
        })
      ]
    };

    const queue = findFlowWorkQueue(
      portfolio,
      effectiveOrchestratorFilters({ scope: "failures_only" }),
      { limit: 3 }
    );

    assert.deepEqual(
      queue.map((w) => `${w.storyId}:${w.stepId}:${w.kind}`),
      ["a:vsFigmaLive:golden", "b:vsFigmaLive:golden", "c:structural:fix"]
    );
  });
});

describe("selectFlowWorkBatch", () => {
  let repo;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "flow-batch-"));
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("includes investigator-pending fixes alongside goldens in one batch", () => {
    const portfolio = {
      rows: [
        row("a", { structural: { status: "not_tested", canRun: true } }),
        row("b", { structural: { status: "not_tested", canRun: true } }),
        row("c", { structural: { status: "fail", percent: 2, canRun: true } })
      ]
    };
    const batch = selectFlowWorkBatch(
      repo,
      portfolio,
      effectiveOrchestratorFilters({ scope: "failures_only" }),
      3
    );
    assert.equal(batch.length, 3);
    assert.deepEqual(
      batch.map((w) => `${w.storyId}:${w.kind}`),
      ["a:golden", "b:golden", "c:fix"]
    );
  });
});

describe("flowWorkCanRunInParallel", () => {
  let repo;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "flow-par-"));
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("always allows parallel dispatch (investigator is per fix-all job)", () => {
    assert.equal(
      flowWorkCanRunInParallel("/tmp", {
        kind: "fix",
        storyId: "lab-button--primary",
        entryPoint: "storybook",
        stepId: "structural",
        suiteId: fixSuiteForCell("storybook", "structural")
      }),
      true
    );
  });

  it("allows parallel golden work", () => {
    assert.equal(
      flowWorkCanRunInParallel(repo, {
        kind: "golden",
        storyId: "a",
        stepId: "structural"
      }),
      true
    );
  });

  it("cached investigation does not affect parallel dispatch", () => {
    const work = {
      kind: "fix",
      storyId: "lab-button--primary",
      entryPoint: "storybook",
      stepId: "structural",
      suiteId: fixSuiteForCell("storybook", "structural")
    };
    assert.equal(flowWorkCanRunInParallel(repo, work), true);

    appendTestInvestigation({
      repoRoot: repo,
      storyId: "lab-button--primary",
      suiteId: "pixel",
      story: { storyId: "lab-button--primary", status: "fail", percent: 1.2 },
      resultRow: { status: "fail", percent: 1.2, failReason: "diff" }
    });
    const path = join(
      repo,
      "lab-memory/visual/investigations/active/lab-button--primary.md"
    );
    let body = readFileSync(path, "utf8");
    body = body.replace(
      /### Root cause\s*\n\n[\s\S]*?(?=\n### )/,
      "### Root cause\n\nBorder radius mismatch.\n\n"
    );
    writeFileSync(path, body, "utf8");

    assert.equal(flowWorkCanRunInParallel(repo, work), true);
  });
});
