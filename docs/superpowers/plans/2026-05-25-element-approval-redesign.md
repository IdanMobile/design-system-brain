# Element approval redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the developer-shaped spec editor (props/events/behaviours tables) with a designer-shaped flow: click a layer in the rendered preview, write plain English, AI translates into runtime behaviour + developer API.

**Architecture:** New per-story spec shape (`elements[]` instead of `events[]/props[]/behaviours[]`). Heuristic rule engine extracts behaviour + dev-API cards from the description on every blur; an opt-in ✨ button calls OpenAI/Anthropic for polish on complex prose. Click-in-preview selection via a transparent overlay layer in the dev playground. Element IDs are stamped at render time by a shared deterministic hash so audit and showcase reference the same DOM nodes.

**Tech Stack:** TypeScript (strict), React 18, Node 22+ (`--experimental-strip-types`), Vite 5, Playwright (audit), vanilla HTTP server (`scripts/specs-*.mjs`), node:test for unit + integration.

**Source spec:** `docs/superpowers/specs/2026-05-25-element-approval-redesign-design.md`.

**Commit policy:** Each task lists a commit step. The user's workflow rule is "never commit without explicit ask"; the executing agent should ask once at the start of execution whether to commit per-task, batch at phase boundaries, or leave uncommitted for review at the end.

---

## File structure

```
packages/contract/src/
  spec-types.ts                  REWRITE (Task 1.1)

packages/pixel-test/src/
  element-id.ts                  NEW (Task 2.1)
  element-id.test.ts             NEW (Task 2.1)
  spec-extract-heuristic.ts      NEW (Task 2.3)
  spec-extract-heuristic.test.ts NEW (Task 2.3)
  spec-store.ts                  KEEP (schema-agnostic; verify in Task 1.2)
  spec-store.test.ts             MODIFY (Task 1.2) — fixtures use v2 shape
  logic-audit-probes.ts          MODIFY (Task 2.2) — return data-lab-id with each control
  logic-audit.ts                 REWRITE (Tasks 2.4, 2.5)
  spec-event-namer.ts            DELETE (Task 1.4)
  spec-event-namer.test.ts       DELETE (Task 1.4)
  spec-prop-parser.ts            DELETE (Task 1.4)
  spec-prop-parser.test.ts       DELETE (Task 1.4)
  spec-inference.ts              DELETE (Task 1.4)
  spec-inference.test.ts         DELETE (Task 1.4)

packages/ui/src/
  element-ids-runtime.ts         NEW (Task 2.2)
  index.ts                       MODIFY (Tasks 1.5, 2.2)
  behaviour-baseline.ts          DELETE (Task 1.5)

packages/developer-playground/src/
  spec-api.ts                    MODIFY (Task 1.6) — keep listSpecs/fetchSpec/saveSpec for v2 shape
  spec-extract-client.ts         NEW (Task 4.3)
  ElementOverlay.tsx             NEW (Task 3.1)
  ElementPanel.tsx               NEW (Tasks 3.2, 3.3, 4.4)
  Showcase.tsx                   REWRITE (Task 3.4)
  showcase.css                   REWRITE (Task 3.5)
  SpecEditor.tsx                 DELETE (Task 1.6)
  SpecPreview.tsx                DELETE (Task 1.6)

scripts/
  specs-bootstrap-v2.mjs         NEW (Task 1.3)
  specs-bootstrap-v2.test.mjs    NEW (Task 1.3)
  specs-bootstrap.mjs            DELETE (Task 1.4)
  specs-accept-drift.mjs         DELETE (Task 1.4)
  specs-server.mjs               KEEP (schema-agnostic JSON I/O; verify in Task 1.2)
  specs-server.test.mjs          MODIFY (Task 1.2) — fixtures use v2 shape
  specs-llm.mjs                  NEW (Task 4.1)
  specs-llm.test.mjs             NEW (Task 4.1)
  serve-playground.mjs           MODIFY (Task 4.2) — mount /api/specs/extract

package.json                     MODIFY (Tasks 1.3, 1.4, 4.1) — script renames

lab-memory/specs/                CONTENT CHANGES via Task 1.3 (specs-bootstrap-v2)
lab-memory/specs-legacy/         NEW directory, archive of v1 specs

docs/ROADMAP.md                  MODIFY (Task 5.1) — Phase 2.0 section
.env.example                     MODIFY (Task 4.5) — document LAB_LLM_API_KEY
```

---

# Phase 1 — Data model + migration

**Goal:** New spec shape on disk; legacy archived; old UI/runtime/scripts deleted. Audit reads the new shape but verdict is just "has elements / doesn't" (real verdicts land in Phase 2).

---

## Task 1.1: New spec types

**Files:**
- Rewrite: `packages/contract/src/spec-types.ts`

- [ ] **Step 1: Rewrite `spec-types.ts`** with the v2 shape.

```ts
/**
 * Schema v2 — element-shaped specs for the logic approval flow.
 *
 * See `docs/superpowers/specs/2026-05-25-element-approval-redesign-design.md`
 * for the full model. One JSON file per story at
 * `lab-memory/specs/<storyId>.spec.json`.
 */

export type SpecStatus = "proposed" | "approved";
export type ElementSource = "ai" | "designer";

/** TypeScript signature for a single developer prop or event. */
export interface DevApiEntry {
  name: string;
  signature: string;
}

/** Cards rendered next to the designer's description. */
export interface AiExtracted {
  behaviour: string;
  devApi: DevApiEntry[];
  extractedBy: "heuristic" | "llm";
  extractedAt: string;
}

export interface ElementSpec {
  /** Stable hash of `text + role + tag`; tie-breaker suffix when duplicated. */
  id: string;
  selector: string; // always `[data-lab-id="<id>"]`
  displayName: string;
  description: string;
  source: ElementSource;
  aiSuggestion: string;
  aiExtracted: AiExtracted | null;
  status: SpecStatus;
  approvedAt: string | null;
}

export interface StorySpec {
  storyId: string;
  schemaVersion: 2;
  intent: string;
  status: SpecStatus;
  approvedAt: string | null;
  approvedBy: string | null;
  specVersion: number;
  elements: ElementSpec[];
}

export const SPEC_SCHEMA_VERSION = 2 as const;
```

- [ ] **Step 2: Verify TypeScript still compiles where the new types are used (none yet).**

Run: `node --experimental-strip-types -e "import('./packages/contract/src/spec-types.ts').then(m => console.log('ok:', Object.keys(m)))"`
Expected: `ok: [ 'SPEC_SCHEMA_VERSION' ]` (one runtime export; rest are types).

- [ ] **Step 3: Commit.**

```bash
git add packages/contract/src/spec-types.ts
git commit -m "feat(contract): schemaVersion 2 ElementSpec for element-shaped specs"
```

---

## Task 1.2: Spec store + server use v2 fixtures

**Files:**
- Modify: `packages/pixel-test/src/spec-store.test.ts`
- Modify: `scripts/specs-server.test.mjs`

`spec-store.ts` and `specs-server.mjs` are JSON-shape-agnostic. We only need to update their tests to use v2 fixtures so the tests document the new contract.

- [ ] **Step 1: Replace the `sampleSpec` helper in `packages/pixel-test/src/spec-store.test.ts`.**

```ts
import type { StorySpec } from "../../contract/src/spec-types.ts";

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
```

Delete the `diffSpecs` tests (`diffSpecs reports no changes for equal specs`, `diffSpecs detects added and removed props`, `diffSpecs detects changed prop type`) — they reference deleted fields. Drop the import of `diffSpecs` from `./spec-store.ts`.

- [ ] **Step 2: Remove `diffSpecs` from `spec-store.ts`.** It only made sense for v1's props/events/behaviours lists. Delete the function and the `SpecDelta` import.

In `packages/pixel-test/src/spec-store.ts`, delete:

```ts
// remove these two helpers entirely
export function diffSpecs(before: StorySpec, after: StorySpec): SpecDelta { ... }
function diffList<T>(beforeArr: T[], afterArr: T[], delta: SpecDelta, kind: ...): void { ... }
```

