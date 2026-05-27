import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { buildSystemPrompt, buildUserPrompt } from '../lib/prompt-builder.mjs';
import { getLibraryConfig } from '../lib/library-config.mjs';

let _client = null;
export function setAnthropicClient(client) { _client = client; }
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

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
  componentName: z.string().min(1),
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

function parseClaudeJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  throw new Error('Cannot parse JSON from Claude response. First 300 chars: ' + text.slice(0, 300));
}

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

  let componentSource, storiesSource;
  try {
    ({ componentSource, storiesSource } = parseClaudeJson(claudeResponse.content[0].text));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to parse Claude response', message: err.message });
  }

  const generatedFiles = [
    { path: `src/components/${componentName}/${componentName}.tsx`, content: componentSource },
  ];
  if (storiesSource) {
    generatedFiles.push({ path: `src/components/${componentName}/${componentName}.stories.tsx`, content: storiesSource });
  }

  return res.status(200).json({ generatedFiles, packageDependencies });
}
