const STATE_CSS_HINTS = {
  hover: '&:hover', hovered: '&:hover',
  pressed: '&:active, &:focus-visible', active: '&:active',
  disabled: '&:disabled, &[aria-disabled="true"]',
  loading: '(isLoading prop)', focused: '&:focus-visible',
  selected: '&[aria-selected="true"]',
};

function getCssHint(label) {
  const m = label.match(/state[=:](\w+)/i);
  if (!m) return '';
  const hint = STATE_CSS_HINTS[m[1].toLowerCase()];
  return hint ? ` → ${hint}` : '';
}

function formatBase(base) {
  const lines = [];
  for (const [k, v] of Object.entries(base.cssVars ?? {})) lines.push(`- ${k}: ${v}`);
  if (base.background) lines.push(`- background: ${base.background}`);
  if (base.cornerRadius) lines.push(`- border-radius: ${base.cornerRadius}`);
  if (base.padding) {
    const p = base.padding;
    lines.push(`- padding: ${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`);
  }
  if (base.gap) lines.push(`- gap: ${base.gap}`);
  if (base.boxShadow) lines.push(`- box-shadow: ${base.boxShadow}`);
  if (base.textColor) lines.push(`- color: ${base.textColor}`);
  if (base.typography) {
    const t = base.typography;
    lines.push(`- font: size=${t.fontSize} family=${t.fontFamily} weight=${t.fontWeight}`);
  }
  if (base.overflow) lines.push(`- overflow: ${base.overflow}`);
  return lines.length ? lines.join('\n') : '(none)';
}

function formatVariantOverrides(overrides) {
  if (!overrides || !Object.keys(overrides).length) return '(none)';
  return Object.entries(overrides).map(([label, s]) => {
    const lines = [`**${label}**${getCssHint(label)}`];
    for (const [k, v] of Object.entries(s.cssVars ?? {})) lines.push(`  - ${k}: ${v}`);
    if (s.background) lines.push(`  - background: ${s.background}`);
    if (s.opacity !== undefined) lines.push(`  - opacity: ${s.opacity}`);
    if (s.boxShadow) lines.push(`  - box-shadow: ${s.boxShadow}`);
    return lines.join('\n');
  }).join('\n\n');
}

function formatAxes(axes) {
  if (!axes || !Object.keys(axes).length) return '(none)';
  return Object.entries(axes).map(([axis, vals]) => `- ${axis}: [${vals.join(', ')}]`).join('\n');
}

function formatSizeDimensions(sd) {
  if (!sd || !Object.keys(sd).length) return '';
  const rows = Object.entries(sd)
    .map(([s, d]) => `  ${s}: height=${d.height}px paddingH=${d.paddingH}px paddingV=${d.paddingV}px gap=${d.gap}px`)
    .join('\n');
  return `\n### Size Dimensions\n${rows}`;
}

function formatTokens(tokens) {
  const section = (label, arr, fn) => arr?.length ? `### ${label}\n${arr.map(fn).join('\n')}` : '';
  return [
    section('Colors', tokens.colors, t => `- ${t.cssVar}: ${t.value}  (${t.name})`),
    section('Typography', tokens.typography, t => `- ${t.cssVar}: ${[t.fontSize, t.fontFamily, t.fontWeight].filter(Boolean).join('/')}  (${t.name})`),
    section('Shadows', tokens.shadows, t => `- ${t.cssVar}: ${t.value}  (${t.name})`),
    section('Border Radius', tokens.radius, t => `- ${t.cssVar}: ${t.value}  (${t.name})`),
    section('Gaps', tokens.gaps, t => `- ${t.cssVar}: ${t.value}  (${t.name})`),
  ].filter(Boolean).join('\n\n');
}

export function extractAllowedVars(tokensCss) {
  const matches = tokensCss.match(/--[\w-]+(?=\s*:)/g) ?? [];
  return [...new Set(matches)].sort();
}

export function buildSystemPrompt(tokens, libraryPromptBlock) {
  return `You are a React component engineer. Generate a production-quality React component from the design spec and screenshot.

## Design Tokens
${formatTokens(tokens)}

${libraryPromptBlock}

## Rules
1. Use ONLY CSS variables from the Allowed CSS Variables list — no hardcoded hex, pixel, or font values that have a token.
2. Raw values with no token: keep as-is with comment /* no token */.
3. Apply each variant override to the CSS selector shown after "→".
4. Variant axes (Size, Type) become TypeScript union props.
5. If icon slot is YES: accept optional \`icon?: React.ReactNode\` prop.
6. Base styles = Default state. Overrides are additive.
7. Screenshot = ground truth for layout and proportions.
8. Named export only, no default export. All props typed.

## Output
Respond with ONLY valid JSON, no markdown:
{"componentSource":"<full TSX>","storiesSource":"<CSF3 stories or null>"}`;
}

export function buildUserPrompt(componentName, styleManifest, tokensCss) {
  const allowedVars = extractAllowedVars(tokensCss);
  return `Generate component: **${componentName}**

## Style Manifest

### Base
${formatBase(styleManifest.base)}

### Variant Overrides
${formatVariantOverrides(styleManifest.variantOverrides)}

### Variant Axes
${formatAxes(styleManifest.variantAxes)}
${formatSizeDimensions(styleManifest.sizeDimensions)}

### Slots
- Icon slot: ${styleManifest.slots?.hasIconSlot ? 'YES' : 'NO'}

## Allowed CSS Variables
${allowedVars.join('\n')}

## Export
\`export const ${componentName}: React.FC<${componentName}Props> = ...\``;
}