Also delete the `SpecDelta` type from `packages/contract/src/spec-types.ts` (it was v1-only; we already rewrote the file in Task 1.1 — confirm it's not there).

- [ ] **Step 3: Replace the `sampleSpec` helper in `scripts/specs-server.test.mjs`.**

```js
function sampleSpec(id) {
  return {
    storyId: id,
    schemaVersion: 2,
    intent: "",
    status: "proposed",
    approvedAt: null,
    approvedBy: null,
    specVersion: 1,
    elements: []
  };
}
```

- [ ] **Step 4: Run both test suites.**

```bash
node --experimental-strip-types --test packages/pixel-test/src/spec-store.test.ts
node --test scripts/specs-server.test.mjs
```

Expected: every remaining test passes. The deleted diff tests are gone; the store/server tests pass with the v2 shape unchanged because they only round-trip JSON.

- [ ] **Step 5: Commit.**

```bash
git add packages/pixel-test/src/spec-store.ts packages/pixel-test/src/spec-store.test.ts scripts/specs-server.test.mjs
git commit -m "refactor(specs): drop diffSpecs, port store + server tests to v2 fixtures"
```

---

## Task 1.3: `specs-bootstrap-v2.mjs` — archive legacy + write fresh

**Files:**
- Create: `scripts/specs-bootstrap-v2.mjs`
- Create: `scripts/specs-bootstrap-v2.test.mjs`
- Modify: `package.json` — replace `specs:bootstrap` script

- [ ] **Step 1: Write the failing test.**

```js
// scripts/specs-bootstrap-v2.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve(process.cwd(), "scripts/specs-bootstrap-v2.mjs");
const repoStoriesModule = resolve(process.cwd(), "packages/contract/src/stories.ts");

function makeRepoFixture() {
  const root = mkdtempSync(join(tmpdir(), "specs-boot-v2-"));
  mkdirSync(join(root, "lab-memory/specs"), { recursive: true });
  // pre-seed one v1-shaped spec to be archived
  writeFileSync(
    join(root, "lab-memory/specs/lab-button--primary.spec.json"),
    JSON.stringify({ storyId: "lab-button--primary", events: [{ name: "onPrimaryClicked" }] }) + "\n"
  );
  // copy the contract module so the script can import it
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

    // legacy archive contains the v1 file unchanged
    const legacy = JSON.parse(
      readFileSync(join(root, "lab-memory/specs-legacy/lab-button--primary.spec.json"), "utf8")
    );
    assert.equal(legacy.events[0].name, "onPrimaryClicked");

    // every DEV_STORY has a fresh v2 spec
    const freshFiles = readdirSync(join(root, "lab-memory/specs"))
      .filter((n) => n.endsWith(".spec.json"));
    assert.ok(freshFiles.length >= 1);
    const fresh = JSON.parse(
      readFileSync(join(root, "lab-memory/specs/lab-button--primary.spec.json"), "utf8")
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
    const legacyBefore = readdirSync(join(root, "lab-memory/specs-legacy")).length;
    spawnSync(process.execPath, ["--experimental-strip-types", script], { cwd: root });
    const legacyAfter = readdirSync(join(root, "lab-memory/specs-legacy")).length;
    assert.equal(legacyBefore, legacyAfter, "second run should not touch the archive");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test and verify it fails.**

```bash
node --test scripts/specs-bootstrap-v2.test.mjs
```

Expected: FAIL — script doesn't exist yet.

- [ ] **Step 3: Implement the script.**

```js
// scripts/specs-bootstrap-v2.mjs
#!/usr/bin/env node
/**
 * Migrate v1 spec files to v2 (elements-shape):
 *   1. Copy every existing lab-memory/specs/<id>.spec.json to lab-memory/specs-legacy/
 *      (only if it doesn't look v2 already — schemaVersion !== 2).
 *   2. Write fresh v2 files for every DEV_STORY with empty elements[] and intent.
 *
 * Idempotent: re-running after migration is a no-op.
 *
 * Run: node --experimental-strip-types scripts/specs-bootstrap-v2.mjs
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(process.cwd());
const vault = resolve(repoRoot, "lab-memory/specs");
const legacy = resolve(repoRoot, "lab-memory/specs-legacy");

mkdirSync(vault, { recursive: true });
mkdirSync(legacy, { recursive: true });

const storiesModule = await import(
  resolve(repoRoot, "packages/contract/src/stories.ts")
);
const DEV_STORIES = storiesModule.DEV_STORIES;

let archived = 0;
let written = 0;
let skipped = 0;

// Step 1: archive any v1-shaped file in the vault.
for (const name of readdirSync(vault)) {
  if (!name.endsWith(".spec.json")) continue;
  const source = resolve(vault, name);
  const parsed = JSON.parse(readFileSync(source, "utf8"));
  if (parsed.schemaVersion === 2) continue; // already v2 — leave alone
  const dest = resolve(legacy, name);
  if (!existsSync(dest)) {
    writeFileSync(dest, readFileSync(source, "utf8"));
    archived += 1;
  }
}

// Step 2: write fresh v2 files for every DEV_STORY.
for (const entry of DEV_STORIES) {
  const target = resolve(vault, `${entry.id}.spec.json`);
  if (existsSync(target)) {
    const parsed = JSON.parse(readFileSync(target, "utf8"));
    if (parsed.schemaVersion === 2) {
      skipped += 1;
      continue;
    }
  }
  const fresh = {
    storyId: entry.id,
    schemaVersion: 2,
    intent: "",
    status: "proposed",
    approvedAt: null,
    approvedBy: null,
    specVersion: 1,
    elements: []
  };
  writeFileSync(target, JSON.stringify(fresh, null, 2) + "\n", "utf8");
  written += 1;
}

console.log(`✓ specs:bootstrap-v2 — archived ${archived}, wrote ${written}, skipped ${skipped}`);
console.log(`  vault: ${vault}`);
console.log(`  legacy: ${legacy}`);
console.log(`  Next: pnpm test:logic:audit:all   (populates elements[] from the DOM)`);
```

- [ ] **Step 4: Update `package.json` scripts.**

In `package.json`, replace the existing bootstrap scripts:

```diff
-    "specs:bootstrap": "node --experimental-strip-types scripts/specs-bootstrap.mjs",
-    "specs:bootstrap:force": "node --experimental-strip-types scripts/specs-bootstrap.mjs --force",
-    "specs:accept-drift": "node scripts/specs-accept-drift.mjs",
+    "specs:bootstrap-v2": "node --experimental-strip-types scripts/specs-bootstrap-v2.mjs",
+    "specs:bootstrap": "node --experimental-strip-types scripts/specs-bootstrap-v2.mjs",
```

(Keep `specs:bootstrap` as an alias so muscle memory still works.)

- [ ] **Step 5: Run the tests and verify they pass.**

```bash
node --test scripts/specs-bootstrap-v2.test.mjs
```

Expected: 2/2 pass.

- [ ] **Step 6: Commit.**

```bash
git add scripts/specs-bootstrap-v2.mjs scripts/specs-bootstrap-v2.test.mjs package.json
git commit -m "feat(specs): specs-bootstrap-v2 archives v1 + writes empty v2 files"
```

---

## Task 1.4: Delete v1-only files

**Files:**
- Delete: `packages/pixel-test/src/spec-event-namer.ts`
- Delete: `packages/pixel-test/src/spec-event-namer.test.ts`
- Delete: `packages/pixel-test/src/spec-prop-parser.ts`
- Delete: `packages/pixel-test/src/spec-prop-parser.test.ts`
- Delete: `packages/pixel-test/src/spec-inference.ts`
- Delete: `packages/pixel-test/src/spec-inference.test.ts`
- Delete: `scripts/specs-bootstrap.mjs`
- Delete: `scripts/specs-accept-drift.mjs`
- Modify: `packages/pixel-test/package.json` — update `test:specs` script
- Modify: `package.json` — drop `specs:accept-drift`, update `test:specs`

- [ ] **Step 1: Delete the six v1 source/test files.**

```bash
rm packages/pixel-test/src/spec-event-namer.ts
rm packages/pixel-test/src/spec-event-namer.test.ts
rm packages/pixel-test/src/spec-prop-parser.ts
rm packages/pixel-test/src/spec-prop-parser.test.ts
rm packages/pixel-test/src/spec-inference.ts
rm packages/pixel-test/src/spec-inference.test.ts
rm scripts/specs-bootstrap.mjs
rm scripts/specs-accept-drift.mjs
```

- [ ] **Step 2: Update `packages/pixel-test/package.json` `test:specs` to drop the deleted files.**

```diff
-    "test:specs": "node --experimental-strip-types --test src/spec-store.test.ts src/spec-event-namer.test.ts src/spec-prop-parser.test.ts src/spec-inference.test.ts"
+    "test:specs": "node --experimental-strip-types --test src/spec-store.test.ts"
```

(The new `spec-extract-heuristic.test.ts` gets added to this list in Task 2.3.)

- [ ] **Step 3: Drop the `specs:accept-drift` script from root `package.json`.**

```diff
-    "specs:accept-drift": "node scripts/specs-accept-drift.mjs",
```

- [ ] **Step 4: Verify nothing in `packages/` still imports the deleted modules.**

```bash
rg "spec-event-namer|spec-prop-parser|spec-inference|specs-bootstrap\.mjs|specs-accept-drift" packages/ scripts/
```

Expected: zero matches.

- [ ] **Step 5: Run the remaining spec tests.**

```bash
pnpm test:specs
pnpm test:specs:server
```

Expected: both pass.

- [ ] **Step 6: Commit.**

```bash
git add -A
git commit -m "chore(specs): remove v1 inference engine, bootstrap, and accept-drift scripts"
```

---

## Task 1.5: Delete `behaviour-baseline.ts`

**Files:**
- Delete: `packages/ui/src/behaviour-baseline.ts`
- Modify: `packages/ui/src/index.ts` — drop side-effect import and re-exports

The v1 baseline auto-wired generic `aria-pressed` toggle. The redesign asserts: the designer's text is the source of truth; baseline auto-wiring would mask un-described behaviour. Remove it.

- [ ] **Step 1: Delete the file.**

```bash
rm packages/ui/src/behaviour-baseline.ts
```

- [ ] **Step 2: Remove the side-effect import and re-exports from `packages/ui/src/index.ts`.**

```diff
-// Side-effect import: installs the design-system behaviour baseline on the
-// host page. See `behaviour-baseline.ts` for the contract.
-import "./behaviour-baseline";
-export { installBaselineBehaviours, BEHAVIOUR_BASELINE_ATTRS } from "./behaviour-baseline";
 export { AnalyticsCharts } from "./components/AnalyticsCharts";
```

- [ ] **Step 3: Verify nothing else imports the deleted module.**

```bash
rg "behaviour-baseline|installBaselineBehaviours|BEHAVIOUR_BASELINE_ATTRS|data-pressed-source|data-pressed-managed" packages/ scripts/
```

Expected: zero matches.

- [ ] **Step 4: Rebuild downstream packages to verify nothing breaks.**

```bash
pnpm storybook:build
pnpm playground:build
```

Expected: both succeed. The Showcase will produce warnings (`SpecEditor` references stale types) — that's fine; Task 1.6 fixes it.

- [ ] **Step 5: Commit.**

```bash
git add -A
git commit -m "feat(ui): drop behaviour-baseline runtime; designer text is the source of truth"
```

---

## Task 1.6: Stub `SpecEditor` so the playground builds; delete `SpecPreview`

The new Showcase (Task 3.4) hasn't been written yet, but the existing one imports `SpecEditor` and the editor imports types that no longer exist. To unblock Phase 1, replace `SpecEditor` with a stub that renders nothing useful but compiles. `SpecPreview` can be deleted now — it was used only by `SpecEditor`.

**Files:**
- Modify: `packages/developer-playground/src/SpecEditor.tsx` — stub it
- Delete: `packages/developer-playground/src/SpecPreview.tsx`
- Modify: `packages/developer-playground/src/spec-api.ts` — drop v1-only helpers

- [ ] **Step 1: Delete `SpecPreview.tsx`.**

```bash
rm packages/developer-playground/src/SpecPreview.tsx
```

- [ ] **Step 2: Replace `SpecEditor.tsx` content with a stub.**

```tsx
// packages/developer-playground/src/SpecEditor.tsx
//
// TEMPORARY STUB — replaced by ElementPanel.tsx in Phase 3.
// During Phase 1+2 the showcase renders this stub on the right side of each
// story card so the build still compiles while the v2 audit + heuristic work
// land first. Tracked in docs/superpowers/plans/2026-05-25-element-approval-redesign.md.

import React from "react";

export function SpecEditor({ storyId }: { storyId: string }) {
  return (
    <aside className="spec-editor spec-editor--stub">
      <p>
        Approval flow is being rebuilt around per-element selection.
        <br />
        See <code>docs/superpowers/specs/2026-05-25-element-approval-redesign-design.md</code>
        <br />
        Story: <code>{storyId}</code>
      </p>
    </aside>
  );
}
```

- [ ] **Step 3: Rewrite `spec-api.ts` to only expose what survives v2.**

```ts
// packages/developer-playground/src/spec-api.ts
import type { StorySpec } from "../../contract/src/spec-types.ts";

const ROOT = "/api/specs";

export async function listSpecs(): Promise<StorySpec[]> {
  const res = await fetch(ROOT, { cache: "no-store" });
  if (!res.ok) throw new Error(`listSpecs failed: ${res.status}`);
  const body = (await res.json()) as { specs: StorySpec[] };
  return body.specs;
}

export async function fetchSpec(storyId: string): Promise<StorySpec | null> {
  const res = await fetch(`${ROOT}/${encodeURIComponent(storyId)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetchSpec ${storyId} failed: ${res.status}`);
  return (await res.json()) as StorySpec;
}

export async function saveSpec(spec: StorySpec): Promise<StorySpec> {
  const res = await fetch(`${ROOT}/${encodeURIComponent(spec.storyId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spec)
  });
  if (!res.ok) {
    let detail = "";
    try { detail = JSON.stringify(await res.json()); } catch { /* ignore */ }
    throw new Error(`saveSpec ${spec.storyId} failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as StorySpec;
}
```

(The `approveSpec` helper is removed; per-element approval lives in `ElementPanel` in Phase 3 and uses `saveSpec` directly with a mutated `status` field.)

- [ ] **Step 4: Build the playground.**

```bash
pnpm playground:build
```

Expected: success. The stub renders text instead of the editor; visual delivery tests are unaffected because they hit `?story=` (single-story view, no showcase).

- [ ] **Step 5: Run delivery tests on golden to confirm no regression.**

```bash
pnpm test:delivery:golden
```

Expected: 3 PASS.

- [ ] **Step 6: Commit.**

```bash
git add -A
git commit -m "refactor(playground): stub SpecEditor and trim spec-api during element-approval rebuild"
```

---

## Task 1.7: Audit reads v2 with a stub verdict

The audit must not crash on the new shape. Until Phase 2 lands real verdicts, return `pass` if the story has any elements, else `needs-approval`.

**Files:**
- Modify: `packages/pixel-test/src/logic-audit.ts`

- [ ] **Step 1: Replace the `computeVerdict` function** in `logic-audit.ts` with this temporary stub. Find the block that begins `function computeVerdict({ spec, observedEvents }: VerdictInputs)` and replace its body:

```ts
function computeVerdict({ spec }: { spec: StorySpec | null }): VerdictDecision {
  if (!spec) {
    return { verdict: "needs-spec", reason: "no spec on disk — run `pnpm specs:bootstrap-v2`", missingEvents: [], extraEvents: [] };
  }
  if (spec.elements.length === 0 && spec.status === "approved") {
    return { verdict: "pass", reason: "approved as static (no interactive elements)", missingEvents: [], extraEvents: [] };
  }
  if (spec.elements.length === 0) {
    return { verdict: "needs-approval", reason: "no elements populated yet — first audit will discover them", missingEvents: [], extraEvents: [] };
  }
  const allApproved = spec.elements.every((e) => e.status === "approved");
  if (allApproved) {
    return { verdict: "pass", reason: `${spec.elements.length}/${spec.elements.length} elements approved`, missingEvents: [], extraEvents: [] };
  }
  const approved = spec.elements.filter((e) => e.status === "approved").length;
  return {
    verdict: "needs-approval",
    reason: `${approved}/${spec.elements.length} elements approved`,
    missingEvents: [],
    extraEvents: []
  };
}
```

Update the call site `const decision = computeVerdict({ spec, observedEvents });` to `const decision = computeVerdict({ spec });`. Delete the now-unused `observedEvents` variable and the `observedEventsFromControls` function — they were v1 event-name-set comparison.

Remove the import `import { nameEventFromDom } from "./spec-event-namer.ts";` (file is deleted).

- [ ] **Step 2: Run the audit on the golden smoke set.**

Prerequisite: run `pnpm specs:bootstrap-v2` once so the vault has v2 specs.

```bash
pnpm specs:bootstrap-v2
pnpm playground:serve > /tmp/play.log 2>&1 &
sleep 2
pnpm test:logic:audit
```

Expected: 3 stories, each `needs-approval` (no elements populated yet — that's correct for this phase). Audit exits 0 because nothing is a regression.

```bash
lsof -ti :6108 | xargs kill 2>/dev/null
```

- [ ] **Step 3: Commit.**

```bash
git add packages/pixel-test/src/logic-audit.ts
git commit -m "feat(audit): read v2 specs with stub verdict (real per-element logic in phase 2)"
```

---

# Phase 2 — Heuristic engine + per-element verdicts

**Goal:** Audit discovers elements + stamps stable IDs + heuristic-extracts behaviour/devApi cards. Per-element + story rollup verdicts land. CI signal is real before any new UI lands.

---

## Task 2.1: Shared element-ID hash

**Files:**
- Create: `packages/pixel-test/src/element-id.ts`
- Create: `packages/pixel-test/src/element-id.test.ts`

Pure function shared by the audit (which stamps IDs via Playwright) and the playground runtime (Task 2.2, which stamps IDs at React mount).

- [ ] **Step 1: Write the failing test.**

```ts
// packages/pixel-test/src/element-id.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeElementId, resolveCollisions } from "./element-id.ts";

test("same text+role+tag yields the same id", () => {
  const a = computeElementId({ text: "Login", role: "", tag: "button" });
  const b = computeElementId({ text: "Login", role: "", tag: "button" });
  assert.equal(a, b);
  assert.match(a, /^el-/);
});

test("different text yields different id", () => {
  const a = computeElementId({ text: "Login", role: "", tag: "button" });
  const b = computeElementId({ text: "Logout", role: "", tag: "button" });
  assert.notEqual(a, b);
});

test("id is human-readable when text is meaningful", () => {
  const id = computeElementId({ text: "Continue with Google", role: "", tag: "button" });
  assert.ok(id.includes("continue") || id.includes("google"), `expected hint in ${id}`);
});

test("resolveCollisions adds numeric suffix to duplicates", () => {
  const inputs = [
    { text: "Reset", role: "", tag: "button" },
    { text: "Reset", role: "", tag: "button" },
    { text: "Reset", role: "", tag: "button" }
  ];
  const ids = resolveCollisions(inputs.map((i) => computeElementId(i)));
  assert.equal(ids[0], "el-reset");
  assert.equal(ids[1], "el-reset-2");
  assert.equal(ids[2], "el-reset-3");
});

test("empty text uses role/tag fallback", () => {
  const id = computeElementId({ text: "", role: "tab", tag: "div" });
  assert.match(id, /^el-tab/);
});
```

- [ ] **Step 2: Run the test and verify it fails.**

```bash
node --experimental-strip-types --test packages/pixel-test/src/element-id.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `element-id.ts`.**

```ts
// packages/pixel-test/src/element-id.ts
/**
 * Stable per-element ID derivation.
 *
 * Hash is built from `text + role + tag` (NOT DOM index) so element re-ordering
 * within a story doesn't break the link. When two elements within the same story
 * collide (e.g. three "Reset" buttons), the caller passes the full list to
 * `resolveCollisions` to disambiguate with `-2`, `-3` suffixes.
 *
 * The ID format `el-<slug>` is intentionally human-readable so designers
 * looking at lab-memory/specs/*.spec.json can grep their way around.
 */

export interface ElementIdInputs {
  text: string;
  role: string;
  tag: string;
}

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

export function computeElementId({ text, role, tag }: ElementIdInputs): string {
  const meaningful = (text || "").trim();
  const slug = meaningful ? slugify(meaningful) : slugify(role || tag || "element");
  return `el-${slug || "element"}`;
}

/**
 * Walk an ordered list of raw IDs and disambiguate duplicates with numeric
 * suffixes. Stable: first occurrence keeps its bare ID, second becomes `-2`, etc.
 */
export function resolveCollisions(rawIds: string[]): string[] {
  const counts = new Map<string, number>();
  const out: string[] = [];
  for (const id of rawIds) {
    const seen = counts.get(id) ?? 0;
    counts.set(id, seen + 1);
    out.push(seen === 0 ? id : `${id}-${seen + 1}`);
  }
  return out;
}
```

- [ ] **Step 4: Run the tests and verify they pass.**

```bash
node --experimental-strip-types --test packages/pixel-test/src/element-id.test.ts
```

Expected: 5/5 pass.

- [ ] **Step 5: Commit.**

```bash
git add packages/pixel-test/src/element-id.ts packages/pixel-test/src/element-id.test.ts
git commit -m "feat(audit): stable element-id hash shared by audit and playground"
```

---

## Task 2.2: `element-ids-runtime.ts` stamps `data-lab-id` in the browser

**Files:**
- Create: `packages/ui/src/element-ids-runtime.ts`
- Modify: `packages/ui/src/index.ts` — side-effect import the runtime

The playground needs `data-lab-id` attributes in the rendered DOM so the click-in-preview overlay (Phase 3) and the audit probe both reference the same nodes. A small runtime in `@lab/ui` walks `[data-figma-component]` subtrees on mount + on mutation.

- [ ] **Step 1: Implement the runtime.**

```ts
// packages/ui/src/element-ids-runtime.ts
/**
 * Walks every `[data-figma-component]` subtree on the host page and stamps a
 * `data-lab-id="el-<slug>"` attribute on every interactive descendant. Uses the
 * same `computeElementId` + `resolveCollisions` rules the audit uses, so the
 * IDs are byte-identical regardless of which side discovered them.
 *
 * Runs:
 *   - once after the first DOMContentLoaded
 *   - on every MutationObserver tick (debounced to next microtask) so re-renders
 *     re-stamp consistently
 *
 * NO-OP outside the browser.
 */

const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "summary",
  '[role="button"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="menuitem"]',
  '[role="option"]',
  "[tabindex]:not([tabindex=\"-1\"])"
].join(",");

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

function elementText(el: Element): string {
  return (el.textContent ?? "").trim();
}

function elementRole(el: Element): string {
  return el.getAttribute("role") ?? "";
}

function computeRawId(el: Element): string {
  const meaningful = elementText(el);
  const slug = meaningful
    ? slugify(meaningful)
    : slugify(elementRole(el) || el.tagName.toLowerCase() || "element");
  return `el-${slug || "element"}`;
}

function stampSubtree(root: Element): void {
  const controls = Array.from(root.querySelectorAll<Element>(INTERACTIVE_SELECTOR));
  // Compute raw IDs, then resolve collisions within this subtree only.
  const raws = controls.map((c) => computeRawId(c));
  const counts = new Map<string, number>();
  const finalIds: string[] = [];
  for (const raw of raws) {
    const seen = counts.get(raw) ?? 0;
    counts.set(raw, seen + 1);
    finalIds.push(seen === 0 ? raw : `${raw}-${seen + 1}`);
  }
  for (let i = 0; i < controls.length; i += 1) {
    const el = controls[i];
    const id = finalIds[i];
    if (el.getAttribute("data-lab-id") !== id) {
      el.setAttribute("data-lab-id", id);
    }
  }
}

function stampAllRoots(): void {
  if (typeof document === "undefined") return;
  const roots = document.querySelectorAll<Element>("[data-figma-component]");
  for (const root of Array.from(roots)) stampSubtree(root);
}

let pending = false;
function scheduleStamp(): void {
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    stampAllRoots();
  });
}

