# ContentListBoard → `ds.list`

**Status:** Draft (Phase 2.1) — refine using `pnpm test:logic:audit` gap output before implementation.
**Figma marker:** `data-figma-component="ContentListBoard"`  
**Storybook:** `Lab/ContentListBoard` — `default`, `compact`, `highlighted`  
**Visual variants (delivery):** `lab-contentlistboard--default`, `--compact`, `--highlighted`

---

## 1. What this component is

A **task / content list board**: breadcrumb context, titled header with primary action, optional inline quick-edit field, and a scrollable list of rows with status and priority badges.

**Product role:** display a collection of work items; let the developer drive data, async state, and actions. Visual layout is owned by the design system.

---

## 2. Public API (`ds.list`)

App developers call **only** this surface (not `ContentListBoard` directly):

```tsx
import { ds } from "@lab/ui";

ds.list({
  breadcrumbs,
  title,
  subtitle,
  items,
  isLoading,
  isEmpty,
  isError,
  errorMessage,
  disabled,
  quickEdit,
  compact,
  highlighted,
  onCreate,
  onItemAction,
  onQuickEditChange,
  onRetry,
});
```

### 2.1 Data in

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `items` | `ListItem[]` | when populated | Rows to render. Ignored when `isLoading` or `isEmpty` (see precedence). |
| `breadcrumbs` | `ListBreadcrumb[]` | no | Default: `[{ label: "Workspace" }, { label: "Components" }, { label: "Library QA", active: true }]` |
| `title` | `string` | no | Header title. Default: `"Component Task Board"`. |
| `subtitle` | `string` | no | Header description. Default: `"List, badges, icons, dividers and edit text controls"`. |
| `quickEdit` | `{ label: string; value: string }` | no | Controlled inline edit. Omit to hide the field. |
| `errorMessage` | `string` | no | Shown when `isError`. Default: `"Could not load tasks."` |

#### `ListItem`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | Stable key for React + callbacks |
| `title` | `string` | yes | Primary line (row heading) |
| `owner` | `string` | no | Secondary line, e.g. `"Owner: Nora"` |
| `status` | `{ label: string; tone: ListBadgeTone }` | no | Status badge |
| `priority` | `{ label: string; tone?: ListBadgeTone }` | no | Priority badge (default tone `neutral`) |

`ListBadgeTone`: `"success" | "warning" | "danger" | "neutral"`

### 2.2 State in (developer-controlled)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `isLoading` | `boolean` | `false` | Show loading skeleton; list non-interactive |
| `isEmpty` | `boolean` | `false` | Show empty state when `items.length === 0` or forced |
| `isError` | `boolean` | `false` | Show error banner + retry; list hidden or stale per product choice (**see 2.4**) |
| `disabled` | `boolean` | `false` | All actions inert; no callbacks fired |

**Precedence (mutually exclusive render modes):**

1. `isLoading` → loading UI  
2. else `isError` → error UI (+ optional retry)  
3. else `isEmpty` || `items.length === 0` → empty UI  
4. else → populated list  

If multiple flags are true, the highest row in this list wins (documented for tests).

### 2.3 Visual-only props (not business logic)

| Prop | Type | Default | Maps to |
| --- | --- | --- | --- |
| `compact` | `boolean` | `false` | `lab-contentlistboard--compact` |
| `highlighted` | `boolean` | `false` | `lab-contentlistboard--highlighted` |

These affect layout/density only. They must not change callback signatures or data shape.

### 2.4 Events out (callbacks)

| Callback | When fired | Payload |
| --- | --- | --- |
| `onCreate` | User clicks header **New Task** | `void` |
| `onItemAction` | User activates a list row (click or Enter/Space on focused row) | `{ item: ListItem; index: number }` |
| `onQuickEditChange` | User edits quick-edit input | `{ value: string }` |
| `onRetry` | User clicks **Retry** in error state | `void` |

**Rules:**

- Callbacks are **optional**. If omitted, the control is visible but inert (or hidden — TBD in 2.2 impl; default: visible + inert when `disabled`, hidden when callback absent — **decision: visible, inert if no handler** for header button to match current Storybook).
- When `disabled === true`, **no** callbacks fire.
- When `isLoading`, interactive controls are disabled and callbacks do not fire.

### 2.5 Controlled vs uncontrolled

| Concern | Controlled by |
| --- | --- |
| List data | Developer (`items`) |
| Async state | Developer (`isLoading`, `isEmpty`, `isError`) |
| Quick edit value | Developer (`quickEdit.value` + `onQuickEditChange`) |
| Row selection / highlight | **Not in v1** — optional future `selectedId` |
| Breadcrumb navigation | **Display only in v1** — no `onBreadcrumbClick` |

