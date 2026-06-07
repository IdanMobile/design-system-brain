/**
 * token-mapper.mjs
 *
 * Parses raw tokens + tokensCss to produce semantically-annotated token lists.
 * This gives Claude two critical pieces of information it otherwise lacks:
 *
 *   1. The RESOLVED VALUE of each CSS variable (e.g. --color-action-primary = #6B3FA0)
 *      so it can colour-match what it sees in the reference PNG to the right variable.
 *
 *   2. The SEMANTIC ROLE of each token (PRIMARY_ACTION, SURFACE_BACKGROUND, TEXT_PRIMARY …)
 *      so it knows which variable to reach for in each context without guessing.
 */

// ─── Semantic role classifiers ────────────────────────────────────────────────

const COLOR_ROLES = [
  { role: 'PRIMARY_ACTION',    test: n => /\b(action[_-]primary|cta|primary[_-]btn|brand[_-]main)\b/i.test(n) },
  { role: 'BRAND_PRIMARY',     test: n => /\b(brand|primary)\b.*\b(500|bold|main|default)\b|\b(primary|brand)[_-](500|main|bold)\b/i.test(n) },
  { role: 'SURFACE_BG',        test: n => /\b(page|surface|background|bg)[_-](light|dark|base|default|main)\b|\b(bg|background|surface)\b(?![_-]text)/i.test(n) },
  { role: 'SURFACE_OVERLAY',   test: n => /\b(overlay|modal|dialog|card|panel|sheet)\b/i.test(n) },
  { role: 'TEXT_PRIMARY',      test: n => /\b(text|fg|foreground)[_-](primary|icons?|main|default)\b|\btext[_-]icons\b/i.test(n) },
  { role: 'TEXT_SECONDARY',    test: n => /\b(secondary|muted|caption|subtitle|placeholder|body[_-]text)\b/i.test(n) },
  { role: 'BORDER',            test: n => /\b(border|stroke|outline|divider|separator)\b/i.test(n) },
  { role: 'ERROR',             test: n => /\b(error|danger|destructive|critical|negative)\b/i.test(n) },
  { role: 'SUCCESS',           test: n => /\b(success|positive|confirm|green)\b/i.test(n) },
  { role: 'WARNING',           test: n => /\b(warning|caution|attention|amber)\b/i.test(n) },
];

const FONT_ROLES = [
  { role: 'HEADING',  test: n => /\b(h[1-6]|heading|title|display|hero|headline)\b/i.test(n) },
  { role: 'LABEL',   test: n => /\b(label|caption|small|xs|tiny|button|cta)\b/i.test(n) },
  { role: 'BODY',    test: n => /\b(body|paragraph|regular|normal|default|text)\b/i.test(n) },
];

function classifyColorRole(name) {
  for (const { role, test } of COLOR_ROLES) {
    if (test(name)) return role;
  }
  return null;
}

function classifyFontRole(name) {
  for (const { role, test } of FONT_ROLES) {
    if (test(name)) return role;
  }
  return null;
}

// ─── CSS var parser ───────────────────────────────────────────────────────────

/**
 * Parse a tokensCss string and return { '--var-name': 'resolvedValue' }.
 * Handles multi-value properties (e.g. box-shadow) and hex colours.
 */
export function parseCssVarValues(tokensCss) {
  const result = {};
  const re = /^\s*(--[a-z][a-z0-9-]*)\s*:\s*(.+?)\s*;/gm;
  let m;
  while ((m = re.exec(tokensCss)) !== null) {
    result[m[1]] = m[2].trim();
  }
  return result;
}

// ─── CSS var derivation ───────────────────────────────────────────────────────

/**
 * Attempt to find the CSS variable name for a token.
 * Tokens from guing may have an explicit cssVar field, or we derive from the name.
 */
