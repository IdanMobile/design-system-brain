import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createSpecStore } from "./spec-store.ts";
import type { StorySpec } from "../../contract/src/spec-types.ts";

function tmpVault(): string {
  return mkdtempSync(join(tmpdir(), "spec-store-"));
}

function sampleSpec(id: string, patch: Partial<StorySpec> = {}): StorySpec {
  return {
    storyId: id,
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

test("readSpec returns null for missing story", () => {
  const vault = tmpVault();
  try {
    const store = createSpecStore({ vaultDir: vault });
    assert.equal(store.readSpec("lab-button--primary"), null);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});

test("writeSpec persists and readSpec returns it", () => {
  const vault = tmpVault();
  try {
    const store = createSpecStore({ vaultDir: vault });
    const spec = sampleSpec("lab-button--primary", {
      intent: "Click to submit",
      elements: [
        {
          id: "el-login",
          selector: '[data-lab-id="el-login"]',
          displayName: "Login",
          description: "click to sign in",
          source: "designer",
          aiSuggestion: "",
          aiExtracted: null,
          status: "proposed",
          approvedAt: null
        }
      ]
    });
    store.writeSpec(spec);
    const filePath = resolve(vault, "lab-button--primary.spec.json");
    assert.ok(existsSync(filePath));
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as StorySpec;
    assert.equal(parsed.storyId, "lab-button--primary");
    assert.equal(parsed.schemaVersion, 2);
    assert.equal(parsed.elements[0].id, "el-login");
    assert.deepEqual(store.readSpec("lab-button--primary"), spec);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});

test("writeSpec bumps specVersion when content changes", () => {
  const vault = tmpVault();
  try {
    const store = createSpecStore({ vaultDir: vault });
    const base = sampleSpec("lab-button--primary");
    store.writeSpec(base);
    const updated = { ...base, intent: "real intent" };
    store.writeSpec(updated);
    const after = store.readSpec("lab-button--primary");
    assert.equal(after?.specVersion, 2);
    assert.equal(after?.intent, "real intent");
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});

test("writeSpec keeps specVersion when content unchanged", () => {
  const vault = tmpVault();
  try {
    const store = createSpecStore({ vaultDir: vault });
    const base = sampleSpec("x--y", { specVersion: 5 });
    store.writeSpec(base);
    store.writeSpec({ ...base });
    const after = store.readSpec("x--y");
    assert.equal(after?.specVersion, 5);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});

test("listSpecs returns all .spec.json files in vault", () => {
  const vault = tmpVault();
  try {
    const store = createSpecStore({ vaultDir: vault });
    store.writeSpec(sampleSpec("a--default"));
    store.writeSpec(sampleSpec("b--default"));
    const ids = store.listSpecs().map((s) => s.storyId).sort();
    assert.deepEqual(ids, ["a--default", "b--default"]);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});

test("setStatus mutates status, approvedAt, approvedBy and bumps version", () => {
  const vault = tmpVault();
  try {
    const store = createSpecStore({ vaultDir: vault });
    store.writeSpec(sampleSpec("lab-button--primary"));
    const approved = store.setStatus("lab-button--primary", "approved", "showcase");
    assert.equal(approved?.status, "approved");
    assert.equal(approved?.approvedBy, "showcase");
    assert.ok(approved?.approvedAt && approved.approvedAt.endsWith("Z"));
    assert.equal(approved?.specVersion, 2);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});
