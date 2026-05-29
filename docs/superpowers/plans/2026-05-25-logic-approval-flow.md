# Logic Approval Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project rule override:** Project rule `Only create commits when requested by the user` overrides the skill's commit-per-task convention. Commit steps below are written as suggested checkpoints — the executor should pause and confirm with the user before running them, OR group several tasks into one commit when the user requests one.

**Spec:** `docs/superpowers/specs/2026-05-25-logic-approval-flow-design.md`

**Goal:** Replace hand-authored component specs with an **infer → propose → human-approve → drift-detect** loop, with the approval gate living in the dev playground showcase.

**Architecture:** Three new modules and a server endpoint:

1. **Spec store** (`packages/contract/src/spec-types.ts` + `packages/pixel-test/src/spec-store.ts`) — read/write/diff `lab-memory/specs/<storyId>.spec.json` files. Single source of truth for spec data shape.
2. **Inference engine** (`packages/pixel-test/src/spec-inference.ts`) — combines TS prop types + Storybook story args + a Playwright DOM walk into a proposed spec.
3. **Showcase editor** (`packages/developer-playground/src/SpecEditor.tsx` + `spec-api.ts`) — inline edit/approve UI in the dev playground, talking to a new write-back endpoint on `serve-playground.mjs`.
4. **Audit integration** (`packages/pixel-test/src/logic-audit.ts`) — verdict becomes `pass | needs-approval | regression | drift`, gated on approved spec presence and behaviour observation.

**Tech Stack:** TypeScript with `node --experimental-strip-types` for scripts and tests. Playwright for DOM walks. React for the showcase UI (Vite build). Native Node `http` for the dev server. Tests use `node --test` and assertion via `node:assert/strict`.

---

## File Structure

**New files:**

```
docs/superpowers/specs/2026-05-25-logic-approval-flow-design.md   (already written)
docs/superpowers/plans/2026-05-25-logic-approval-flow.md          (this file)

lab-memory/specs/                                                 (directory; populated by bootstrap)
  README.md                                                       (vault folder explanation)

packages/contract/src/
  spec-types.ts                                                   (shared types — StorySpec, ProposedSpec, BehaviourSource)

packages/pixel-test/src/
  spec-store.ts                                                   (read/write/diff specs on disk)
  spec-store.test.ts                                              (unit tests)
  spec-inference.ts                                               (inference engine: TS types + args + DOM → ProposedSpec)
  spec-inference.test.ts                                          (unit tests)
  spec-prop-parser.ts                                             (parse TS prop interfaces, exported helper)
  spec-prop-parser.test.ts                                        (unit tests)
  spec-event-namer.ts                                             (auto-name events from DOM labels, exported helper)
  spec-event-namer.test.ts                                        (unit tests)

packages/developer-playground/src/
  SpecEditor.tsx                                                  (the inline editor component)
  SpecPreview.tsx                                                 (JSX-call preview component)
  spec-api.ts                                                     (fetch client for /api/specs)

scripts/
  specs-bootstrap.mjs                                             (one-shot migration from component-specs.ts)
  specs-server.mjs                                                (small reusable spec server, mounted by serve-playground)
  specs-server.test.mjs                                           (integration tests for the endpoints)
```

**Modified files:**

```
packages/contract/src/index.ts                                    (export new spec-types; remove COMPONENT_SPECS export at end of plan)
packages/contract/src/component-specs.ts                          (DELETED at end of plan, after bootstrap consumes it)

packages/pixel-test/src/logic-audit.ts                            (read spec, compute new verdict, write .proposed.json on drift)
packages/pixel-test/src/logic-audit-probes.ts                     (unchanged — already detects source)

packages/developer-playground/src/Showcase.tsx                    (load specs via spec-api; render badge + SpecEditor)
packages/developer-playground/src/showcase.css                    (badge + editor styles)

scripts/serve-playground.mjs                                      (mount specs-server.mjs routes)

package.json                                                      (add: specs:bootstrap, specs:inspect scripts)
```

**Deleted at end of plan:**

```
packages/contract/src/component-specs.ts                          (after bootstrap migration succeeds and showcase reads from disk)
```

---

## Phase 1 — Foundations: spec types + on-disk store

**Goal of phase:** A typed, tested module that can read/write/diff `lab-memory/specs/<storyId>.spec.json` files. No UI, no inference yet. After this phase, `pnpm --filter @lab/pixel-test test:specs:store` passes.

### Task 1.1 — Shared spec types in `@lab/contract`

**Files:**
- Create: `packages/contract/src/spec-types.ts`
- Modify: `packages/contract/src/index.ts`

- [ ] **Step 1: Create the spec types module**

```ts
// packages/contract/src/spec-types.ts
/**
 * Provenance of an interactive behaviour.
 * - `component`: implemented in the component file (React state, controlled inputs, real handlers).
 * - `baseline`:  provided by the @lab/ui design-system runtime (behaviour-baseline.ts).
 */
export type BehaviourSource = "component" | "baseline";

export type SpecStatus = "proposed" | "approved" | "drifted";

export interface SpecPropEntry {
  name: string;
  type: string;
  /** String preview of the default (e.g. `"\"team@lab.dev\""`, `"true"`, `"42"`). */
  default?: string;
  description?: string;
}

export interface SpecEventEntry {
  name: string;
  /** Plain-English description of what triggers this event. */
  trigger: string;
}

export interface SpecBehaviourEntry {
  id: string;
  label: string;
  source: BehaviourSource;
}

export interface StorySpec {
  storyId: string;
  component: string;
  status: SpecStatus;
  approvedAt: string | null;
  approvedBy: string | null;
  specVersion: number;
  intent: string;
  props: SpecPropEntry[];
  events: SpecEventEntry[];
  behaviours: SpecBehaviourEntry[];
}

/** A ProposedSpec is a StorySpec with status frozen at "proposed". */
export type ProposedSpec = Omit<StorySpec, "status" | "approvedAt" | "approvedBy"> & {
  status: "proposed";
  approvedAt: null;
  approvedBy: null;
};

/** Diff between an approved spec and a freshly-proposed spec. */
export interface SpecDelta {
  storyId: string;
  added: { props: SpecPropEntry[]; events: SpecEventEntry[]; behaviours: SpecBehaviourEntry[] };
  removed: { props: SpecPropEntry[]; events: SpecEventEntry[]; behaviours: SpecBehaviourEntry[] };
  changed: Array<{ kind: "prop" | "event" | "behaviour"; name: string; before: unknown; after: unknown }>;
}
```

- [ ] **Step 2: Export from `@lab/contract` index**

Modify `packages/contract/src/index.ts` — add this line near the existing exports:

```ts
export * from "./spec-types";
```

- [ ] **Step 3: Verify the package still type-checks**

Run: `pnpm --filter @lab/contract build`

Expected: exit 0, no new type errors. (Pre-existing MUI type errors in `@lab/ui` are unrelated and acceptable.)

### Task 1.2 — Spec store: read / write / list

**Files:**
- Create: `packages/pixel-test/src/spec-store.ts`
- Create: `packages/pixel-test/src/spec-store.test.ts`
- Modify: `packages/pixel-test/package.json` (add `test:specs` script)

- [ ] **Step 1: Write the failing test**

```ts
// packages/pixel-test/src/spec-store.test.ts
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
    const spec: StorySpec = {
      storyId: "lab-button--primary",
      component: "Button",
      status: "proposed",
      approvedAt: null,
      approvedBy: null,
      specVersion: 1,
      intent: "",
      props: [{ name: "variant", type: "string", default: '"primary"' }],
      events: [],
      behaviours: []
    };
    store.writeSpec(spec);
    const filePath = resolve(vault, "lab-button--primary.spec.json");
    assert.ok(existsSync(filePath));
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as StorySpec;
    assert.equal(parsed.storyId, "lab-button--primary");
    assert.equal(parsed.props[0].name, "variant");
    assert.deepEqual(store.readSpec("lab-button--primary"), spec);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});

test("writeSpec bumps specVersion when content changes", () => {
  const vault = tmpVault();
  try {
    const store = createSpecStore({ vaultDir: vault });
    const base: StorySpec = {
      storyId: "lab-button--primary",
      component: "Button",
      status: "proposed",
      approvedAt: null,
      approvedBy: null,
      specVersion: 1,
      intent: "",
      props: [],
      events: [],
      behaviours: []
    };
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

test("listSpecs returns all .spec.json files in vault", () => {
  const vault = tmpVault();
  try {
    const store = createSpecStore({ vaultDir: vault });
    const spec = (id: string): StorySpec => ({
      storyId: id,
      component: "X",
      status: "proposed",
      approvedAt: null,
      approvedBy: null,
      specVersion: 1,
      intent: "",
      props: [],
      events: [],
      behaviours: []
    });
    store.writeSpec(spec("a--default"));
    store.writeSpec(spec("b--default"));
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
    const initial: StorySpec = {
      storyId: "lab-button--primary",
      component: "Button",
      status: "proposed",
      approvedAt: null,
      approvedBy: null,
      specVersion: 1,
      intent: "",
      props: [],
      events: [],
      behaviours: []
    };
    store.writeSpec(initial);
    const approved = store.setStatus("lab-button--primary", "approved", "showcase");
    assert.equal(approved?.status, "approved");
    assert.equal(approved?.approvedBy, "showcase");
    assert.ok(approved?.approvedAt && approved.approvedAt.endsWith("Z"));
    assert.equal(approved?.specVersion, 2);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lab/pixel-test exec node --experimental-strip-types --test src/spec-store.test.ts`

Expected: FAIL — `spec-store.ts` does not exist yet.

- [ ] **Step 3: Implement `spec-store.ts`**

