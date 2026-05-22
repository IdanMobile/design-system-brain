/**
 * In-page probes for logic audit — probe/snapshot scripts run in page.evaluate().
 * Pointer clicks use Playwright locators (real mouse), not el.click() in evaluate.
 */

export interface ControlProbe {
  /** Index in querySelectorAll(INTERACTIVE_SELECTOR) under the component root */
  index: number;
  tag: string;
  role: string;
  text: string;
  ariaLabel: string;
  type: string;
  readOnly: boolean;
  disabled: boolean;
  /** Click may open a listbox / menu (native select, MUI Select, lab dropdown shell) */
  opensMenu?: boolean;
}

export interface DomSnapshot {
  digest: string;
  ariaExpanded: string[];
  ariaSelected: string[];
  checked: string[];
  menuOpen: boolean;
}

export type InteractionOutcome = "state_changed" | "no_visible_change" | "skipped_readonly" | "click_failed";

export interface InteractionFinding extends ControlProbe {
  outcome: InteractionOutcome;
  category: "ds_builtin" | "static_shell" | "readonly" | "unknown";
  note?: string;
}

export const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  '[role="button"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="combobox"]',
  '[role="menuitem"]',
  '[role="radio"]',
  ".lab-select-field",
  ".lab-tab",
  ".lab-tabs-panel button",
  ".lab-filter-panel button",
  ".lab-bottom-nav button",
  ".lab-top-nav button"
].join(", ");

/** Playwright + probe: root component node if interactive, plus descendants. */
export const ROOT_AND_DESCENDANT_INTERACTIVE = `[data-figma-component]:is(${INTERACTIVE_SELECTOR}), [data-figma-component] ${INTERACTIVE_SELECTOR}`;

export function probeScript(): {
  component: string | null;
  controls: ControlProbe[];
} {
  const sel =
    'button, a[href], input:not([type=hidden]), select, textarea, summary, [role="button"], [role="tab"], [role="checkbox"], [role="switch"], [role="slider"], [role="combobox"], [role="menuitem"], [role="radio"], .lab-select-field, .lab-tab, .lab-tabs-panel button, .lab-filter-panel button, .lab-bottom-nav button, .lab-top-nav button';

  function visible(el: Element): boolean {
    const html = el as HTMLElement;
    const style = window.getComputedStyle(html);
    if (style.visibility === "hidden" || style.display === "none") return false;
    const rect = html.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function menuTrigger(el: Element): boolean {
    const html = el as HTMLElement;
    if (html.tagName === "SELECT") return true;
    if ((html.getAttribute("role") ?? "") === "combobox") return true;
    if (html.classList.contains("lab-select-field")) return true;
    if (html.closest(".MuiSelect-select, .MuiInputBase-root")) return true;
    return false;
  }

  const root = document.querySelector("[data-figma-component]");
  if (!root) return { component: null, controls: [] };

  const component = root.getAttribute("data-figma-component");
  const nodes: Element[] = [];
  if (root.matches(sel)) nodes.push(root);
  root.querySelectorAll(sel).forEach((el) => nodes.push(el));
  const controls: ControlProbe[] = [];

  for (let i = 0; i < nodes.length && controls.length < 40; i++) {
    const el = nodes[i] as HTMLElement;
    if (!visible(el)) continue;
    const disabled =
      el.hasAttribute("disabled") ||
      el.getAttribute("aria-disabled") === "true" ||
      el.closest("[disabled], [aria-disabled='true']") != null;
    const readOnly =
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.readOnly : false;

    controls.push({
      index: i,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") ?? "",
      text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
      ariaLabel: el.getAttribute("aria-label") ?? "",
      type: el.getAttribute("type") ?? "",
      readOnly,
      disabled,
      opensMenu: menuTrigger(el)
    });
  }

  return { component, controls };
}

export function snapshotScript(): DomSnapshot {
  const root = document.querySelector("[data-figma-component]");
  if (!root) {
    return { digest: "", ariaExpanded: [], ariaSelected: [], checked: [], menuOpen: false };
  }

  const ariaExpanded: string[] = [];
  const ariaSelected: string[] = [];
  const checked: string[] = [];

  root.querySelectorAll("[aria-expanded]").forEach((el) => {
    ariaExpanded.push(`${el.getAttribute("aria-expanded")}:${(el.textContent ?? "").slice(0, 20)}`);
  });
  root.querySelectorAll("[aria-selected]").forEach((el) => {
    ariaSelected.push(`${el.getAttribute("aria-selected")}:${(el.textContent ?? "").slice(0, 20)}`);
  });
  root.querySelectorAll("input[type=checkbox], input[type=radio], [role=checkbox], [role=switch]").forEach((el) => {
    const on =
      el.getAttribute("aria-checked") === "true" ||
      (el instanceof HTMLInputElement && el.checked);
    checked.push(`${on}:${(el.textContent ?? el.getAttribute("aria-label") ?? "").slice(0, 20)}`);
  });

  const menuOpen =
    root.querySelector(
      '[role="listbox"]:not([hidden]), [role="menu"]:not([hidden]), .lab-select-menu, .MuiPopover-root, .MuiMenu-root'
    ) != null;

  const digest = [
    root.textContent?.replace(/\s+/g, " ").trim().slice(0, 500) ?? "",
    ariaExpanded.join("|"),
    ariaSelected.join("|"),
    checked.join("|"),
    menuOpen ? "menu-open" : "menu-closed"
  ].join("§");

  return { digest, ariaExpanded, ariaSelected, checked, menuOpen };
}

export function snapshotsEqual(a: DomSnapshot, b: DomSnapshot): boolean {
  return a.digest === b.digest;
}

export function classifyFinding(
  control: ControlProbe,
  outcome: InteractionOutcome,
  component: string | null
): InteractionFinding {
  if (outcome === "skipped_readonly") {
    return { ...control, outcome, category: "readonly", note: "Read-only or display-only field" };
  }
  if (outcome === "click_failed") {
    return { ...control, outcome, category: "unknown", note: "Pointer click failed or element not reachable" };
  }
  if (outcome === "state_changed") {
    const isDs =
      component === "MUIShowcase" ||
      control.role === "tab" ||
      control.role === "switch" ||
      control.role === "slider" ||
      control.tag === "select" ||
      control.opensMenu ||
      (control.tag === "input" && control.type === "checkbox");
    return {
      ...control,
      outcome,
      category: "ds_builtin",
      note: isDs ? "Design-system widget responds to input" : "UI state changed on interaction"
    };
  }
  return {
    ...control,
    outcome,
    category: "static_shell",
    note: "No visible state change — wire props/handlers in delivery package (packages/ui)"
  };
}
