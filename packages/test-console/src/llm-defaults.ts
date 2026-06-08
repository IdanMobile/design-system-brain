import type { LlmProvider } from "./types";

/** Mirror of scripts/lab-llm-settings.mjs defaults (UI only). */
export const DEFAULT_LLM_MODELS: Record<LlmProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  gemini: "gemini-2.0-flash"
};
