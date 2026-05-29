import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

describe("compareStoryToRef", () => {
  test("returns error status when reference PNG does not exist", async () => {
    const { compareStoryToRef } = await import("../src/compare-story-to-ref.ts");
    const result = await compareStoryToRef(
      "avatar--default",
      "/non/existent/path.png",
      { baseUrl: "http://localhost:6006", outDir: "/tmp/vg-test-missing", tolerance: 0.1 }
    );
    assert.equal(result.status, "error");
    assert.match(result.message ?? "", /reference PNG/i);
  });
});
