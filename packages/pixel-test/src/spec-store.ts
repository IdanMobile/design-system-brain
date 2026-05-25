/**
 * On-disk spec store. One JSON file per story at
 * `<vaultDir>/<storyId>.spec.json`. Read / write / list / diff. No HTTP,
 * Persistence layer for v2 specs; HTTP lives in `specs-server.mjs`.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { join, resolve } from "node:path";
import type {
  SpecStatus,
  StorySpec
} from "../../contract/src/spec-types.ts";

export interface SpecStoreOptions {
  /** Absolute path to the vault directory (e.g. `<repo>/lab-memory/specs`). */
  vaultDir: string;
}

export interface SpecStore {
  readSpec(storyId: string): StorySpec | null;
  writeSpec(spec: StorySpec): StorySpec;
  setStatus(storyId: string, status: SpecStatus, actor: string): StorySpec | null;
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

function comparable(spec: StorySpec): Omit<StorySpec, "specVersion"> & { specVersion: 0 } {
  return { ...spec, specVersion: 0 };
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
    let next: StorySpec = { ...spec };
    if (existsSync(file)) {
      const prev = readJson<StorySpec>(file);
      const changed = !structurallyEqual(comparable(prev), comparable(next));
      next = { ...next, specVersion: changed ? prev.specVersion + 1 : prev.specVersion };
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
    const out: StorySpec[] = [];
    for (const name of readdirSync(vaultDir)) {
      if (!name.endsWith(".spec.json")) continue;
      out.push(readJson<StorySpec>(join(vaultDir, name)));
    }
    return out;
  }

  return { readSpec, writeSpec, setStatus, listSpecs, filePathFor };
}
