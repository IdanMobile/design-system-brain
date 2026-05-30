#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_AGENT_MODEL,
  DEFAULT_RUN_SETTINGS,
  DEFAULT_STORYBOOK_PARALLEL,
  MAX_PARALLEL_WORKERS,
  normalizeRunSettings,
  resolveAgentModel,
  resolveDevAgentModel,
  storybookParallelCap
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

describe("resolveDevAgentModel", () => {
  it("defaults to composer-2.5-fast", () => {
    assert.equal(resolveDevAgentModel({}), DEFAULT_AGENT_MODEL);
  });

  it("uses persisted devAgentModel", () => {
    assert.equal(resolveDevAgentModel({ devAgentModel: "gpt-5.3-codex" }), "gpt-5.3-codex");
  });

  it("keeps unknown devAgentModel slug", () => {
    const s = normalizeRunSettings({ devAgentModel: "gpt-5.3-codex-high" });
    assert.equal(s.devAgentModel, "gpt-5.3-codex-high");
  });
});

describe("parallelWorkers", () => {
  it(`clamps to ${MAX_PARALLEL_WORKERS}`, () => {
    const s = normalizeRunSettings({ parallelWorkers: 150 });
    assert.equal(s.parallelWorkers, MAX_PARALLEL_WORKERS);
    assert.equal(MAX_PARALLEL_WORKERS, 100);
  });
});

describe("orchestrator sort", () => {
  it("defaults to flow_first for per-item portfolio scheduling", () => {
    assert.equal(DEFAULT_RUN_SETTINGS.sortBy, "flow_first");
    assert.equal(normalizeRunSettings({}).sortBy, "flow_first");
  });

  it("accepts flow_first for per-item scheduling", () => {
    const s = normalizeRunSettings({ sortBy: "flow_first" });
    assert.equal(s.sortBy, "flow_first");
  });
});

describe("storybookParallelCap", () => {
  it(`caps Storybook load at ${DEFAULT_STORYBOOK_PARALLEL} by default`, () => {
    assert.equal(storybookParallelCap(100), DEFAULT_STORYBOOK_PARALLEL);
    assert.equal(DEFAULT_STORYBOOK_PARALLEL, 12);
  });
});
