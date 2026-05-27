/**
 * Walks the DOM under a story's [data-figma-component] root and produces a
 * Figma-style layer tree (every node, indented). Used by LayerPanel.
 *
 * IDs:
 * - Interactive nodes (those that already carry data-lab-id) reuse the stamped
 *   `el-…` ID — keeps continuity with what the audit observes.
 * - Non-interactive nodes get a structural `ly-<slug>-<hash>` ID derived from
 *   tag-path + text, so two divs at the same depth resolve to different IDs
 *   even when their textContent is empty.
 *
 * Pure DOM read — no state, no side effects. Re-build any time the preview
 * re-renders. Returns a tree of `LayerNode`s plus a flat map for fast lookup.
 */

/**
 * Inlined from `@lab/pixel-test/src/element-id.ts` because the playground
 * bundle (Vite) must not import from the test package. Keep both copies in
 * sync — same slug rules, same hash, same `ly-…` prefix.
 */
function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36).slice(0, 6);
}

function computeStructuralId(tagPath: string, text: string, tag: string): string {
  const meaningful = (text || "").trim();
  const base = meaningful ? slugify(meaningful) : slugify(tag || "layer");
  const hash = shortHash(`${tagPath}|${meaningful}|${tag}`);
  return `ly-${base || "layer"}-${hash}`;
}

export interface LayerNode {
  id: string;
  tag: string;
  role: string;
  displayName: string;
  isInteractive: boolean;
  labId: string | null;
  depth: number;
  node: HTMLElement;
  children: LayerNode[];
}

const INTERACTIVE_SELECTOR =
  'button, input, select, textarea, a[href], [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="switch"], [contenteditable=""], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK"]);
const MAX_TEXT = 36;

function elementText(node: HTMLElement): string {
  const own = Array.from(node.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent ?? "")
    .join(" ")
    .trim();
  if (own) return own.slice(0, MAX_TEXT);
  const all = (node.textContent ?? "").trim();
  return all.slice(0, MAX_TEXT);
}

function elementRole(node: HTMLElement): string {
  const explicit = node.getAttribute("role");
  if (explicit) return explicit;
  const tag = node.tagName.toLowerCase();
  if (tag === "button") return "button";
  if (tag === "a" && node.hasAttribute("href")) return "link";
  if (tag === "input") return (node as HTMLInputElement).type || "input";
  if (tag === "select") return "combobox";
  if (tag === "textarea") return "textbox";
  return "";
}

function siblingIndexOfSameTag(node: HTMLElement): number {
  let idx = 0;
  let prev = node.previousElementSibling;
  while (prev) {
    if (prev.tagName === node.tagName) idx++;
    prev = prev.previousElementSibling;
  }
  return idx;
}

function tagPathFrom(root: HTMLElement, node: HTMLElement): string {
  const segs: string[] = [];
  let cur: HTMLElement | null = node;
  while (cur && cur !== root) {
    segs.unshift(`${cur.tagName.toLowerCase()}[${siblingIndexOfSameTag(cur)}]`);
    cur = cur.parentElement;
  }
  return segs.join(">");
}

function displayNameFor(node: HTMLElement, text: string): string {
  if (text) return text;
  const aria = node.getAttribute("aria-label");
  if (aria) return aria.slice(0, MAX_TEXT);
  return `<${node.tagName.toLowerCase()}>`;
}

export interface BuildResult {
  roots: LayerNode[];
  byId: Map<string, LayerNode>;
}

export function buildLayerTree(root: HTMLElement): BuildResult {
  const byId = new Map<string, LayerNode>();

  function walk(node: HTMLElement, depth: number): LayerNode | null {
    if (SKIP_TAGS.has(node.tagName)) return null;
    const tag = node.tagName.toLowerCase();
    const text = elementText(node);
    const role = elementRole(node);
    const labId = node.getAttribute("data-lab-id");
    const isInteractive = node.matches(INTERACTIVE_SELECTOR);

    const id = labId ?? computeStructuralId(tagPathFrom(root, node), text, tag);

    const children: LayerNode[] = [];
    for (const child of Array.from(node.children) as HTMLElement[]) {
      const sub = walk(child, depth + 1);
      if (sub) children.push(sub);
    }

    const layer: LayerNode = {
      id,
      tag,
      role,
      displayName: displayNameFor(node, text),
      isInteractive,
      labId,
      depth,
      node,
      children,
    };
    byId.set(id, layer);
    return layer;
  }

  const roots: LayerNode[] = [];
  for (const child of Array.from(root.children) as HTMLElement[]) {
    const sub = walk(child, 0);
    if (sub) roots.push(sub);
  }
  return { roots, byId };
}

export function flatten(tree: LayerNode[]): LayerNode[] {
  const out: LayerNode[] = [];
  function visit(n: LayerNode) {
    out.push(n);
    for (const c of n.children) visit(c);
  }
  for (const root of tree) visit(root);
  return out;
}
