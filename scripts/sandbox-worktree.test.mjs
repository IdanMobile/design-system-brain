import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterPromotableSandboxFiles } from "./sandbox-worktree.mjs";

describe("filterPromotableSandboxFiles", () => {
  const codeFile = "packages/figma-importer-plugin/src/code-v2.ts";

  it("blocks code promotion on watchdog even when git diff shows code changes", () => {
    const out = filterPromotableSandboxFiles([codeFile], {
      codeFileCount: 1,
      watchdogTripped: true,
      agentExitCode: 143,
      editCount: 0,
    });
    assert.deepEqual(out, []);
  });

  it("allows promotion when git diff shows code changes even if editCount is zero", () => {
    const out = filterPromotableSandboxFiles([codeFile], {
      codeFileCount: 1,
      watchdogTripped: false,
      agentExitCode: 0,
      editCount: 0,
    });
    assert.deepEqual(out, [codeFile]);
  });

  it("blocks promotion when no git diff and zero edits", () => {
    const out = filterPromotableSandboxFiles([], {
      codeFileCount: 0,
      watchdogTripped: false,
      agentExitCode: 0,
      editCount: 0,
    });
    assert.deepEqual(out, []);
  });

  it("allows code promotion when agent edited allowlisted file", () => {
    const out = filterPromotableSandboxFiles([codeFile], {
      codeFileCount: 1,
      watchdogTripped: false,
      agentExitCode: 0,
      editCount: 2,
    });
    assert.deepEqual(out, [codeFile]);
  });
});
