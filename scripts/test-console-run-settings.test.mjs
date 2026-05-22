#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_AGENT_MODEL,
  MAX_PARALLEL_WORKERS,
  normalizeRunSettings,
  resolveAgentModel
} from "./test-console-run-settings.mjs";

describe("resolveAgentModel", () => {
  it("defaults to composer-2.5-fast", () => {
    assert.equal(resolveAgentModel({}), DEFAULT_AGENT_MODEL);
  });

  it("uses persisted agentModel", () => {
    assert.equal(resolveAgentModel({ agentModel: "gpt-5.3-codex" }), "gpt-5.3-codex");
  });

  it("keeps unknown model slug (CLI may add new ids)", () => {
    const s = normalizeRunSettings({ agentModel: "gpt-5.3-codex-high" });
    assert.equal(s.agentModel, "gpt-5.3-codex-high");
  });
});

describe("parallelWorkers", () => {
  it(`clamps to ${MAX_PARALLEL_WORKERS}`, () => {
    const s = normalizeRunSettings({ parallelWorkers: 99 });
    assert.equal(s.parallelWorkers, MAX_PARALLEL_WORKERS);
    assert.equal(MAX_PARALLEL_WORKERS, 20);
  });
});
