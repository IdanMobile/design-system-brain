/**
 * Returns library-specific configuration for component generation.
 * @param {'mui' | 'shadcn' | 'radix' | 'daisyui'} library
 * @returns {{ promptBlock: string, packageDependencies: string[], translationGuide: string }}
 */
export function getLibraryConfig(library) {
  switch (library) {
    case 'mui':
      return {
        promptBlock: `## Library: Material UI (@mui/material)
- CRITICAL — Import rule: NEVER import from '@mui/material' directly. ALWAYS import from '../adapters/mui/internal' using the Mui prefix alias.
  Example: import { MuiButton, MuiCheckbox, MuiFormControlLabel } from '../adapters/mui/internal';
  Then use MuiButton, MuiCheckbox, etc. — never the bare MUI names.
- Apply Figma styles using the sx prop with CSS variable references, e.g. sx={{ backgroundColor: 'var(--color-action-primary)' }}
- The DesignSystemProvider wraps the app with an MUI theme that already maps tokens globally
- Use MUI's built-in :hover/:disabled/:focus states where possible; only override in sx when Figma specifies a different value
- Use sx={{ '&:hover': {...}, '&:disabled': {...} }} for interactive state overrides`,
        packageDependencies: ['@mui/material', '@emotion/react', '@emotion/styled'],
        translationGuide: `## MUI Semantic Translation Guide

You are given a pixel-correct component that uses MuiBox as a structural fallback for containers
whose semantic role was uncertain during generation. Replace MuiBox with the correct MUI semantic
component based on the visual clues in the Figma reference and the layer structure.

### Dialog / Modal Pattern
Clue: the root element has a dark/overlay background (SURFACE_OVERLAY token), a border-radius,
a max-width constraint, or is described as a "dialog" / "modal" / "alert" in the Figma layer tree.
Translation:
- Root MuiBox → <MuiDialog open={open ?? true} onClose={onClose}>
- Inner content MuiBox (main body area) → <MuiDialogContent>
- Title text MuiBox at the top (heading font size) → <MuiDialogTitle>
- Bottom action buttons container MuiBox → <MuiDialogActions>
- Expose new props: open?: boolean (default true), onClose?: () => void

### Button Pattern
Clue: element has an onClick prop, is inside MuiDialogActions, has pointer cursor sx,
or wraps only text + optional icon.
Translation:
- MuiBox → <MuiButton variant="...">
  - Solid fill (backgroundColor CSS var in sx): variant="contained"
  - Border only (border CSS var, no fill): variant="outlined"
  - No fill, no border: variant="text"
- Keep ALL sx props on MuiButton.
- Already-correct: MuiButton stays as MuiButton.

### Typography Pattern
Clue: element renders only text (no child elements), has font-family/size/weight in sx.
Translation:
- Text-only MuiBox → <MuiTypography variant="...">
  - Large heading font (HEADING role): variant="h5" or "h4" depending on relative size
  - Body text (BODY role): variant="body1"
  - Small/caption (LABEL role): variant="caption"
- Keep sx intact.
- MuiTypography that's already there stays as-is.

### Card Pattern
Clue: element has cornerRadius sx, boxShadow sx, contains content sections with a header,
body, and optional action row. No overlay/backdrop.
Translation:
- Root MuiBox → <MuiCard>
- Body content area → <MuiCardContent>
- Header section (title + optional subtitle) → <MuiCardHeader title={...} subheader={...}>
- Action buttons row at bottom → <MuiCardActions>

### Stack / Layout
- MuiStack is already semantic — leave it unchanged.
- MuiBox used purely as a flex/grid container with no visual styling other than layout properties
  (display, flexDirection, gap, alignItems, justifyContent) → leave as MuiBox (it IS the right choice).

### Divider
- A zero-height or 1px MuiBox used as a visual separator → <MuiDivider>

### Conservative Rules (IMPORTANT)
- If you are not confident which semantic component applies, leave the element as MuiBox.
- Do NOT change structural nesting or move children between elements.
- Do NOT change any sx prop values — not even to "clean them up".
- Do NOT add new imports that don't exist in the current adapter.
- The import source must stay '../adapters/mui/internal'; only the named identifiers change.`,
      };

    case 'shadcn':
      return {
        promptBlock: `## Library: shadcn/ui (Tailwind CSS)
- CRITICAL — Import rule: NEVER import directly from 'shadcn/ui' package roots. ALWAYS import from '../adapters/shadcn/internal' using the Shadcn prefix alias.
  Example: import { ShadcnButton, ShadcnInput } from '../adapters/shadcn/internal';
  Then use ShadcnButton, ShadcnInput, etc. — never the bare shadcn names.
- Apply Figma styles using Tailwind CSS utility classes with CSS variable references, e.g. className="bg-[var(--color-action-primary)]"
- Use cn() utility for conditional class merging
- For interactive states use Tailwind variants: hover:, disabled:, focus:, etc.
- Pass className prop through to root element for external overrides`,
        packageDependencies: ['shadcn', 'tailwindcss', 'class-variance-authority', 'clsx'],
        translationGuide: `## shadcn/ui Semantic Translation Guide

Replace plain div/span containers with shadcn semantic components based on visual role.

### Dialog / Modal Pattern
Clue: overlay background, modal-style centered layout, close button, title + body + actions.
Translation: root div → <ShadcnDialog open={open ?? true} onOpenChange={onClose}>
  Wrap content in <ShadcnDialogContent>, title in <ShadcnDialogHeader>/<ShadcnDialogTitle>,
  description in <ShadcnDialogDescription>, actions in <ShadcnDialogFooter>.

### Button Pattern
Clue: has onClick, cursor-pointer className, or is inside DialogFooter.
Translation: plain div → <ShadcnButton variant="default|outline|ghost|destructive|secondary">
  Keep all className values intact. Infer variant from Tailwind classes.

### Card Pattern
Clue: rounded container with shadow, contains header + body sections.
Translation: root div → <ShadcnCard>, header → <ShadcnCardHeader>/<ShadcnCardTitle>,
  body → <ShadcnCardContent>, footer → <ShadcnCardFooter>.

### Alert Pattern
Clue: coloured banner with icon + message.
Translation: div → <ShadcnAlert variant="default|destructive">.

### Conservative Rule: if not confident, leave as plain div/span.`,
      };

    case 'radix':
      return {
        promptBlock: `## Library: Radix UI (headless + inline styles)
- CRITICAL — Import rule: NEVER import from '@radix-ui/*' packages directly. ALWAYS import from '../adapters/radix/internal' using the Radix prefix alias.
  Example: import { RadixButton, RadixCheckbox } from '../adapters/radix/internal';
  Then use RadixButton, RadixCheckbox, etc. — never the bare Radix names.
- Apply Figma styles using the style prop with CSS variable references, e.g. style={{ backgroundColor: 'var(--color-action-primary)' }}
- Radix components are headless — you are responsible for all visual styling via inline styles or CSS
- Use data-state and data-disabled attributes for interactive state styling
- For hover/focus states use CSS-in-JS or pass style objects; prefer data-attribute selectors`,
        packageDependencies: ['@radix-ui/themes', '@radix-ui/react-dialog', '@radix-ui/react-checkbox', '@radix-ui/react-dropdown-menu'],
        translationGuide: `## Radix UI Semantic Translation Guide

Replace plain div containers with Radix primitive compositions based on visual role.

### Dialog / Modal Pattern
Clue: overlay background, modal centered layout with title + body + close action.
Translation:
  Root div → <RadixDialog.Root open={open ?? true} onOpenChange={onClose}>
    <RadixDialog.Portal><RadixDialog.Overlay /><RadixDialog.Content>
      title span → <RadixDialog.Title>, body → <RadixDialog.Description>,
      close button → <RadixDialog.Close asChild>

### Button Pattern
Clue: has onClick or role="button".
Translation: div → use asChild pattern or wrap with appropriate Radix primitive.

### Conservative Rule: if not confident, leave as plain div/span with style props.`,
      };

    case 'daisyui':
      return {
        promptBlock: `## Library: DaisyUI (Tailwind CSS)
- DaisyUI is a CSS/Tailwind plugin — there are no JS imports. Use DaisyUI class names (btn, card, badge, etc.) combined with Tailwind utility classes. Apply Figma tokens via Tailwind arbitrary values: bg-[var(--color-primary)] text-[var(--color-text-main)].
- Apply Figma styles using DaisyUI Tailwind utility classes combined with CSS variable overrides
- Use DaisyUI semantic class names (btn, card, input, etc.) as base, then override with CSS variables
- For interactive states use Tailwind variants: hover:, disabled:, focus:, active:, etc.
- Pass className prop through to root element so callers can add modifiers`,
        packageDependencies: ['daisyui', 'tailwindcss'],
        translationGuide: `## DaisyUI Semantic Translation Guide

Replace plain div/span elements with DaisyUI semantic class patterns.

### Modal / Dialog Pattern
Clue: overlay background, modal-centered layout.
Translation: add className="modal" to overlay, "modal-box" to content container.
  Add close button with className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2".

### Button Pattern
Clue: has onClick or acts as a CTA.
Translation: div → <button className="btn btn-primary|btn-secondary|btn-ghost|btn-outline ...">
  Keep all arbitrary Tailwind value classes (bg-[var(...)], etc.).

### Card Pattern
Clue: rounded shadowed container with sections.
Translation: root div → add className="card ...", body → "card-body", title → "card-title".

### Alert Pattern
Clue: coloured banner with message.
Translation: div → add className="alert alert-info|alert-warning|alert-error|alert-success".

### Conservative Rule: if not confident, leave existing className as-is.`,
      };

    default:
      throw new Error(`Unknown library: "${library}". Must be one of: mui, shadcn, radix, daisyui`);
  }
}
