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
  '[tabindex]:not([tabindex="-1"])'
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
  const controls: Element[] = [];
  if (root.matches(INTERACTIVE_SELECTOR)) controls.push(root);
  controls.push(...Array.from(root.querySelectorAll<Element>(INTERACTIVE_SELECTOR)));
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
let stamping = false;

function scheduleStamp(): void {
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    stamping = true;
    try {
      stampAllRoots();
    } finally {
      stamping = false;
    }
  });
}

export function installElementIds(): void {
  if (typeof document === "undefined") return;
  stampAllRoots();
  const observer = new MutationObserver((records) => {
    // Ignore our own attribute mutations to avoid re-stamping loops.
    if (stamping) return;
    for (const r of records) {
      if (r.type === "attributes" && r.attributeName === "data-lab-id") return;
    }
    scheduleStamp();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["role", "tabindex", "href", "data-figma-component"]
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => installElementIds(), { once: true });
  } else {
    installElementIds();
  }
}
