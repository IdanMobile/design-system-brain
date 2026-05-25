import { test } from "node:test";
import assert from "node:assert/strict";
import { computeElementId, resolveCollisions } from "./element-id.ts";

test("slugifies meaningful text", () => {
  assert.equal(computeElementId({ text: "Sign in", role: "", tag: "button" }), "el-sign-in");
});

test("strips punctuation", () => {
  assert.equal(computeElementId({ text: "Save & Close!", role: "", tag: "button" }), "el-save-close");
});

test("falls back to role when text is empty", () => {
  assert.equal(computeElementId({ text: "", role: "switch", tag: "input" }), "el-switch");
});

test("falls back to tag when both text and role are empty", () => {
  assert.equal(computeElementId({ text: "", role: "", tag: "textarea" }), "el-textarea");
});

test("truncates very long text", () => {
  const long = "a".repeat(80);
  const id = computeElementId({ text: long, role: "", tag: "button" });
  assert.ok(id.length <= 43, `expected slug capped at 40 chars (+ "el-"), got ${id.length}`);
});

test("normalizes unicode", () => {
  assert.equal(computeElementId({ text: "Café Münchner", role: "", tag: "button" }), "el-cafe-munchner");
});

test("resolveCollisions disambiguates duplicates with -2, -3 suffixes", () => {
  const out = resolveCollisions(["el-reset", "el-reset", "el-reset", "el-sign-in"]);
  assert.deepEqual(out, ["el-reset", "el-reset-2", "el-reset-3", "el-sign-in"]);
});

test("resolveCollisions is stable across multiple unique ids", () => {
  const out = resolveCollisions(["el-a", "el-b", "el-c"]);
  assert.deepEqual(out, ["el-a", "el-b", "el-c"]);
});

test("computeElementId is deterministic", () => {
  const a = computeElementId({ text: "Login", role: "button", tag: "button" });
  const b = computeElementId({ text: "Login", role: "button", tag: "button" });
  assert.equal(a, b);
});
