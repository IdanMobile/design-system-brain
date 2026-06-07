/**
 * component-analyzer.mjs
 *
 * Analyses the enrichedComponent Figma structure to extract three things:
 *
 *   1. Prop schema — React props derived from Figma component properties
 *      (TEXT → ReactNode with Figma text as default, BOOLEAN → boolean,
 *       INSTANCE_SWAP → ReactNode slot, VARIANT → union string type).
 *      Callback props (onConfirm, onCancel …) are inferred from interactive
 *      layer names in the tree.
 *
 *   2. Layer summary — a concise human-readable tree Claude can follow for
 *      layout structure, fills, spacing, and text content.
 *
 *   3. Text defaults — actual text from Figma TEXT nodes used as Story args.
 */

const MAX_TREE_DEPTH = 5;

// Node types Figma uses for vector/icon shapes
const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE', 'LINE']);

// Layer name patterns that signal an icon layer
const ICON_NAME_RE = /\b(icon|ic_|ico|glyph|symbol|pictogram|logo|mic|camera|bell|home|search|close|check|arrow|chevron|plus|minus|edit|delete|trash|settings|gear|user|profile|heart|star|bookmark|share|upload|download|play|pause|stop|send|attach|lock|unlock)\b/i;

// ─── Layer tree traversal ─────────────────────────────────────────────────────

function collectTextNodes(node, depth = 0, results = []) {
  if (!node) return results;
  if (node.type === 'TEXT') {
    const text = node.characters ?? node.text ?? node.value ?? '';
    results.push({ name: node.name, text, depth });
  }
  for (const child of node.children ?? []) {
    collectTextNodes(child, depth + 1, results);
  }
  return results;
}

/**
 * Detect icon/vector nodes and extract their SVG path data when available.
 * Figma vector nodes have vectorPaths: [{ windingRule, data }] — the `data` field
 * is an SVG path string (M... L... Z...) that can be used directly in <path d="...">.
 */
