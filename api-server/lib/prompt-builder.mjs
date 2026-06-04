/**
 * Converts a string to PascalCase.
 * Handles: "button primary" → "ButtonPrimary", "ButtonPrimary" → "ButtonPrimary",
 *          "button-primary" → "ButtonPrimary", "button_primary" → "ButtonPrimary"
 * @param {string} str
 * @returns {string}
 */
function toPascalCase(str) {
  return str
    .replace(/[-_ ]+/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Converts a styleManifest object to a readable text block.
 * @param {object} manifest
 * @returns {string}
 */
function formatStyleManifest(manifest) {
  const lines = [];

  // Base styles
  if (manifest.base) {
    lines.push('### Base Styles');
    const base = manifest.base;

    if (base.cssVars && Object.keys(base.cssVars).length > 0) {
      lines.push('CSS Variables:');
      for (const [prop, value] of Object.entries(base.cssVars)) {
        lines.push(`  ${prop}: ${value}`);
      }
    }

    if (base.background) lines.push(`background: ${base.background}`);
    if (base.textColor) lines.push(`textColor: ${base.textColor}`);
    if (base.cornerRadius) lines.push(`cornerRadius: ${base.cornerRadius}`);
    if (base.boxShadow) lines.push(`boxShadow: ${base.boxShadow}`);
    if (base.gap) lines.push(`gap: ${base.gap}`);
    if (base.overflow) lines.push(`overflow: ${base.overflow}`);

    if (base.padding) {
      const p = base.padding;
      lines.push(`padding: top=${p.top} right=${p.right} bottom=${p.bottom} left=${p.left}`);
    }

    if (base.typography) {
      const t = base.typography;
      lines.push(`typography: fontSize=${t.fontSize}, fontFamily=${t.fontFamily}, fontWeight=${t.fontWeight}`);
    }
  }

  // Variant overrides
  if (manifest.variantOverrides && Object.keys(manifest.variantOverrides).length > 0) {
    lines.push('');
    lines.push('### Variant Overrides (per-state)');
    for (const [state, overrides] of Object.entries(manifest.variantOverrides)) {
      lines.push(`**${state}**:`);
      if (overrides.cssVars && Object.keys(overrides.cssVars).length > 0) {
        for (const [prop, value] of Object.entries(overrides.cssVars)) {
          lines.push(`  ${prop}: ${value}`);
        }
      }
      if (overrides.background) lines.push(`  background: ${overrides.background}`);
      if (overrides.opacity !== undefined) lines.push(`  opacity: ${overrides.opacity}`);
      if (overrides.boxShadow) lines.push(`  boxShadow: ${overrides.boxShadow}`);
    }
  }

  // Variant axes
  if (manifest.variantAxes && Object.keys(manifest.variantAxes).length > 0) {
    lines.push('');
    lines.push('### Variant Axes');
    for (const [axis, values] of Object.entries(manifest.variantAxes)) {
      lines.push(`  ${axis}: [${Array.isArray(values) ? values.join(', ') : String(values)}]`);
    }
  }

  // Size dimensions
  if (manifest.sizeDimensions && Object.keys(manifest.sizeDimensions).length > 0) {
    lines.push('');
    lines.push('### Size Dimensions');
    for (const [size, dims] of Object.entries(manifest.sizeDimensions)) {
      lines.push(`  ${size}: height=${dims.height}, paddingH=${dims.paddingH}, paddingV=${dims.paddingV}, gap=${dims.gap}`);
    }
  }

  // Slots
  if (manifest.slots) {
    lines.push('');
    lines.push(`### Slots`);
    lines.push(`  hasIconSlot: ${manifest.slots.hasIconSlot}`);
  }

  return lines.join('\n');
}

/**
 * Extracts all CSS variable names from a tokens.css string.
 * Returns a comma-separated list of up to 120 unique variable names.
 * @param {string} tokensCss
 * @returns {string}
 */
function extractAllowedVars(tokensCss) {
  const regex = /^\s*(--[a-z0-9-]+)\s*:/gm;
  const seen = new Set();
  let match;
  while ((match = regex.exec(tokensCss)) !== null) {
    seen.add(match[1]);
  }
  return [...seen].slice(0, 120).join(', ');
}

/**
 * Builds the Claude system prompt.
 *
 * @param {string} promptBlock - Library-specific instructions
 * @param {string} annotatedTokenSection - Pre-formatted token section string
 * @param {{ phase?: number }} [opts]
 *   phase=1 (default): tell Claude to use MuiBox for uncertain structural containers
 *   and focus on pixel-perfect visual accuracy; semantic translation happens in Phase 2.
 * @returns {string}
 */
export function buildSystemPrompt(promptBlock, annotatedTokenSection, { phase = 1 } = {}) {
  return `You are an expert React component generator for a design system.
${promptBlock}

## Design Tokens  (CSS variable → resolved value → semantic role)
${annotatedTokenSection || '  (no tokens provided)'}

## Rules
1. COLOUR MATCHING (CRITICAL): A Figma reference PNG is attached. Look at the actual colours, spacing, and layout in the image. Map those colours to the CSS variables above by comparing the resolved values (e.g. if the button is purple #6B3FA0, use the PRIMARY_ACTION variable). NEVER hardcode hex or rgba values.
2. Write TypeScript with proper prop types. NO any.
3. Use React.forwardRef for all components that wrap DOM elements.
4. Accept a className prop for styling overrides.
5. STYLING: Use the sx prop with CSS variable references for all Figma-derived styles. Spread ...sx last so developer overrides win.
6. EXPORT the Props interface as [ComponentName]Props. NAMED EXPORT ONLY: export { ComponentName }; at the end.
7. FIGMA LAYER HIERARCHY: A layer tree is provided in the user prompt. Implement that EXACT layout structure — do not invent a different structure.${phase === 1 ? `
   PHASE 1 FOCUS: Use MUI components wherever the choice is obvious (MuiStack for flex containers,
   MuiTypography for text, MuiButton for buttons, MuiTextField for inputs, MuiChip for chips, etc.).
   For top-level structural containers where you are unsure whether to use MuiDialog, MuiCard,
   MuiPaper, MuiDrawer, or MuiAppBar — use MuiBox as a placeholder with the correct sx styles.
   A separate semantic translation pass will resolve those structural choices.
   YOUR PRIORITY IN PHASE 1 IS PIXEL-PERFECT VISUAL ACCURACY.` : ''}
8. PROPS FROM FIGMA: Use the derived props list in the user prompt. Every text layer must be an exposed prop. Use Figma text as the default value so developers can override it.
9. ICON SLOT: If hasIconSlot in manifest, accept icon?: React.ReactNode. Render before content.
10. STANDARD PROPS — every component MUST also accept: onClick?, onHover?, isDisabled?, isLoading?, children?, sx?, className?
11. FIGMA STATE → CSS: per-variant styles (hover, pressed, Disabled) go in &:hover, &:disabled selectors. Never unconditional.
12. STORYBOOK (MANDATORY — Storybook 8+ ONLY):
    PROHIBITED: import { Story } from '@storybook/react', Template.bind({}), Default.args = {}
    MANDATORY:
    import type { Meta, StoryObj } from '@storybook/react';
    import { ComponentName } from './ComponentName';
    const meta = { title: 'Components/ComponentName', component: ComponentName,
      args: { /* use Figma text values as defaults */ } } satisfies Meta<typeof ComponentName>;
    export default meta;
    type Story = StoryObj<typeof meta>;
    export const Default: Story = {};
    export const Loading: Story = { args: { isLoading: true } };
    export const Disabled: Story = { args: { isDisabled: true } };
13. ROOT ELEMENT: MUST have data-figma-component="ComponentName" for automated pixel-diff testing.
14. VAR FALLBACK (MANDATORY): Every var(--name) MUST include a concrete fallback, e.g. var(--color-brand-500, #0ea5e9). Use the resolved value from the token table as the fallback.
15. TEXT COLOR: Always set color explicitly on root element. Never rely on UI library defaults.
16. BRANDED BACKGROUND: Components with branded background MUST set explicit backgroundColor in sx/style.
17. RESTRICTED VARS: Only reference CSS variables listed in the token table above.
18. VISUAL GROUND TRUTH: The reference PNG is the source of truth for visual layout. Trust the image over JSON descriptions for spacing ratios, alignment, border-radius proportions, and colour.
19. SIZE PROP: When manifest has sizeDimensions, add size?: 'lg' | 'md' | 'sm' | 'xs' prop defaulting to 'md'.
20. GRADIENT BUTTONS: If the reference PNG shows a gradient button background, use background: 'linear-gradient(...)' with the PRIMARY_ACTION colour and a darker/lighter shade of it.
21. ICONS (CRITICAL — NEVER IMPORT FROM ICON PACKAGES):
    - FORBIDDEN: import from @mui/icons-material, react-icons, lucide-react, @heroicons, phosphor-react, or any other icon package.
    - If the component analysis lists an icon node WITH path data: render it as a plain inline <svg> element using the provided viewBox and <path> elements. Wrap in <MuiSvgIcon> for consistent sizing if using MUI.
    - If the icon node has NO path data: expose it as an icon?: React.ReactNode prop (or iconSlot, micIcon, etc.) that defaults to null. The developer will inject their own icon.
    - A missing icon is always better than a forbidden import. If in doubt, use a React.ReactNode prop.

## Output Format
Respond with a JSON object:
{
  "componentSource": "// full .tsx file content",
  "storiesSource": "// full .stories.tsx file content"
}`;
}

/**
 * Builds the Claude user-turn prompt.
 * @param {string} componentName - PascalCase component name
 * @param {object} styleManifest - Style manifest object
 * @param {string} tokensCss - Full content of tokens.css
 * @param {string} [componentAnalysisSection] - Pre-formatted section from component-analyzer.mjs
 * @returns {string}
 */
export function buildUserPrompt(componentName, styleManifest, tokensCss, componentAnalysisSection) {
  const internalName = toPascalCase(componentName);
  const manifestText = formatStyleManifest(styleManifest);
  const allowedVars = extractAllowedVars(tokensCss);

  const analysisBlock = componentAnalysisSection
    ? `\n## Figma Component Analysis\n${componentAnalysisSection}\n`
    : '';

  return `Generate the ${componentName} React component matching the reference PNG attached above EXACTLY.
${analysisBlock}
## Style Manifest (base styles and state overrides)
${manifestText}

## Allowed CSS Variables (use ONLY these; every var() MUST include the resolved value as fallback)
${allowedVars}

## File Layout
- File: src/components/${internalName}/${internalName}.tsx
- Internal name: ${internalName}
- Props interface: ${internalName}Props  (use the derived props list above, plus standard props below)
- End with: export { ${internalName} };
- Stories file: src/components/${internalName}/${internalName}.stories.tsx
- Story import: import { ${internalName} } from './${internalName}';
- Root element MUST have: data-figma-component="${internalName}"

## Standard Props (add these to EVERY component in addition to Figma-derived props)
- onClick?: () => void
- onHover?: () => void
- isDisabled?: boolean
- isLoading?: boolean
- children?: React.ReactNode
- sx?: Record<string, unknown>
- className?: string`;
}
