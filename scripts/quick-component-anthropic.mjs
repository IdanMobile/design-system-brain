/**
 * Anthropic polish/fix pass for quick-component-generation (endpoint-only).
 */

import { readFileSync } from "node:fs";
import { resolveLabLlmConfig } from "./lab-llm-settings.mjs";

const DEFAULT_MODEL = "claude-sonnet-4-6";

/**
 * @param {object} params
 * @param {string} params.mode - "fix" | "confirm"
 * @param {string} params.componentName
 * @param {string} params.screenId
 * @param {Array<{ path: string, content: string }>} params.packageFiles
 * @param {string} [params.manifestJson]
 * @param {string} [params.contractJson]
 * @param {string} [params.originalPngBase64]
 * @param {Array<{ stepId: string, status: string, percent?: number, reportJson?: string, comparePngBase64?: string }>} params.stepReports
 * @param {string} [repoRoot]
 */
export async function runQuickComponentAnthropic(params, repoRoot) {
  if (process.env.QUICK_COMPONENT_MOCK_ANTHROPIC === "1") {
    return {
      files: params.packageFiles,
      model: "mock",
      mode: params.mode,
      mock: true
    };
  }

  const { provider, apiKey, model } = resolveLabLlmConfig(repoRoot);
  if (provider !== "anthropic" || !apiKey) {
    throw new Error(
      "Anthropic API key required for quick-component-generation. Set LAB_LLM_API_KEY (sk-ant-…) or configure Tests Console → LLM with provider anthropic."
    );
  }

  const system = buildSystemPrompt(params.mode);
  const userText = buildUserPrompt(params);
  const content = [{ type: "text", text: userText }];

  if (params.originalPngBase64) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: params.originalPngBase64.replace(/^data:image\/png;base64,/, "")
      }
    });
  }

  for (const report of params.stepReports.slice(0, 6)) {
    if (report.comparePngBase64) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: report.comparePngBase64.replace(/^data:image\/png;base64,/, "")
        }
      });
    }
  }

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 16384,
      system,
      messages: [{ role: "user", content }]
    }),
    signal: AbortSignal.timeout(Number(process.env.QUICK_COMPONENT_ANTHROPIC_TIMEOUT_MS ?? 180_000))
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Anthropic ${resp.status}: ${detail.slice(0, 400)}`);
  }

  const body = await resp.json();
  const block = body.content?.find((b) => b.type === "text");
  if (!block?.text) throw new Error("Anthropic response missing text block");

  const parsed = parsePackageJson(block.text);
  if (!parsed?.files?.length) {
    throw new Error("Anthropic response missing files[] array");
  }

  return {
    files: parsed.files,
    model: model || DEFAULT_MODEL,
    mode: params.mode,
    stopReason: body.stop_reason ?? null
  };
}

function buildSystemPrompt(mode) {
  const goal =
    mode === "fix"
      ? "Fix the React delivery package toward pixel-perfect parity (≤0.1% visual diff vs reference) and add sensible interactive logic (handlers, state, accessibility)."
      : "Review the React delivery package, confirm structure, and ensure interactive logic (handlers, state, accessibility) is present and sensible.";

  return `${goal}

You receive:
- Current React component package source files
- Figma manifest + Universal contract JSON
- Reference PNG (design truth)
- Lab test reports and compare PNGs (strict 0.1% gate — failures are expected in quick mode)

Rules:
- Return ONLY valid JSON: { "files": [{ "path": "relative/path.tsx", "content": "..." }] }
- Include every file needed for the developer package (component, styles, index if needed)
- Use real React + TypeScript; no markdown fences in file contents
- Do not embed the reference PNG as a background image to cheat parity
- Add props/callbacks for interactive elements visible in the design
- Preserve design tokens / CSS variables where present`;
}

function buildUserPrompt(params) {
  const fileBlock = params.packageFiles
    .map((f) => `### ${f.path}\n\`\`\`tsx\n${f.content}\n\`\`\``)
    .join("\n\n");

  const reportsBlock = params.stepReports
    .map((r) => {
      let line = `- **${r.stepId}**: status=${r.status}`;
      if (r.percent != null) line += `, diff=${r.percent.toFixed(3)}%`;
      if (r.reportJson) line += `\n  report excerpt: ${r.reportJson.slice(0, 1200)}`;
      return line;
    })
    .join("\n");

  return `# Quick component generation — ${params.mode === "fix" ? "fix pass" : "confirm pass"}

**Component:** ${params.componentName}
**Screen id:** ${params.screenId}

## Current package files
${fileBlock}

## Manifest (Guing export)
\`\`\`json
${params.manifestJson?.slice(0, 12000) ?? "{}"}
\`\`\`

## Universal contract
\`\`\`json
${params.contractJson?.slice(0, 12000) ?? "{}"}
\`\`\`

## Lab test results (strict 0.1% — portfolio truth)
${reportsBlock || "(no step reports)"}

Return updated \`files[]\` for the developer-ready React package.`;
}

function parsePackageJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (m) return JSON.parse(m[1]);
  }
  throw new Error("Cannot parse JSON package from Anthropic response");
}

/** @param {string} path @returns {string} */
export function readTextIfExists(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** @param {string} path @returns {string | null} */
export function readBase64IfExists(path) {
  try {
    return readFileSync(path).toString("base64");
  } catch {
    return null;
  }
}
