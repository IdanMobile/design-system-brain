# Delivery principles

**Rule:** Every Storybook story is a **designer deliverable**. If it exists in Storybook (and we extract it), it must exist in the **delivery package** and pass **full delivery** — Storybook · Delivery showcase · Figma — with no permanent exceptions.

This holds for atoms (Button), composites (ContentListBoard), and **page-scale fixtures** (MUI showcase today; full app pages later).

---

## What delivery proves

| **Designer** | Storybook iframe | What design signed off on |
| **Delivery showcase** | Vite app on :6108 | What developers import and run |
| **Figma** | Artifact import / mock renderer | What lands in the design file |

All three must match visually (pixel tests). Behavior is a separate Phase 2 step.

There is no alternate “2-way only” delivery path in the end state. A story that cannot run the package leg is **not delivered yet** — not “skipped by design.”

---

## One story → one package surface

How the designer grouped it in Storybook is how the package exposes it:

| Storybook fixture | Package export | Example |
| --- | --- | --- |
| Single lab component | `ds.button(...)`, `ds.list(...)` | `lab-button--primary` |
| One big composite page | **One wrapped component** | `mui--showcase` → `ds.muiShowcase()` or `<MUIShowcase />` |
| Full page (future) | **One page component** | `checkout--default` → `ds.page({ id: 'checkout', ... })` |

If the designer wrapped MUI as **one** `data-figma-component` root, developers get **one** import that renders the whole thing — not 40 separate MUI primitives they assemble themselves.

Internal implementation may use MUI, hand-built markup, or generated code; the **public** surface is always the wrapped deliverable.

---

## Storybook is not the source of truth for imports

Storybook **fixtures** must render the same code path as the package:

```tsx
// Storybook story
import { MUIShowcase } from "@lab/ui";
export const Showcase = () => <MUIShowcase />;
```

Not: Storybook imports `@mui/material` while `@lab/ui` has nothing. That split is what `storybookOnly` meant historically — it is a **temporary backlog marker**, not a product category.

---

## `storybookOnly` (transitional)

Today `mui--showcase` is flagged `storybookOnly: true` because the package leg was never implemented. Portfolio shows delivery **skipped**.

**Target:** remove the flag by adding the wrapped export to `@lab/ui`, wiring Storybook + playground + delivery, and re-running the 3-way test until green.

Every `storybookOnly` row is a **TODO**, not an allowed exception.

---

## Delivery showcase

The Vite app lists **every story that passes delivery** — including page-scale composites. Catalog is portfolio-gated; no story is hidden because it is “too big.”

Future: full pages in Storybook follow the same pipeline (extract → pixel → figma → live → delivery → behavior).

---

## Relation to Phase 2 (`ds.*`)

- **Visual delivery (step 4):** frozen props / wrapped component matches designer — required for **all** stories first.
- **Behavior (step 5):** data, state, callbacks — rolled out per component after semantic spec.

A page-level `MUIShowcase` can start as a **visual-only** wrapped export (no props except maybe `className`), then gain behavior props when we spec what developers should control on a full page.

---

## Next concrete gap: `mui--showcase`

1. Add `MUIShowcase` to `@lab/ui` (move or share markup from `MUI.stories.tsx`).
2. Storybook imports from `@lab/ui`.
3. Register in contract + playground (`MUIShowcase` / `ds.muiShowcase`).
4. Remove `storybookOnly`.
5. Run delivery 3-way until pass; include in Delivery showcase.

Same pattern repeats for each future full-page story.
