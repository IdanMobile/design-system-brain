import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  captureSuiteMetrics,
  evaluatePromotion,
  isStoryImproved,
  isStoryWorse
} from "./sandbox-promote.mjs";

describe("sandbox-promote", () => {
  it("detects worse metrics", () => {
    assert.equal(
      isStoryWorse(
        { status: "fail", percent: 5, maxRegionPercent: 5 },
        { status: "fail", percent: 6, maxRegionPercent: 5.5 }
      ),
      true
    );
    assert.equal(
      isStoryWorse(
        { status: "pass", percent: 0, maxRegionPercent: 0 },
        { status: "fail", percent: 1, maxRegionPercent: 1 }
      ),
      true
    );
  });

  it("detects improvement", () => {
    assert.equal(
      isStoryImproved(
        { status: "fail", percent: 9, maxRegionPercent: 9 },
        { status: "pass", percent: 0, maxRegionPercent: 0 }
      ),
      true
    );
  });

  it("discard when any story regresses", () => {
    const baseline = captureSuiteMetrics(
      "/repo",
      "figmaLive",
      ["a", "b"],
      (suite, id) =>
        id === "a"
          ? { status: "fail", percent: 5, maxRegionPercent: 5 }
          : { status: "fail", percent: 2, maxRegionPercent: 2 }
    );
    const after = captureSuiteMetrics(
      "/repo",
      "figmaLive",
      ["a", "b"],
      (suite, id) =>
        id === "a"
          ? { status: "fail", percent: 6, maxRegionPercent: 6 }
          : { status: "pass", percent: 0, maxRegionPercent: 0 }
    );
    const v = evaluatePromotion(baseline, after);
    assert.equal(v.discard, true);
    assert.equal(v.promote, false);
    assert.equal(v.worse.length, 1);
  });

  it("promote when improved and none worse", () => {
    const baseline = captureSuiteMetrics("/repo", "figmaLive", ["a"], () => ({
      status: "fail",
      percent: 5,
      maxRegionPercent: 5
    }));
    const after = captureSuiteMetrics("/repo", "figmaLive", ["a"], () => ({
      status: "pass",
      percent: 0,
      maxRegionPercent: 0
    }));
    const v = evaluatePromotion(baseline, after);
    assert.equal(v.promote, true);
    assert.equal(v.discard, false);
  });
});
