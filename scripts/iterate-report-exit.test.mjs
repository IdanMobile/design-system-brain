import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exitCodeForReport, scopeReportResults } from "./iterate-report-exit.mjs";

describe("iterate-report-exit", () => {
  const report = {
    results: [
      { storyId: "lab-button--primary", status: "pass" },
      { storyId: "lab-button--ghost", status: "fail" }
    ]
  };

  it("scopes results to one story", () => {
    const scoped = scopeReportResults(report.results, { storyId: "lab-button--primary" });
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0].storyId, "lab-button--primary");
  });

  it("full portfolio exit fails when any story fails", () => {
    assert.equal(exitCodeForReport(report), 1);
  });

  it("scoped exit passes when target story passes", () => {
    assert.equal(exitCodeForReport(report, { storyId: "lab-button--primary" }), 0);
  });

  it("scoped exit fails when target story fails", () => {
    assert.equal(exitCodeForReport(report, { storyId: "lab-button--ghost" }), 1);
  });

  it("strict treats warn as failure", () => {
    const warnReport = {
      results: [{ storyId: "lab-loginpage--default", status: "warn" }]
    };
    assert.equal(exitCodeForReport(warnReport, { storyId: "lab-loginpage--default" }), 0);
    assert.equal(
      exitCodeForReport(warnReport, { storyId: "lab-loginpage--default", strict: true }),
      1
    );
  });
});