```ts
// packages/pixel-test/src/spec-store.ts
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync
} from "node:fs";
import { resolve, join } from "node:path";
import type { StorySpec, SpecStatus } from "../../contract/src/spec-types.ts";

export interface SpecStoreOptions {
  /** Absolute path to the vault directory (typically `<repo>/lab-memory/specs`). */
  vaultDir: string;
}

export interface SpecStore {
  readSpec(storyId: string): StorySpec | null;
  writeSpec(spec: StorySpec): StorySpec;
  setStatus(
    storyId: string,
    status: SpecStatus,
    actor: string
  ): StorySpec | null;
  listSpecs(): StorySpec[];
  filePathFor(storyId: string): string;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function structurallyEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createSpecStore(opts: SpecStoreOptions): SpecStore {
  const { vaultDir } = opts;
  ensureDir(vaultDir);

  function filePathFor(storyId: string): string {
    return resolve(vaultDir, `${storyId}.spec.json`);
  }

  function readSpec(storyId: string): StorySpec | null {
    const file = filePathFor(storyId);
    if (!existsSync(file)) return null;
    return readJson<StorySpec>(file);
  }

  function writeSpec(spec: StorySpec): StorySpec {
    ensureDir(vaultDir);
    const file = filePathFor(spec.storyId);
    let next = { ...spec };
    if (existsSync(file)) {
      const prev = readJson<StorySpec>(file);
      // Compare without specVersion — version bumps every time content differs.
      const prevContent = { ...prev, specVersion: 0 };
      const nextContent = { ...next, specVersion: 0 };
      if (!structurallyEqual(prevContent, nextContent)) {
        next = { ...next, specVersion: prev.specVersion + 1 };
      } else {
        next = { ...next, specVersion: prev.specVersion };
      }
    }
    writeJson(file, next);
    return next;
  }

  function setStatus(
    storyId: string,
    status: SpecStatus,
    actor: string
  ): StorySpec | null {
    const current = readSpec(storyId);
    if (!current) return null;
    const next: StorySpec = {
      ...current,
      status,
      approvedAt: status === "approved" ? nowIso() : current.approvedAt,
      approvedBy: status === "approved" ? actor : current.approvedBy
    };
    return writeSpec(next);
  }

  function listSpecs(): StorySpec[] {
    if (!existsSync(vaultDir)) return [];
    const entries = readdirSync(vaultDir);
    const out: StorySpec[] = [];
    for (const name of entries) {
      if (!name.endsWith(".spec.json")) continue;
      const parsed = readJson<StorySpec>(join(vaultDir, name));
      out.push(parsed);
    }
    return out;
  }

  return { readSpec, writeSpec, setStatus, listSpecs, filePathFor };
}
```

- [ ] **Step 4: Add the test script to `packages/pixel-test/package.json`**

Insert the `test:specs` script into the `"scripts"` block:

```jsonc
{
  "scripts": {
    // ... existing scripts
    "test:specs": "node --experimental-strip-types --test src/spec-store.test.ts src/spec-inference.test.ts src/spec-prop-parser.test.ts src/spec-event-namer.test.ts"
  }
}
```

