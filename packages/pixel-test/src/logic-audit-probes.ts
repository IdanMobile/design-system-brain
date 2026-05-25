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
  /** Value of `data-lab-id` stamped by @lab/ui/element-ids-runtime.ts (v2). */
  labId: string;
}

export interface DomSnapshot {
  digest: string;
  ariaExpanded: string[];
  ariaSelected: string[];
  ariaPressed: string[];
  /**
   * Captured provenance of each pressed element: "baseline" if the
   * design-system runtime stamped it, "native" if a component controls it.
   * Used to attribute each finding's source in the audit report.
   */
  pressedSources: BehaviourSource[];
  checked: string[];
  inputValues: string[];
  activeIndex: number;
  menuOpen: boolean;
}

export type InteractionOutcome = "state_changed" | "no_visible_change" | "skipped_readonly" | "click_failed";

/**
 * Provenance of an observed behaviour:
 *   • `native`   — the component implements the behaviour itself
 *                  (React state, controlled inputs, real handlers, MUI built-ins).
 *   • `baseline` — the design-system runtime (@lab/ui/behaviour-baseline.ts)
 *                  auto-wired the behaviour because the component author left
 *                  the control unmanaged. Audit detects by sniffing the
 *                  `data-pressed-source="baseline"` stamp.
 *   • `none`     — the behaviour was not observed (true gap).
 */
export type BehaviourSource = "native" | "baseline" | "none";

export interface InteractionFinding extends ControlProbe {
  outcome: InteractionOutcome;
  category: "ds_builtin" | "static_shell" | "readonly" | "unknown";
  source: BehaviourSource;
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
      opensMenu: menuTrigger(el),
      labId: el.getAttribute("data-lab-id") ?? ""
    });
  }

  return { component, controls };
}

export function snapshotScript(): DomSnapshot {
  const empty: DomSnapshot = {
    digest: "",
    ariaExpanded: [],
    ariaSelected: [],
    ariaPressed: [],
    pressedSources: [],
    checked: [],
    inputValues: [],
    activeIndex: -1,
    menuOpen: false
  };
  const root = document.querySelector("[data-figma-component]");
  if (!root) return empty;

  const ariaExpanded: string[] = [];
  const ariaSelected: string[] = [];
  const ariaPressed: string[] = [];
  const pressedSources: ("native" | "baseline" | "none")[] = [];
  const checked: string[] = [];
  const inputValues: string[] = [];

  // querySelectorAll only finds DESCENDANTS — but the [data-figma-component]
  // root is often itself the interactive element (e.g. a Button). Walk root +
  // descendants so we don't miss state changes on the root element.
  const walk = (sel: string, cb: (el: Element) => void): void => {
    if (root.matches(sel)) cb(root);
    root.querySelectorAll(sel).forEach(cb);
  };

  walk("[aria-expanded]", (el) => {
    ariaExpanded.push(`${el.getAttribute("aria-expanded")}:${(el.textContent ?? "").slice(0, 20)}`);
  });
  walk("[aria-selected]", (el) => {
    ariaSelected.push(`${el.getAttribute("aria-selected")}:${(el.textContent ?? "").slice(0, 20)}`);
  });
  walk("[aria-pressed], [data-pressed]", (el) => {
    const v =
      el.getAttribute("aria-pressed") ?? el.getAttribute("data-pressed") ?? "";
    ariaPressed.push(`${v}:${(el.textContent ?? "").slice(0, 20)}`);
    const html = el as HTMLElement;
    const source =
      html.getAttribute("data-pressed-source") === "baseline"
        ? "baseline"
        : "native";
    pressedSources.push(source);
  });
  walk("input[type=checkbox], input[type=radio], [role=checkbox], [role=switch]", (el) => {
    const on =
      el.getAttribute("aria-checked") === "true" ||
      (el instanceof HTMLInputElement && el.checked);
    checked.push(`${on}:${(el.textContent ?? el.getAttribute("aria-label") ?? "").slice(0, 20)}`);
  });
  walk("input, textarea", (el) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      inputValues.push(`${el.value}:${el.name ?? el.id ?? el.getAttribute("type") ?? ""}`);
    }
  });

  // Capture which interactive descendant currently has visual focus / active
  // styling — components can express "I just got clicked" by toggling a class
  // (`.is-active`, `.lab-active`, `[data-active="true"]`) or by being the
  // browser's `document.activeElement`. Either signal is enough for the audit.
  let activeIndex = -1;
  const focusable = root.querySelectorAll(
    "button, a[href], input, select, textarea, [role='button'], [role='tab'], [tabindex]"
  );
  for (let i = 0; i < focusable.length; i += 1) {
    const el = focusable[i] as HTMLElement;
    if (
      el === document.activeElement ||
      el.matches(
        '.is-active, .is-pressed, .lab-active, [data-active="true"], [data-pressed="true"], [aria-current="true"]'
      )
    ) {
      activeIndex = i;
      break;
    }
  }

  const menuOpen =
    root.querySelector(
      '[role="listbox"]:not([hidden]), [role="menu"]:not([hidden]), .lab-select-menu, .MuiPopover-root, .MuiMenu-root'
    ) != null;

  const digest = [
    root.textContent?.replace(/\s+/g, " ").trim().slice(0, 500) ?? "",
    ariaExpanded.join("|"),
    ariaSelected.join("|"),
    ariaPressed.join("|"),
    checked.join("|"),
    inputValues.join("|"),
    `active:${activeIndex}`,
    menuOpen ? "menu-open" : "menu-closed"
  ].join("§");

  return {
    digest,
    ariaExpanded,
    ariaSelected,
    ariaPressed,
    pressedSources,
    checked,
    inputValues,
    activeIndex,
    menuOpen
  };
}