export function installElementIds(): void {
  if (typeof document === "undefined") return;
  stampAllRoots();
  const observer = new MutationObserver(() => scheduleStamp());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["role", "tabindex", "href"]
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => installElementIds(), { once: true });
  } else {
    installElementIds();
  }
}
```

- [ ] **Step 2: Re-add a single side-effect import in `packages/ui/src/index.ts`.**

```diff
+// Side-effect import: stamps `data-lab-id` on every interactive descendant
+// of `[data-figma-component]`. See `element-ids-runtime.ts`.
+import "./element-ids-runtime";
+export { installElementIds } from "./element-ids-runtime";
 export { AnalyticsCharts } from "./components/AnalyticsCharts";
```

- [ ] **Step 3: Build the playground + smoke the runtime.**

```bash
pnpm playground:build
lsof -ti :6108 | xargs kill 2>/dev/null
node scripts/serve-playground.mjs > /tmp/play.log 2>&1 &
sleep 1.5
curl -s "http://127.0.0.1:6108/?story=lab-loginpage--default" -o /tmp/login-html.html
grep -c "data-lab-id" /tmp/login-html.html
```

The HTML is the empty shell (React mounts client-side), so `data-lab-id` won't appear in the static HTML. We verify the runtime via a quick Playwright probe instead:

```bash
node --experimental-strip-types -e "
import('playwright').then(async ({ chromium }) => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:6108/?story=lab-loginpage--default', { waitUntil: 'networkidle' });
  const ids = await page.evaluate(() => [...document.querySelectorAll('[data-lab-id]')].map(e => e.getAttribute('data-lab-id')));
  console.log('stamped ids:', ids);
  await browser.close();
});
"
```

Expected: an array containing entries like `el-email`, `el-password`, `el-login`, `el-continue-with-google`, etc.

```bash
lsof -ti :6108 | xargs kill 2>/dev/null
```

- [ ] **Step 4: Commit.**

```bash
git add packages/ui/src/element-ids-runtime.ts packages/ui/src/index.ts
git commit -m "feat(ui): stamp data-lab-id on interactive elements via MutationObserver"
```

---

## Task 2.3: Heuristic extraction engine

**Files:**
- Create: `packages/pixel-test/src/spec-extract-heuristic.ts`
- Create: `packages/pixel-test/src/spec-extract-heuristic.test.ts`
- Modify: `packages/pixel-test/package.json` — add the new test file to `test:specs`

- [ ] **Step 1: Write the failing test.**

```ts
// packages/pixel-test/src/spec-extract-heuristic.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFromDescription, type HeuristicInputs } from "./spec-extract-heuristic.ts";

function inputs(overrides: Partial<HeuristicInputs>): HeuristicInputs {
  return {
    displayName: "Login button",
    description: "",
    tag: "button",
    role: "",
    ariaLabel: "",
    text: "Login",
    ...overrides
  };
}

test("click verb composes with object: click to reveal input", () => {
  const out = extractFromDescription(inputs({
    displayName: "Search button",
    text: "",
    description: "click to reveal a search input"
  }));
  assert.match(out.behaviour, /click/i);
  assert.match(out.behaviour, /reveal/i);
  assert.match(out.behaviour, /search input/i);
  const apiNames = out.devApi.map((d) => d.name);
  assert.ok(apiNames.includes("onSearchButtonClicked"), apiNames.join(","));
  assert.ok(apiNames.some((n) => /SearchTextChanged|InputChanged|ValueChanged/i.test(n)));
});

test("hover + chart produces hover behaviour + mouse-enter/leave api", () => {
  const out = extractFromDescription(inputs({
    displayName: "Revenue chart",
    text: "",
    description: "once the user hovers this chart he should see the position values"
  }));
  assert.match(out.behaviour, /hover/i);
  const apiNames = out.devApi.map((d) => d.name);
  assert.ok(apiNames.includes("onMouseEnter"));
  assert.ok(apiNames.includes("onMouseLeave"));
});

test("typing into email input infers onEmailChanged", () => {
  const out = extractFromDescription(inputs({
    displayName: "Email field",
    tag: "input",
    text: "",
    ariaLabel: "Email",
    description: "user types their email address"
  }));
  const apiNames = out.devApi.map((d) => d.name);
  assert.ok(apiNames.some((n) => /onEmailChanged/i.test(n)), apiNames.join(","));
});

test("single-word 'button' gets low-confidence click handler", () => {
  const out = extractFromDescription(inputs({
    displayName: "Login button",
    description: "button"
  }));
  assert.match(out.behaviour, /click/i);
  const apiNames = out.devApi.map((d) => d.name);
  assert.ok(apiNames.includes("onLoginButtonClicked"));
});

test("empty description returns 'please describe' behaviour and empty api", () => {
  const out = extractFromDescription(inputs({ description: "" }));
  assert.match(out.behaviour, /describe/i);
  assert.deepEqual(out.devApi, []);
});

test("submit + form yields onSubmit returning a promise", () => {
  const out = extractFromDescription(inputs({
    displayName: "Submit button",
    description: "submit the form and show a loading spinner"
  }));
  const submit = out.devApi.find((d) => d.name === "onSubmit");
  assert.ok(submit, "expected onSubmit");
  assert.match(submit!.signature, /Promise<void>/);
  assert.ok(out.devApi.some((d) => d.name === "isLoading"));
});

test("navigate adds href to the API", () => {
  const out = extractFromDescription(inputs({
    displayName: "Pricing link",
    tag: "a",
    text: "Pricing",
    description: "navigate to the pricing page"
  }));
  const names = out.devApi.map((d) => d.name);
  assert.ok(names.includes("href"));
  assert.match(out.behaviour, /navigate/i);
});

test("deterministic: same input yields identical output", () => {
  const a = extractFromDescription(inputs({ description: "click to do something" }));
  const b = extractFromDescription(inputs({ description: "click to do something" }));
  assert.deepEqual(a, b);
});
```

- [ ] **Step 2: Run the test and verify it fails.**

```bash
node --experimental-strip-types --test packages/pixel-test/src/spec-extract-heuristic.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the heuristic engine.**