function deriveCssVar(token, cssVarValues) {
  if (token.cssVar && cssVarValues[token.cssVar]) return token.cssVar;

  const slug = '--' + token.name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');

  if (cssVarValues[slug]) return slug;

  const namePart = token.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const cssVar of Object.keys(cssVarValues)) {
    if (cssVar.replace(/[^a-z0-9]/g, '').endsWith(namePart)) return cssVar;
  }

  return token.cssVar || slug;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build fully-annotated token lists from raw token arrays + tokensCss.
 *
 * @param {{ colors, typography, shadows, radius, gaps }} tokens
 * @param {string} tokensCss
 * @returns {{ colors, typography, radius, shadows, gaps, cssVarValues }}
 */
export function buildAnnotatedTokens(tokens, tokensCss) {
  const cssVarValues = parseCssVarValues(tokensCss);

  const colors = (tokens.colors ?? []).map(t => {
    const cssVar = deriveCssVar(t, cssVarValues);
    const value = cssVarValues[cssVar] || t.value || null;
    return { type: 'color', name: t.name, cssVar, value, role: classifyColorRole(t.name) };
  });

  const typography = (tokens.typography ?? []).map(t => {
    // Typography tokens from guing arrive as structured objects with fontFamily/fontSize/fontWeight.
    // Try to find matching CSS vars by suffix matching.
    const nameLower = t.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const findVar = suffix => {
      for (const cssVar of Object.keys(cssVarValues)) {
        const clean = cssVar.replace(/[^a-z0-9]/g, '');
        if (clean.includes(nameLower) && clean.endsWith(suffix)) return cssVar;
      }
      return null;
    };

    const familyCssVar = t.cssVarFamily || findVar('family') || findVar('font');
    const sizeCssVar   = t.cssVarSize   || findVar('size');
    const weightCssVar = t.cssVarWeight || findVar('weight');

    return {
      type: 'typography',
      name: t.name,
      role: classifyFontRole(t.name),
      family: {
        cssVar: familyCssVar,
        value: (familyCssVar && cssVarValues[familyCssVar]) || t.fontFamily || null,
      },
      size: {
        cssVar: sizeCssVar,
        value: (sizeCssVar && cssVarValues[sizeCssVar]) || (t.fontSize ? `${t.fontSize}px` : null),
      },
      weight: {
        cssVar: weightCssVar,
        value: (weightCssVar && cssVarValues[weightCssVar]) || (t.fontWeight ? String(t.fontWeight) : null),
      },
      lineHeight: t.lineHeight || null,
    };
  });

  const radius = (tokens.radius ?? []).map(t => {
    const cssVar = deriveCssVar(t, cssVarValues);
    const value = cssVarValues[cssVar] || (t.value != null ? String(t.value) : null);
    return { type: 'radius', name: t.name, cssVar, value };
  });

  const shadows = (tokens.shadows ?? []).map(t => {
    const cssVar = deriveCssVar(t, cssVarValues);
    const value = cssVarValues[cssVar] || t.value || null;
    return { type: 'shadow', name: t.name, cssVar, value };
  });

  const gaps = (tokens.gaps ?? []).map(t => {
    const cssVar = deriveCssVar(t, cssVarValues);
    const value = cssVarValues[cssVar] || (t.value != null ? String(t.value) : null);
    return { type: 'gap', name: t.name, cssVar, value };
  });

  return { colors, typography, radius, shadows, gaps, cssVarValues };
}

// ─── Prompt formatter ─────────────────────────────────────────────────────────

/**
 * Format annotated tokens as a prompt section that includes resolved values.
 * The resolved value lets Claude colour-match the reference PNG to CSS variables.
 */
