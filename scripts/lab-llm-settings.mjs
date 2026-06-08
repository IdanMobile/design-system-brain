/**
 * Shared LAB LLM configuration for showcase polish (/api/specs/extract).
 *
 * Priority: `.test-console/llm-settings.json` (saved from Tests Console UI)
 *           → process.env LAB_LLM_* → defaults.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const LLM_PROVIDERS = ["openai", "anthropic", "gemini"];

/** @typedef {"openai" | "anthropic" | "gemini"} LlmProvider */

export const DEFAULT_LLM_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  gemini: "gemini-2.0-flash"
};

/** @param {string} [repoRoot] */
export function llmSettingsPath(repoRoot = ROOT) {
  return join(repoRoot, ".test-console", "llm-settings.json");
}

/** @param {string} [repoRoot] @returns {{ provider?: string, model?: string, apiKey?: string, updatedAt?: string } | null} */
function readSettingsFile(repoRoot = ROOT) {
  const path = llmSettingsPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** @param {unknown} raw @returns {LlmProvider} */
function normalizeProvider(raw) {
  const p = String(raw ?? "openai").toLowerCase();
  return /** @type {LlmProvider} */ (LLM_PROVIDERS.includes(p) ? p : "openai");
}

/**
 * Resolved config for LLM HTTP calls (includes secret key when set).
 * @param {string} [repoRoot]
 */
export function resolveLabLlmConfig(repoRoot = ROOT) {
  const file = readSettingsFile(repoRoot);
  const provider = normalizeProvider(file?.provider ?? process.env.LAB_LLM_PROVIDER);
  const apiKey = String(file?.apiKey ?? process.env.LAB_LLM_API_KEY ?? "").trim();
  const model = String(
    file?.model ?? process.env.LAB_LLM_MODEL ?? DEFAULT_LLM_MODELS[provider] ?? DEFAULT_LLM_MODELS.openai
  ).trim();
  /** @type {"test-console" | "env" | "none"} */
  let source = "none";
  if (file?.apiKey) source = "test-console";
  else if (process.env.LAB_LLM_API_KEY) source = "env";
  return { provider, apiKey, model, source, updatedAt: file?.updatedAt ?? null };
}

/**
 * Public view for API/UI (never exposes full api key).
 * @param {string} [repoRoot]
 */
export function loadLlmSettingsPublic(repoRoot = ROOT) {
  const { provider, model, apiKey, source, updatedAt } = resolveLabLlmConfig(repoRoot);
  return {
    provider,
    model,
    apiKeySet: Boolean(apiKey),
    apiKeyPreview: apiKey.length >= 4 ? `…${apiKey.slice(-4)}` : undefined,
    source,
    updatedAt
  };
}

/**
 * Persist LLM settings from Tests Console.
 * @param {{ provider?: string, model?: string, apiKey?: string }} partial
 * @param {string} [repoRoot]
 */
export function setLlmSettings(partial, repoRoot = ROOT) {
  const prev = readSettingsFile(repoRoot) ?? {};
  const provider = normalizeProvider(partial.provider ?? prev.provider ?? process.env.LAB_LLM_PROVIDER);
  const defaultModel = DEFAULT_LLM_MODELS[provider] ?? DEFAULT_LLM_MODELS.openai;
  const model = String(partial.model ?? prev.model ?? defaultModel).trim() || defaultModel;
  let apiKey = prev.apiKey ?? "";
  if (typeof partial.apiKey === "string") {
    const trimmed = partial.apiKey.trim();
    if (trimmed) apiKey = trimmed;
  }
  const next = {
    provider,
    model,
    ...(apiKey ? { apiKey } : {}),
    updatedAt: new Date().toISOString()
  };
  mkdirSync(join(repoRoot, ".test-console"), { recursive: true });
  writeFileSync(llmSettingsPath(repoRoot), JSON.stringify(next, null, 2) + "\n", "utf8");
  return loadLlmSettingsPublic(repoRoot);
}
