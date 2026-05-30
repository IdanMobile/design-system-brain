import assert from "node:assert/strict";
import { planGoldenPool } from "./test-console-golden-pool.mjs";

const stories = ["a", "b", "c", "d", "e"];

const figmaLive = planGoldenPool("figmaLive", stories, 12);
assert.equal(figmaLive.mode, "figma-live-single-harness");
assert.equal(figmaLive.processCount, 1);
assert.equal(figmaLive.chunks.length, 1);
assert.deepEqual(figmaLive.chunks[0], stories);
assert.equal(figmaLive.inProcessParallel, 12);

const figma = planGoldenPool("figma", stories, 12);
assert.equal(figma.mode, "multi-process");
assert.equal(figma.inProcessParallel, 1);
assert.equal(figma.processCount, figma.chunks.length);
assert.ok(figma.processCount > 1);

console.log("test-console-golden-pool.test.mjs — ok");
