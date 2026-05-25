import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFromDescription, type HeuristicInputs } from "./spec-extract-heuristic.ts";

function input(patch: Partial<HeuristicInputs>): HeuristicInputs {
  return {
    displayName: "",
    description: "",
    tag: "button",
    role: "",
    ariaLabel: "",
    text: "",
    ...patch
  };
}

test("empty description yields placeholder", () => {
  const out = extractFromDescription(input({}));
  assert.match(out.behaviour, /please describe/i);
  assert.deepEqual(out.devApi, []);
  assert.equal(out.extractedBy, "heuristic");
});

test("simple click adds on<Name>Clicked", () => {
  const out = extractFromDescription(
    input({ displayName: "Sign In", description: "click to sign in" })
  );
  assert.match(out.behaviour, /^On click/);
  assert.equal(out.devApi[0].name, "onSignInClicked");
  assert.equal(out.devApi[0].signature, "() => void");
});

test("show reveals an object phrase", () => {
  const out = extractFromDescription(
    input({ displayName: "Search Toggle", description: "click to reveal a search input" })
  );
  assert.equal(out.behaviour, "On click: show search input");
  const names = out.devApi.map((a) => a.name);
  assert.ok(names.includes("onSearchToggleClicked"));
  assert.ok(names.includes("onSearchChanged"));
});

test("hover adds enter/leave", () => {
  const out = extractFromDescription(
    input({ displayName: "Chart", description: "on hover show tooltip" })
  );
  const names = out.devApi.map((a) => a.name);
  assert.ok(names.includes("onMouseEnter"));
  assert.ok(names.includes("onMouseLeave"));
});

test("select option adds on<Noun>Selected", () => {
  const out = extractFromDescription(
    input({ displayName: "Country", description: "pick a country option from the list" })
  );
  const sel = out.devApi.find((a) => a.name.startsWith("on"))?.name;
  assert.ok(sel?.endsWith("Selected"), `expected an onXSelected, got ${sel}`);
});

test("submit form adds onSubmit", () => {
  const out = extractFromDescription(
    input({ displayName: "Login", description: "submit the form when clicked" })
  );
  assert.ok(out.devApi.find((a) => a.name === "onSubmit"));
});

test("loading word adds isLoading prop", () => {
  const out = extractFromDescription(
    input({ displayName: "CTA", description: "click and show spinner while loading" })
  );
  assert.ok(out.devApi.find((a) => a.name === "isLoading"));
});

test("type into text input adds on<Field>Changed", () => {
  const out = extractFromDescription(
    input({
      tag: "input",
      displayName: "Email",
      description: "user types their email",
      ariaLabel: "email"
    })
  );
  assert.ok(out.devApi.find((a) => a.name === "onEmailChanged"));
});

test("navigate adds href", () => {
  const out = extractFromDescription(
    input({ displayName: "Docs Link", description: "click to navigate to docs page" })
  );
  assert.ok(out.devApi.find((a) => a.name === "href"));
});

test("fallback when no verbs matched", () => {
  const out = extractFromDescription(
    input({ displayName: "Mystery", description: "just a button" })
  );
  assert.match(out.behaviour, /Click triggers action/i);
  assert.equal(out.devApi[0].name, "onMysteryClicked");
});

test("composition: hover + select", () => {
  const out = extractFromDescription(
    input({
      displayName: "Row",
      description: "on hover and on click select the row item"
    })
  );
  assert.match(out.behaviour, /hover/i);
  assert.match(out.behaviour, /click|selection/i);
  const names = out.devApi.map((a) => a.name);
  assert.ok(names.includes("onMouseEnter"));
  assert.ok(names.some((n) => n.endsWith("Selected")));
});

test("determinism: same inputs produce same behaviour + devApi", () => {
  const a = extractFromDescription(input({ displayName: "Save", description: "click to save" }));
  const b = extractFromDescription(input({ displayName: "Save", description: "click to save" }));
  assert.equal(a.behaviour, b.behaviour);
  assert.deepEqual(a.devApi, b.devApi);
});
