import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildArchitectureConsoleState, buildArchitectAuditPrompt } from "./architecture-console.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("architecture-console", () => {
  it("builds pipeline and packages", () => {
    const state = buildArchitectureConsoleState(ROOT);
    assert.ok(state.pipeline.length >= 5);
    assert.ok(state.packages.length >= 5);
    assert.ok(state.agentRoles.some((r) => r.role.includes("architect")));
  });

  it("audit prompt uses developer_audit workflow + superpowers", () => {
    const p = buildArchitectAuditPrompt();
    assert.match(p, /developer-agent/);
    assert.match(p, /code-architect-investigator/);
    assert.match(p, /using-superpowers/);
    assert.match(p, /systematic-debugging/);
    assert.match(p, /verification-before-completion/);
    assert.match(p, /READ-ONLY/);
  });
});
