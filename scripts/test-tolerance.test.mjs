#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PIXEL_PERFECT_TOLERANCE,
  statusFromPercent,
  statusFromGates,
} from "../packages/pixel-test/src/test-tolerance.ts";

describe("test-tolerance", () => {
  it("exports single PIXEL_PERFECT_TOLERANCE constant", () => {
    assert.equal(PIXEL_PERFECT_TOLERANCE, 0.1);
  });

  it("statusFromPercent pass/warn/fail at 4×", () => {
    assert.equal(statusFromPercent(0.05), "pass");
    assert.equal(statusFromPercent(0.1), "pass");
    assert.equal(statusFromPercent(0.2), "warn");
    assert.equal(statusFromPercent(0.4), "warn");
    assert.equal(statusFromPercent(0.41), "fail");
  });

  it("statusFromGates uses worst of global and region", () => {
    assert.equal(statusFromGates(0.05, 0.05), "pass");
    assert.equal(statusFromGates(0.05, 0.5), "fail");
    assert.equal(statusFromGates(0.2, 0.05), "warn");
  });
});

describe("pixel-perfect-tolerance re-export", () => {
  it("matches test-tolerance.ts", async () => {
    const mjs = await import("./pixel-perfect-tolerance.mjs");
    assert.equal(mjs.PIXEL_PERFECT_TOLERANCE, PIXEL_PERFECT_TOLERANCE);
    assert.equal(mjs.statusFromPercent(0.2), "warn");
    assert.equal(mjs.statusFromGates(0.2, 0.05), "warn");
  });
});
