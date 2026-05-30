#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewSandboxPromotion } from "./merge-captain.mjs";

describe("merge captain", () => {
  it("approves an improving scoped change with passing verification", () => {
    const review = reviewSandboxPromotion({
      suiteId: "pixel",
      mode: "pixel",
      filesChanged: ["packages/pixel-test/src/render-html.ts"],
      promotion: { promote: true, discard: false, worse: [], improved: [{ storyId: "a" }] },
      verification: { tierAOk: true, tierBOk: true, tierCOk: true }
    });

    assert.equal(review.decision, "approve");
    assert.equal(review.requiresHuman, false);
  });

  it("rejects sandbox changes when metrics regressed", () => {
    const review = reviewSandboxPromotion({
      suiteId: "figmaLive",
      mode: "live",
      filesChanged: ["packages/figma-importer-plugin/src/code-v2.ts"],
      promotion: { promote: false, discard: true, worse: [{ storyId: "a" }], improved: [] },
      verification: { tierAOk: true, tierBOk: true, tierCOk: true }
    });

    assert.equal(review.decision, "reject");
    assert.match(review.reasons.join("\n"), /regressed/);
  });

  it("approves shared adapter edits when Tier A passes (Tier C not a pipeline gate)", () => {
    const review = reviewSandboxPromotion({
      suiteId: "figmaLive",
      mode: "live",
      filesChanged: ["packages/figma-importer-plugin/src/code-v2.ts"],
      promotion: { promote: true, discard: false, worse: [], improved: [{ storyId: "a" }] },
      verification: { tierAOk: true, tierBOk: true }
    });

    assert.equal(review.decision, "approve");
    assert.equal(review.sharedAdapter, true);
  });

  it("holds when Tier C explicitly failed", () => {
    const review = reviewSandboxPromotion({
      suiteId: "figmaLive",
      mode: "live",
      filesChanged: ["packages/figma-importer-plugin/src/code-v2.ts"],
      promotion: { promote: true, discard: false, worse: [], improved: [{ storyId: "a" }] },
      verification: { tierAOk: true, tierBOk: true, tierCOk: false }
    });

    assert.equal(review.decision, "hold");
    assert.equal(review.requiresHuman, false);
    assert.match(review.reasons.join("\n"), /Tier C/);
  });

  it("rejects wrong-file changes even when metrics improved", () => {
    const review = reviewSandboxPromotion({
      suiteId: "pixel",
      mode: "pixel",
      filesChanged: ["packages/figma-importer-plugin/src/code-v2.ts"],
      promotion: { promote: true, discard: false, worse: [], improved: [{ storyId: "a" }] },
      verification: { tierAOk: true, tierBOk: true, tierCOk: true }
    });

    assert.equal(review.decision, "reject");
    assert.match(review.reasons.join("\n"), /pixel step/);
  });
});
