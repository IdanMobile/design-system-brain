/**
 * POST /forge-component
 *
 * The main foundry loop: calls Claude, renders via Storybook, pixel-diffs
 * against the Figma reference PNG, and retries with visual feedback until
 * the diff is within tolerance or maxAttempts is exhausted.
 */

import { z } from 'zod';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystemPrompt, buildUserPrompt } from '../lib/prompt-builder.mjs';
import { buildAnnotatedTokens, formatAnnotatedTokensSection } from '../lib/token-mapper.mjs';
import { analyzeComponent, formatComponentAnalysisSection } from '../lib/component-analyzer.mjs';
import { getLibraryConfig } from '../lib/library-config.mjs';
import { renderAndScreenshot } from '../lib/render-harness.mjs';
import { pixelDiff, findDiffRegions } from './pixel-diff.mjs';
import {
  createAnthropicClient,
  parseClaudeJson,
  checkDirectImports,
  FORBIDDEN_DIRECT_IMPORTS,
  ensureDataFigmaComponent,
} from '../lib/claude-helpers.mjs';
import { isAlreadySemantic } from '../lib/semantic-detector.mjs';
import { runPhase2Translation } from '../lib/phase2-translator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve pngjs from visual-gate's isolated node_modules (same as pixel-diff.mjs).
const _require = createRequire(
  resolve(__dirname, '../../packages/visual-gate/package.json')
);
const { PNG } = _require('pngjs');

// ─── Anthropic client (injectable for tests) ─────────────────────────────────

let _client = null;
export function setAnthropicClient(client) { _client = client; }
function getClient() {
  return _client ?? createAnthropicClient();
}

// ─── Request schema ───────────────────────────────────────────────────────────

// Loose token entry — accepts both brain's { name, value: string, cssVar } shape
// and guing's native shapes (no cssVar, numeric value/fontSize/fontWeight).
const AnyTokenEntry = z.object({ name: z.string() }).passthrough();

const RequestSchema = z.object({
  componentName: z.string().min(1).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  library: z.enum(['mui', 'shadcn', 'radix', 'daisyui']),
  tokens: z.object({
    colors: z.array(AnyTokenEntry).optional().default([]),
    typography: z.array(AnyTokenEntry).optional().default([]),
    shadows: z.array(AnyTokenEntry).optional().default([]),
    radius: z.array(AnyTokenEntry).optional().default([]),
    gaps: z.array(AnyTokenEntry).optional().default([]),
  }).optional().default({}),
  tokensCss: z.string(),
  styleManifest: z.any(),
  enrichedComponent: z.any().optional(),
  referencePngBase64: z.string().optional(),
  maxAttempts: z.number().int().min(1).max(10).default(3),
  passPct: z.number().min(0).max(100).default(5.0),
  warnPct: z.number().min(0).max(100).default(20.0),
});

// ─── Visual feedback builder ──────────────────────────────────────────────────

function buildVisualFeedbackSection(regions, previousSource, percent) {
  // Check if this is an import-violation retry (sentinel region with _importError).
  const importError = regions.find(r => r._importError);
  if (importError) {
    return `\n\n## 🚨 CRITICAL IMPORT VIOLATION — YOU MUST FIX THIS BEFORE ANYTHING ELSE\n${importError._importError}\n\nHere is the previous component source with the violation:\n\`\`\`tsx\n${previousSource}\n\`\`\``;
  }

  let feedback = `\n\n## ⚠️ Visual Regeneration Feedback (attempt failed — ${percent != null ? percent.toFixed(1) : '?'}% pixel mismatch — FIX THESE ISSUES)`;
  feedback += `\nThe previous attempt had the following visual differences from the Figma design:`;

  if (regions.length > 0) {
    for (const region of regions) {
      feedback += `\n- Hotspot at (x=${region.rect.x}, y=${region.rect.y}, ${region.rect.width}×${region.rect.height}px): ${region.percent.toFixed(1)}% mismatch`;
    }
  } else {
    feedback += `\n- Global pixel mismatch across the component`;
  }

  feedback += `\n\nPlease fix all visual differences. Here is the previous component source for reference:\n\`\`\`tsx\n${previousSource}\n\`\`\``;
  return feedback;
}

// ─── Phase 2 helper ───────────────────────────────────────────────────────────

/**
 * Run Phase 2 semantic translation if applicable, updating bestResult in place.
 * Skips if the component is already semantic or no translation guide exists.
 * Always returns a (possibly unchanged) result — never throws.
 */
