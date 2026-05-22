#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBatchInvestigationPayload,
  componentFamily,
  formatBatchInvestigationMarkdown
} from "./fix-all-batch-report.mjs";

describe("componentFamily", () => {
  it("groups lab-button variants", () => {
    assert.equal(componentFamily("lab-button--primary"), "lab-button--");
  });
});

describe("buildBatchInvestigationPayload", () => {
  it("detects shared family hints", () => {
    const payload = buildBatchInvestigationPayload(
      [
        {
          storyId: "lab-button--primary",
          status: "fail",
          percent: 0.2,
          maxRegionPercent: 0.5,
          paths: { comparePng: "/a", storybookPng: "/b", figmaPng: "/c" }
        },
        {
          storyId: "lab-button--secondary",
          status: "fail",
          percent: 0.15,
          maxRegionPercent: 0.4,
          paths: { comparePng: "/a2", storybookPng: "/b2", figmaPng: "/c2" }
        }
      ],
      { suiteId: "figma", suiteLabel: "Figma emulator" }
    );
    assert.equal(payload.storyCount, 2);
    assert.ok(payload.hints.some((h) => h.includes("lab-button")));
    const md = formatBatchInvestigationMarkdown(payload);
    assert.ok(md.includes("lab-button--primary"));
    assert.ok(md.includes("shared root cause"));
  });
});
