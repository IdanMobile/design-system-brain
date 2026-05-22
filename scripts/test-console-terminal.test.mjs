#!/usr/bin/env node
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { collectOrchestratorJobPids } from "./test-console-terminal.mjs";

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