---

## 3. Interaction matrix (behavior test source of truth)

Each row becomes one or more Playwright steps in `pnpm test:behavior:golden -- --component list`.

| ID | Setup | User action | Expected UI | Expected callback |
| --- | --- | --- | --- | --- |
| L-01 | default populated `items` (≥2 rows) | — | Breadcrumbs, title, ≥2 rows with badges visible | — |
| L-02 | populated | Click **New Task** | — | `onCreate` once |
| L-03 | populated, `quickEdit` set | Type in quick-edit field | Input value updates in DOM | `onQuickEditChange` with new value |
| L-04 | populated | Click row at index `1` | Row receives active/focus styling (if any) | `onItemAction` with `{ item, index: 1 }` |
| L-05 | populated | Focus row 0, press Enter | — | `onItemAction` with `{ item, index: 0 }` |
| L-06 | `isLoading: true` | Click **New Task** / row | Loading skeleton visible; no list rows | no callbacks |
| L-07 | `isEmpty: true` | — | Empty message visible; no list rows | — |
| L-08 | `items: []`, `isEmpty: false` | — | Empty message visible (derived empty) | — |
| L-09 | `isError: true` | — | Error message + Retry control visible | — |
| L-10 | `isError: true` | Click **Retry** | — | `onRetry` once |
| L-11 | populated, `disabled: true` | Click row / **New Task** | — | no callbacks |
| L-12 | `compact: true` | — | Root has compact layout class | — |
| L-13 | `highlighted: true` | — | Root has highlighted layout class | — |
| L-14 | `isLoading` then props update to populated | wait / auto from demo | Transitions skeleton → list | — |

### Test hooks (playground demo only)

Demo route exposes for Playwright:

```ts
window.__labTestEvents: Array<{ type: string; payload?: unknown; at: number }>
```

Every callback above appends an event, e.g. `{ type: "list.onItemAction", payload: { id, index } }`.

---

## 4. Accessibility (behavior suite smoke)

| Check | Requirement |
| --- | --- |
| Landmarks | `<section>` with discernible header |
| Breadcrumb | `nav` + `aria-label="Breadcrumb"` |
| List | `<ul>` / `<li>` or `role="list"` / `role="listitem"` |
| **New Task** | `<button type="button">` with accessible name |
| Quick edit | `<label>` associated with `<input>` |
| Error retry | `<button type="button">` named “Retry” |

---

## 5. Default fixture data (Storybook / delivery parity)

Used for visual variants until props-driven refactor lands:

```ts
const DEFAULT_ITEMS: ListItem[] = [
  { id: "1", title: "Release Notes / Data Widgets", owner: "Nora", status: { label: "Ready", tone: "success" }, priority: { label: "High" } },
  { id: "2", title: "Billing Chart / Pie + Breakdown", owner: "Tom", status: { label: "In review", tone: "warning" }, priority: { label: "Medium" } },
  { id: "3", title: "Calendar Module / Sprint Timeline", owner: "Dana", status: { label: "Blocked", tone: "danger" }, priority: { label: "High" } },
  { id: "4", title: "Icon Tokens / Color Migration", owner: "Ruth", status: { label: "Ready", tone: "success" }, priority: { label: "Low" } },
];
```

Delivery pixel tests continue to use frozen `?story=lab-contentlistboard--*` URLs until `ds.list` renders identically with equivalent props.

---

## 6. Out of scope (v1)

- Inline row editing / drag reorder  
- Pagination / virtual scroll  
- Breadcrumb click navigation  
- Custom row actions menu (kebab)  
- Developer styling overrides (`className`, `style` on internals)

---

## 7. Implementation checklist (Phase 2.1+)

- [ ] Types in `@lab/contract` (`ListProps`, `ListItem`, …)  
- [ ] `ds.list` facade in `@lab/ui`  
- [ ] Refactor `ContentListBoard` to pure render from props  
- [ ] Storybook stories: `loading`, `empty`, `error`, `populated`  
- [ ] Playground `?demo=list` with mock polling + control panel  
- [ ] Behavior tests L-01 … L-14  
- [ ] Delivery re-run on visual variants  

---

## 8. Sign-off

- [ ] Product / design agrees interaction matrix  
- [ ] Matrix covers all clickable controls in current Storybook fixture  
- [ ] Approved to start `@lab/ui` refactor (2.2)
