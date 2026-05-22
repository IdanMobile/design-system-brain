#!/usr/bin/env node
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  capturePortfolioSnapshot,
  comparePortfolioSnapshots
} from "./developer-proposal.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("developer-proposal", () => {
  it("capturePortfolioSnapshot returns suites with successRate", () => {
    const snap = capturePortfolioSnapshot(ROOT);
    assert.ok(snap.storyCount >= 0);
    assert.ok(typeof snap.successRate === "number");
    assert.ok(snap.suites.pixel);
  });

  it("comparePortfolioSnapshots detects pass delta", () => {
    const before = {
      capturedAt: "",
      storyCount: 2,
      suites: {
        pixel: { pass: 1, fail: 1, warn: 0, not_tested: 0, total: 2 },
        figma: { pass: 0, fail: 2, warn: 0, not_tested: 0, total: 2 },
        figmaLive: { pass: 0, fail: 2, warn: 0, not_tested: 0, total: 2 },
        delivery: { pass: 0, fail: 2, warn: 0, not_tested: 0, total: 2 }
      },
      totalPass: 1,
      totalCells: 8,
      successRate: 1 / 8
    };
    const after = {
      ...before,
      suites: {
        ...before.suites,
        pixel: { pass: 2, fail: 0, warn: 0, not_tested: 0, total: 2 }
      },
      totalPass: 2,
      successRate: 2 / 8
    };
    const cmp = comparePortfolioSnapshots(before, after);
    assert.equal(cmp.passDelta, 1);
    assert.equal(cmp.improved, true);
    assert.equal(cmp.regressed, false);
  });
});