```ts
// packages/pixel-test/src/spec-extract-heuristic.ts
/**
 * Local heuristic extractor. Pure function, no I/O.
 *
 * Rules are checked in declared order; each rule independently appends to
 * behaviour fragments and/or devApi entries. Results are joined into a single
 * sentence at the end.
 *
 * Determinism guarantee: for the same `(description, displayName, tag, role)`
 * the function returns byte-identical output (used by the audit to cache and
 * compare `aiExtracted` between runs).
 */

import type { AiExtracted, DevApiEntry } from "../../contract/src/spec-types.ts";

export interface HeuristicInputs {
  displayName: string;
  description: string;
  tag: string;
  role: string;
  ariaLabel: string;
  text: string;
}

function pascalize(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

const TEXT_INPUT_TYPES = new Set(["text", "email", "password", "search", "tel", "url", "number"]);

function isTextInput(inputs: HeuristicInputs): boolean {
  if (inputs.tag === "textarea") return true;
  if (inputs.tag !== "input") return false;
  // tag-only is fine for the heuristic; we assume text-like unless explicit role says otherwise
  return true;
}

/** Pull the noun phrase after a verb (e.g. "reveal a search input" → "search input"). */
function nounAfter(desc: string, verbs: string[]): string {
  const lower = desc.toLowerCase();
  for (const v of verbs) {
    const idx = lower.indexOf(v);
    if (idx === -1) continue;
    const tail = desc.slice(idx + v.length).trim();
    // strip leading articles + take up to the next punctuation/conjunction
    const cleaned = tail.replace(/^(a|an|the)\s+/i, "");
    const cut = cleaned.split(/[,.;]| and | then | so /i)[0].trim();
    if (cut) return cut;
  }
  return "";
}

function fieldNoun(inputs: HeuristicInputs): string {
  const candidate = inputs.ariaLabel || inputs.displayName || inputs.text || inputs.tag;
  // strip trailing "field", "input", etc.
  return candidate.replace(/\b(field|input|textarea|button)\b/gi, "").trim() || "Value";
}

interface ExtractAcc {
  verbs: string[];
  objects: string[];
  api: DevApiEntry[];
  apiByName: Set<string>;
}

function addApi(acc: ExtractAcc, entry: DevApiEntry): void {
  if (acc.apiByName.has(entry.name)) return;
  acc.apiByName.add(entry.name);
  acc.api.push(entry);
}

export function extractFromDescription(inputs: HeuristicInputs): AiExtracted {
  const desc = (inputs.description || "").trim();
  const display = pascalize(inputs.displayName || inputs.text || inputs.role || inputs.tag || "Element");
  const acc: ExtractAcc = { verbs: [], objects: [], api: [], apiByName: new Set() };

  if (!desc) {
    return {
      behaviour: "Clicking does something — please describe what it should do.",
      devApi: [],
      extractedBy: "heuristic",
      extractedAt: new Date().toISOString()
    };
  }

  const lower = desc.toLowerCase();

  // ── click / tap / press
  if (/\b(click|tap|press)\b/.test(lower)) {
    acc.verbs.push("On click");
    addApi(acc, { name: `on${display}Clicked`, signature: "() => void" });
  }

  // ── hover
  if (/\b(hover|mouse over|mouseover)\b/.test(lower)) {
    acc.verbs.push("On hover");
    addApi(acc, { name: "onMouseEnter", signature: "() => void" });
    addApi(acc, { name: "onMouseLeave", signature: "() => void" });
  }

  // ── select / pick + option / item
  if (/\b(select|pick|choose)\b/.test(lower) && /\b(option|item|value|row)\b/.test(lower)) {
    acc.verbs.push("On selection");
    const noun = pascalize(nounAfter(desc, ["select", "pick", "choose"]) || "Item");
    addApi(acc, { name: `on${noun || "Item"}Selected`, signature: "(id: string) => void" });
  }

  // ── submit / send form
  if (/\b(submit|send)\b/.test(lower) && /\bform\b/.test(lower)) {
    acc.verbs.push("On submit");
    addApi(acc, { name: "onSubmit", signature: "() => Promise<void>" });
  }

  // ── loading / spinner / wait
  if (/\b(loading|spinner|wait)\b/.test(lower)) {
    addApi(acc, { name: "isLoading", signature: "boolean" });
  }

  // ── type / enter + text input
  if (/\b(type|types|enter|input)\b/.test(lower) && isTextInput(inputs)) {
    acc.verbs.push("On type");
    const field = pascalize(fieldNoun(inputs));
    addApi(acc, { name: `on${field}Changed`, signature: "(value: string) => void" });
  }

  // ── show / reveal / open + object
  if (/\b(show|reveal|open|display)\b/.test(lower)) {
    const noun = nounAfter(desc, ["show", "reveal", "open", "display"]);
    if (noun) acc.objects.push(`show ${noun}`);
    // If a "search input" is mentioned, also add an on<Name>Changed event.
    const nounLower = noun.toLowerCase();
    if (/\b(input|search|field|textbox)\b/.test(nounLower)) {
      const fieldName = pascalize(noun.replace(/\b(input|field|textbox)\b/gi, "").trim() || "Value");
      addApi(acc, { name: `on${fieldName}Changed`, signature: "(value: string) => void" });
    }
  }

  // ── navigate / go to / route
  if (/\b(navigate|go to|route)\b/.test(lower)) {
    const dest = nounAfter(desc, ["navigate to", "go to", "route to", "navigate", "go", "route"]);
    acc.objects.push(dest ? `navigate to ${dest}` : "navigate");
    addApi(acc, { name: "href", signature: "string" });
  }

  // ── single-word / fallback
  if (acc.verbs.length === 0 && acc.objects.length === 0) {
    acc.verbs.push("Click triggers action");
    addApi(acc, { name: `on${display}Clicked`, signature: "() => void" });
  }

  const verbStr = acc.verbs.join(" + ");
  const objStr = acc.objects.length ? acc.objects.join(", ") : "";
  const behaviour = objStr ? `${verbStr}: ${objStr}` : verbStr;

  return {
    behaviour,
    devApi: acc.api,
    extractedBy: "heuristic",
    extractedAt: new Date().toISOString()
  };
}
```

- [ ] **Step 4: Run the tests and verify they pass.**

```bash
node --experimental-strip-types --test packages/pixel-test/src/spec-extract-heuristic.test.ts
```

Expected: 8/8 pass.

- [ ] **Step 5: Add the new test to `test:specs`.**

In `packages/pixel-test/package.json`:

```diff
-    "test:specs": "node --experimental-strip-types --test src/spec-store.test.ts"
+    "test:specs": "node --experimental-strip-types --test src/spec-store.test.ts src/element-id.test.ts src/spec-extract-heuristic.test.ts"
```

- [ ] **Step 6: Run the bundle.**

```bash
pnpm test:specs
```

Expected: all tests pass (~16 total: store + element-id + heuristic).

- [ ] **Step 7: Commit.**

```bash
git add -A
git commit -m "feat(audit): heuristic engine maps designer text to behaviour + dev api"
```

---

## Task 2.4: Per-element audit verdicts (probe + populate + classify)

**Files:**
- Modify: `packages/pixel-test/src/logic-audit-probes.ts` — include `data-lab-id` in `ControlProbe`
- Modify: `packages/pixel-test/src/logic-audit.ts` — element-level loop

This is the heart of Phase 2. The audit needs to:
1. Probe the DOM, get each control with its stamped `data-lab-id`.
2. Read the spec; for each observed control, find/create the matching `elements[]` entry.
3. Run the heuristic to fill `aiSuggestion` and `aiExtracted` on `ai`-source entries that have no `description` yet.
4. Compute per-element verdict + story rollup.
5. Persist the updated spec back to disk (the audit writes specs now, not just reads them — it's the discovery mechanism).

- [ ] **Step 1: Extend `ControlProbe` in `logic-audit-probes.ts` to carry the `data-lab-id`.**

In `packages/pixel-test/src/logic-audit-probes.ts`, add `labId` to the `ControlProbe` interface (around line 6-18):

```ts
export interface ControlProbe {
  index: number;
  tag: string;
  role: string;
  text: string;
  ariaLabel: string;
  type: string;
  readOnly: boolean;
  disabled: boolean;
  opensMenu?: boolean;
  labId: string;
}
```

Then in the `probeScript` function (around line 127, the `controls.push({...})` block), add `labId`:

```ts
    controls.push({
      index: i,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") ?? "",
      text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
      ariaLabel: el.getAttribute("aria-label") ?? "",
      type: el.getAttribute("type") ?? "",
      readOnly,
      disabled,
      opensMenu: menuTrigger(el),
      labId: el.getAttribute("data-lab-id") ?? ""
    });
```

- [ ] **Step 2: Write the failing per-element verdict test.**

Create `packages/pixel-test/src/logic-audit-verdict.test.ts` (new file):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStoryVerdict, type ObservedElement } from "./logic-audit.ts";
import type { StorySpec } from "../../contract/src/spec-types.ts";

function makeSpec(elements: StorySpec["elements"]): StorySpec {
  return {
    storyId: "x",
    schemaVersion: 2,
    intent: "",
    status: "proposed",
    approvedAt: null,
    approvedBy: null,
    specVersion: 1,
    elements
  };
}

function makeObserved(labId: string, displayName = labId): ObservedElement {
  return { labId, displayName, tag: "button", role: "", text: displayName, ariaLabel: "" };
}

test("approved + present → pass", () => {
  const spec = makeSpec([
    {
      id: "el-login", selector: "[data-lab-id=\"el-login\"]", displayName: "Login",
      description: "click to login", source: "designer",
      aiSuggestion: "", aiExtracted: null, status: "approved", approvedAt: "2026-01-01T00:00:00Z"
    }
  ]);
  const decision = computeStoryVerdict(spec, [makeObserved("el-login", "Login")]);
  assert.equal(decision.verdict, "pass");
  assert.equal(decision.perElement[0].verdict, "pass");
});

test("approved + missing from DOM → regression", () => {
  const spec = makeSpec([
    {
      id: "el-login", selector: "[data-lab-id=\"el-login\"]", displayName: "Login",
      description: "click to login", source: "designer",
      aiSuggestion: "", aiExtracted: null, status: "approved", approvedAt: "2026-01-01T00:00:00Z"
    }
  ]);
  const decision = computeStoryVerdict(spec, []);
  assert.equal(decision.verdict, "regression");
});

test("new element observed → adds proposed entry, story is needs-approval", () => {
  const spec = makeSpec([]);
  const decision = computeStoryVerdict(spec, [makeObserved("el-login", "Login")]);
  assert.equal(decision.verdict, "needs-approval");
  assert.equal(decision.updatedSpec.elements.length, 1);
  assert.equal(decision.updatedSpec.elements[0].id, "el-login");
  assert.equal(decision.updatedSpec.elements[0].source, "ai");
});

test("empty elements + story approved → pass (static)", () => {
  const spec = makeSpec([]);
  spec.status = "approved";
  const decision = computeStoryVerdict(spec, []);
  assert.equal(decision.verdict, "pass");
});

test("rollup picks the worst verdict", () => {
  const spec = makeSpec([
    {
      id: "el-a", selector: "[data-lab-id=\"el-a\"]", displayName: "A",
      description: "click", source: "designer",
      aiSuggestion: "", aiExtracted: null, status: "approved", approvedAt: "2026-01-01T00:00:00Z"
    },
    {
      id: "el-b", selector: "[data-lab-id=\"el-b\"]", displayName: "B",
      description: "", source: "ai",
      aiSuggestion: "click", aiExtracted: null, status: "proposed", approvedAt: null
    }
  ]);
  const decision = computeStoryVerdict(spec, [makeObserved("el-a"), makeObserved("el-b")]);
  assert.equal(decision.verdict, "needs-approval");
});
```

- [ ] **Step 3: Run the test and verify it fails.**

```bash
node --experimental-strip-types --test packages/pixel-test/src/logic-audit-verdict.test.ts
```

Expected: FAIL — `computeStoryVerdict` and `ObservedElement` don't exist yet.

- [ ] **Step 4: Implement `computeStoryVerdict` and refactor `auditStory` in `logic-audit.ts`.**

Add these exports near the top of `logic-audit.ts` (after imports):

```ts
import type { StorySpec, ElementSpec } from "../../contract/src/spec-types.ts";
import { extractFromDescription } from "./spec-extract-heuristic.ts";

export interface ObservedElement {
  labId: string;
  displayName: string;
  tag: string;
  role: string;
  text: string;
  ariaLabel: string;
}

export type ElementVerdict = "pass" | "regression" | "needs-approval" | "drift" | "new-element";

export interface ElementDecision {
  labId: string;
  verdict: ElementVerdict;
  reason: string;
}

export interface StoryDecision {
  verdict: AuditVerdict;
  reason: string;
  perElement: ElementDecision[];
  updatedSpec: StorySpec;
}

function freshElementFromObserved(obs: ObservedElement): ElementSpec {
  const heuristicInput = {
    displayName: obs.displayName || obs.labId,
    description: "",
    tag: obs.tag,
    role: obs.role,
    ariaLabel: obs.ariaLabel,
    text: obs.text
  };
  const suggestion = extractFromDescription({
    ...heuristicInput,
    description: obs.displayName || obs.labId || "interactive element"
  });
  return {
    id: obs.labId,
    selector: `[data-lab-id="${obs.labId}"]`,
    displayName: obs.displayName || obs.labId,
    description: "",
    source: "ai",
    aiSuggestion: suggestion.behaviour,
    aiExtracted: null,
    status: "proposed",
    approvedAt: null
  };
}

const ELEMENT_RANK: Record<ElementVerdict, number> = {
  regression: 4,
  drift: 3,
  "needs-approval": 2,
  "new-element": 2,
  pass: 1
};

