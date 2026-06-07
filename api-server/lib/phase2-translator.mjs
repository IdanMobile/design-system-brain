/**
 * phase2-translator.mjs
 *
 * Phase 2: Semantic Library Translation
 *
 * Takes a Phase 1 component that is known to render pixel-correctly (using
 * MuiBox as a structural fallback for uncertain containers) and translates it
 * to use the semantically correct library components (MuiDialog, MuiButton,
 * MuiCard, etc.) without changing any visual output.
 *
 * This module is intentionally isolated so it can be unit-tested independently
 * with a mock Anthropic client. It ALWAYS resolves (never rejects) — on any
 * error it returns the Phase 1 values unchanged.
 */

import { renderAndScreenshot } from './render-harness.mjs';
import { pixelDiff } from '../routes/pixel-diff.mjs';
import { createAnthropicClient, parseClaudeJson, checkDirectImports } from './claude-helpers.mjs';

// ─── Anthropic client (injectable for tests) ─────────────────────────────────

let _client = null;
export function setPhase2AnthropicClient(client) { _client = client; }
function getClient() {
  return _client ?? createAnthropicClient();
}

// ─── Phase 2 system prompt ────────────────────────────────────────────────────

function buildPhase2SystemPrompt(library, translationGuide, componentAnalysisSection) {
  return `You are a React refactoring specialist for a design system.

## Your Sole Task
You are given a PIXEL-CORRECT React component (Phase 1 output) that uses MuiBox as a
structural fallback for containers whose semantic role was uncertain during generation.
Your job is to translate those MuiBox containers to the correct ${library.toUpperCase()} semantic
components — WITHOUT changing any visual output.

${translationGuide}

## Component Structure (from Figma — use this to identify semantic roles)
${componentAnalysisSection || '(no structure analysis available)'}

## Hard Rules — Do NOT violate these
1. Every sx prop, className, and style value stays EXACTLY as-is. Do not touch CSS variable
   references, values, or keys.
2. The Props interface stays EXACTLY as-is — same names, same types, same defaults.
3. data-figma-component attribute must stay on the outermost JSX element.
4. The import source stays '../adapters/${library}/internal' — only the named imports list changes.
5. storiesSource default args and story exports must remain identical.
6. If you are not confident a swap is correct, leave the element as MuiBox.
7. If the component already uses semantic components correctly, return it unchanged.
8. Do NOT add new props. Do NOT change callback names or types.

## Output Format
Respond with a JSON object — no prose, no explanation:
{
  "componentSource": "// full .tsx file content",
  "storiesSource": "// full .stories.tsx file content"
}`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Run Phase 2 library semantic translation.
 *
 * Always resolves — on any error returns Phase 1 values unchanged.
 *
 * @param {{
 *   componentSource: string,
 *   storiesSource: string | null,
 *   componentName: string,
 *   library: string,
 *   referencePngBase64: string | null,
 *   tokensCss: string,
 *   translationGuide: string,
 *   componentAnalysisSection: string,
 * }} params
 * @returns {Promise<{ componentSource: string, storiesSource: string | null, phase2Applied: boolean }>}
 */
export async function runPhase2Translation({
  componentSource,
  storiesSource,
  componentName,
  library,
  referencePngBase64,
  tokensCss,
  translationGuide,
  componentAnalysisSection,
}) {
  const phase1 = { componentSource, storiesSource, phase2Applied: false };

  try {
    const systemPrompt = buildPhase2SystemPrompt(library, translationGuide, componentAnalysisSection);

    // User message: Figma reference PNG (visual ground truth) + Phase 1 source
    const userContent = [];

    if (referencePngBase64) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: referencePngBase64 },
      });
      userContent.push({
        type: 'text',
        text: 'The image above is the Figma reference. The component source below renders pixel-correctly against it. Translate to semantic library components without changing the visual output.',
      });
    }

    userContent.push({
      type: 'text',
      text: `## Phase 1 Component Source (pixel-correct, translate this)\n\`\`\`tsx\n${componentSource}\n\`\`\`\n\n## Stories Source\n\`\`\`tsx\n${storiesSource ?? ''}\n\`\`\``,
    });

    console.log(`[phase2] ${componentName}: starting library translation for ${library}`);

    const response = await getClient().messages.create({
      model: process.env.BRAIN_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    if (response.stop_reason === 'max_tokens') {
      console.warn(`[phase2] ${componentName}: response truncated — falling back to Phase 1`);
      return phase1;
    }

    const block = response.content[0];
    if (!block || block.type !== 'text') {
      console.warn(`[phase2] ${componentName}: unexpected response type — falling back to Phase 1`);
      return phase1;
    }

    let phase2Source, phase2Stories;
    try {
      ({ componentSource: phase2Source, storiesSource: phase2Stories } = parseClaudeJson(block.text));
    } catch (err) {
      console.warn(`[phase2] ${componentName}: JSON parse failed — falling back to Phase 1:`, err.message);
      return phase1;
    }

    if (!phase2Source || typeof phase2Source !== 'string') {
      console.warn(`[phase2] ${componentName}: missing componentSource — falling back to Phase 1`);
      return phase1;
    }

    // Check Phase 2 output doesn't introduce direct library imports
    const violations = checkDirectImports(phase2Source);
    if (violations.length > 0) {
      console.warn(`[phase2] ${componentName}: import violations in Phase 2 output (${violations.join(', ')}) — falling back to Phase 1`);
      return phase1;
    }

    // Optional sanity pixel diff — verifies Phase 2 didn't regress visually
    const regressionThreshold = parseFloat(process.env.BRAIN_PHASE2_REGRESSION_PCT ?? '20');
    const skipSanityDiff = process.env.BRAIN_PHASE2_SKIP_SANITY_DIFF === '1';

    if (referencePngBase64 && !skipSanityDiff) {
      try {
        const screenshot = await renderAndScreenshot(componentName, {
          componentSource: phase2Source,
          storiesSource: phase2Stories ?? '',
          tokensCss,
        });
        const { percent } = await pixelDiff(screenshot, referencePngBase64);
        if (percent > regressionThreshold) {
          console.warn(`[phase2] ${componentName}: regression detected (${percent.toFixed(1)}% > ${regressionThreshold}%) — falling back to Phase 1`);
          return phase1;
        }
        console.log(`[phase2] ${componentName}: sanity diff passed (${percent.toFixed(1)}%)`);
      } catch (err) {
        // Non-fatal — if render fails, trust Phase 2 source without diff
        console.warn(`[phase2] ${componentName}: sanity diff failed (non-fatal):`, err.message);
      }
    }

    console.log(`[phase2] ${componentName}: translation complete`);
    return {
      componentSource: phase2Source,
      storiesSource: phase2Stories ?? storiesSource,
      phase2Applied: true,
    };
  } catch (err) {
    console.warn(`[phase2] ${componentName}: unexpected error — falling back to Phase 1:`, err.message);
    return phase1;
  }
}