function collectIconNodes(node, results = []) {
  if (!node) return results;

  const isVectorType = VECTOR_TYPES.has(node.type);
  const hasIconName  = ICON_NAME_RE.test(node.name ?? '');

  // Consider a node an icon if:
  // (a) it's a vector type, OR
  // (b) its name matches icon patterns AND it has no text children AND is small (< 64px)
  const isSmall    = (node.width ?? 999) <= 64 && (node.height ?? 999) <= 64;
  const hasNoText  = !(node.children ?? []).some(c => c.type === 'TEXT');
  const isIconNode = isVectorType || (hasIconName && isSmall && hasNoText);

  if (isIconNode) {
    const entry = {
      name: node.name ?? 'icon',
      type: node.type,
      width: node.width != null ? Math.round(node.width) : null,
      height: node.height != null ? Math.round(node.height) : null,
      paths: null,
    };

    // Extract SVG path data if available (Figma plugin API exposes this on VectorNode)
    const vp = node.vectorPaths ?? node.svgPaths ?? [];
    if (vp.length > 0) {
      entry.paths = vp.map(p => ({
        windingRule: (p.windingRule ?? 'NONZERO').toLowerCase(),
        d: p.data ?? p.path ?? '',
      })).filter(p => p.d);
    }

    // Also check for pre-exported SVG string
    if (!entry.paths && node.svgData) {
      entry.svgString = node.svgData;
    }

    // Fill colour for the icon
    const fill = (node.fills ?? [])[0];
    if (fill?.type === 'SOLID' && fill.color) {
      const { r, g, b } = fill.color;
      entry.fillHex = '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    }

    results.push(entry);
    return results; // Don't recurse into icon children
  }

  for (const child of node.children ?? []) {
    collectIconNodes(child, results);
  }
  return results;
}

const INTERACTIVE_PATTERNS = [
  { role: 'PRIMARY_BUTTON',   re: /\b(cta|primary|confirm|continue|submit|ok|save|proceed|accept|yes)\b/i },
  { role: 'SECONDARY_BUTTON', re: /\b(secondary|cancel|dismiss|close|back|return|no)\b/i },
  { role: 'DESTRUCTIVE',      re: /\b(delete|remove|destroy|discard|danger)\b/i },
  { role: 'LINK',             re: /\b(link|anchor|learn[_-]?more)\b/i },
];

function collectInteractiveNodes(node, results = []) {
  if (!node) return results;
  for (const { role, re } of INTERACTIVE_PATTERNS) {
    if (re.test(node.name)) { results.push({ name: node.name, role, type: node.type }); break; }
  }
  for (const child of node.children ?? []) collectInteractiveNodes(child, results);
  return results;
}

/**
 * Build a human-readable layer tree for the prompt.
 * Includes fill colours (hex), layout mode, gap, text content, and dimensions.
 */
function buildLayerSummary(node, depth = 0) {
  if (!node || depth > MAX_TREE_DEPTH) return null;
  const indent = '  '.repeat(depth);
  let line = `${indent}[${node.type ?? 'NODE'}] "${node.name ?? ''}"`;

  const hints = [];

  // Dimensions
  if (node.width != null && node.height != null) {
    hints.push(`${Math.round(node.width)}×${Math.round(node.height)}px`);
  }

  // Layout
  if (node.layoutMode)                hints.push(`flex-${node.layoutMode.toLowerCase()}`);
  if (node.primaryAxisAlignItems)     hints.push(`main=${node.primaryAxisAlignItems}`);
  if (node.counterAxisAlignItems)     hints.push(`cross=${node.counterAxisAlignItems}`);
  if (node.itemSpacing != null)       hints.push(`gap=${node.itemSpacing}px`);
  if (node.paddingTop != null)        hints.push(`pad=${node.paddingTop}/${node.paddingRight}/${node.paddingBottom}/${node.paddingLeft}px`);

  // Corner radius
  if (node.cornerRadius != null && node.cornerRadius > 0) hints.push(`r=${node.cornerRadius}px`);

  // Fill colour
  const fill = (node.fills ?? [])[0];
  if (fill) {
    if (fill.type === 'SOLID' && fill.color) {
      const { r, g, b, a } = fill.color;
      const hex = '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
      hints.push(`fill=${hex}${a != null && a < 1 ? Math.round(a * 100) + '%' : ''}`);
    } else if (/GRADIENT/.test(fill.type ?? '')) {
      hints.push('fill=gradient');
    }
  }

  // Text
  if (node.type === 'TEXT') {
    const txt = (node.characters ?? node.text ?? '').slice(0, 60);
    if (txt) hints.push(`text="${txt}${txt.length === 60 ? '…' : ''}"`);
    if (node.fontSize)   hints.push(`size=${node.fontSize}`);
    if (node.fontWeight) hints.push(`weight=${node.fontWeight}`);
    if (node.textAlignHorizontal) hints.push(`align=${node.textAlignHorizontal}`);
  }

  if (hints.length) line += `  (${hints.join(', ')})`;

  const children = [];
  for (const child of node.children ?? []) {
    if (depth < MAX_TREE_DEPTH) {
      const s = buildLayerSummary(child, depth + 1);
      if (s) children.push(s);
    }
  }
  if (node.children?.length > 0 && depth >= MAX_TREE_DEPTH) {
    children.push(`${'  '.repeat(depth + 1)}… ${node.children.length} more children`);
  }

  return [line, ...children].join('\n');
}

// ─── Prop derivation ──────────────────────────────────────────────────────────

/**
 * Convert Figma component properties to React prop definitions.
 * TEXT props use the Figma default value as the prop default (developer can override).
 */
function derivePropsFromFigmaProperties(componentProperties) {
  if (!componentProperties) return [];
  const props = [];

  for (const [key, prop] of Object.entries(componentProperties)) {
    // camelCase the key: "Alert Title" → "alertTitle"
    const name = key.trim()
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .split(/\s+/)
      .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))
      .join('');

    switch (prop.type) {
      case 'TEXT':
        props.push({
          name,
          tsType: 'React.ReactNode',
          description: `Content of "${key}" text layer`,
          defaultValue: prop.defaultValue ?? null,
          source: 'figma-text',
        });
        break;

      case 'BOOLEAN':
        props.push({
          name,
          tsType: 'boolean',
          description: `Toggle "${key}" element visibility`,
          defaultValue: prop.defaultValue ?? false,
          source: 'figma-boolean',
        });
        break;

      case 'INSTANCE_SWAP':
        props.push({
          name,
          tsType: 'React.ReactNode',
          description: `Slot for swapping "${key}" component`,
          defaultValue: null,
          source: 'figma-instance-swap',
        });
        break;

      case 'VARIANT':
        if (prop.variantOptions?.length > 0) {
          const union = prop.variantOptions.map(v => `'${v}'`).join(' | ');
          props.push({
            name,
            tsType: union,
            description: `Variant axis "${key}"`,
            defaultValue: prop.defaultValue ?? prop.variantOptions[0],
            source: 'figma-variant',
          });
        }
        break;
    }
  }

  return props;
}

