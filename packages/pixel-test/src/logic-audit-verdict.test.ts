import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeStoryDecision,
  mergeElementSpec,
  type ObservedElement
} from "./logic-audit-verdict.ts";
import type { ElementSpec, StorySpec } from "../../contract/src/spec-types.ts";

function spec(patch: Partial<StorySpec> = {}): StorySpec {
  return {
    storyId: "x--y",
    schemaVersion: 2,
    intent: "",
    status: "proposed",
    approvedAt: null,
    approvedBy: null,
    specVersion: 1,
    elements: [],
    ...patch
  };
}

function element(id: string, patch: Partial<ElementSpec> = {}): ElementSpec {
  return {
    id,
    selector: `[data-lab-id="${id}"]`,
    displayName: id.replace("el-", ""),
    description: "",
    source: "ai",
    aiSuggestion: "",
    aiExtracted: null,
    status: "proposed",
    approvedAt: null,
    ...patch
  };
}

function observe(labId: string, patch: Partial<ObservedElement> = {}): ObservedElement {
  return {
    labId,
    displayName: labId.replace("el-", ""),
    tag: "button",
    role: "",
    text: labId.replace("el-", ""),
    ...patch
  };
}

test("static + approved → pass", () => {
  const d = computeStoryDecision({
    spec: spec({ status: "approved", approvedAt: "now" }),
    observed: []
  });
  assert.equal(d.storyVerdict, "pass");
});

test("static + proposed → needs-approval", () => {
  const d = computeStoryDecision({ spec: spec(), observed: [] });
  assert.equal(d.storyVerdict, "needs-approval");
});

test("observed approved element → pass", () => {
  const d = computeStoryDecision({
    spec: spec({ elements: [element("el-login", { status: "approved", approvedAt: "now" })] }),
    observed: [observe("el-login", { displayName: "login" })]
  });
  assert.equal(d.storyVerdict, "pass");
  assert.equal(d.perElement[0].verdict, "pass");
});

test("observed proposed element → needs-approval", () => {
  const d = computeStoryDecision({
    spec: spec({ elements: [element("el-login")] }),
    observed: [observe("el-login")]
  });
  assert.equal(d.storyVerdict, "needs-approval");
});

test("observed element not in spec → new-element (rollup worst)", () => {
  const d = computeStoryDecision({
    spec: spec({ elements: [element("el-login", { status: "approved", approvedAt: "now" })] }),
    observed: [observe("el-login", { displayName: "login" }), observe("el-help")]
  });
  assert.equal(d.storyVerdict, "new-element");
  const help = d.perElement.find((e) => e.labId === "el-help");
  assert.equal(help?.verdict, "new-element");
});

test("approved element no longer observed → regression (worst beats new-element)", () => {
  const d = computeStoryDecision({
    spec: spec({
      elements: [
        element("el-login", { status: "approved", approvedAt: "now" }),
        element("el-help", { status: "approved", approvedAt: "now" })
      ]
    }),
    observed: [observe("el-login", { displayName: "login" })]
  });
  assert.equal(d.storyVerdict, "regression");
  const help = d.perElement.find((e) => e.labId === "el-help");
  assert.equal(help?.verdict, "regression");
});

test("displayName drift on an approved element", () => {
  const d = computeStoryDecision({
    spec: spec({
      elements: [element("el-login", { status: "approved", approvedAt: "now", displayName: "login" })]
    }),
    observed: [observe("el-login", { displayName: "sign in" })]
  });
  assert.equal(d.storyVerdict, "drift");
});

test("mixed: one approved-pass + one proposed → needs-approval", () => {
  const d = computeStoryDecision({
    spec: spec({
      elements: [
        element("el-login", { status: "approved", approvedAt: "now" }),
        element("el-reset")
      ]
    }),
    observed: [observe("el-login", { displayName: "login" }), observe("el-reset")]
  });
  assert.equal(d.storyVerdict, "needs-approval");
});

test("mergeElementSpec creates fresh proposed spec when missing", () => {
  const merged = mergeElementSpec({
    existing: undefined,
    observed: observe("el-login"),
    aiSuggestion: "Click to sign in",
    aiExtracted: {
      behaviour: "On click",
      devApi: [{ name: "onLoginClicked", signature: "() => void" }],
      extractedBy: "heuristic",
      extractedAt: "now"
    }
  });
  assert.equal(merged.id, "el-login");
  assert.equal(merged.selector, '[data-lab-id="el-login"]');
  assert.equal(merged.status, "proposed");
  assert.equal(merged.source, "ai");
  assert.equal(merged.aiSuggestion, "Click to sign in");
});

test("mergeElementSpec preserves designer-edited fields", () => {
  const existing = element("el-login", {
    description: "designer wrote this",
    source: "designer",
    status: "approved",
    approvedAt: "earlier"
  });
  const merged = mergeElementSpec({
    existing,
    observed: observe("el-login", { displayName: "Login" }),
    aiSuggestion: "fresh suggestion",
    aiExtracted: null
  });
  assert.equal(merged.description, "designer wrote this");
  assert.equal(merged.source, "designer");
  assert.equal(merged.status, "approved");
  assert.equal(merged.approvedAt, "earlier");
  assert.equal(merged.displayName, "Login");
  assert.equal(merged.aiSuggestion, "fresh suggestion");
});
