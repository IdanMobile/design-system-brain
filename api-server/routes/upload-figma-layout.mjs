/**
 * POST /upload-figma-layout  (legacy one-shot endpoint)
 *
 * Single Claude call — no render, no pixel diff, no retry loop.
 * For full iterative generation use POST /forge-component instead.
 * Kept for back-compat; all helpers now shared via claude-helpers.mjs.
 */

import { z } from 'zod';
import { buildSystemPrompt, buildUserPrompt } from '../lib/prompt-builder.mjs';
import { getLibraryConfig } from '../lib/library-config.mjs';
import {
  createAnthropicClient,
  parseClaudeJson,
  checkDirectImports,
  ensureDataFigmaComponent,
} from '../lib/claude-helpers.mjs';

// ─── Anthropic client (injectable for tests) ─────────────────────────────────

let _client = null;
export function setAnthropicClient(client) { _client = client; }
function getClient() {
  return _client ?? createAnthropicClient();
}

// ─── Request schema ───────────────────────────────────────────────────────────

const StyleManifestSchema = z.object({
  base: z.object({
    cssVars: z.record(z.string()).optional().default({}),
    cornerRadius: z.string().optional(),
    padding: z.object({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() }).optional(),
    typography: z.object({ fontSize: z.string(), fontFamily: z.string(), fontWeight: z.string() }).optional(),
    background: z.string().optional(),
    boxShadow: z.string().optional(),
    gap: z.string().optional(),
    textColor: z.string().optional(),
    overflow: z.string().optional(),
  }),
  variantOverrides: z.record(z.object({
    cssVars: z.record(z.string()).optional(),
    background: z.string().optional(),
    opacity: z.number().optional(),
    boxShadow: z.string().optional(),
  })).optional().default({}),
  slots: z.object({ hasIconSlot: z.boolean() }).optional().default({ hasIconSlot: false }),
  variantAxes: z.record(z.array(z.string())).optional().default({}),
  sizeDimensions: z.record(z.object({ height: z.number(), paddingH: z.number(), paddingV: z.number(), gap: z.number() })).optional(),
  hasFluidVariant: z.boolean().optional(),
  contentTypes: z.record(z.string()).optional(),
});

const TokenEntrySchema = z.object({ name: z.string(), value: z.string(), cssVar: z.string() });

const RequestSchema = z.object({
  componentName: z.string().min(1).regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'componentName must start with a letter and contain only letters, digits, underscores, hyphens'),
  library: z.enum(['mui', 'shadcn', 'radix', 'daisyui']),
  pngBase64: z.string().min(100),
  tokens: z.object({
    colors: z.array(TokenEntrySchema).optional().default([]),
    typography: z.array(z.object({ name: z.string(), cssVar: z.string(), fontSize: z.string().optional(), fontFamily: z.string().optional(), fontWeight: z.string().optional() })).optional().default([]),
    shadows: z.array(TokenEntrySchema).optional().default([]),
    radius: z.array(TokenEntrySchema).optional().default([]),
    gaps: z.array(TokenEntrySchema).optional().default([]),
  }),
  tokensCss: z.string(),
  styleManifest: StyleManifestSchema,
});

// ─── Route handler ────────────────────────────────────────────────────────────

export async function uploadFigmaLayoutHandler(req, res) {
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { componentName, library, pngBase64, tokens, tokensCss, styleManifest } = parsed.data;
  const { promptBlock, packageDependencies } = getLibraryConfig(library);

  const systemPrompt = buildSystemPrompt(tokens, promptBlock);
  const userPrompt = buildUserPrompt(componentName, styleManifest, tokensCss);

  let claudeResponse;
  try {
    claudeResponse = await getClient().messages.create({
      model: process.env.BRAIN_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
        ],
      }],
    });
  } catch (err) {
    console.error('[upload-figma-layout] Claude error:', err.message);
    return res.status(500).json({ error: 'Claude API call failed', message: err.message });
  }

  if (claudeResponse.stop_reason === 'max_tokens') {
    return res.status(422).json({ error: 'response_truncated', message: 'Claude hit the token limit — try a simpler component or reduce manifest size' });
  }

  const firstBlock = claudeResponse.content[0];
  if (!firstBlock || firstBlock.type !== 'text') {
    return res.status(500).json({ error: 'Unexpected Claude response type', message: `content[0].type was ${firstBlock?.type}` });
  }

  let componentSource, storiesSource;
  try {
    ({ componentSource, storiesSource } = parseClaudeJson(firstBlock.text));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to parse Claude response', message: err.message });
  }

  if (!componentSource || typeof componentSource !== 'string') {
    return res.status(500).json({ error: 'Claude response missing componentSource', message: 'Expected { componentSource: string, storiesSource: string|null }' });
  }

  componentSource = ensureDataFigmaComponent(componentSource, componentName);
  const importViolations = checkDirectImports(componentSource);
  if (importViolations.length > 0) {
    console.warn(`[upload-figma-layout] Direct UI lib imports in ${componentName}:`, importViolations);
  }

  const generatedFiles = [
    { path: `src/components/${componentName}/${componentName}.tsx`, content: componentSource },
  ];
  if (storiesSource) {
    generatedFiles.push({ path: `src/components/${componentName}/${componentName}.stories.tsx`, content: storiesSource });
  }

  return res.status(200).json({ generatedFiles, packageDependencies, importViolations });
}