/**
 * Derive onClick callback props from interactive nodes found in the layer tree.
 * Named after the layer: "Continue Button" → onContinue, "Cancel" → onCancel.
 */
function deriveCallbackProps(interactiveNodes) {
  const seen = new Set();
  const props = [];

  for (const node of interactiveNodes) {
    let callbackName;

    if (node.role === 'SECONDARY_BUTTON') {
      callbackName = 'onCancel';
    } else {
      // Derive from layer name: "Continue Button" → "onContinue"
      const clean = node.name
        .replace(/\b(button|btn|cta|link)\b/gi, '')
        .trim()
        .split(/\s+/)
        .map((w, i) => i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
      callbackName = `on${clean}` || (node.role === 'PRIMARY_BUTTON' ? 'onConfirm' : 'onAction');
    }

    if (!seen.has(callbackName)) {
      seen.add(callbackName);
      props.push({
        name: callbackName,
        tsType: '() => void',
        description: `Called when "${node.name}" is activated`,
        defaultValue: null,
        source: 'interactive-layer',
      });
    }
  }

  return props;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Full component analysis from enrichedComponent.
 *
 * @param {object} enrichedComponent
 * @returns {{ propSchema, layerSummary, textNodes, interactiveNodes }}
 */
export function analyzeComponent(enrichedComponent) {
  if (!enrichedComponent) {
    return { propSchema: [], layerSummary: '', textNodes: [], interactiveNodes: [] };
  }

  // Prefer the canonical variant's structure if the component is a COMPONENT_SET.
  const structure =
    enrichedComponent.structure ??
    enrichedComponent.variants?.find(v => v.isCanonical)?.structure ??
    null;

  const textNodes        = structure ? collectTextNodes(structure)        : [];
  const interactiveNodes = structure ? collectInteractiveNodes(structure) : [];
  const iconNodes        = structure ? collectIconNodes(structure)        : [];
  const layerSummary     = structure ? (buildLayerSummary(structure) ?? '') : '(no structure available)';

  // Props from Figma component properties (TEXT, BOOLEAN, INSTANCE_SWAP, VARIANT)
  const figmaProps    = derivePropsFromFigmaProperties(enrichedComponent.componentProperties);

  // Callback props from interactive elements — only add if not already covered
  const figmaPropNames = new Set(figmaProps.map(p => p.name));
  const callbackProps  = deriveCallbackProps(interactiveNodes).filter(p => !figmaPropNames.has(p.name));

  const propSchema = [...figmaProps, ...callbackProps];

  return { propSchema, layerSummary, textNodes, interactiveNodes, iconNodes };
}

/**
 * Format the analysis as a prompt section for Claude.
 */
export function formatComponentAnalysisSection(analysis) {
  const lines = [];

  // Prop schema
  if (analysis.propSchema.length > 0) {
    lines.push('### Component Props (derived from Figma — implement ALL of these)');
    lines.push('Note: use Figma text values as prop DEFAULTS so developers can override them.');
    for (const p of analysis.propSchema) {
      const dflt = p.defaultValue != null ? `  // default: ${JSON.stringify(p.defaultValue)}` : '';
      lines.push(`  ${p.name}?: ${p.tsType}${dflt}  — ${p.description}`);
    }
  }

  // Text defaults (for Story args and as reference for the developer)
  const withText = analysis.textNodes.filter(n => n.text);
  if (withText.length > 0) {
    lines.push('');
    lines.push('### Figma Text Content (use as default prop values)');
    for (const n of withText) {
      lines.push(`  "${n.name}": "${n.text.slice(0, 100)}${n.text.length > 100 ? '…' : ''}"`);
    }
  }

  // Icon nodes (inline SVG guidance)
  if (analysis.iconNodes?.length > 0) {
    lines.push('');
    lines.push('### Icon Nodes (MANDATORY: render as inline <svg> — NEVER import from any icon package)');
    for (const icon of analysis.iconNodes) {
      const size = icon.width != null ? `${icon.width}×${icon.height}px` : 'unknown size';
      const colorHint = icon.fillHex ? `, fill: ${icon.fillHex}` : '';

      if (icon.paths?.length > 0) {
        // Figma provided the exact SVG path data — Claude can inline it verbatim
        const vb = `0 0 ${icon.width ?? 24} ${icon.height ?? 24}`;
        const pathElements = icon.paths.map(p =>
          `<path fill-rule="${p.windingRule}" d="${p.d.slice(0, 200)}${p.d.length > 200 ? '…' : ''}" />`
        ).join(' ');
        lines.push(`  "${icon.name}" (${size}${colorHint}): inline SVG →`);
        lines.push(`    <svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${pathElements}</svg>`);
      } else if (icon.svgString) {
        lines.push(`  "${icon.name}" (${size}${colorHint}): SVG string provided (use as-is or inline)`);
      } else {
        // No path data — expose as React.ReactNode prop so developer provides their icon
        // Derive prop name from layer name: "Mic Icon" → "micIcon", "Camera" → "cameraIcon"
        const words = icon.name
          .replace(/\bicon\b/gi, '') // remove the generic word "icon" from the name
          .trim()
          .split(/[\s_-]+/)
          .filter(Boolean);
        const propName = words.length > 0
          ? words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)).join('')
          : 'icon';
        const safePropName = propName.toLowerCase().endsWith('icon') ? propName : `${propName}Icon`;
        lines.push(`  "${icon.name}" (${size}${colorHint}): NO SVG path data available.`);
        lines.push(`    → Expose as prop: ${safePropName}?: React.ReactNode  (renders the icon slot)`);
        lines.push(`    → Default: null (render nothing if prop not provided)`);
      }
    }
    lines.push('  RULE: If icon has path data above → inline SVG. If prop slot → accept ReactNode. NEVER import from any icon package.');
  }

  // Interactive elements detected
  if (analysis.interactiveNodes.length > 0) {
    lines.push('');
    lines.push('### Interactive Elements → Callback Props');
    for (const n of analysis.interactiveNodes) {
      lines.push(`  [${n.role}] "${n.name}" → expose as callback prop`);
    }
  }

  // Layer hierarchy
  if (analysis.layerSummary) {
    lines.push('');
    lines.push('### Figma Layer Hierarchy (implement this EXACT layout — do not invent a different structure)');
    lines.push('```');
    lines.push(analysis.layerSummary);
    lines.push('```');
  }

  return lines.join('\n');
}
