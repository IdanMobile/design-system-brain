import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve(process.cwd(), "scripts/specs-bootstrap-v2.mjs");
const repoStoriesModule = resolve(process.cwd(), "packages/contract/src/stories.ts");

function makeRepoFixture() {
  const root = mkdtempSync(join(tmpdir(), "specs-boot-v2-"));
  mkdirSync(join(root, "lab-memory/logic/specs"), { recursive: true });
  writeFileSync(
    join(root, "lab-memory/logic/specs/lab-button--primary.spec.json"),
    JSON.stringify({ storyId: "lab-button--primary", events: [{ name: "onPrimaryClicked" }] }) + "\n"
  );
  mkdirSync(join(root, "packages/contract/src"), { recursive: true });
  writeFileSync(
    join(root, "packages/contract/src/stories.ts"),
    readFileSync(repoStoriesModule, "utf8")
  );
  return root;
}

test("archives v1 specs and writes fresh v2 files", () => {
  const root = makeRepoFixture();
  try {
    const res = spawnSync(process.execPath, ["--experimental-strip-types", script], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(res.status, 0, res.stderr);

    const legacy = JSON.parse(
      readFileSync(join(root, "lab-memory/logic/archive/lab-button--primary.spec.json"), "utf8")
    );
    assert.equal(legacy.events[0].name, "onPrimaryClicked");

    const freshFiles = readdirSync(join(root, "lab-memory/logic/specs"))
      .filter((n) => n.endsWith(".spec.json"));
    assert.ok(freshFiles.length >= 1);
    const fresh = JSON.parse(
      readFileSync(join(root, "lab-memory/logic/specs/lab-button--primary.spec.json"), "utf8")
    );
    assert.equal(fresh.schemaVersion, 2);
    assert.equal(fresh.status, "proposed");
    assert.deepEqual(fresh.elements, []);
    assert.equal(fresh.intent, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("is idempotent — second run does not re-archive an already-fresh file", () => {
  const root = makeRepoFixture();
  try {
    spawnSync(process.execPath, ["--experimental-strip-types", script], { cwd: root });
    const legacyBefore = readdirSync(join(root, "lab-memory/logic/archive")).length;
    spawnSync(process.execPath, ["--experimental-strip-types", script], { cwd: root });
    const legacyAfter = readdirSync(join(root, "lab-memory/logic/archive")).length;
    assert.equal(legacyBefore, legacyAfter, "second run should not touch the archive");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
