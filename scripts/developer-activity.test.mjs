#!/usr/bin/env node
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDeveloperActivityView, AUDIT_STEPS, IMPLEMENT_STEPS } from "./developer-activity.mjs";

describe("developer-activity", () => {
  it("returns idle when no activity file", () => {
    const view = buildDeveloperActivityView("/nonexistent-path-xyz", null, null);
    assert.equal(view.active, false);
    assert.equal(view.idle, true);
  });

  it("exposes audit step labels", () => {
    assert.ok(AUDIT_STEPS.length >= 3);
    assert.ok(IMPLEMENT_STEPS.some((s) => s.id === "verify"));
  });
});