async function maybeRunPhase2(bestResult, {
  library, translationGuide, componentName, referencePngBase64,
  tokensCss, componentAnalysisSection,
}) {
  if (!translationGuide) return bestResult;

  if (isAlreadySemantic(bestResult.componentSource, library)) {
    console.log(`[forge-component] ${componentName}: Phase 2 skipped — already semantic`);
    return bestResult;
  }

  console.log(`[forge-component] ${componentName}: Phase 2 translation started`);
  const phase2 = await runPhase2Translation({
    componentSource: bestResult.componentSource,
    storiesSource: bestResult.storiesSource,
    componentName,
    library,
    referencePngBase64,
    tokensCss,
    translationGuide,
    componentAnalysisSection,
  });

  return { ...bestResult, ...phase2 };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function forgeComponentHandler(req, res) {
  // 1. Validate request.
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const {
    componentName,
    library,
    tokens,
    tokensCss,
    styleManifest,
    referencePngBase64,
    maxAttempts,
    passPct,
    warnPct,
  } = parsed.data;

  const { promptBlock, translationGuide } = getLibraryConfig(library);

  // Enrich tokens with resolved CSS values and semantic roles.
  const annotatedTokens = buildAnnotatedTokens(tokens, tokensCss);
  const annotatedTokenSection = formatAnnotatedTokensSection(annotatedTokens);

  // Analyse the Figma structure to derive prop schema and layer tree.
  const componentAnalysis = analyzeComponent(parsed.data.enrichedComponent);
  const componentAnalysisSection = formatComponentAnalysisSection(componentAnalysis);

  const systemPrompt = buildSystemPrompt(promptBlock, annotatedTokenSection, { phase: 1 });

  // Track best result across attempts.
  let bestResult = null;
  let lastRegions = [];
  let lastComponentSource = null;
  let lastPercent = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 2. Build user prompt (with visual feedback on retry).
    const baseUserPrompt = buildUserPrompt(componentName, styleManifest, tokensCss, componentAnalysisSection);
    const userPrompt = attempt > 1
      ? baseUserPrompt + buildVisualFeedbackSection(lastRegions, lastComponentSource, lastPercent)
      : baseUserPrompt;

    // 3. Call Claude — include reference PNG as image on every attempt so Claude
    //    has visual ground truth. On retry, also attach the diff image so Claude
    //    can see exactly which pixels are wrong.
    let claudeResponse;
    try {
      const userContent = [];

      // Always show the Figma reference PNG first (image = source of truth).
      if (referencePngBase64) {
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: referencePngBase64 },
        });
      }

      // On retry with a diff image, show it so Claude sees exactly which pixels differ.
      if (attempt > 1 && bestResult?.diffImageBase64) {
        userContent.push({
          type: 'text',
          text: 'The red diff image below shows pixel-level differences between your last output and the Figma reference. Fix the regions highlighted in red.',
        });
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: bestResult.diffImageBase64 },
        });
      }

      userContent.push({ type: 'text', text: userPrompt });

      claudeResponse = await getClient().messages.create({
        model: process.env.BRAIN_MODEL ?? 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });
    } catch (err) {
      console.error(`[forge-component] Claude error on attempt ${attempt}:`, err.message);
      if (attempt === 1) {
        return res.status(500).json({ error: 'Claude API call failed', message: err.message });
      }
      // Return best result so far if we have one.
      break;
    }

    if (claudeResponse.stop_reason === 'max_tokens') {
      return res.status(422).json({ error: 'response_truncated', message: 'Claude hit the token limit — try a simpler component or reduce manifest size' });
    }

    const firstBlock = claudeResponse.content[0];
    if (!firstBlock || firstBlock.type !== 'text') {
      if (attempt === 1) {
        return res.status(500).json({ error: 'Unexpected Claude response type', message: `content[0].type was ${firstBlock?.type}` });
      }
      break;
    }

    // 4. Parse Claude output.
    let componentSource, storiesSource;
    try {
      ({ componentSource, storiesSource } = parseClaudeJson(firstBlock.text));
    } catch (err) {
      if (attempt === 1) {
        return res.status(500).json({ error: 'Failed to parse Claude response', message: err.message });
      }
      break;
    }

    if (!componentSource || typeof componentSource !== 'string') {
      if (attempt === 1) {
        return res.status(500).json({ error: 'Claude response missing componentSource' });
      }
      break;
    }

    // 5. Post-process.
    componentSource = ensureDataFigmaComponent(componentSource, componentName);
    const importViolations = checkDirectImports(componentSource);
    if (importViolations.length > 0) {
      console.warn(`[forge-component] Direct UI lib imports in ${componentName}:`, importViolations);
      // Feed violation back as feedback and retry if attempts remain.
      if (attempt < maxAttempts) {
        lastComponentSource = componentSource;
        lastRegions = [];
        lastPercent = null;
        // Append import violation error to feedback for next attempt via lastRegions trick:
        // We store the violation message and it gets included in buildVisualFeedbackSection.
        // Override: directly append to the next attempt's prompt via a sentinel region.
        const isIconImport = importViolations.some(v => v.includes('icons') || v.includes('react-icons') || v.includes('lucide') || v.includes('heroicons') || v.includes('phosphor') || v.includes('feather'));
        const iconFix = isIconImport
          ? ` For icons: use inline <svg> with path data from the component analysis, or expose as icon?: React.ReactNode prop. NEVER import from any icon package.`
          : '';
        lastRegions = [{ rect: { x: 0, y: 0, width: 0, height: 0 }, percent: 100,
          cropBase64: '',
          _importError: `CRITICAL: You used forbidden direct imports (${importViolations.join(', ')}). You MUST import from '../adapters/${library}/internal' ONLY. Never import from '${importViolations[0]}' directly.${iconFix}` }];
        continue;
      }
    }

    // 6. If no reference PNG, return component immediately (no render/diff possible).
    if (!referencePngBase64) {
      return res.status(200).json({
        status: 'pass',
        percent: 0,
        attempts: attempt,
        componentSource,
        storiesSource: storiesSource ?? null,
        diffImageBase64: null,
        regions: [],
        importViolations,
      });
    }

    // 7. Render and screenshot.
    let screenshotBase64;
    try {
      screenshotBase64 = await renderAndScreenshot(componentName, {
        componentSource,
        storiesSource: storiesSource ?? '',
        tokensCss,
      });
    } catch (err) {
      console.warn(`[forge-component] renderAndScreenshot failed on attempt ${attempt} (non-fatal):`, err.message);
      // Skip diff — return component without pixel result.
      return res.status(200).json({
        status: 'unknown',
        percent: null,
        attempts: attempt,
        componentSource,
        storiesSource: storiesSource ?? null,
        diffImageBase64: null,
        regions: [],
        importViolations,
        renderError: err.message,
      });
    }

    // 8. Pixel diff.
    let diffResult;
    try {
      diffResult = await pixelDiff(screenshotBase64, referencePngBase64, passPct);
    } catch (err) {
      console.warn(`[forge-component] pixelDiff failed on attempt ${attempt} (non-fatal):`, err.message);
      return res.status(200).json({
        status: 'unknown',
        percent: null,
        attempts: attempt,
        componentSource,
        storiesSource: storiesSource ?? null,
        diffImageBase64: null,
        regions: [],
        importViolations,
        diffError: err.message,
      });
    }

    const { status: rawStatus, percent, diffPng, actual, ref } = diffResult;

    // Apply warnPct threshold to compute final status.
    const status = percent <= passPct ? 'pass' : percent <= warnPct ? 'warn' : 'fail';

    // Serialize diff PNG to base64.
    const diffImageBase64 = PNG.sync.write(diffPng).toString('base64');

    // Find diff regions.
    let regions = [];
    if (percent > 0) {
      try {
        regions = findDiffRegions(diffPng, actual, ref);
      } catch (err) {
        console.warn('[forge-component] findDiffRegions error (non-fatal):', err.message);
      }
    }

    const currentResult = {
      status,
      percent,
      attempts: attempt,
      componentSource,
      storiesSource: storiesSource ?? null,
      diffImageBase64,
      regions,
      importViolations,
    };

    // Track best result (lowest percent mismatch).
    if (bestResult === null || percent < bestResult.percent) {
      bestResult = currentResult;
    }

    // 9. If pass, run Phase 2 and return.
    if (status === 'pass') {
      bestResult = await maybeRunPhase2(bestResult, {
        library, translationGuide, componentName, referencePngBase64,
        tokensCss, componentAnalysisSection,
      });
      return res.status(200).json(bestResult);
    }

    // 10. Prepare feedback for next attempt.
    lastRegions = regions;
    lastComponentSource = componentSource;
    lastPercent = percent;
  }

  // All attempts exhausted — run Phase 2 on best result and return.
  if (bestResult) {
    bestResult.attempts = maxAttempts;
    bestResult = await maybeRunPhase2(bestResult, {
      library, translationGuide, componentName, referencePngBase64,
      tokensCss, componentAnalysisSection,
    });
    return res.status(200).json(bestResult);
  }

  // Should not reach here (first attempt errors return early), but just in case.
  return res.status(500).json({ error: 'No result produced after all attempts' });
}