export function formatAnnotatedTokensSection(annotated) {
  const lines = [];

  // ── Colors ───────────────────────────────────────────────────────────────────
  if (annotated.colors.length > 0) {
    lines.push('### Colors  (CSS variable → resolved value → semantic role)');
    for (const c of annotated.colors) {
      const role = c.role ? `  [${c.role}]` : '';
      const val  = c.value ? ` = ${c.value}` : '';
      lines.push(`  ${c.name}: var(${c.cssVar}, ${c.value ?? c.name})${val}${role}`);
    }

    // Semantic quick-reference — the single most important block for Claude
    const primary    = annotated.colors.find(c => c.role === 'PRIMARY_ACTION') ||
                       annotated.colors.find(c => c.role === 'BRAND_PRIMARY');
    const bg         = annotated.colors.find(c => c.role === 'SURFACE_BG');
    const textPrim   = annotated.colors.find(c => c.role === 'TEXT_PRIMARY');
    const textSec    = annotated.colors.find(c => c.role === 'TEXT_SECONDARY');
    const border     = annotated.colors.find(c => c.role === 'BORDER');
    const overlay    = annotated.colors.find(c => c.role === 'SURFACE_OVERLAY');

    const semantics = [
      primary  && `  PRIMARY_ACTION  (CTA buttons, focus rings, links):  var(${primary.cssVar}, ${primary.value ?? ''})`,
      bg       && `  SURFACE_BG      (page/card background):             var(${bg.cssVar}, ${bg.value ?? ''})`,
      overlay  && `  SURFACE_OVERLAY (modal/dialog overlay background):  var(${overlay.cssVar}, ${overlay.value ?? ''})`,
      textPrim && `  TEXT_PRIMARY    (headings, body text):              var(${textPrim.cssVar}, ${textPrim.value ?? ''})`,
      textSec  && `  TEXT_SECONDARY  (muted/secondary text):             var(${textSec.cssVar}, ${textSec.value ?? ''})`,
      border   && `  BORDER          (strokes, dividers):                var(${border.cssVar}, ${border.value ?? ''})`,
    ].filter(Boolean);

    if (semantics.length > 0) {
      lines.push('');
      lines.push('### Semantic Colour Map  ← USE THESE for matching colours in the reference PNG');
      lines.push(...semantics);
    }
  }

  // ── Typography ───────────────────────────────────────────────────────────────
  if (annotated.typography.length > 0) {
    lines.push('');
    lines.push('### Typography Scales');
    for (const f of annotated.typography) {
      const role = f.role ? `  [${f.role}]` : '';
      const parts = [];
      if (f.family.cssVar)  parts.push(`font-family: var(${f.family.cssVar}, ${f.family.value ?? 'sans-serif'})`);
      if (f.size.cssVar)    parts.push(`font-size: var(${f.size.cssVar}, ${f.size.value ?? '16px'})`);
      if (f.weight.cssVar)  parts.push(`font-weight: var(${f.weight.cssVar}, ${f.weight.value ?? '400'})`);
      if (f.lineHeight)     parts.push(`line-height: ${f.lineHeight}`);
      lines.push(`  ${f.name}${role}: ${parts.join(';  ')}`);
    }
  }

  // ── Radius ───────────────────────────────────────────────────────────────────
  if (annotated.radius.length > 0) {
    lines.push('');
    lines.push('### Border Radius');
    for (const r of annotated.radius) {
      lines.push(`  ${r.name}: var(${r.cssVar}, ${r.value ?? '4px'})`);
    }
  }

  // ── Shadows ──────────────────────────────────────────────────────────────────
  if (annotated.shadows.length > 0) {
    lines.push('');
    lines.push('### Shadows');
    for (const s of annotated.shadows) {
      lines.push(`  ${s.name}: var(${s.cssVar}, ${s.value ?? 'none'})`);
    }
  }

  // ── Gaps ─────────────────────────────────────────────────────────────────────
  if (annotated.gaps.length > 0) {
    lines.push('');
    lines.push('### Spacing / Gaps');
    for (const g of annotated.gaps) {
      lines.push(`  ${g.name}: var(${g.cssVar}, ${g.value ?? '8px'})`);
    }
  }

  return lines.join('\n');
}