(The test files for inference / prop-parser / event-namer don't exist yet — that's fine, `node --test` ignores missing files individually. Verify by listing what's matched at run time.)

- [ ] **Step 5: Run test to verify pass**

Run: `pnpm --filter @lab/pixel-test exec node --experimental-strip-types --test src/spec-store.test.ts`

Expected: 5 tests pass.

- [ ] **Step 6: Optional commit checkpoint**

If user has requested commits, group the spec types + store into one commit:

```bash
git add packages/contract/src/spec-types.ts packages/contract/src/index.ts \
        packages/pixel-test/src/spec-store.ts packages/pixel-test/src/spec-store.test.ts \
        packages/pixel-test/package.json
git commit -m "feat(specs): add typed spec model and on-disk store"
```

### Task 1.3 — Spec diff helper (used later by drift detection)

**Files:**
- Modify: `packages/pixel-test/src/spec-store.ts` (add `diffSpecs` export)
- Modify: `packages/pixel-test/src/spec-store.test.ts` (add tests)

- [ ] **Step 1: Write the failing test (append to `spec-store.test.ts`)**

```ts
import { diffSpecs } from "./spec-store.ts";

test("diffSpecs reports no changes for equal specs", () => {
  const base: StorySpec = {
    storyId: "x",
    component: "X",
    status: "approved",
    approvedAt: "2026-05-25T00:00:00.000Z",
    approvedBy: "showcase",
    specVersion: 1,
    intent: "",
    props: [{ name: "a", type: "string" }],
    events: [{ name: "onClick", trigger: "click" }],
    behaviours: [{ id: "b1", label: "L", source: "component" }]
  };
  const delta = diffSpecs(base, base);
  assert.equal(delta.added.props.length, 0);
  assert.equal(delta.removed.props.length, 0);
  assert.equal(delta.changed.length, 0);
});

test("diffSpecs detects added and removed props", () => {
  const before: StorySpec = {
    storyId: "x",
    component: "X",
    status: "approved",
    approvedAt: null,
    approvedBy: null,
    specVersion: 1,
    intent: "",
    props: [{ name: "a", type: "string" }],
    events: [],
    behaviours: []
  };
  const after: StorySpec = {
    ...before,
    props: [{ name: "b", type: "number" }]
  };
  const delta = diffSpecs(before, after);
  assert.equal(delta.added.props[0].name, "b");
  assert.equal(delta.removed.props[0].name, "a");
});

test("diffSpecs detects changed prop type", () => {
  const before: StorySpec = {
    storyId: "x", component: "X", status: "approved",
    approvedAt: null, approvedBy: null, specVersion: 1, intent: "",
    props: [{ name: "a", type: "string" }], events: [], behaviours: []
  };
  const after: StorySpec = {
    ...before,
    props: [{ name: "a", type: "number" }]
  };
  const delta = diffSpecs(before, after);
  assert.equal(delta.changed.length, 1);
  assert.equal(delta.changed[0].kind, "prop");
  assert.equal(delta.changed[0].name, "a");
});
```

- [ ] **Step 2: Add `diffSpecs` to `spec-store.ts`**

Append to `packages/pixel-test/src/spec-store.ts`:

```ts
import type { SpecDelta, SpecPropEntry, SpecEventEntry, SpecBehaviourEntry } from "../../contract/src/spec-types.ts";

type NamedEntry =
  | { kind: "prop";      entry: SpecPropEntry }
  | { kind: "event";     entry: SpecEventEntry }
  | { kind: "behaviour"; entry: SpecBehaviourEntry };

function byName<T extends { name?: string; id?: string }>(arr: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const item of arr) {
    const key = (item.name ?? item.id) as string;
    m.set(key, item);
  }
  return m;
}

export function diffSpecs(before: StorySpec, after: StorySpec): SpecDelta {
  const delta: SpecDelta = {
    storyId: after.storyId,
    added: { props: [], events: [], behaviours: [] },
    removed: { props: [], events: [], behaviours: [] },
    changed: []
  };

  const beforeProps = byName(before.props);
  const afterProps = byName(after.props);
  for (const [name, entry] of afterProps) {
    const prev = beforeProps.get(name);
    if (!prev) delta.added.props.push(entry);
    else if (JSON.stringify(prev) !== JSON.stringify(entry)) {
      delta.changed.push({ kind: "prop", name, before: prev, after: entry });
    }
  }
  for (const [name, entry] of beforeProps) {
    if (!afterProps.has(name)) delta.removed.props.push(entry);
  }

  const beforeEvents = byName(before.events);
  const afterEvents = byName(after.events);
  for (const [name, entry] of afterEvents) {
    const prev = beforeEvents.get(name);
    if (!prev) delta.added.events.push(entry);
    else if (JSON.stringify(prev) !== JSON.stringify(entry)) {
      delta.changed.push({ kind: "event", name, before: prev, after: entry });
    }
  }
  for (const [name, entry] of beforeEvents) {
    if (!afterEvents.has(name)) delta.removed.events.push(entry);
  }

  const beforeBehs = byName(before.behaviours);
  const afterBehs = byName(after.behaviours);
  for (const [id, entry] of afterBehs) {
    const prev = beforeBehs.get(id);
    if (!prev) delta.added.behaviours.push(entry);
    else if (JSON.stringify(prev) !== JSON.stringify(entry)) {
      delta.changed.push({ kind: "behaviour", name: id, before: prev, after: entry });
    }
  }
  for (const [id, entry] of beforeBehs) {
    if (!afterBehs.has(id)) delta.removed.behaviours.push(entry);
  }

  return delta;
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @lab/pixel-test exec node --experimental-strip-types --test src/spec-store.test.ts`

Expected: all 8 tests pass.

---

## Phase 2 — Inference engine: TS types + Storybook args + DOM walk → ProposedSpec

**Goal of phase:** Given a story id and a Playwright page rendering it, produce a `ProposedSpec`. Tested against fixture HTML + fixture TS source. After this phase, `pnpm --filter @lab/pixel-test test:specs` passes including inference tests.

### Task 2.1 — Event name generator

**Files:**
- Create: `packages/pixel-test/src/spec-event-namer.ts`
- Create: `packages/pixel-test/src/spec-event-namer.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/pixel-test/src/spec-event-namer.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { nameEventFromDom } from "./spec-event-namer.ts";

test("button text 'Login' → onLoginClicked", () => {
  assert.equal(
    nameEventFromDom({ tag: "button", text: "Login" }),
    "onLoginClicked"
  );
});

test("button text 'Continue with Google' → onContinueWithGoogleClicked", () => {
  assert.equal(
    nameEventFromDom({ tag: "button", text: "Continue with Google" }),
    "onContinueWithGoogleClicked"
  );
});

test("input[type=email] → onEmailChanged via aria-label", () => {
  assert.equal(
    nameEventFromDom({ tag: "input", type: "email", ariaLabel: "Email" }),
    "onEmailChanged"
  );
});

test("input[type=password] → onPasswordChanged via type", () => {
  assert.equal(
    nameEventFromDom({ tag: "input", type: "password" }),
    "onPasswordChanged"
  );
});

test("button with no text or label → onAction1Clicked with collision index", () => {
  assert.equal(
    nameEventFromDom({ tag: "button", collisionIndex: 1 }),
    "onAction1Clicked"
  );
});

test("non-ascii / punctuation stripped: 'Sign in (free)' → onSignInFreeClicked", () => {
  assert.equal(
    nameEventFromDom({ tag: "button", text: "Sign in (free)" }),
    "onSignInFreeClicked"
  );
});

test("role=tab text 'Activity' → onActivityClicked", () => {
  assert.equal(
    nameEventFromDom({ tag: "div", role: "tab", text: "Activity" }),
    "onActivityClicked"
  );
});

test("checkbox input → onCheckedChanged", () => {
  assert.equal(
    nameEventFromDom({ tag: "input", type: "checkbox", ariaLabel: "Receive updates" }),
    "onReceiveUpdatesChanged"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lab/pixel-test exec node --experimental-strip-types --test src/spec-event-namer.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `spec-event-namer.ts`**

```ts
// packages/pixel-test/src/spec-event-namer.ts
export interface DomLabel {
  tag: string;
  /** e.g. "button" tag, "input" type, "div" with role="tab". */
  role?: string;
  type?: string;
  text?: string;
  ariaLabel?: string;
  /** When multiple controls collide on the same generated name, the namer uses this 1-based index. */
  collisionIndex?: number;
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

const TYPING_TYPES = new Set(["text", "email", "password", "search", "tel", "url", "number", ""]);

function isTypingInput(label: DomLabel): boolean {
  if (label.tag !== "input" && label.tag !== "textarea") return false;
  if (label.tag === "textarea") return true;
  return TYPING_TYPES.has((label.type ?? "").toLowerCase());
}

function isCheckboxLike(label: DomLabel): boolean {
  return (
    label.tag === "input" &&
    (label.type === "checkbox" || label.type === "radio")
  );
}

export function nameEventFromDom(label: DomLabel): string {
  const role = label.role ?? label.tag;

  if (isTypingInput(label)) {
    const semantic = label.ariaLabel || label.type || "value";
    return `on${pascalize(semantic)}Changed`;
  }

  if (isCheckboxLike(label)) {
    const semantic = label.ariaLabel || label.type || "checked";
    return `on${pascalize(semantic)}Changed`;
  }

  // Click-like: buttons, tabs, role=button, links
  const labelText = (label.text ?? label.ariaLabel ?? "").trim();
  if (labelText) {
    return `on${pascalize(labelText)}Clicked`;
  }

  const idx = label.collisionIndex ?? 1;
  return `onAction${idx}Clicked`;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @lab/pixel-test exec node --experimental-strip-types --test src/spec-event-namer.test.ts`

Expected: all 8 tests pass.

### Task 2.2 — TypeScript prop parser

**Files:**
- Create: `packages/pixel-test/src/spec-prop-parser.ts`
- Create: `packages/pixel-test/src/spec-prop-parser.test.ts`

The parser uses a regex-based extractor (not the TS compiler API). This is a deliberate YAGNI choice: every component file in this repo follows the same `type FooProps = { ... }` pattern. If the codebase later adopts interface-based or extended types, we revisit with the TS compiler API.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/pixel-test/src/spec-prop-parser.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseComponentProps } from "./spec-prop-parser.ts";

const BUTTON_SRC = `
import React from "react";

type ButtonProps = {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  iconLeft?: boolean;
  iconRight?: boolean;
  children?: React.ReactNode;
};

export function Button({ variant = "primary", size = "md" }: ButtonProps) {
  return <button>x</button>;
}
`;

test("extracts prop names and types from a Props type alias", () => {
  const props = parseComponentProps(BUTTON_SRC, "Button");
  assert.equal(props.length, 5);
  assert.equal(props[0].name, "variant");
  assert.equal(props[0].type, '"primary" | "secondary" | "danger" | "ghost"');
  assert.equal(props[2].name, "iconLeft");
  assert.equal(props[2].type, "boolean");
});

test("defaults read from destructured signature with literal values", () => {
  const props = parseComponentProps(BUTTON_SRC, "Button");
  const variant = props.find((p) => p.name === "variant");
  assert.equal(variant?.default, '"primary"');
  const size = props.find((p) => p.name === "size");
  assert.equal(size?.default, '"md"');
  const iconLeft = props.find((p) => p.name === "iconLeft");
  assert.equal(iconLeft?.default, undefined);
});

test("returns empty array when the type alias is missing", () => {
  const props = parseComponentProps("export function Nothing() {}", "Nothing");
  assert.deepEqual(props, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lab/pixel-test exec node --experimental-strip-types --test src/spec-prop-parser.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `spec-prop-parser.ts`**

```ts
// packages/pixel-test/src/spec-prop-parser.ts
import type { SpecPropEntry } from "../../contract/src/spec-types.ts";

/**
 * Extract props from a component source file. Looks for either:
 *   type <Component>Props = { ... };
 *   interface <Component>Props { ... }
 *
 * For defaults, scans the component function signature for destructured
 * params with `name = literal` patterns. This covers every component in the
 * repo today; switch to the TS compiler API only if components start using
 * extended or imported prop types.
 */
export function parseComponentProps(
  source: string,
  componentName: string
): SpecPropEntry[] {
  const propsTypeMatch =
    matchTypeAlias(source, componentName) ?? matchInterface(source, componentName);
  if (!propsTypeMatch) return [];

  const fields = parseFields(propsTypeMatch);
  const defaults = parseDestructuredDefaults(source, componentName);
  return fields.map((f) => ({
    name: f.name,
    type: f.type,
    default: defaults.get(f.name)
  }));
}

function matchTypeAlias(source: string, component: string): string | null {
  const pattern = new RegExp(
    `type\\s+${component}Props\\s*=\\s*\\{([\\s\\S]*?)\\n\\}\\s*;?`,
    "m"
  );
  const m = source.match(pattern);
  return m ? m[1] : null;
}

function matchInterface(source: string, component: string): string | null {
  const pattern = new RegExp(
    `interface\\s+${component}Props\\s*\\{([\\s\\S]*?)\\n\\}`,
    "m"
  );
  const m = source.match(pattern);
  return m ? m[1] : null;
}

interface ParsedField {
  name: string;
  type: string;
}

function parseFields(body: string): ParsedField[] {
  const lines = body
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter(Boolean);

  const out: ParsedField[] = [];
  for (const line of lines) {
    // Match  `name?: type;`  or  `name: type;`  or trailing `,`
    const m = line.match(/^(\w+)\??:\s*(.+?)[;,]?$/);
    if (!m) continue;
    out.push({ name: m[1], type: m[2].trim() });
  }
  return out;
}

function parseDestructuredDefaults(
  source: string,
  component: string
): Map<string, string> {
  const defaults = new Map<string, string>();
  // Find `export function <Name>(` or `function <Name>(` and capture the destructured signature body.
  const sigPattern = new RegExp(
    `function\\s+${component}\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*:`,
    "m"
  );
  const m = source.match(sigPattern);
  if (!m) return defaults;
  const block = m[1];
  // Match each `name = default,` pair. default is everything until the next top-level `,` or end of block.
  const partPattern = /(\w+)\s*=\s*([^,]+?)(?=,|$)/g;
  let part: RegExpExecArray | null;
  while ((part = partPattern.exec(block)) !== null) {
    defaults.set(part[1], part[2].trim());
  }
  return defaults;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @lab/pixel-test exec node --experimental-strip-types --test src/spec-prop-parser.test.ts`

Expected: 3 tests pass.

### Task 2.3 — Inference engine (orchestrator)

**Files:**
- Create: `packages/pixel-test/src/spec-inference.ts`
- Create: `packages/pixel-test/src/spec-inference.test.ts`

The inference engine combines three signals: prop-parser output, Storybook story args (looked up in `DEV_STORIES` from `@lab/contract`), and a DOM walk (passed in as data, not executed here — keeps unit tests fast and pure).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/pixel-test/src/spec-inference.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { inferProposedSpec } from "./spec-inference.ts";

const BUTTON_SRC = `
import React from "react";
type ButtonProps = {
  variant?: "primary" | "secondary";
  children?: React.ReactNode;
};
export function Button({ variant = "primary" }: ButtonProps) { return <button>x</button>; }
`;

test("inferProposedSpec for a Button story", () => {
  const proposed = inferProposedSpec({
    storyId: "lab-button--primary",
    component: "Button",
    componentSource: BUTTON_SRC,
    storyArgs: { variant: "primary", children: "Primary" },
    domControls: [
      {
        tag: "button",
        role: "",
        text: "Primary",
        ariaLabel: "",
        type: "",
        pressedSource: "baseline"
      }
    ]
  });
  assert.equal(proposed.storyId, "lab-button--primary");
  assert.equal(proposed.component, "Button");
  assert.equal(proposed.status, "proposed");
  assert.equal(proposed.specVersion, 1);
  const variant = proposed.props.find((p) => p.name === "variant");
  assert.equal(variant?.default, '"primary"');
  const event = proposed.events[0];
  assert.equal(event.name, "onPrimaryClicked");
  const behaviour = proposed.behaviours.find((b) => b.id === "press-toggle");
  assert.equal(behaviour?.source, "baseline");
});

test("inferProposedSpec dedupes event names by collision index", () => {
  const proposed = inferProposedSpec({
    storyId: "x",
    component: "X",
    componentSource: "",
    storyArgs: {},
    domControls: [
      { tag: "button", role: "", text: "Save", ariaLabel: "", type: "", pressedSource: null },
      { tag: "button", role: "", text: "Save", ariaLabel: "", type: "", pressedSource: null }
    ]
  });
  assert.equal(proposed.events[0].name, "onSaveClicked");
  assert.equal(proposed.events[1].name, "onSaveClicked_2");
});

test("inferProposedSpec returns empty events for a static-only story", () => {
  const proposed = inferProposedSpec({
    storyId: "lab-loadingstates--card-skeleton",
    component: "LoadingStates",
    componentSource: "",
    storyArgs: {},
    domControls: []
  });
  assert.deepEqual(proposed.events, []);
  assert.deepEqual(proposed.behaviours, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lab/pixel-test exec node --experimental-strip-types --test src/spec-inference.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `spec-inference.ts`**

```ts
// packages/pixel-test/src/spec-inference.ts
import type {
  ProposedSpec,
  SpecPropEntry,
  SpecEventEntry,
  SpecBehaviourEntry
} from "../../contract/src/spec-types.ts";
import { parseComponentProps } from "./spec-prop-parser.ts";
import { nameEventFromDom } from "./spec-event-namer.ts";

export interface InferenceDomControl {
  tag: string;
  role: string;
  text: string;
  ariaLabel: string;
  type: string;
  /** "baseline" if the control was stamped by the @lab/ui baseline runtime, else null. */
  pressedSource: "baseline" | null;
}

export interface InferenceInput {
  storyId: string;
  component: string;
  /** Full text of the component source file (used to extract prop types). */
  componentSource: string;
  /** Storybook story.args record (used to fill defaults for data props). */
  storyArgs: Record<string, unknown>;
  domControls: InferenceDomControl[];
}

function jsonLiteral(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

function propsFromSource(
  source: string,
  componentName: string,
  args: Record<string, unknown>
): SpecPropEntry[] {
  const parsed = parseComponentProps(source, componentName);
  // Story args override TS defaults for the per-story preview signature.
  return parsed.map((p) => {
    const override = args[p.name];
    return {
      name: p.name,
      type: p.type,
      default: override !== undefined ? jsonLiteral(override) : p.default
    };
  });
}

function eventsFromControls(controls: InferenceDomControl[]): SpecEventEntry[] {
  const counts = new Map<string, number>();
  const out: SpecEventEntry[] = [];
  for (const c of controls) {
    const baseName = nameEventFromDom({
      tag: c.tag,
      role: c.role,
      text: c.text,
      ariaLabel: c.ariaLabel,
      type: c.type
    });
    const seen = counts.get(baseName) ?? 0;
    counts.set(baseName, seen + 1);
    const name = seen === 0 ? baseName : `${baseName}_${seen + 1}`;
    out.push({
      name,
      trigger: triggerDescription(c)
    });
  }
  return out;
}

function triggerDescription(c: InferenceDomControl): string {
  if (c.tag === "input" || c.tag === "textarea") {
    const label = c.ariaLabel || c.type || c.tag;
    return `user types in ${label} input`;
  }
  const label = c.text || c.ariaLabel || c.role || c.tag;
  return `click ${label}`;
}

function behavioursFromControls(controls: InferenceDomControl[]): SpecBehaviourEntry[] {
  if (controls.length === 0) return [];
  const out: SpecBehaviourEntry[] = [];
  const baselineCount = controls.filter((c) => c.pressedSource === "baseline").length;
  if (baselineCount > 0) {
    out.push({
      id: "press-toggle",
      label: `${baselineCount === 1 ? "1 button toggles" : `${baselineCount} buttons toggle`} pressed on click`,
      source: "baseline"
    });
  }
  return out;
}

export function inferProposedSpec(input: InferenceInput): ProposedSpec {
  const props = propsFromSource(input.componentSource, input.component, input.storyArgs);
  const events = eventsFromControls(input.domControls);
  const behaviours = behavioursFromControls(input.domControls);
  return {
    storyId: input.storyId,
    component: input.component,
    status: "proposed",
    approvedAt: null,
    approvedBy: null,
    specVersion: 1,
    intent: "",
    props,
    events,
    behaviours
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @lab/pixel-test exec node --experimental-strip-types --test src/spec-inference.test.ts`

Expected: 3 tests pass.

- [ ] **Step 5: Run full Phase 1 + 2 test suite**

Run: `pnpm --filter @lab/pixel-test test:specs`

Expected: all 4 test files pass (~14 tests total).

- [ ] **Step 6: Optional commit checkpoint**

```bash
git add packages/pixel-test/src/spec-event-namer.ts packages/pixel-test/src/spec-event-namer.test.ts \
        packages/pixel-test/src/spec-prop-parser.ts packages/pixel-test/src/spec-prop-parser.test.ts \
        packages/pixel-test/src/spec-inference.ts packages/pixel-test/src/spec-inference.test.ts
git commit -m "feat(specs): inference engine — props + events + behaviours from DOM"
```

---

## Phase 3 — Bootstrap migration: seed `lab-memory/specs/` from `component-specs.ts`

**Goal of phase:** A one-shot script that converts every hand-authored `ComponentSpec` into a per-story `.spec.json` with `status: "proposed"`. After this phase, running `pnpm specs:bootstrap` populates `lab-memory/specs/` with 48 files and the showcase + audit can read from them. The hand-authored TS file is deleted at the END of the plan (Phase 7), not here — we keep it as a fallback during integration.

### Task 3.1 — `scripts/specs-bootstrap.mjs`

**Files:**
- Create: `scripts/specs-bootstrap.mjs`
- Create: `lab-memory/specs/README.md`
- Modify: `package.json` (add `specs:bootstrap` script)

- [ ] **Step 1: Create the vault folder readme**

```md
<!-- lab-memory/specs/README.md -->
# Story specs

One file per story (`<storyId>.spec.json`). Source of truth for what each
story's component is supposed to do. Edited via the dev playground showcase
(approve / drift re-approve flow); hand-editable as an escape hatch.

See `docs/superpowers/specs/2026-05-25-logic-approval-flow-design.md` for the model.

Drift sidecars (`<storyId>.proposed.json`) appear when the audit detects new
controls or behaviours that aren't in the approved spec; remove them by
re-approving in the showcase.
```

- [ ] **Step 2: Implement the bootstrap script**

```js
#!/usr/bin/env node
// scripts/specs-bootstrap.mjs
// One-shot migration: seeds lab-memory/specs/<storyId>.spec.json from the
// hand-authored COMPONENT_SPECS in packages/contract/src/component-specs.ts.
// Status is "proposed" — human still has to approve each story in the
// showcase. Re-running is idempotent: existing files are skipped unless
// `--force` is passed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
const vaultDir = resolve(repoRoot, "lab-memory/specs");
const force = process.argv.includes("--force");

if (!existsSync(vaultDir)) mkdirSync(vaultDir, { recursive: true });

const { DEV_STORIES } = await import(
  resolve(repoRoot, "packages/contract/src/stories.ts")
);
const { COMPONENT_SPECS } = await import(
  resolve(repoRoot, "packages/contract/src/component-specs.ts")
);

let written = 0;
let skipped = 0;
let missingSpec = 0;

for (const entry of DEV_STORIES) {
  const target = resolve(vaultDir, `${entry.id}.spec.json`);
  if (existsSync(target) && !force) {
    skipped += 1;
    continue;
  }
  const spec = COMPONENT_SPECS[entry.component];
  if (!spec) {
    missingSpec += 1;
    continue;
  }
  const out = {
    storyId: entry.id,
    component: entry.component,
    status: "proposed",
    approvedAt: null,
    approvedBy: null,
    specVersion: 1,
    intent: spec.summary ?? "",
    props: (spec.props ?? []).map((p) => ({
      name: p.name,
      type: p.type,
      default:
        entry.args && entry.args[p.name] !== undefined
          ? JSON.stringify(entry.args[p.name])
          : p.default ?? undefined,
      description: p.description ?? undefined
    })),
    events: (spec.events ?? []).map((e) => ({
      name: e.name,
      trigger: e.description ?? e.signature ?? ""
    })),
    behaviours: (spec.behaviours ?? []).map((b) => ({
      id: b.id,
      label: `${b.trigger} → ${b.effect}`,
      source: b.source ?? "component"
    }))
  };
  writeFileSync(target, JSON.stringify(out, null, 2) + "\n", "utf8");
  written += 1;
}

console.log(`✓ specs bootstrap: ${written} written, ${skipped} skipped, ${missingSpec} missing`);
console.log(`  → ${vaultDir}`);
if (force) console.log(`  (--force: overwrote existing files)`);
```

- [ ] **Step 3: Add the script to `package.json`**

Insert at the appropriate alphabetical spot in `"scripts"`:

```jsonc
"specs:bootstrap": "node scripts/specs-bootstrap.mjs",
"specs:bootstrap:force": "node scripts/specs-bootstrap.mjs --force"
```

- [ ] **Step 4: Run the bootstrap**

Run: `pnpm specs:bootstrap`

Expected output: `✓ specs bootstrap: 48 written, 0 skipped, X missing` (X = number of `DEV_STORIES` entries whose component has no entry in `COMPONENT_SPECS`; should be 0 if the hand-authored file is complete).

- [ ] **Step 5: Inspect a few generated files**

```bash
ls lab-memory/specs/*.spec.json | head -5
cat lab-memory/specs/lab-loginpage--default.spec.json
```

Expected: file exists with `status: "proposed"` and props/events/behaviours seeded from the hand-authored spec.

- [ ] **Step 6: Verify idempotency**

Run: `pnpm specs:bootstrap`

Expected: `0 written, 48 skipped, 0 missing`.

- [ ] **Step 7: Optional commit checkpoint**

```bash
git add scripts/specs-bootstrap.mjs lab-memory/specs/README.md lab-memory/specs/*.spec.json package.json
git commit -m "feat(specs): bootstrap 48 stories with proposed specs from hand-authored seeds"
```

---

## Phase 4 — Dev server endpoints: `/api/specs/...`

**Goal of phase:** A reusable spec-server module (Node, vanilla `http`) that handles GET/PUT for individual specs and a list endpoint. Mounted by `serve-playground.mjs` so the showcase can read/write specs in dev mode. After this phase, `curl http://127.0.0.1:6108/api/specs/lab-button--primary` returns the spec JSON and PUT writes it.

### Task 4.1 — Spec server module

**Files:**
- Create: `scripts/specs-server.mjs`
- Create: `scripts/specs-server.test.mjs`
- Modify: `package.json` (add `test:specs:server` script)

- [ ] **Step 1: Write failing integration tests**

```js
// scripts/specs-server.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createSpecRoutes } from "./specs-server.mjs";

function startServer(vaultDir) {
  const routes = createSpecRoutes({ vaultDir });
  const server = createServer((req, res) => {
    if (routes.matches(req)) {
      routes.handle(req, res);
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolveServer({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r))
      });
    });
  });
}

async function jsonRequest(url, init = {}) {
  const res = await fetch(url, init);
  const body = res.status === 204 ? null : await res.text();
  return { status: res.status, body: body ? JSON.parse(body) : null };
}

test("GET unknown spec returns 404", async () => {
  const vault = mkdtempSync(join(tmpdir(), "spec-server-"));
  const server = await startServer(vault);
  try {
    const res = await fetch(`${server.url}/api/specs/lab-nothing--here`);
    assert.equal(res.status, 404);
  } finally {
    await server.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("PUT then GET roundtrip", async () => {
  const vault = mkdtempSync(join(tmpdir(), "spec-server-"));
  const server = await startServer(vault);
  try {
    const spec = {
      storyId: "lab-x--y",
      component: "X",
      status: "proposed",
      approvedAt: null,
      approvedBy: null,
      specVersion: 1,
      intent: "",
      props: [],
      events: [],
      behaviours: []
    };
    const put = await jsonRequest(`${server.url}/api/specs/lab-x--y`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec)
    });
    assert.equal(put.status, 200);
    assert.equal(put.body.storyId, "lab-x--y");
    assert.ok(existsSync(resolve(vault, "lab-x--y.spec.json")));

    const get = await jsonRequest(`${server.url}/api/specs/lab-x--y`);
    assert.equal(get.status, 200);
    assert.equal(get.body.storyId, "lab-x--y");
  } finally {
    await server.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("PUT with mismatched storyId returns 400", async () => {
  const vault = mkdtempSync(join(tmpdir(), "spec-server-"));
  const server = await startServer(vault);
  try {
    const res = await fetch(`${server.url}/api/specs/lab-x--y`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storyId: "lab-other--story", component: "X" })
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("GET /api/specs returns list of all specs", async () => {
  const vault = mkdtempSync(join(tmpdir(), "spec-server-"));
  const server = await startServer(vault);
  try {
    for (const id of ["a--default", "b--default"]) {
      await fetch(`${server.url}/api/specs/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storyId: id, component: id, status: "proposed",
          approvedAt: null, approvedBy: null, specVersion: 1,
          intent: "", props: [], events: [], behaviours: []
        })
      });
    }
    const list = await jsonRequest(`${server.url}/api/specs`);
    assert.equal(list.status, 200);
    const ids = list.body.specs.map((s) => s.storyId).sort();
    assert.deepEqual(ids, ["a--default", "b--default"]);
  } finally {
    await server.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("PUT rejects non-JSON body with 400", async () => {
  const vault = mkdtempSync(join(tmpdir(), "spec-server-"));
  const server = await startServer(vault);
  try {
    const res = await fetch(`${server.url}/api/specs/lab-x--y`, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: "not json"
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
    rmSync(vault, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/specs-server.test.mjs`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `specs-server.mjs`**

```js
// scripts/specs-server.mjs
// Mountable spec routes. The owning HTTP server detects matching requests
// via `routes.matches(req)` and forwards them to `routes.handle(req, res)`.
// Vanilla Node, no deps. Returns JSON; only listens on localhost in the
// calling server.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const API_PREFIX = "/api/specs";

export function createSpecRoutes({ vaultDir }) {
  if (!existsSync(vaultDir)) mkdirSync(vaultDir, { recursive: true });

  function filePathFor(storyId) {
    return resolve(vaultDir, `${storyId}.spec.json`);
  }

  function readSpec(storyId) {
    const file = filePathFor(storyId);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8"));
  }

  function writeSpec(spec) {
    writeFileSync(filePathFor(spec.storyId), JSON.stringify(spec, null, 2) + "\n", "utf8");
  }

  function listSpecs() {
    if (!existsSync(vaultDir)) return [];
    return readdirSync(vaultDir)
      .filter((n) => n.endsWith(".spec.json"))
      .map((n) => JSON.parse(readFileSync(join(vaultDir, n), "utf8")));
  }

  function matches(req) {
    return (req.url ?? "").startsWith(API_PREFIX);
  }

  async function readJsonBody(req) {
    const ct = (req.headers["content-type"] ?? "").toLowerCase();
    if (!ct.startsWith("application/json")) {
      const err = new Error("Content-Type must be application/json");
      err.statusCode = 400;
      throw err;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    try {
      return JSON.parse(raw);
    } catch {
      const err = new Error("Malformed JSON body");
      err.statusCode = 400;
      throw err;
    }
  }

  function sendJson(res, status, body) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify(body));
  }

  function bumpSpecVersionIfChanged(prev, next) {
    if (!prev) return { ...next, specVersion: next.specVersion ?? 1 };
    const compare = (s) => ({ ...s, specVersion: 0 });
    const changed = JSON.stringify(compare(prev)) !== JSON.stringify(compare(next));
    return { ...next, specVersion: changed ? prev.specVersion + 1 : prev.specVersion };
  }

  async function handle(req, res) {
    try {
      const url = req.url ?? "";
      // GET /api/specs  → list
      if (url === API_PREFIX && req.method === "GET") {
        sendJson(res, 200, { specs: listSpecs() });
        return;
      }
      // GET /api/specs/<storyId>  → read one
      const m = url.match(/^\/api\/specs\/([^/?]+)$/);
      if (m && req.method === "GET") {
        const spec = readSpec(decodeURIComponent(m[1]));
        if (!spec) {
          sendJson(res, 404, { error: "spec not found", storyId: m[1] });
          return;
        }
        sendJson(res, 200, spec);
        return;
      }
      // PUT /api/specs/<storyId>  → write
      if (m && req.method === "PUT") {
        const storyId = decodeURIComponent(m[1]);
        const body = await readJsonBody(req);
        if (body.storyId !== storyId) {
          sendJson(res, 400, {
            error: "storyId in URL does not match body",
            urlStoryId: storyId,
            bodyStoryId: body.storyId
          });
          return;
        }
        const prev = readSpec(storyId);
        const merged = bumpSpecVersionIfChanged(prev, body);
        if (merged.status === "approved" && !merged.approvedAt) {
          merged.approvedAt = new Date().toISOString();
          merged.approvedBy = merged.approvedBy ?? "showcase";
        }
        writeSpec(merged);
        sendJson(res, 200, merged);
        return;
      }
      sendJson(res, 404, { error: "no route", url, method: req.method });
    } catch (err) {
      const status = err.statusCode ?? 500;
      sendJson(res, status, { error: err.message ?? "internal" });
    }
  }

  return { matches, handle };
}
```

- [ ] **Step 4: Add the test script and run tests**

Add to root `package.json` `"scripts"`:

```jsonc
"test:specs:server": "node --test scripts/specs-server.test.mjs"
```

Run: `pnpm test:specs:server`

Expected: 5 tests pass.

### Task 4.2 — Mount spec routes on `serve-playground.mjs`

**Files:**
- Modify: `scripts/serve-playground.mjs`

- [ ] **Step 1: Import and mount the routes**

Replace the existing imports + `server.on("request", ...)` block with:

```js
#!/usr/bin/env node
/**
 * Serve the built developer playground (`packages/developer-playground/dist/`)
 * on port 6108 — used by the delivery pixel-diff harness AND the inline
 * spec approval flow. Spec routes are mounted at /api/specs.
 */

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { createSpecRoutes } from "./specs-server.mjs";

const PORT = Number(process.env.PLAYGROUND_PORT ?? 6108);
const ROOT = resolve(process.cwd(), "packages/developer-playground/dist");
const VAULT = resolve(process.cwd(), "lab-memory/specs");

if (!existsSync(join(ROOT, "index.html"))) {
  console.error(
    `\n✗ No playground build found at ${ROOT}\n` +
      `  Build it first:\n` +
      `      pnpm playground:build\n`
  );
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const specRoutes = createSpecRoutes({ vaultDir: VAULT });
const server = createServer();

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`\n✗ Port ${PORT} is already in use.\n`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

server.on("request", async (req, res) => {
  if (specRoutes.matches(req)) {
    await specRoutes.handle(req, res);
    return;
  }
  try {
    const url = new URL(req.url ?? "/", "http://x");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const resolved = resolve(ROOT, "." + pathname);
    if (!resolved.startsWith(ROOT + sep) && resolved !== ROOT) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    const mime = MIME[extname(resolved).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime, "Access-Control-Allow-Origin": "*" });
    createReadStream(resolved).pipe(res);
  } catch (err) {
    res.writeHead(500).end(err instanceof Error ? err.message : "Error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`✓ Developer playground served from ${ROOT}`);
  console.log(`  → http://127.0.0.1:${PORT}/?view=showcase  (approve specs inline)`);
  console.log(`  → http://127.0.0.1:${PORT}/api/specs       (spec inventory JSON)`);
});
```

- [ ] **Step 2: Smoke-test manually**

In one terminal: `pnpm playground:serve`

In another:
```bash
curl -s http://127.0.0.1:6108/api/specs/lab-button--primary | head -20
```

Expected: JSON of the spec written in Phase 3.

```bash
curl -s http://127.0.0.1:6108/api/specs | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["specs"]))'
```

Expected: `48` (or however many were bootstrapped).

- [ ] **Step 3: Stop the playground server (Ctrl-C in the first terminal).**

- [ ] **Step 4: Optional commit checkpoint**

```bash
git add scripts/specs-server.mjs scripts/specs-server.test.mjs scripts/serve-playground.mjs package.json
git commit -m "feat(specs): dev server endpoints /api/specs for inline approval"
```

---

## Phase 5 — Showcase editor: badges, inline edit, approve, write-back

**Goal of phase:** Each story card in the showcase shows a status badge and an editable spec panel. User can edit props/events/behaviours/intent and click Approve. After approval, the spec file on disk has `status: "approved"`. After this phase, the human goes through the showcase once to approve all 48 stories.

### Task 5.1 — Spec API client

**Files:**
- Create: `packages/developer-playground/src/spec-api.ts`

- [ ] **Step 1: Implement the client**

```ts
// packages/developer-playground/src/spec-api.ts
import type { StorySpec } from "@lab/contract";

const API_BASE = "/api/specs";

export async function fetchSpec(storyId: string): Promise<StorySpec | null> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(storyId)}`, {
    headers: { accept: "application/json" }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetchSpec(${storyId}) → ${res.status}`);
  return (await res.json()) as StorySpec;
}

export async function saveSpec(spec: StorySpec): Promise<StorySpec> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(spec.storyId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(spec)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`saveSpec(${spec.storyId}) → ${res.status}: ${text}`);
  }
  return (await res.json()) as StorySpec;
}

export async function isApiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(API_BASE, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}
```

### Task 5.2 — JSX preview component

**Files:**
- Create: `packages/developer-playground/src/SpecPreview.tsx`

- [ ] **Step 1: Implement the preview component**

```tsx
// packages/developer-playground/src/SpecPreview.tsx
import React from "react";
import type { StorySpec } from "@lab/contract";

interface Props {
  spec: Pick<StorySpec, "component" | "props" | "events">;
}

export function SpecPreview({ spec }: Props) {
  const lines: string[] = [`<${spec.component}`];
  for (const p of spec.props) {
    const value = p.default ?? "/* required */";
    lines.push(`  ${p.name}={${value}}`);
  }
  for (const e of spec.events) {
    lines.push(`  ${e.name}={() => { /* ${e.trigger} */ }}`);
  }
  lines.push("/>");
  return (
    <pre className="showcase-spec-preview" aria-label="Component signature">
      <code>{lines.join("\n")}</code>
    </pre>
  );
}
```

### Task 5.3 — Spec editor component

**Files:**
- Create: `packages/developer-playground/src/SpecEditor.tsx`

- [ ] **Step 1: Implement the editor**

```tsx
// packages/developer-playground/src/SpecEditor.tsx
import React from "react";
import type {
  StorySpec,
  SpecPropEntry,
  SpecEventEntry,
  SpecBehaviourEntry
} from "@lab/contract";
import { SpecPreview } from "./SpecPreview";
import { saveSpec } from "./spec-api";

interface Props {
  spec: StorySpec;
  onChange: (next: StorySpec) => void;
}

type Mode = "view" | "edit";

export function SpecEditor({ spec, onChange }: Props) {
  const [mode, setMode] = React.useState<Mode>(
    spec.status === "approved" ? "view" : "edit"
  );
  const [draft, setDraft] = React.useState<StorySpec>(spec);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDraft(spec);
    setMode(spec.status === "approved" ? "view" : "edit");
  }, [spec]);

  const update = (patch: Partial<StorySpec>) =>
    setDraft((d) => ({ ...d, ...patch }));

  async function persist(status: StorySpec["status"]) {
    setSaving(true);
    setError(null);
    try {
      const payload: StorySpec = { ...draft, status };
      const saved = await saveSpec(payload);
      onChange(saved);
      setMode("view");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const isEditable = mode === "edit" || spec.status !== "approved";

  return (
    <div className={`spec-editor spec-status-${spec.status}`}>
      <StatusBadge status={spec.status} />

      <SpecPreview spec={draft} />

      <section className="spec-section">
        <label className="spec-label">Intent</label>
        <textarea
          value={draft.intent}
          readOnly={!isEditable}
          onChange={(e) => update({ intent: e.target.value })}
          placeholder="What is this component supposed to do? Capture domain context the audit can't see."
          rows={3}
        />
      </section>

      <EditableList<SpecPropEntry>
        title={`Props (${draft.props.length})`}
        items={draft.props}
        readOnly={!isEditable}
        empty="No data props."
        onChange={(props) => update({ props })}
        newItem={() => ({ name: "newProp", type: "string", default: undefined })}
        renderRow={(item, onItemChange) => (
          <>
            <input
              value={item.name}
              readOnly={!isEditable}
              onChange={(e) => onItemChange({ ...item, name: e.target.value })}
            />
            <input
              value={item.type}
              readOnly={!isEditable}
              onChange={(e) => onItemChange({ ...item, type: e.target.value })}
            />
            <input
              value={item.default ?? ""}
              placeholder="default"
              readOnly={!isEditable}
              onChange={(e) =>
                onItemChange({ ...item, default: e.target.value || undefined })
              }
            />
          </>
        )}
      />

      <EditableList<SpecEventEntry>
        title={`Events (${draft.events.length})`}
        items={draft.events}
        readOnly={!isEditable}
        empty="No events."
        onChange={(events) => update({ events })}
        newItem={() => ({ name: "onSomethingClicked", trigger: "click something" })}
        renderRow={(item, onItemChange) => (
          <>
            <input
              value={item.name}
              readOnly={!isEditable}
              onChange={(e) => onItemChange({ ...item, name: e.target.value })}
            />
            <input
              value={item.trigger}
              readOnly={!isEditable}
              onChange={(e) => onItemChange({ ...item, trigger: e.target.value })}
            />
          </>
        )}
      />

      <EditableList<SpecBehaviourEntry>
        title={`Behaviours (${draft.behaviours.length})`}
        items={draft.behaviours}
        readOnly={!isEditable}
        empty="No documented behaviours."
        onChange={(behaviours) => update({ behaviours })}
        newItem={() => ({ id: "new-behaviour", label: "", source: "component" })}
        renderRow={(item, onItemChange) => (
          <>
            <input
              value={item.id}
              readOnly={!isEditable}
              onChange={(e) => onItemChange({ ...item, id: e.target.value })}
            />
            <input
              value={item.label}
              readOnly={!isEditable}
              onChange={(e) => onItemChange({ ...item, label: e.target.value })}
            />
            <select
              value={item.source}
              disabled={!isEditable}
              onChange={(e) =>
                onItemChange({
                  ...item,
                  source: e.target.value as SpecBehaviourEntry["source"]
                })
              }
            >
              <option value="component">Component</option>
              <option value="baseline">Baseline</option>
            </select>
          </>
        )}
      />

      <footer className="spec-actions">
        {mode === "view" && spec.status === "approved" && (
          <button onClick={() => setMode("edit")}>Edit</button>
        )}
        {mode === "edit" && (
          <>
            <button
              className="primary"
              disabled={saving}
              onClick={() => void persist("approved")}
            >
              {saving ? "Saving…" : "Approve"}
            </button>
            <button
              disabled={saving}
              onClick={() => {
                setDraft(spec);
                setMode(spec.status === "approved" ? "view" : "edit");
              }}
            >
              Reset
            </button>
          </>
        )}
        {error && <span className="spec-error">{error}</span>}
      </footer>
    </div>
  );
}

function StatusBadge({ status }: { status: StorySpec["status"] }) {
  const map = {
    proposed: { label: "Needs approval", className: "badge-proposed" },
    approved: { label: "Approved",       className: "badge-approved" },
    drifted:  { label: "Drift — review", className: "badge-drifted" }
  } as const;
  const cfg = map[status];
  return <span className={`spec-badge ${cfg.className}`}>{cfg.label}</span>;
}

interface EditableListProps<T> {
  title: string;
  items: T[];
  empty: string;
  readOnly: boolean;
  onChange: (next: T[]) => void;
  renderRow: (item: T, onItemChange: (next: T) => void) => React.ReactNode;
  newItem: () => T;
}

function EditableList<T>({
  title,
  items,
  empty,
  readOnly,
  onChange,
  renderRow,
  newItem
}: EditableListProps<T>) {
  return (
    <section className="spec-section">
      <header className="spec-list-header">
        <h5>{title}</h5>
        {!readOnly && (
          <button onClick={() => onChange([...items, newItem()])}>+ Add</button>
        )}
      </header>
      {items.length === 0 && <p className="spec-empty">{empty}</p>}
      {items.map((item, i) => (
        <div key={i} className="spec-row">
          {renderRow(item, (next) => {
            const copy = [...items];
            copy[i] = next;
            onChange(copy);
          })}
          {!readOnly && (
            <button
              aria-label="remove"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
```

### Task 5.4 — Wire `SpecEditor` into `Showcase.tsx`

**Files:**
- Modify: `packages/developer-playground/src/Showcase.tsx`

- [ ] **Step 1: Replace the existing right-side panel (the `SpecPanel` from the previous session) with a `SpecEditor` per story**

Inside `Showcase.tsx`, find the `<SpecPanel ... />` usage and replace it. Add at top:

```ts
import { SpecEditor } from "./SpecEditor";
import { fetchSpec, isApiAvailable } from "./spec-api";
import type { StorySpec } from "@lab/contract";
```

Inside the `Showcase` component, add hooks that load specs:

```tsx
const [specsByStory, setSpecsByStory] = React.useState<Record<string, StorySpec>>({});
const [apiAvailable, setApiAvailable] = React.useState(true);

React.useEffect(() => {
  let cancelled = false;
  (async () => {
    const available = await isApiAvailable();
    if (cancelled) return;
    setApiAvailable(available);
    if (!available) return;
    const entries = await Promise.all(
      stories.map(async (s) => [s.id, await fetchSpec(s.id)] as const)
    );
    if (cancelled) return;
    setSpecsByStory(
      Object.fromEntries(entries.filter(([, v]) => v !== null) as [string, StorySpec][])
    );
  })();
  return () => {
    cancelled = true;
  };
}, [stories]);
```

Render per-story card:

```tsx
{stories.map((story) => {
  const spec = specsByStory[story.id];
  return (
    <article key={story.id} className="showcase-card">
      <div className="showcase-card-body">
        <div className="showcase-preview">{renderStoryPreview(story)}</div>
        <aside className="showcase-spec-panel">
          {!apiAvailable && (
            <p className="spec-banner">
              Read-only — run <code>pnpm playground:serve</code> for inline approval.
            </p>
          )}
          {spec ? (
            <SpecEditor
              spec={spec}
              onChange={(next) =>
                setSpecsByStory((prev) => ({ ...prev, [next.storyId]: next }))
              }
            />
          ) : (
            <p>No spec yet for <code>{story.id}</code> — run <code>pnpm specs:bootstrap</code>.</p>
          )}
        </aside>
      </div>
    </article>
  );
})}
```

Note: the existing `import { COMPONENT_SPECS, getComponentSpec } from "@lab/contract"` block in `Showcase.tsx` is no longer used — remove it. The `SpecPanel`, `PropsTable`, `formatArgValue`, `formatStoryCall` helpers in the same file are also superseded and should be deleted.

### Task 5.5 — Editor styling

**Files:**
- Modify: `packages/developer-playground/src/showcase.css`

- [ ] **Step 1: Append spec-editor styles**

Append to `packages/developer-playground/src/showcase.css`:

```css
/* === Spec editor === */

.spec-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.spec-badge {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.badge-proposed { background: rgba(245, 158, 11, 0.16); color: #b45309; border: 1px solid rgba(245, 158, 11, 0.4); }
.badge-approved { background: rgba(16, 185, 129, 0.16); color: #047857; border: 1px solid rgba(16, 185, 129, 0.4); }
.badge-drifted  { background: rgba(239, 68, 68, 0.16);  color: #b91c1c; border: 1px solid rgba(239, 68, 68, 0.4); }

.showcase-spec-preview {
  background: #0f172a;
  color: #e2e8f0;
  padding: 14px 16px;
  border-radius: 8px;
  font-size: 0.78rem;
  line-height: 1.4;
  overflow-x: auto;
  margin: 0;
}

.spec-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.spec-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.spec-list-header h5 {
  margin: 0;
  font-size: 0.82rem;
  color: #0f172a;
}

.spec-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #0f172a;
}

.spec-section textarea,
.spec-row input,
.spec-row select {
  font: inherit;
  font-size: 0.78rem;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #fff;
}

.spec-section textarea[readonly],
.spec-row input[readonly] {
  background: #f8fafc;
  color: #475569;
}

.spec-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 6px;
  align-items: center;
}

.spec-empty {
  font-size: 0.75rem;
  color: #64748b;
  margin: 0;
}

.spec-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
}

.spec-actions button {
  font-size: 0.78rem;
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f1f5f9;
  cursor: pointer;
}

.spec-actions button.primary {
  background: #2563eb;
  color: #fff;
  border-color: #1d4ed8;
}

.spec-actions button:disabled {
  opacity: 0.5;
  cursor: progress;
}

.spec-banner {
  background: rgba(245, 158, 11, 0.12);
  border-left: 3px solid #f59e0b;
  padding: 8px 10px;
  font-size: 0.75rem;
  color: #92400e;
  border-radius: 4px;
  margin-bottom: 8px;
}

.spec-error {
  color: #b91c1c;
  font-size: 0.75rem;
}
```

### Task 5.6 — Build and smoke-test

- [ ] **Step 1: Build the playground**

Run: `pnpm playground:build`

Expected: exit 0.

- [ ] **Step 2: Serve and visit**

In one terminal: `pnpm playground:serve`

Open: `http://127.0.0.1:6108/?view=showcase`

Expected: every story card shows an amber "Needs approval" badge with editable props/events/behaviours fields and a JSX preview at top.

- [ ] **Step 3: Approve one story end-to-end**

In the showcase, find `lab-button--primary`, click **Approve**, verify:
- badge flips to green "Approved"
- `cat lab-memory/specs/lab-button--primary.spec.json` shows `"status": "approved"` and a recent `approvedAt` timestamp

- [ ] **Step 4: Stop the server (Ctrl-C).**

- [ ] **Step 5: Optional commit checkpoint**

```bash
git add packages/developer-playground/src/SpecEditor.tsx \
        packages/developer-playground/src/SpecPreview.tsx \
        packages/developer-playground/src/spec-api.ts \
        packages/developer-playground/src/Showcase.tsx \
        packages/developer-playground/src/showcase.css
git commit -m "feat(specs): inline spec editor and approval flow in showcase"
```

---

## Phase 6 — Audit integration: approval-gated pass criteria + drift detection

**Goal of phase:** `logic-audit.ts` reads the approved spec for each story and produces one of `pass | needs-approval | regression | drift`. When drift is detected, writes `lab-memory/specs/<storyId>.proposed.json` so the showcase can show the delta.

### Task 6.1 — Wire the spec store into `logic-audit.ts`

**Files:**
- Modify: `packages/pixel-test/src/logic-audit.ts`

- [ ] **Step 1: Import the spec store + inference at the top of `logic-audit.ts`**

```ts
import { createSpecStore, diffSpecs } from "./spec-store.ts";
import { inferProposedSpec, type InferenceDomControl } from "./spec-inference.ts";
import { readFileSync } from "node:fs";
import type { StorySpec, SpecDelta } from "../../contract/src/spec-types.ts";

const SPEC_STORE = createSpecStore({
  vaultDir: resolve(process.cwd(), "lab-memory/specs")
});
```

- [ ] **Step 2: Extend `AuditResult` with approval-gated verdict fields**

Replace the existing `AuditResult` interface:

```ts
type ApprovalVerdict = "pass" | "needs-approval" | "regression" | "drift" | "error";

interface AuditResult {
  storyId: string;
  component: string | null;
  status: "pass" | "gap" | "error";
  /** New: gate verdict that the portfolio summary uses. */
  verdict: ApprovalVerdict;
  interactiveCount: number;
  dsBuiltinCount: number;
  staticShellCount: number;
  readonlyCount: number;
  nativeCount: number;
  baselineCount: number;
  findings: InteractionFinding[];
  gaps: string[];
  dsBuiltIn: string[];
  approvedSpecId: string | null;
  specStatus: StorySpec["status"] | "missing";
  driftDelta: SpecDelta | null;
  demoVideo?: string;
  error?: string;
  testedAt: string;
}
```

- [ ] **Step 3: After the existing classify loop, compute the approval-gated verdict**

Insert just before the return statement at the bottom of `runStory` (the function that returns `AuditResult`):

```ts
// Map findings → flat lists of observed events + observed baseline behaviours,
// which we compare against the approved spec.
const observedEventNames = findings
  .filter((f) => f.outcome === "state_changed")
  .map((f) => describeFinding(f));
const observedBaselineIds = findings
  .filter((f) => f.source === "baseline")
  .map((f) => `press-toggle`);
const approvedSpec = SPEC_STORE.readSpec(storyId);

let verdict: ApprovalVerdict;
let driftDelta: SpecDelta | null = null;

if (!approvedSpec || approvedSpec.status !== "approved") {
  verdict = "needs-approval";
} else {
  // Behaviour-by-behaviour check: every approved behaviour must have been observed.
  const baselineApprovedIds = approvedSpec.behaviours
    .filter((b) => b.source === "baseline")
    .map((b) => b.id);
  const missing = baselineApprovedIds.filter((id) => !observedBaselineIds.includes(id));
  const extras = observedBaselineIds.filter((id) => !baselineApprovedIds.includes(id));

  if (missing.length > 0) {
    verdict = "regression";
  } else if (extras.length > 0) {
    // Build a proposed delta and save sidecar for showcase to read.
    const proposed: StorySpec = {
      ...approvedSpec,
      status: "proposed",
      approvedAt: null,
      approvedBy: null,
      behaviours: [
        ...approvedSpec.behaviours,
        ...extras.map((id) => ({
          id,
          label: `${id} (auto-observed)`,
          source: "baseline" as const
        }))
      ]
    };
    driftDelta = diffSpecs(approvedSpec, proposed);
    writeFileSync(
      resolve(process.cwd(), `lab-memory/specs/${storyId}.proposed.json`),
      JSON.stringify(proposed, null, 2) + "\n",
      "utf8"
    );
    verdict = "drift";
  } else {
    verdict = "pass";
  }
}
```

Add the helper `describeFinding` near the bottom of the file:

```ts
function describeFinding(f: InteractionFinding): string {
  const label = f.text || f.ariaLabel || `${f.tag}#${f.index}`;
  return `${f.tag}:${label}`;
}
```

- [ ] **Step 4: Include the new fields in the returned `AuditResult`**

In the existing return statement at the end of `runStory`, add:

```ts
return {
  // ... existing fields
  verdict,
  approvedSpecId: approvedSpec?.storyId ?? null,
  specStatus: approvedSpec?.status ?? "missing",
  driftDelta
};
```

- [ ] **Step 5: Also include them in the error path return**

Find the `catch` block that returns the error AuditResult and add:

```ts
verdict: "error" as ApprovalVerdict,
approvedSpecId: null,
specStatus: "missing" as const,
driftDelta: null,
```

- [ ] **Step 6: Surface the verdict in the console summary line**

Find the line that logs `console.log(\`${icon} ${detail}...\`)` and prepend the verdict:

```ts
const verdictTag =
  result.verdict === "pass"            ? "✓ PASS"
  : result.verdict === "needs-approval" ? "△ NEEDS-APPROVAL"
  : result.verdict === "regression"     ? "✗ REGRESSION"
  : result.verdict === "drift"          ? "⚠ DRIFT"
  : "✗ ERROR";

console.log(`${verdictTag} | ${detail}${videoNote}`);
```

### Task 6.2 — Update audit HTML report to show verdict column

**Files:**
- Modify: `packages/pixel-test/src/logic-audit.ts` (the `writeSuiteHtml` function)

- [ ] **Step 1: Add a `Verdict` column**

In `writeSuiteHtml`, change the table header to include a Verdict column right after Status:

```html
<thead><tr>
<th>Story</th><th>Component</th><th>Status</th><th>Verdict</th>
<th>Interaction video</th><th>Controls</th><th>Source split</th>
<th>DS built-in</th><th>Gaps</th><th>Working</th><th>Missing API</th>
</tr></thead>
```

Build the verdict cell inside the row map:

```ts
const verdict = (r as any).verdict ?? "—";
const verdictColor = {
  pass: "#16a34a",
  "needs-approval": "#d97706",
  regression: "#dc2626",
  drift: "#d97706",
  error: "#dc2626"
}[verdict] ?? "#64748b";
const verdictCell = `<span style="color:${verdictColor};font-weight:700">${escapeHtml(verdict.toUpperCase())}</span>`;
```

Insert `<td>${verdictCell}</td>` right after the status cell in each row.

### Task 6.3 — End-to-end regression: approve, audit, mutate, audit again

This is a manual scripted smoke — we don't add Playwright integration tests for the audit (it already takes minutes to run). Instead we run a known sequence and verify each transition.

- [ ] **Step 1: Approve `lab-button--primary` in the showcase (if not already done in Task 5.6 Step 3).**

- [ ] **Step 2: Run audit on it**

Run: `pnpm --filter @lab/pixel-test test:logic:audit -- --stories lab-button--primary`

Expected: `✓ PASS` verdict (because the approved spec has 1 baseline behaviour and the audit observed 1).

- [ ] **Step 3: Force regression — remove the baseline behaviour from the spec by hand**

```bash
# Manually edit lab-memory/specs/lab-button--primary.spec.json:
# set "behaviours": []
```

Run the audit again. Expected: `⚠ DRIFT` — the audit observed a baseline behaviour the approved spec doesn't list. A sidecar `lab-button--primary.proposed.json` is written.

- [ ] **Step 4: Restore the spec** by re-running `pnpm specs:bootstrap --force` (or by approving again in the showcase).

- [ ] **Step 5: Optional commit checkpoint**

```bash
git add packages/pixel-test/src/logic-audit.ts
git commit -m "feat(audit): approval-gated verdicts and drift sidecars"
```

---

## Phase 7 — Cleanup + regression

**Goal of phase:** Delete the hand-authored `component-specs.ts` (now superseded by `lab-memory/specs/`). Run the full 5-suite regression. Document the new flow.

### Task 7.1 — Delete `component-specs.ts` + its export

**Files:**
- Delete: `packages/contract/src/component-specs.ts`
- Modify: `packages/contract/src/index.ts`

- [ ] **Step 1: Verify no remaining imports**

```bash
rg "from .@lab/contract.*COMPONENT_SPECS|from .*component-specs" --type ts
```

Expected: zero matches (Showcase.tsx no longer uses it; bootstrap script has already consumed it).

- [ ] **Step 2: Delete the file**

Run: `rm packages/contract/src/component-specs.ts`

- [ ] **Step 3: Remove the export from `packages/contract/src/index.ts`**

Find and delete:

```ts
export * from "./component-specs";
```

- [ ] **Step 4: Build to verify nothing else broke**

Run: `pnpm --filter @lab/contract build && pnpm --filter @lab/developer-playground build`

Expected: both exit 0.

### Task 7.2 — Full portfolio regression

- [ ] **Step 1: Approve all 48 stories in the showcase**

In another terminal: `pnpm playground:serve`

Open: `http://127.0.0.1:6108/?view=showcase`

For each amber-badged story, review the props/events/behaviours (most should be acceptable as-is since they were seeded from the previous hand-authored specs) and click **Approve**. Use the JSON file as escape hatch for bulk approve if the UI is too slow — but for the first pass, go through the UI to validate the editor works.

- [ ] **Step 2: Run all 5 suites**

```bash
pnpm test:pixel:all
pnpm test:figma:all
pnpm test:figma:live --all
pnpm test:delivery:all
pnpm test:logic:audit:all
pnpm test:portfolio:refresh
```

Expected: 48/48 pass on every suite, including logic audit now reporting verdict `pass` for all 48 stories.

- [ ] **Step 3: Inspect portfolio**

```bash
node -e "
const fs=require('fs');
const p=JSON.parse(fs.readFileSync('./test-portfolio/portfolio.json','utf8'));
const counts={};
for(const r of p.rows){
  for(const [stepId, cell] of Object.entries(r.cells||{})){
    counts[stepId]=counts[stepId]||{};
    counts[stepId][cell.status]=(counts[stepId][cell.status]||0)+1;
  }
}
console.log(JSON.stringify(counts,null,2));
"
```

Expected: each suite shows `{ pass: 48, ... }` for the delivery set.

### Task 7.3 — Doc updates

**Files:**
- Modify: `docs/ROADMAP.md` (mark approval flow as shipped)
- Modify: `packages/storybook-lab/specs/.gitkeep` (NOT needed — vault is at `lab-memory/`)

- [ ] **Step 1: Add a one-paragraph entry to `docs/ROADMAP.md`** noting that the logic approval flow shipped, with a pointer to the design doc and this plan.

- [ ] **Step 2: Final commit checkpoint**

```bash
git add packages/contract/src/component-specs.ts packages/contract/src/index.ts docs/ROADMAP.md
git commit -m "feat(specs): remove hand-authored component-specs.ts; approval flow live"
```

---

## Self-review

**1. Spec coverage** — checked each section of the design doc against the plan:

| Spec section | Implemented by |
|---|---|
| Lifecycle (5 gates) | Phase 6 (audit verdict) + Phase 7 (regression) |
| Spec model (JSON shape) | Task 1.1 (types) + Task 3.1 (bootstrap writes them) |
| Inference engine (TS types, args, DOM, naming) | Tasks 2.1 / 2.2 / 2.3 |
| Approval UX in showcase (3 states, editor) | Tasks 5.2 / 5.3 / 5.4 / 5.5 |
| Server endpoint (`/api/specs/...`) | Task 4.1 / 4.2 |
| Audit pass criteria (4 verdicts) | Task 6.1 / 6.2 |
| Baseline runtime attribution | Already in place from previous session; surfaced via verdict in Task 6.1 |
| What gets deleted | Task 7.1 |
| One-shot bootstrap | Task 3.1 |
| Edge cases | Bootstrap idempotency (Task 3.1 step 6), drift sidecar (Task 6.1 step 3), API-not-available fallback (Task 5.4 banner) |

**Gaps from spec → plan:**
- `/api/specs/proposed/:storyId` (fresh inference on demand) — **not yet built.** The drift sidecar (Task 6.1) provides the same information through a different path. Document this in Phase 7 docs note: live re-inference can be added when the audit needs to be run from inside the showcase.
- "Apply this spec to all variants of `Button`" bulk action — out of scope for v1; document as follow-up.

**2. Placeholder scan** — no TBDs, no "implement later", no missing code blocks. Every step has either complete code, an exact command, or an inspection/click action.

**3. Type consistency:**
- `StorySpec` shape consistent across Phase 1 (types), Phase 3 (bootstrap writes), Phase 4 (server reads/writes), Phase 5 (editor consumes), Phase 6 (audit reads).
- `BehaviourSource` values `"component" | "baseline"` consistent.
- `SpecStatus` values `"proposed" | "approved" | "drifted"` consistent.
- `ApprovalVerdict` values `"pass" | "needs-approval" | "regression" | "drift" | "error"` consistent in Phase 6 (logic-audit + report).
- Function names: `createSpecStore`, `inferProposedSpec`, `diffSpecs`, `nameEventFromDom`, `parseComponentProps`, `fetchSpec`, `saveSpec` — used consistently between definition and call sites.

No issues found.
