/**
 * claude-helpers.mjs
 *
 * Shared utilities for Claude response parsing, import validation,
 * the Anthropic client factory, and JSX post-processing.
 * Used by forge-component.mjs (Phase 1), phase2-translator.mjs (Phase 2),
 * and upload-figma-layout.mjs (legacy).
 */

import Anthropic from '@anthropic-ai/sdk';

// ─── Anthropic client factory ─────────────────────────────────────────────────

/**
 * Create a new Anthropic client from ANTHROPIC_API_KEY.
 * Each route keeps its own injectable override for tests; they call this as the fallback.
 * @returns {Anthropic}
 * @throws {Error} if ANTHROPIC_API_KEY is not set
 */
export function createAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// ─── Forbidden imports ────────────────────────────────────────────────────────

export const FORBIDDEN_DIRECT_IMPORTS = [
  '@mui/material',
  '@mui/icons-material',
  '@radix-ui/',
  'shadcn',
  '@shadcn/',
  'daisyui',
  '@headlessui/',
  '@heroui/',
  // Icon libraries — icons must be inline SVG, never imported packages
  'react-icons',
  'lucide-react',
  '@heroicons/',
  'phosphor-react',
  '@phosphor-icons/',
  'feather-icons',
  'react-feather',
];

// ─── Claude response parsing ──────────────────────────────────────────────────

/**
 * Parse a JSON object from a Claude text response.
 * Handles both raw JSON and ```json ... ``` code blocks.
 * @param {string} text
 * @returns {object}
 * @throws {Error} if JSON cannot be parsed
 */
export function parseClaudeJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  throw new Error('Cannot parse JSON from Claude response. First 300 chars: ' + text.slice(0, 300));
}

// ─── Import validation ────────────────────────────────────────────────────────

/**
 * Scan component source for forbidden direct UI library imports.
 * @param {string} componentSource
 * @returns {string[]} array of violating import paths
 */
export function checkDirectImports(componentSource) {
  const violations = [];
  const lines = componentSource.split('\n');
  for (const line of lines) {
    const importMatch = line.match(/^\s*import\s+.+\s+from\s+['"](.+)['"]/);
    if (!importMatch) continue;
    const importPath = importMatch[1];
    for (const forbidden of FORBIDDEN_DIRECT_IMPORTS) {
      if (importPath.startsWith(forbidden)) {
        violations.push(importPath);
        break;
      }
    }
  }
  return violations;
}

// ─── JSX post-processing ──────────────────────────────────────────────────────

/**
 * Ensure the root JSX element has data-figma-component="<ComponentName>" for
 * pixel-diff selector targeting. No-op if the attribute is already present.
 * @param {string} componentSource
 * @param {string} componentName
 * @returns {string}
 */
export function ensureDataFigmaComponent(componentSource, componentName) {
  if (componentSource.includes('data-figma-component')) return componentSource;

  const attributeToInject = `data-figma-component="${componentName}"`;
  const returnJsxPattern = /(return\s*\(\s*\n\s*)(<[A-Z][A-Za-z0-9]*|<[a-z][a-z0-9-]*)(\s)/;
  const inlineReturnPattern = /(return\s*)(<[A-Z][A-Za-z0-9]*|<[a-z][a-z0-9-]*)(\s)/;

  if (returnJsxPattern.test(componentSource)) {
    return componentSource.replace(returnJsxPattern, `$1$2 ${attributeToInject}$3`);
  }
  if (inlineReturnPattern.test(componentSource)) {
    return componentSource.replace(inlineReturnPattern, `$1$2 ${attributeToInject}$3`);
  }
  return componentSource;
}
