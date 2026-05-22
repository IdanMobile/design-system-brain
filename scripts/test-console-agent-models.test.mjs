#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseAgentListModelsOutput,
  sortAgentModelOptions
} from "./test-console-agent-models.mjs";

describe("parseAgentListModelsOutput", () => {
  it("parses CLI list-models format", () => {
    const options = parseAgentListModelsOutput(`
Available models

auto - Auto
composer-2.5-fast - Composer 2.5 Fast (current, default)
gpt-5.3-codex - Codex 5.3

Tip: use --model
`);
    assert.equal(options.length, 3);
    assert.equal(options[1].id, "composer-2.5-fast");
    assert.match(options[1].label, /default/);
  });
});

describe("sortAgentModelOptions", () => {
  it("puts composer-2.5-fast first", () => {
    const sorted = sortAgentModelOptions([
      { id: "auto", label: "Auto" },
      { id: "composer-2.5-fast", label: "Composer 2.5 Fast (default)" },
      { id: "gpt-5.2", label: "GPT-5.2" }
    ]);
    assert.equal(sorted[0].id, "composer-2.5-fast");
  });
});
