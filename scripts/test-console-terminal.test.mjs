#!/usr/bin/env node
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectOrchestratorJobPids,
  collectSafeOrchestratorJobPids,
  isProcessAlive
} from "./test-console-terminal.mjs";

describe("collectOrchestratorJobPids", () => {
  it("dedupes orchestrator and active pids", () => {
    const pids = collectOrchestratorJobPids({
      fixAllOrchestratorPid: 100,
      fixAllActivePid: 200,
      fixAllActivePids: [200, 300],
      fixAllPid: 400
    });
    assert.deepEqual(pids.sort(), [100, 200, 300, 400]);
  });
});

describe("collectSafeOrchestratorJobPids", () => {
  it("drops dead pids that would otherwise be killed on cancel", () => {
    const alive = process.pid;
    assert.equal(isProcessAlive(alive), true);
    const safe = collectSafeOrchestratorJobPids({
      id: "dead-pid-job",
      action: "fix-all:figmaLive",
      fixAllOrchestratorPid: 999999991,
      fixAllActivePids: [999999992, alive]
    });
    assert.equal(safe.includes(999999991), false);
    assert.equal(safe.includes(999999992), false);
    assert.equal(safe.includes(alive), false);
  });
});