export function computeStoryVerdict(spec: StorySpec, observed: ObservedElement[]): StoryDecision {
  const updatedElements = spec.elements.map((e) => ({ ...e }));
  const observedById = new Map(observed.map((o) => [o.labId, o]));
  const decisions: ElementDecision[] = [];

  // Existing spec entries: pass / regression
  for (const entry of updatedElements) {
    if (!observedById.has(entry.id)) {
      if (entry.status === "approved") {
        decisions.push({ labId: entry.id, verdict: "regression", reason: `approved element \"${entry.displayName}\" no longer in DOM` });
      } else {
        decisions.push({ labId: entry.id, verdict: "needs-approval", reason: `proposed element \"${entry.displayName}\" not in DOM (probably stale)` });
      }
      continue;
    }
    if (entry.status === "approved") {
      decisions.push({ labId: entry.id, verdict: "pass", reason: `${entry.displayName} approved + present` });
    } else {
      decisions.push({ labId: entry.id, verdict: "needs-approval", reason: `${entry.displayName} awaiting approval` });
    }
  }

  // New observed entries: add to spec as proposed AI elements
  const specIds = new Set(updatedElements.map((e) => e.id));
  for (const obs of observed) {
    if (specIds.has(obs.labId)) continue;
    updatedElements.push(freshElementFromObserved(obs));
    decisions.push({ labId: obs.labId, verdict: "new-element", reason: `new element \"${obs.displayName}\" discovered` });
  }

  // Static story (no elements observed, no spec entries)
  if (updatedElements.length === 0) {
    if (spec.status === "approved") {
      return {
        verdict: "pass",
        reason: "approved as static (no interactive elements)",
        perElement: [],
        updatedSpec: { ...spec, elements: updatedElements }
      };
    }
    return {
      verdict: "needs-approval",
      reason: "no interactive elements detected — approve as static in the showcase",
      perElement: [],
      updatedSpec: { ...spec, elements: updatedElements }
    };
  }

  // Story rollup = worst per-element
  let worstRank = 0;
  let worstVerdict: ElementVerdict = "pass";
  for (const d of decisions) {
    const r = ELEMENT_RANK[d.verdict];
    if (r > worstRank) {
      worstRank = r;
      worstVerdict = d.verdict;
    }
  }

  const approvedCount = decisions.filter((d) => d.verdict === "pass").length;
  const total = updatedElements.length;
  const storyVerdict: AuditVerdict =
    worstVerdict === "regression" ? "regression"
    : worstVerdict === "drift" ? "drift"
    : worstVerdict === "pass" ? "pass"
    : "needs-approval";

  const reason =
    storyVerdict === "pass"
      ? `${total}/${total} elements approved`
      : storyVerdict === "regression"
      ? `${decisions.filter((d) => d.verdict === "regression").length} approved element(s) missing`
      : `${approvedCount}/${total} elements approved`;

  return {
    verdict: storyVerdict,
    reason,
    perElement: decisions,
    updatedSpec: { ...spec, elements: updatedElements }
  };
}
```

Update `auditStory` to use this:

```ts
async function auditStory(
  page: Page,
  storyId: string,
  opts: CliOpts,
  specStore: ReturnType<typeof createSpecStore>
): Promise<AuditResult> {
  const testedAt = new Date().toISOString();
  const spec = specStore.readSpec(storyId);

  if (!spec) {
    return {
      storyId,
      component: DEV_STORY_BY_ID[storyId]?.component ?? null,
      status: "error",
      verdict: "needs-spec",
      verdictReason: "no spec on disk — run `pnpm specs:bootstrap-v2`",
      observedEvents: [],
      missingEvents: [],
      extraEvents: [],
      specStatus: "missing",
      interactiveCount: 0,
      dsBuiltinCount: 0,
      staticShellCount: 0,
      readonlyCount: 0,
      nativeCount: 0,
      baselineCount: 0,
      findings: [],
      gaps: [],
      dsBuiltIn: [],
      testedAt
    };
  }

  try {
    const component = await loadStory(page, storyId, opts);
    const initial = await page.evaluate(probeScript);
    const observed: ObservedElement[] = initial.controls
      .filter((c) => c.labId)
      .map((c) => ({
        labId: c.labId,
        displayName: c.text || c.ariaLabel || c.role || c.tag,
        tag: c.tag,
        role: c.role,
        text: c.text,
        ariaLabel: c.ariaLabel
      }));

    const decision = computeStoryVerdict(spec, observed);
    if (JSON.stringify(decision.updatedSpec.elements) !== JSON.stringify(spec.elements)) {
      specStore.writeSpec(decision.updatedSpec);
    }

    const status: AuditResult["status"] =
      decision.verdict === "pass" ? "pass"
      : decision.verdict === "regression" ? "fail"
      : "warn";

    return {
      storyId,
      component,
      status,
      verdict: decision.verdict,
      verdictReason: decision.reason,
      observedEvents: decision.perElement.map((p) => p.labId),
      missingEvents: decision.perElement.filter((p) => p.verdict === "regression").map((p) => p.labId),
      extraEvents: decision.perElement.filter((p) => p.verdict === "new-element").map((p) => p.labId),
      specStatus: spec.status,
      interactiveCount: observed.length,
      dsBuiltinCount: 0,
      staticShellCount: 0,
      readonlyCount: 0,
      nativeCount: 0,
      baselineCount: 0,
      findings: [],
      gaps: [],
      dsBuiltIn: [],
      testedAt
    };
  } catch (error) {
    return {
      storyId,
      component: DEV_STORY_BY_ID[storyId]?.component ?? null,
      status: "error",
      verdict: "error",
      verdictReason: error instanceof Error ? error.message : String(error),
      observedEvents: [],
      missingEvents: [],
      extraEvents: [],
      specStatus: spec.status,
      interactiveCount: 0,
      dsBuiltinCount: 0,
      staticShellCount: 0,
      readonlyCount: 0,
      nativeCount: 0,
      baselineCount: 0,
      findings: [],
      gaps: [],
      dsBuiltIn: [],
      error: error instanceof Error ? error.message : String(error),
      testedAt
    };
  }
}
```

Remove the `interactControl`, `pointerClickControl`, `pointerPickMenuOption`, `readSnapshot`, `showAuditHud`, and `saveStoryVideo` blocks — Phase 2 audit doesn't interact with the DOM anymore, it only probes. The `--record` flag becomes a no-op for now (Phase 2 follow-up if anyone misses interaction videos).

Also remove the `persistDriftSidecar` function and its call — drift sidecars are gone; drift is now per-element and lives in the spec itself.

- [ ] **Step 5: Run the verdict tests.**

```bash
node --experimental-strip-types --test packages/pixel-test/src/logic-audit-verdict.test.ts
```

Expected: 5/5 pass.

- [ ] **Step 6: Smoke the audit end-to-end.**

```bash
pnpm specs:bootstrap-v2  # ensure v2 specs exist
lsof -ti :6108 | xargs kill 2>/dev/null
node scripts/serve-playground.mjs > /tmp/play.log 2>&1 &
sleep 2
pnpm test:logic:audit
lsof -ti :6108 | xargs kill 2>/dev/null
```

Expected: each story prints `△ NEEDS-APPROVAL · N/N elements approved` with N elements discovered. Spec files now contain `elements[]` populated by the heuristic.

Inspect one to confirm:

```bash
cat lab-memory/specs/lab-loginpage--default.spec.json | python3 -m json.tool | head -40
```

Expected JSON has `elements: [...]` with multiple AI-source entries (email, password, login button, etc.).

- [ ] **Step 7: Commit.**

```bash
git add -A
git commit -m "feat(audit): per-element verdicts; audit populates elements[] on first run"
```

---

## Task 2.5: Audit CLI output + HTML report

**Files:**
- Modify: `packages/pixel-test/src/logic-audit.ts` — `writeSuiteHtml` + main CLI loop

- [ ] **Step 1: Replace the CLI line emitter** in `main()`. Find the `console.log(\`${icon} ${detail}${videoNote}\`)` block and replace with:

```ts
const icon =
  result.verdict === "pass" ? "✓"
  : result.verdict === "regression" || result.verdict === "error" ? "✗"
  : "△";
console.log(`${icon} ${result.verdict.toUpperCase()} · ${result.verdictReason}`);

// Per-element bullet list (only when there are elements)
const updated = specStore.readSpec(storyId);
if (updated && updated.elements.length > 0) {
  for (const el of updated.elements) {
    const bullet = el.status === "approved" ? "✓" : "◯";
    const tail = el.description || el.aiSuggestion || "(no description)";
    console.log(`  ${bullet} ${el.displayName.padEnd(28)} → ${tail}`);
  }
}
```

- [ ] **Step 2: Rewrite `writeSuiteHtml`.** Replace the whole function with:

```ts
const VERDICT_COLOR: Record<AuditVerdict, string> = {
  pass: "#16a34a",
  drift: "#d97706",
  "needs-spec": "#d97706",
  "needs-approval": "#d97706",
  regression: "#dc2626",
  error: "#dc2626"
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function writeSuiteHtml(results: StoryResultRecord[]): string {
  const rows = results
    .filter((r) => r.status !== "not_tested" && r.status !== "skipped")
    .map((r) => {
      const raw = r as StoryResultRecord & {
        component?: string;
        verdict?: AuditVerdict;
        verdictReason?: string;
        specStatus?: string;
        interactiveCount?: number;
      };
      const verdict: AuditVerdict = raw.verdict ?? (r.status === "pass" ? "pass" : "error");
      const color = VERDICT_COLOR[verdict] ?? "#dc2626";
      return `<tr>
        <td><code>${escapeHtml(r.storyId)}</code></td>
        <td>${escapeHtml(raw.component ?? "—")}</td>
        <td style="color:${color};font-weight:600">${verdict.toUpperCase()}</td>
        <td style="font-size:12px;color:#cbd5e1">${escapeHtml(raw.verdictReason ?? "")}</td>
        <td>${raw.interactiveCount ?? 0}</td>
        <td>${escapeHtml(raw.specStatus ?? "")}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Logic audit</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;background:#0f1419;color:#e8edf4}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid #2d3a4f;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#1a2332}
code{font-size:12px}
h1{margin-top:0}
p{color:#8b9cb3}
a{color:#58a6ff}
</style></head><body>
<h1>Logic audit — Delivery showcase</h1>
<p>Per-element approval. Open <a href="http://127.0.0.1:6108/?view=showcase">showcase</a> to approve.</p>
<table>
<thead><tr>
<th>Story</th><th>Component</th><th>Verdict</th><th>Reason</th><th>Elements</th><th>Spec status</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;
}
```

The per-element nested detail in the HTML report can be a Phase 3 follow-up; for now the flat row + the spec files give enough signal.

- [ ] **Step 3: Smoke the new output.**

```bash
lsof -ti :6108 | xargs kill 2>/dev/null
node scripts/serve-playground.mjs > /tmp/play.log 2>&1 &
sleep 2
pnpm test:logic:audit 2>&1 | head -40
lsof -ti :6108 | xargs kill 2>/dev/null
```

Expected output per story:

```
▶ lab-loginpage--default … △ NEEDS-APPROVAL · 0/5 elements approved
  ◯ Email                       → click triggers action
  ◯ Password                    → click triggers action
  ◯ Login                       → click triggers action
  ◯ Continue with Google        → click triggers action
  ◯ Continue with GitHub        → click triggers action
```

- [ ] **Step 4: Run the test bundle to make sure nothing else regressed.**

```bash
pnpm test:specs
pnpm test:specs:server
node --experimental-strip-types --test packages/pixel-test/src/logic-audit-verdict.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit.**

```bash
git add packages/pixel-test/src/logic-audit.ts
git commit -m "feat(audit): per-element CLI bullets + simplified HTML report"
```

---

# Phase 3 — Click-in-preview UX

**Goal:** Designer can open the showcase, click any element in any story's preview, edit its description, see live heuristic cards, approve. Per-story approval roundtrip works end-to-end.

---

## Task 3.1: `ElementOverlay.tsx` — click + hover capture

**Files:**
- Create: `packages/developer-playground/src/ElementOverlay.tsx`

- [ ] **Step 1: Implement the overlay component.**

```tsx
// packages/developer-playground/src/ElementOverlay.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";

interface ElementOverlayProps {
  /** ID stamped by `data-lab-id` on the currently-selected element, if any. */
  selectedId: string | null;
  /** Called when the designer clicks an interactive element in the preview. */
  onSelect: (labId: string | null) => void;
  /** The preview content; rendered as children. The overlay paints absolutely on top. */
  children: React.ReactNode;
}

/**
 * Renders a position:relative container with `children` (the story preview) and
 * a non-blocking overlay layer that draws hover/selected outlines on top of any
 * `[data-lab-id]` element underneath the cursor. Click is captured by the
 * overlay, mapped to the underlying labId via `document.elementsFromPoint`.
 */
export function ElementOverlay({ selectedId, onSelect, children }: ElementOverlayProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedRect, setSelectedRect] = useState<DOMRect | null>(null);

  // Recompute selected rect whenever selection or layout changes
  useEffect(() => {
    if (!selectedId || !stageRef.current) {
      setSelectedRect(null);
      return;
    }
    const el = stageRef.current.querySelector(`[data-lab-id="${selectedId}"]`);
    if (el) {
      setSelectedRect((el as HTMLElement).getBoundingClientRect());
    }
    // Recompute on resize / scroll
    const recompute = () => {
      const el2 = stageRef.current?.querySelector(`[data-lab-id="${selectedId}"]`);
      if (el2) setSelectedRect((el2 as HTMLElement).getBoundingClientRect());
    };
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [selectedId]);

  const findLabIdAt = useCallback((x: number, y: number): { id: string; rect: DOMRect } | null => {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      const id = (el as HTMLElement).closest("[data-lab-id]")?.getAttribute("data-lab-id");
      if (id) {
        const owner = (el as HTMLElement).closest("[data-lab-id]") as HTMLElement;
        return { id, rect: owner.getBoundingClientRect() };
      }
    }
    return null;
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const hit = findLabIdAt(e.clientX, e.clientY);
      if (!hit) {
        setHoveredId(null);
        setHoveredRect(null);
        return;
      }
      setHoveredId(hit.id);
      setHoveredRect(hit.rect);
    },
    [findLabIdAt]
  );

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const hit = findLabIdAt(e.clientX, e.clientY);
      if (hit) {
        e.preventDefault();
        e.stopPropagation();
        onSelect(hit.id);
      } else {
        onSelect(null);
      }
    },
    [findLabIdAt, onSelect]
  );

  // Esc deselects
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSelect(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelect]);

  // Translate page-coordinates rects into stage-coordinates for absolute boxes
  const stageRect = stageRef.current?.getBoundingClientRect();
  const toStage = (r: DOMRect | null): React.CSSProperties | null => {
    if (!r || !stageRect) return null;
    return {
      position: "absolute",
      left: r.left - stageRect.left,
      top: r.top - stageRect.top,
      width: r.width,
      height: r.height,
      pointerEvents: "none"
    };
  };

  const hoveredStyle = toStage(hoveredRect);
  const selectedStyle = toStage(selectedRect);

  return (
    <div className="element-overlay" ref={stageRef}>
      {children}
      <div
        className="element-overlay__catcher"
        onPointerMove={onPointerMove}
        onClick={onClick}
        aria-hidden="true"
      />
      {hoveredStyle && hoveredId !== selectedId && (
        <div className="element-overlay__hover" style={hoveredStyle} />
      )}
      {selectedStyle && (
        <div className="element-overlay__selected" style={selectedStyle} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles by building the playground.**

(We'll wire it into Showcase in Task 3.4; for now we just need TypeScript to be happy.)

```bash
pnpm playground:build
```

Expected: build succeeds with no TypeScript errors. The component is unused so it'll be tree-shaken; that's fine.

- [ ] **Step 3: Commit.**

```bash
git add packages/developer-playground/src/ElementOverlay.tsx
git commit -m "feat(playground): ElementOverlay component for click-in-preview selection"
```

---

## Task 3.2 + 3.3: `ElementPanel.tsx` — story view, element view, approve roundtrip

**Files:**
- Create: `packages/developer-playground/src/ElementPanel.tsx`

Combined into one task because the two panel modes share state + are tightly coupled.

- [ ] **Step 1: Implement `ElementPanel.tsx`.**

```tsx
// packages/developer-playground/src/ElementPanel.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ElementSpec,
  StorySpec
} from "../../contract/src/spec-types.ts";
import { fetchSpec, saveSpec } from "./spec-api";

interface ElementPanelProps {
  storyId: string;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "loaded"; spec: StorySpec; draft: Partial<ElementSpec> | null }
  | { kind: "error"; message: string };

export function ElementPanel({ storyId, selectedElementId, onSelectElement }: ElementPanelProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Load spec
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetchSpec(storyId)
      .then((spec) => {
        if (cancelled) return;
        if (!spec) setState({ kind: "missing" });
        else setState({ kind: "loaded", spec, draft: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [storyId]);

  // Clear draft + feedback when selection changes
  useEffect(() => {
    setState((prev) => prev.kind === "loaded" ? { ...prev, draft: null } : prev);
    setFeedback(null);
  }, [selectedElementId]);

  const selectedElement: ElementSpec | null = useMemo(() => {
    if (state.kind !== "loaded" || !selectedElementId) return null;
    return state.spec.elements.find((e) => e.id === selectedElementId) ?? null;
  }, [state, selectedElementId]);

  const persistElement = useCallback(
    async (next: ElementSpec) => {
      if (state.kind !== "loaded") return;
      setBusy(true);
      setFeedback(null);
      try {
        const updatedSpec: StorySpec = {
          ...state.spec,
          elements: state.spec.elements.map((e) => (e.id === next.id ? next : e))
        };
        const saved = await saveSpec(updatedSpec);
        setState({ kind: "loaded", spec: saved, draft: null });
        setFeedback("Saved.");
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [state]
  );

  const persistStoryIntent = useCallback(
    async (intent: string) => {
      if (state.kind !== "loaded") return;
      setBusy(true);
      try {
        const saved = await saveSpec({ ...state.spec, intent });
        setState({ kind: "loaded", spec: saved, draft: null });
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [state]
  );

  const approveStoryAsStatic = useCallback(async () => {
    if (state.kind !== "loaded") return;
    setBusy(true);
    try {
      const saved = await saveSpec({
        ...state.spec,
        status: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy: "showcase"
      });
      setState({ kind: "loaded", spec: saved, draft: null });
      setFeedback("Story approved as static.");
    } finally {
      setBusy(false);
    }
  }, [state]);

  if (state.kind === "loading") return <aside className="element-panel"><p>Loading…</p></aside>;
  if (state.kind === "missing") return <aside className="element-panel"><p>No spec — run <code>pnpm specs:bootstrap-v2</code>.</p></aside>;
  if (state.kind === "error") return <aside className="element-panel element-panel--error"><p>Error: {state.message}</p></aside>;

  // Static story
  if (state.spec.elements.length === 0) {
    return (
      <aside className="element-panel">
        <p className="element-panel__intent-label">Intent</p>
        <textarea
          className="element-panel__intent"
          value={state.spec.intent}
          onBlur={(e) => persistStoryIntent(e.target.value)}
          onChange={(e) => setState((p) => p.kind === "loaded" ? { ...p, spec: { ...p.spec, intent: e.target.value } } : p)}
          placeholder="One sentence: what is this story?"
          rows={2}
        />
        <p className="element-panel__hint">
          {state.spec.status === "approved"
            ? "Approved as static — no interactive elements."
            : "No interactive elements detected. Run pnpm test:logic:audit to confirm, then approve below."}
        </p>
        {state.spec.status !== "approved" && (
          <button className="element-panel__approve" disabled={busy} onClick={approveStoryAsStatic}>
            Approve story as static
          </button>
        )}
        {feedback && <p className="element-panel__feedback">{feedback}</p>}
      </aside>
    );
  }

  // Element view
  if (selectedElement) {
    return (
      <ElementView
        element={selectedElement}
        busy={busy}
        feedback={feedback}
        onChange={(patch) =>
          setState((p) =>
            p.kind === "loaded"
              ? { ...p, draft: { ...(p.draft ?? {}), ...patch } }
              : p
          )
        }
        draft={state.draft}
        onClose={() => onSelectElement(null)}
        onApprove={async () => {
          const merged: ElementSpec = {
            ...selectedElement,
            ...(state.draft ?? {}),
            status: "approved",
            approvedAt: new Date().toISOString()
          };
          await persistElement(merged);
        }}
        onSaveDraft={async () => {
          const merged: ElementSpec = {
            ...selectedElement,
            ...(state.draft ?? {})
          };
          await persistElement(merged);
        }}
        onReset={() =>
          setState((p) =>
            p.kind === "loaded"
              ? {
                  ...p,
                  draft: {
                    description: "",
                    source: "ai"
                  }
                }
              : p
          )
        }
      />
    );
  }

  // Story view (no selection)
  return (
    <aside className="element-panel">
      <p className="element-panel__intent-label">Intent</p>
      <textarea
        className="element-panel__intent"
        value={state.spec.intent}
        onBlur={(e) => persistStoryIntent(e.target.value)}
        onChange={(e) =>
          setState((p) => p.kind === "loaded"
            ? { ...p, spec: { ...p.spec, intent: e.target.value } }
            : p)
        }
        placeholder="One sentence: what does this story do?"
        rows={2}
      />
      <p className="element-panel__count">
        All elements ({state.spec.elements.length})
      </p>
      <ul className="element-panel__list">
        {state.spec.elements.map((el) => {
          const icon = el.status === "approved" ? "✓" : "◯";
          const tail = el.description || el.aiSuggestion || "(no description)";
          return (
            <li
              key={el.id}
              className={`element-panel__row element-panel__row--${el.status}`}
              onClick={() => onSelectElement(el.id)}
            >
              <span className="element-panel__row-icon">{icon}</span>
              <span className="element-panel__row-name">{el.displayName}</span>
              <span className="element-panel__row-tail">{tail}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

// ── ElementView (selected) ──

interface ElementViewProps {
  element: ElementSpec;
  draft: Partial<ElementSpec> | null;
  busy: boolean;
  feedback: string | null;
  onChange: (patch: Partial<ElementSpec>) => void;
  onClose: () => void;
  onApprove: () => Promise<void>;
  onSaveDraft: () => Promise<void>;
  onReset: () => void;
}

function ElementView({ element, draft, busy, feedback, onChange, onClose, onApprove, onSaveDraft, onReset }: ElementViewProps) {
  const description = draft?.description ?? element.description;
  const displayName = draft?.displayName ?? element.displayName;
  const dirty = draft !== null;

  // Local heuristic cards (re-runs on description blur via the audit; in v3.x
  // we display the cards last saved by the server, the heuristic preview here
  // is just a hint that something will change after Save / Approve).
  const live = element.aiExtracted;

  return (
    <aside className="element-panel element-panel--element">
      <header className="element-panel__head">
        <span className="element-panel__badge" data-status={element.status}>
          {element.status === "approved" ? "Approved" : "Proposed"}
        </span>
        <button className="element-panel__close" onClick={onClose} aria-label="Close">×</button>
      </header>

      <label className="element-panel__field">
        <span>Layer</span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => onChange({ displayName: e.target.value, source: "designer" })}
        />
      </label>

      <label className="element-panel__field">
        <span>What should this do?</span>
        <textarea
          value={description}
          onChange={(e) => onChange({ description: e.target.value, source: "designer" })}
          placeholder={element.aiSuggestion ? `e.g. ${element.aiSuggestion}` : "Plain English. e.g. 'click to reveal a search input'"}
          rows={3}
        />
      </label>

      {live && (
        <>
          <div className="element-panel__card element-panel__card--behaviour">
            <p className="element-panel__card-title">Runtime behaviour</p>
            <p className="element-panel__card-body">{live.behaviour}</p>
          </div>
          <div className="element-panel__card element-panel__card--api">
            <p className="element-panel__card-title">Developer API</p>
            {live.devApi.length === 0 ? (
              <p className="element-panel__card-body">—</p>
            ) : (
              <ul>
                {live.devApi.map((api) => (
                  <li key={api.name}><code>{api.name}: {api.signature}</code></li>
                ))}
              </ul>
            )}
            <p className="element-panel__card-footer">
              extracted by {live.extractedBy}
            </p>
          </div>
        </>
      )}

      <footer className="element-panel__foot">
        <button className="element-panel__approve" disabled={busy} onClick={onApprove}>
          {element.status === "approved" ? "Re-approve" : "✓ Approve"}
        </button>
        <button disabled={busy || !dirty} onClick={onSaveDraft}>Save draft</button>
        <button className="element-panel__ghost" onClick={onReset}>Reset to AI suggestion</button>
      </footer>
      {feedback && <p className="element-panel__feedback">{feedback}</p>}
    </aside>
  );
}
```

- [ ] **Step 2: Verify the playground builds.**

```bash
pnpm playground:build
```

Expected: success.

- [ ] **Step 3: Commit.**

```bash
git add packages/developer-playground/src/ElementPanel.tsx
git commit -m "feat(playground): ElementPanel — story view + element view + approve roundtrip"
```

---

## Task 3.4: Wire `ElementOverlay` + `ElementPanel` into `Showcase.tsx`

**Files:**
- Rewrite: `packages/developer-playground/src/Showcase.tsx`
- Delete: `packages/developer-playground/src/SpecEditor.tsx` (the stub from Task 1.6)

- [ ] **Step 1: Rewrite `Showcase.tsx`.**

```tsx
// packages/developer-playground/src/Showcase.tsx
import React, { useMemo, useState } from "react";
import { DEV_STORIES, type DevStoryEntry } from "../../contract/src/index.ts";
import { renderDevStory } from "./registry";
import { PackageDownload } from "./PackageDownload";
import { ElementOverlay } from "./ElementOverlay";
import { ElementPanel } from "./ElementPanel";
import "./showcase.css";

function groupByComponent(stories: DevStoryEntry[]): [string, DevStoryEntry[]][] {
  const map = new Map<string, DevStoryEntry[]>();
  for (const entry of stories) {
    const list = map.get(entry.component) ?? [];
    list.push(entry);
    map.set(entry.component, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function StoryCard({ entry }: { entry: DevStoryEntry }) {
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  return (
    <article className="showcase-card">
      <header>
        <code title={entry.id}>{entry.id}</code>
        <a href={`?story=${encodeURIComponent(entry.id)}`}>Open alone ↗</a>
      </header>
      <div className="showcase-card-body">
        <div className="showcase-stage lab-stage">
          <ElementOverlay selectedId={selectedElementId} onSelect={setSelectedElementId}>
            {renderDevStory(entry)}
          </ElementOverlay>
        </div>
        <ElementPanel
          storyId={entry.id}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
        />
      </div>
    </article>
  );
}

export function Showcase() {
  const packageStories = useMemo(() => DEV_STORIES, []);
  const grouped = useMemo(() => groupByComponent(packageStories), [packageStories]);

  return (
    <div className="showcase-page">
      <header className="showcase-header">
        <div>
          <h1>Delivery showcase</h1>
          <p>
            Click any layer in a preview to describe what it does. The audit's job is to confirm your descriptions still hold.
          </p>
        </div>
        <p className="showcase-meta">
          {packageStories.length} stories · isolated view: <code>?story=&lt;story-id&gt;</code>
        </p>
      </header>

      <PackageDownload />

      {grouped.map(([component, stories]) => (
        <section key={component} className="showcase-section">
          <h2>{component}</h2>
          <div className="showcase-grid">
            {stories.map((entry) => <StoryCard key={entry.id} entry={entry} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Delete the `SpecEditor.tsx` stub.**

```bash
rm packages/developer-playground/src/SpecEditor.tsx
```

- [ ] **Step 3: Build the playground.**

```bash
pnpm playground:build
```

Expected: success.

- [ ] **Step 4: Commit.**

```bash
git add -A
git commit -m "feat(playground): wire ElementOverlay + ElementPanel into Showcase"
```

---

## Task 3.5: CSS for overlay, panel, and badges

**Files:**
- Rewrite: `packages/developer-playground/src/showcase.css`

Replace the entire file. The old v1 spec-editor styles are gone; we keep the page/section/card chrome and add new overlay + panel styles.

- [ ] **Step 1: Replace `showcase.css`.**

```css
/* packages/developer-playground/src/showcase.css */
.showcase-page { min-height: 100vh; background: #f5f7fb; }

.showcase-header {
  position: sticky; top: 0; z-index: 2;
  display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;
  gap: 12px 24px; padding: 20px 32px;
  background: rgba(245,247,251,0.92); border-bottom: 1px solid #dbe3ef; backdrop-filter: blur(8px);
}
.showcase-header h1 { margin: 0 0 4px; font-size: 1.5rem; color: #0f172a; }
.showcase-header p  { margin: 0; color: #64748b; font-size: 0.95rem; max-width: 60ch; }
.showcase-meta      { font-size: 0.85rem; }
.showcase-meta code { font-size: 0.8rem; background: #e8eef7; padding: 2px 6px; border-radius: 4px; }

.showcase-section   { padding: 24px 32px 8px; }
.showcase-section > h2 { margin: 0 0 16px; font-size: 1.1rem; color: #1e293b; letter-spacing: 0.02em; }

.showcase-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 820px), 1fr));
  gap: 20px;
}

.showcase-card {
  background: #fff; border: 1px solid #dbe3ef; border-radius: 12px; overflow: hidden;
  box-shadow: 0 1px 2px rgba(15,23,42,0.04);
}
.showcase-card > header {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 14px; border-bottom: 1px solid #eef2f7; background: #fafbfd;
}
.showcase-card > header code { font-size: 0.78rem; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.showcase-card > header a    { flex-shrink: 0; font-size: 0.78rem; color: #006dce; text-decoration: none; }

.showcase-card-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
  gap: 0; align-items: stretch;
}
@media (max-width: 960px) {
  .showcase-card-body { grid-template-columns: 1fr; }
}
.showcase-stage { padding: 24px; overflow: auto; min-width: 0; position: relative; }

/* ── ElementOverlay ── */
.element-overlay { position: relative; }
.element-overlay__catcher {
  position: absolute; inset: 0; z-index: 10;
  background: transparent; cursor: default;
}
.element-overlay__hover {
  border: 1px dashed #93c5fd; border-radius: 4px;
  background: rgba(147, 197, 253, 0.08);
  z-index: 11;
}
.element-overlay__selected {
  border: 2px solid #2563eb; border-radius: 4px;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.18);
  z-index: 12;
}

/* ── ElementPanel ── */
.element-panel {
  display: flex; flex-direction: column; gap: 12px;
  background: #f8fafc; border-left: 1px solid #eef2f7;
  padding: 16px; font-size: 0.85rem; color: #1e293b;
  overflow: auto; max-height: 100%;
}
@media (max-width: 960px) {
  .element-panel { border-left: 0; border-top: 1px solid #eef2f7; }
}
.element-panel--error { background: #fef2f2; color: #991b1b; }

.element-panel__intent-label,
.element-panel__count { margin: 0; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
.element-panel__intent { width: 100%; font-family: inherit; font-size: 0.85rem; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; resize: vertical; }
.element-panel__hint   { font-size: 0.78rem; color: #64748b; margin: 0; }
.element-panel__feedback { font-size: 0.78rem; color: #047857; margin: 0; }
.element-panel__approve {
  background: #16a34a; color: #fff; border: 0; padding: 8px 14px; border-radius: 6px;
  font-weight: 600; cursor: pointer;
}
.element-panel__approve:disabled { opacity: 0.5; cursor: not-allowed; }

.element-panel__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.element-panel__row {
  display: grid; grid-template-columns: 18px 1fr; gap: 6px;
  align-items: start; padding: 8px 10px; border-radius: 6px; cursor: pointer;
  background: #fff; border: 1px solid #e2e8f0;
}
.element-panel__row:hover { background: #f1f5f9; }
.element-panel__row--approved .element-panel__row-icon { color: #16a34a; }
.element-panel__row--proposed .element-panel__row-icon { color: #d97706; }
.element-panel__row-name { font-weight: 600; color: #0f172a; grid-column: 2; }
.element-panel__row-tail { grid-column: 2; font-size: 0.78rem; color: #64748b; }

.element-panel--element { gap: 10px; }
.element-panel__head { display: flex; align-items: center; justify-content: space-between; }
.element-panel__badge {
  font-size: 0.66rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  padding: 3px 8px; border-radius: 999px;
}
.element-panel__badge[data-status="approved"] { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
.element-panel__badge[data-status="proposed"] { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
.element-panel__close { background: transparent; border: 0; font-size: 1.2rem; color: #64748b; cursor: pointer; }

.element-panel__field { display: flex; flex-direction: column; gap: 4px; font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
.element-panel__field input,
.element-panel__field textarea {
  font: inherit; font-size: 0.85rem; font-weight: 400; color: #0f172a; text-transform: none;
  padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;
}
.element-panel__field input:focus,
.element-panel__field textarea:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2); }

.element-panel__card { padding: 10px 12px; border-radius: 8px; }
.element-panel__card--behaviour { background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16,185,129,0.25); }
.element-panel__card--api       { background: rgba(124, 58, 237, 0.08); border: 1px solid rgba(124,58,237,0.25); }
.element-panel__card-title { margin: 0 0 4px; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; }
.element-panel__card-body  { margin: 0; font-size: 0.85rem; color: #1e293b; }
.element-panel__card ul { margin: 4px 0 0; padding-left: 18px; font-size: 0.8rem; }
.element-panel__card code { font-family: "Roboto Mono", ui-monospace, monospace; font-size: 0.78rem; }
.element-panel__card-footer { margin: 4px 0 0; font-size: 0.7rem; color: #94a3b8; font-style: italic; }

.element-panel__foot { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.element-panel__foot button { font-size: 0.8rem; font-weight: 600; padding: 7px 12px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #334155; cursor: pointer; }
.element-panel__foot button:disabled { opacity: 0.5; cursor: not-allowed; }
.element-panel__ghost { background: transparent !important; border-color: transparent !important; color: #64748b !important; }
```

- [ ] **Step 2: Build the playground.**

```bash
pnpm playground:build
```

Expected: success.

- [ ] **Step 3: Commit.**

```bash
git add packages/developer-playground/src/showcase.css
git commit -m "style(playground): overlay + element panel CSS"
```

---

## Task 3.6: Smoke test the showcase end-to-end

**Files:** (no edits — manual smoke)

- [ ] **Step 1: Run the audit to populate elements** (Phase 2 work; required for showcase to have anything to display):

```bash
pnpm specs:bootstrap-v2
lsof -ti :6108 | xargs kill 2>/dev/null
node scripts/serve-playground.mjs > /tmp/play.log 2>&1 &
sleep 2
pnpm test:logic:audit
```

Expected: each story shows `△ NEEDS-APPROVAL · 0/N elements approved`.

- [ ] **Step 2: Open the showcase in a browser** and walk through one story manually.

```bash
open "http://127.0.0.1:6108/?view=showcase"
```

Manual checks (one story, e.g. `lab-loginpage--default`):
- Card renders with preview on left, panel on right
- Panel "Story view" shows intent textarea + 5 elements with `◯` icons
- Click "Email field" row in the list → panel switches to element view, preview shows blue selection outline on the email input
- Edit description ("user types email"), click Save draft — panel shows "Saved.", row in story view shows updated description
- Click Approve — badge flips to green Approved, row icon flips to `✓`

- [ ] **Step 3: Re-run audit to confirm the spec round-tripped.**

```bash
pnpm test:logic:audit
```

Expected: `lab-loginpage--default` shows `△ NEEDS-APPROVAL · 1/5 elements approved` with `✓ Email field` in the bullet list.

```bash
lsof -ti :6108 | xargs kill 2>/dev/null
```

- [ ] **Step 4: Commit (no code changes, just a marker commit if anything broke during smoke).**

```bash
git status
# If clean: skip this commit
# If anything was tweaked during smoke: git add -A && git commit -m "fix(playground): tweaks from showcase smoke"
```

---

# Phase 4 — ✨ AI polish

**Goal:** Optional LLM endpoint that re-extracts cards for tricky descriptions. Gracefully disabled when no API key is configured.

---

## Task 4.1: `specs-llm.mjs` server + tests

**Files:**
- Create: `scripts/specs-llm.mjs`
- Create: `scripts/specs-llm.test.mjs`

- [ ] **Step 1: Write the failing test.**

```js
// scripts/specs-llm.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createExtractRoutes } from "./specs-llm.mjs";

function start(routes) {
  const server = createServer((req, res) => {
    if (routes.matches(req)) { routes.handle(req, res); return; }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

test("returns 503 when no API key configured", async () => {
  const routes = createExtractRoutes({ apiKey: null, fetchImpl: async () => { throw new Error("should not call"); } });
  const server = await start(routes);
  try {
    const res = await fetch(`${server.url}/api/specs/extract`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storyId: "x", elementId: "y", displayName: "Z", description: "click" })
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /LAB_LLM_API_KEY/);
  } finally {
    await server.close();
  }
});

test("calls the fetcher with the configured key and returns parsed JSON", async () => {
  let captured = null;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        behaviour: "On click: open menu",
        devApi: [{ name: "onMenuOpened", signature: "() => void" }]
      }) } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const routes = createExtractRoutes({ apiKey: "sk-test", fetchImpl: fakeFetch });
  const server = await start(routes);
  try {
    const res = await fetch(`${server.url}/api/specs/extract`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storyId: "x", elementId: "y", displayName: "Menu", description: "click to open menu" })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.behaviour, "On click: open menu");
    assert.equal(body.devApi[0].name, "onMenuOpened");
    assert.equal(body.extractedBy, "llm");
    assert.match(captured.url, /openai\.com/);
    assert.match(captured.init.headers.Authorization, /Bearer sk-test/);
  } finally {
    await server.close();
  }
});

test("falls through to 502 when LLM returns malformed JSON twice", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: "not json at all" } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const routes = createExtractRoutes({ apiKey: "sk-test", fetchImpl: fakeFetch });
  const server = await start(routes);
  try {
    const res = await fetch(`${server.url}/api/specs/extract`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storyId: "x", elementId: "y", displayName: "Z", description: "click" })
    });
    assert.equal(res.status, 502);
    assert.equal(calls, 2, "should have retried once");
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 2: Run the test and verify it fails.**

```bash
node --test scripts/specs-llm.test.mjs
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `scripts/specs-llm.mjs`.**

```js
// scripts/specs-llm.mjs
/**
 * Mountable LLM extraction endpoint for the dev playground server.
 *
 * `createExtractRoutes({ apiKey, fetchImpl })` returns `{ matches, handle }`
 * compatible with the same pattern as `specs-server.mjs`. Tests inject a
 * mock fetch via `fetchImpl`; production wiring passes `fetch`.
 */

const API_PREFIX = "/api/specs/extract";

function buildPrompt(body) {
  const nearby = (body.nearbyElements || [])
    .slice(0, 6)
    .map((n) => `- ${n.tag}${n.role ? `[role=${n.role}]` : ""}: "${(n.text || "").slice(0, 40)}"`)
    .join("\n");
  return [
    "You are translating a designer's plain-English description of a UI element",
    "into (a) a one-sentence runtime behaviour and (b) a list of developer prop",
    "signatures the implementer will need.",
    "",
    `STORY INTENT: ${body.storyIntent || "(none)"}`,
    `ELEMENT: ${body.displayName} (${body.tag}, role=${body.role || "—"}, text="${body.text || ""}")`,
    `NEARBY ELEMENTS:\n${nearby || "(none)"}`,
    `DESIGNER DESCRIPTION: "${body.description}"`,
    "",
    "Reply with JSON, no prose:",
    '{ "behaviour": string, "devApi": [{ "name": string, "signature": string }] }',
    "",
    "Rules:",
    "- Names in camelCase, start with `on` for events.",
    "- Signature in TypeScript only, e.g. \"(value: string) => void\".",
    "- AT MOST 3 devApi entries.",
    "- If description is too vague, behaviour = \"needs more detail\", devApi = []."
  ].join("\n");
}

async function callOpenAI(apiKey, prompt, fetchImpl, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: attempt === 0 ? 0.2 : 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) {
      if (attempt === retries) throw new Error(`OpenAI ${res.status}`);
      continue;
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed.behaviour === "string" && Array.isArray(parsed.devApi)) {
        return parsed;
      }
    } catch {
      if (attempt === retries) throw new Error("malformed json");
    }
  }
  throw new Error("malformed json after retries");
}

export function createExtractRoutes({ apiKey, fetchImpl = fetch } = {}) {
  function matches(req) {
    return (req.url ?? "") === API_PREFIX;
  }

  async function readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }

  function send(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(body));
  }

  async function handle(req, res) {
    if (req.method !== "POST") { send(res, 405, { error: "POST only" }); return; }
    if (!apiKey) {
      send(res, 503, { error: "configure LAB_LLM_API_KEY in .env to enable AI polish" });
      return;
    }
    let body;
    try { body = await readJsonBody(req); } catch { send(res, 400, { error: "malformed body" }); return; }
    if (!body.description) { send(res, 400, { error: "description required" }); return; }

    const prompt = buildPrompt(body);
    try {
      const parsed = await callOpenAI(apiKey, prompt, fetchImpl, 1);
      send(res, 200, { ...parsed, extractedBy: "llm" });
    } catch (err) {
      send(res, 502, { error: err.message ?? "LLM call failed" });
    }
  }

  return { matches, handle };
}
```

- [ ] **Step 4: Run the tests.**

```bash
node --test scripts/specs-llm.test.mjs
```

Expected: 3/3 pass.

- [ ] **Step 5: Add to `package.json`.**

```diff
+    "test:specs:llm": "node --test scripts/specs-llm.test.mjs",
```

- [ ] **Step 6: Commit.**

```bash
git add scripts/specs-llm.mjs scripts/specs-llm.test.mjs package.json
git commit -m "feat(specs): /api/specs/extract LLM endpoint with retry + key-missing fallback"
```

---

## Task 4.2: Mount the LLM endpoint on the playground server

**Files:**
- Modify: `scripts/serve-playground.mjs`

- [ ] **Step 1: Update the server.**

```diff
 import { createSpecRoutes } from "./specs-server.mjs";
+import { createExtractRoutes } from "./specs-llm.mjs";
+import { readFileSync, existsSync as fsExists } from "node:fs";

 const PORT = Number(process.env.PLAYGROUND_PORT ?? 6108);
 const ROOT = resolve(process.cwd(), "packages/developer-playground/dist");
 const VAULT = resolve(process.cwd(), "lab-memory/specs");

+function loadLlmKey() {
+  if (process.env.LAB_LLM_API_KEY) return process.env.LAB_LLM_API_KEY;
+  const envPath = resolve(process.cwd(), ".env");
+  if (!fsExists(envPath)) return null;
+  const text = readFileSync(envPath, "utf8");
+  const match = text.match(/^LAB_LLM_API_KEY=(.+)$/m);
+  return match ? match[1].trim() : null;
+}
+
 const specRoutes = createSpecRoutes({ vaultDir: VAULT });
+const extractRoutes = createExtractRoutes({ apiKey: loadLlmKey() });
 const server = createServer();
```

And update the request handler to forward to the new routes:

```diff
 server.on("request", async (req, res) => {
+  if (extractRoutes.matches(req)) { await extractRoutes.handle(req, res); return; }
   if (specRoutes.matches(req)) { await specRoutes.handle(req, res); return; }
```

Update the startup log:

```diff
   console.log(`  → http://127.0.0.1:${PORT}/api/specs  (spec inventory JSON, read/write via PUT)`);
+  console.log(`  → http://127.0.0.1:${PORT}/api/specs/extract  (LLM polish — ${process.env.LAB_LLM_API_KEY ? "enabled" : "no key, 503 fallback"})`);
```

- [ ] **Step 2: Smoke the endpoint.**

```bash
lsof -ti :6108 | xargs kill 2>/dev/null
node scripts/serve-playground.mjs > /tmp/play.log 2>&1 &
sleep 2
curl -s -X POST -H "Content-Type: application/json" -d '{"storyId":"x","elementId":"y","displayName":"Z","description":"click"}' http://127.0.0.1:6108/api/specs/extract
echo ""
lsof -ti :6108 | xargs kill 2>/dev/null
```

Expected (no key configured): `{"error":"configure LAB_LLM_API_KEY in .env to enable AI polish"}` with status 503.

- [ ] **Step 3: Commit.**

```bash
git add scripts/serve-playground.mjs
git commit -m "feat(playground-server): mount /api/specs/extract"
```

---

## Task 4.3: `spec-extract-client.ts` and ✨ button in `ElementPanel`

**Files:**
- Create: `packages/developer-playground/src/spec-extract-client.ts`
- Modify: `packages/developer-playground/src/ElementPanel.tsx`

- [ ] **Step 1: Implement the client.**

```ts
// packages/developer-playground/src/spec-extract-client.ts
import type { AiExtracted } from "../../contract/src/spec-types.ts";

interface ExtractRequest {
  storyId: string;
  elementId: string;
  displayName: string;
  description: string;
  tag: string;
  role: string;
  ariaLabel: string;
  text: string;
  storyIntent: string;
  nearbyElements: Array<{ tag: string; role: string; text: string }>;
}

export type ExtractResult =
  | { kind: "ok"; extracted: AiExtracted }
  | { kind: "no-key" }
  | { kind: "error"; message: string };

export async function callExtract(req: ExtractRequest): Promise<ExtractResult> {
  let res;
  try {
    res = await fetch("/api/specs/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req)
    });
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "network error" };
  }
  if (res.status === 503) return { kind: "no-key" };
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { kind: "error", message: `LLM ${res.status}: ${body.slice(0, 120)}` };
  }
  const body = await res.json();
  return {
    kind: "ok",
    extracted: {
      behaviour: body.behaviour,
      devApi: body.devApi,
      extractedBy: "llm",
      extractedAt: new Date().toISOString()
    }
  };
}
```

- [ ] **Step 2: Wire the ✨ button into `ElementView` inside `ElementPanel.tsx`.**

Add import:

```ts
import { callExtract, type ExtractResult } from "./spec-extract-client";
```

Add inside `ElementView`:

```tsx
const [aiBusy, setAiBusy] = useState(false);
const [aiBanner, setAiBanner] = useState<string | null>(null);

const improveWithAi = useCallback(async () => {
  setAiBusy(true);
  setAiBanner(null);
  const result: ExtractResult = await callExtract({
    storyId: "", // ElementView doesn't own storyId; lift if needed
    elementId: element.id,
    displayName,
    description,
    tag: "", role: "", ariaLabel: "", text: displayName,
    storyIntent: "",
    nearbyElements: []
  });
  setAiBusy(false);
  if (result.kind === "no-key") {
    setAiBanner("AI polish unavailable — add LAB_LLM_API_KEY=… to .env to enable.");
    return;
  }
  if (result.kind === "error") {
    setAiBanner(`AI unreachable: ${result.message}`);
    return;
  }
  // Patch the draft to include the LLM-extracted cards
  onChange({ aiExtracted: result.extracted });
}, [element.id, displayName, description, onChange]);
```

Add the button in the footer:

```tsx
<button className="element-panel__sparkle" disabled={aiBusy} onClick={improveWithAi}>
  {aiBusy ? "✨…" : "✨ Improve with AI"}
</button>
```

Add the banner above the footer:

```tsx
{aiBanner && <p className="element-panel__feedback element-panel__feedback--warn">{aiBanner}</p>}
```

The `storyId` and `nearbyElements` fields are stubbed with empty values; if AI quality suffers, lift them by passing `storyId` through `ElementPanel` props (it already has it) and probing the parent `[data-figma-component]` for sibling elements. Marked as a follow-up; v1 ships with the simpler call.

- [ ] **Step 3: Add CSS for the sparkle button.**

In `showcase.css`:

```css
.element-panel__sparkle {
  background: linear-gradient(135deg, #a78bfa, #7c3aed) !important;
  color: #fff !important;
  border: 0 !important;
}
.element-panel__feedback--warn { color: #b45309; }
```

- [ ] **Step 4: Build the playground.**

```bash
pnpm playground:build
```

Expected: success.

- [ ] **Step 5: Commit.**

```bash
git add -A
git commit -m "feat(playground): ✨ Improve-with-AI button calls /api/specs/extract"
```

---

## Task 4.4: Document `LAB_LLM_API_KEY` in `.env.example` + README

**Files:**
- Modify: `.env.example`
- Modify: `README.md` (or create section)

- [ ] **Step 1: Add to `.env.example`.**

```bash
# Check if .env.example exists; create if not
test -f .env.example || echo "# Lab env" > .env.example
```

Append:

```
# Optional: enables the ✨ Improve-with-AI button in the showcase logic-approval flow.
# OpenAI key (sk-...) or Anthropic key (sk-ant-...). When absent, the showcase still
# works — only the AI polish button is disabled.
# LAB_LLM_API_KEY=sk-...
```

- [ ] **Step 2: Add a README section.**

Find the README — likely `README.md`. Add a section under existing tooling:

```markdown
## Logic approval (element specs)

- `pnpm specs:bootstrap-v2` — seed empty per-story spec files.
- `pnpm test:logic:audit` — discover interactive elements + verdict.
- `pnpm playground:serve` then open `http://127.0.0.1:6108/?view=showcase` — click any element in a preview, write a plain-English description, approve.
- Optional: set `LAB_LLM_API_KEY` in `.env` to enable the ✨ Improve-with-AI button.
- CI: the audit never calls the LLM endpoint. Heuristic-only by design.
```

- [ ] **Step 3: Commit.**

```bash
git add -A
git commit -m "docs: document LAB_LLM_API_KEY and element-approval flow"
```

---

## Task 4.5: Manual end-to-end smoke (with and without key)

**Files:** (no edits — manual)

- [ ] **Step 1: Smoke WITHOUT key.**

```bash
unset LAB_LLM_API_KEY
lsof -ti :6108 | xargs kill 2>/dev/null
node scripts/serve-playground.mjs > /tmp/play.log 2>&1 &
sleep 2
open "http://127.0.0.1:6108/?view=showcase"
```

In the browser, select an element, click ✨. Expected: amber banner "AI polish unavailable — add LAB_LLM_API_KEY=… to .env to enable." Heuristic cards still visible.

```bash
lsof -ti :6108 | xargs kill 2>/dev/null
```

- [ ] **Step 2: Smoke WITH key.**

If you have an OpenAI key:

```bash
export LAB_LLM_API_KEY="sk-..."
lsof -ti :6108 | xargs kill 2>/dev/null
node scripts/serve-playground.mjs > /tmp/play.log 2>&1 &
sleep 2
```

Open showcase, select an element, write a tricky description (e.g. "once the user hovers this chart he should see the position values"), click ✨. Expected: behaviour + devApi cards update within ~2s; card footer says "extracted by llm".

```bash
lsof -ti :6108 | xargs kill 2>/dev/null
```

- [ ] **Step 3: Commit (only if tweaks were needed during smoke).**

```bash
git status
# git add -A && git commit -m "fix(playground): tweaks from llm smoke" (if needed)
```

---

# Phase 5 — Docs + closeout

## Task 5.1: Update `docs/ROADMAP.md`

**Files:**
- Modify: `docs/ROADMAP.md` — replace Phase 2.0 section with the new v2 reality

- [ ] **Step 1: Replace the existing Phase 2.0 + 2.1 sections.**

Find the section that starts `### 2.0 Logic audit — spec-aware verdicts + inline approval` and replace with:

```markdown
### 2.0 Logic audit — element approval (✅ delivered 2026-05-25, redesigned same day)

**Principle:** Designer clicks a layer in the live preview, writes plain English, the audit's heuristic engine (and an optional LLM polish) translates the text into runtime behaviour + developer API. Audit gates on per-element approval.

- [x] `lab-memory/specs/<storyId>.spec.json` v2 — `elements[]` per story; legacy v1 archived to `lab-memory/specs-legacy/`.
- [x] Stable element IDs (`computeElementId` + `data-lab-id` runtime in `@lab/ui`) shared by audit + showcase.
- [x] Heuristic extractor (`spec-extract-heuristic.ts`) — composable rules, fully deterministic.
- [x] Per-element verdicts: `pass / regression / needs-approval / new-element`; story rollup picks worst.
- [x] Click-in-preview UX (`ElementOverlay` + `ElementPanel`); element approve roundtrip.
- [x] Optional `LAB_LLM_API_KEY` → ✨ Improve-with-AI button at `/api/specs/extract`.
- [x] Design doc: `docs/superpowers/specs/2026-05-25-element-approval-redesign-design.md`.
- [x] Plan: `docs/superpowers/plans/2026-05-25-element-approval-redesign.md`.

**Validation 2.0**

```bash
pnpm test:specs           # store, element-id, heuristic
pnpm test:specs:server    # spec PUT/GET
pnpm test:specs:llm       # LLM endpoint, mocked
pnpm specs:bootstrap-v2   # seed fresh v2 files
pnpm playground:serve
pnpm test:logic:audit:all # populates elements[], reports per-story verdicts
open http://127.0.0.1:6108/?view=showcase   # designer approves elements
```
```

- [ ] **Step 2: Commit.**

```bash
git add docs/ROADMAP.md
git commit -m "docs(roadmap): update Phase 2.0 for element-approval redesign"
```

---

## Task 5.2: Final regression — all five suites

**Files:** (no edits — verification)

- [ ] **Step 1: Run all unit tests.**

```bash
pnpm test:specs
pnpm test:specs:server
pnpm test:specs:llm
node --experimental-strip-types --test packages/pixel-test/src/logic-audit-verdict.test.ts
```

Expected: every test passes.

- [ ] **Step 2: Run the four visual suites on golden.**

```bash
pnpm test:pixel:golden
pnpm test:figma:golden
pnpm test:figma:live:golden
pnpm test:delivery:golden
```

Expected: each suite's golden subset passes (no regression from the v2 work).

- [ ] **Step 3: Run logic audit on the golden smoke.**

```bash
lsof -ti :6108 | xargs kill 2>/dev/null
node scripts/serve-playground.mjs > /tmp/play.log 2>&1 &
sleep 2
pnpm test:logic:audit
lsof -ti :6108 | xargs kill 2>/dev/null
```

Expected: every story prints `△ NEEDS-APPROVAL · 0/N elements approved`. No regressions, no errors. Designer (you) approves through the showcase next.

- [ ] **Step 4: Refresh portfolio.**

```bash
pnpm test:portfolio:refresh
```

- [ ] **Step 5: Commit if anything was tweaked.**

```bash
git status
# git add -A && git commit -m "chore: post-regression tweaks" (if needed)
```

---

# End of plan

After all tasks: the v2 element-approval flow is fully implemented, tested, and documented. Designer opens the showcase, clicks layers, writes plain English, hits Approve. AI suggestions are heuristic by default and LLM-polished on demand when a key is configured. The audit gates on real per-element approval; regressions and new-elements are detected automatically.
