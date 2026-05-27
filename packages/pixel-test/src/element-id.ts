/**
 * Stable per-element ID derivation.
 *
 * Hash is built from `text + role + tag` (NOT DOM index) so element re-ordering
 * within a story doesn't break the link. When two elements within the same story
 * collide (e.g. three "Reset" buttons), the caller passes the full list to
 * `resolveCollisions` to disambiguate with `-2`, `-3` suffixes.
 *
 * The ID format `el-<slug>` is intentionally human-readable so designers
 * looking at lab-memory/logic/specs/*.spec.json can grep their way around.
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
 * Structural ID for arbitrary DOM layers (including non-interactive ones).
 *
 * `tagPath` is the chain of ancestor tags from the figma-component root,
 * each appended with its sibling-of-same-tag index, e.g. `div[0]>section[0]>div[1]`.
 * `text` is the layer's trimmed textContent (truncated by caller).
 *
 * Two non-interactive divs with no text but different positions produce
 * different IDs because the path differs. The format `ly-<slug>` distinguishes
 * "layer" IDs from interactive `el-<slug>` IDs in spec files.
 */
export interface StructuralIdInputs {
  tagPath: string;
  text: string;
  tag: string;
}

function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36).slice(0, 6);
}

export function computeStructuralId({ tagPath, text, tag }: StructuralIdInputs): string {
  const meaningful = (text || "").trim();
  const base = meaningful ? slugify(meaningful) : slugify(tag || "layer");
  const hash = shortHash(`${tagPath}|${meaningful}|${tag}`);
  return `ly-${base || "layer"}-${hash}`;
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
