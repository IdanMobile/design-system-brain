/**
 * @file Unit tests for quick-component-generation gate (isolated from lab strict flow).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  quickStepProceeds,
  strictStepPassed,
  anyStrictFailure,
  QUICK_COMPONENT_GATE_TOLERANCE,
  QUICK_COMPONENT_REPORT_TOLERANCE
} from "./quick-component-gate.mjs";

describe("quick-component-gate", () => {
  it("report tolerance stays at strict 0.1%", () => {
    assert.equal(QUICK_COMPONENT_REPORT_TOLERANCE, 0.1);
    assert.equal(QUICK_COMPONENT_GATE_TOLERANCE, 5.0);
  });

  it("quickStepProceeds allows fail within 5% gate", () => {
    assert.equal(quickStepProceeds({ status: "fail", percent: 4.2 }), true);
    assert.equal(quickStepProceeds({ status: "fail", percent: 5.0 }), true);
  });

  it("quickStepProceeds allows blocked prerequisite (logic without live)", () => {
    assert.equal(
      quickStepProceeds({ status: "not_tested", error: "Blocked — Contract → Figma must pass first" }),
      true
    );
  });

  it("quickStepProceeds treats connection refused as proceed (quick infra skip)", () => {
    assert.equal(
      quickStepProceeds({
        status: "error",
        error: "page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:6107/iframe.html"
      }),
      true
    );
    assert.equal(quickStepProceeds({ status: "error", error: "manifest contract invalid" }), false);
    assert.equal(quickStepProceeds({ status: "error" }), false);
    assert.equal(quickStepProceeds({ status: "not_tested" }), false);
  });

  it("quickStepProceeds allows structural fail without percent", () => {
    assert.equal(quickStepProceeds({ status: "fail" }), true);
  });

  it("strictStepPassed differs from quick gate", () => {
    assert.equal(strictStepPassed({ status: "fail", percent: 4.2 }), false);
    assert.equal(quickStepProceeds({ status: "fail", percent: 4.2 }), true);
  });

  it("anyStrictFailure detects mixed portfolio", () => {
    assert.equal(
      anyStrictFailure(
        {
          structural: { status: "pass" },
          vsFigmaLive: { status: "fail", percent: 2.0 }
        },
        ["structural", "vsFigmaLive"]
      ),
      true
    );
    assert.equal(
      anyStrictFailure({ structural: { status: "pass" } }, ["structural"]),
      false
    );
  });
});
