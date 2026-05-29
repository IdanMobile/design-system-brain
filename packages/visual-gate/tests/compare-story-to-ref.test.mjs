import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

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

const CLI_PATH = new URL("../src/cli.ts", import.meta.url).pathname;

function runCli(args) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", CLI_PATH, ...args],
    { encoding: "utf8" }
  );
}

describe("cli arg parsing", () => {
  test("exits 3 and prints error when --storyId is missing", () => {
    const result = runCli([]);
    assert.equal(result.status, 3, `expected exit 3, got ${result.status}\n${result.stderr}`);
    assert.match(result.stderr, /--storyId/);
  });

  test("exits 3 and prints error when --referencePng is missing", () => {
    const result = runCli(["--storyId", "avatar--default"]);
    assert.equal(result.status, 3, `expected exit 3, got ${result.status}\n${result.stderr}`);
    assert.match(result.stderr, /--referencePng/);
  });

  test("exits 3 when --referencePng path does not exist (no browser needed)", () => {
    const result = runCli([
      "--storyId", "avatar--default",
      "--referencePng", "/does/not/exist.png",
    ]);
    assert.equal(result.status, 3, `expected exit 3, got ${result.status}\n${result.stderr}`);
  });

  test("--outputJson writes a JSON file when reference is missing", () => {
    const outFile = join(tmpdir(), `vg-test-${Date.now()}.json`);
    runCli([
      "--storyId", "avatar--default",
      "--referencePng", "/does/not/exist.png",
      "--outputJson", outFile,
    ]);
    const data = JSON.parse(readFileSync(outFile, "utf8"));
    assert.equal(data.storyId, "avatar--default");
    assert.equal(data.status, "error");
  });
});