export function snapshotsEqual(a: DomSnapshot, b: DomSnapshot): boolean {
  return a.digest === b.digest;
}

/**
 * Detect the **source** of a behaviour that just occurred:
 *   - If the after-snapshot grew a new pressedSource entry tagged "baseline",
 *     the design-system runtime auto-wired it.
 *   - If a press toggle happened but no baseline tag was added, the component
 *     code owns the behaviour (native).
 *   - Otherwise no behaviour observed.
 */
function diffSource(before: DomSnapshot, after: DomSnapshot): BehaviourSource {
  const beforeBaseline = before.pressedSources.filter((s) => s === "baseline").length;
  const afterBaseline = after.pressedSources.filter((s) => s === "baseline").length;
  if (afterBaseline > beforeBaseline) return "baseline";
  if (before.digest !== after.digest) return "native";
  return "none";
}

export function classifyFinding(
  control: ControlProbe,
  outcome: InteractionOutcome,
  component: string | null,
  before?: DomSnapshot,
  after?: DomSnapshot
): InteractionFinding {
  const source: BehaviourSource =
    before && after && outcome === "state_changed"
      ? diffSource(before, after)
      : outcome === "state_changed"
        ? "native"
        : "none";

  if (outcome === "skipped_readonly") {
    return { ...control, outcome, category: "readonly", source: "none", note: "Read-only or display-only field" };
  }
  if (outcome === "click_failed") {
    return { ...control, outcome, category: "unknown", source: "none", note: "Pointer click failed or element not reachable" };
  }
  if (outcome === "state_changed") {
    const isDs =
      component === "MUIShowcase" ||
      control.role === "tab" ||
      control.role === "switch" ||
      control.role === "slider" ||
      control.tag === "select" ||
      control.tag === "textarea" ||
      control.opensMenu ||
      (control.tag === "input" && control.type === "checkbox") ||
      (control.tag === "input" &&
        ["text", "email", "password", "search", "tel", "url", "number", ""].includes(
          (control.type || "").toLowerCase()
        ));
    const sourceNote =
      source === "baseline"
        ? "Wired by @lab/ui design-system baseline runtime"
        : isDs
          ? "Design-system widget responds to input"
          : "Component code owns the state";
    return {
      ...control,
      outcome,
      category: "ds_builtin",
      source,
      note: sourceNote
    };
  }
  return {
    ...control,
    outcome,
    category: "static_shell",
    source: "none",
    note: "No visible state change — even with the design-system baseline this control did nothing"
  };
}
