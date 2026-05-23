import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isStepPassing, loadStoryStepCellsFromDisk, safeStorySegment } from "./step-gate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("step-gate", () => {
  it("safeStorySegment collapses double dashes like pixel-test report paths", () => {
    assert.equal(safeStorySegment("lab-button--secondary"), "lab-button-secondary");
    assert.equal(safeStorySegment("lab-calendarscheduler--compact"), "lab-calendarscheduler-compact");
  });

  it("loadStoryStepCellsFromDisk resolves by-story paths with collapsed segments", () => {
    const cells = loadStoryStepCellsFromDisk(ROOT, "lab-button--secondary", readFileSync, existsSync, join);
    assert.equal(cells.pixel?.status, "pass");
    assert.ok(isStepPassing(cells.pixel?.status));
  });
});
