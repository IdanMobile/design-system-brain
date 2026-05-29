import type { AiExtracted } from "../../contract/src/spec-types.ts";

export interface ExtractInput {
  storyId: string;
  elementId: string;
  displayName: string;
  description: string;
  tag: string;
  role: string;
  ariaLabel: string;
  text: string;
}

/**
 * Calls the server-side extraction endpoint. The server falls back to the
 * local heuristic when no LLM API key is configured, so the caller can treat
 * the response as `AiExtracted` regardless of whether an LLM was reachable.
 *
 * Extra fields (`note`, `model`, `provider`, `raw`) are surfaced on the
 * returned object for display in the panel footer.
 */
export interface ExtractResult extends AiExtracted {
  note?: string;
  model?: string;
  provider?: string;
}

export async function callExtract(input: ExtractInput): Promise<ExtractResult> {
  const resp = await fetch("/api/specs/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`extract ${resp.status}: ${detail.slice(0, 240)}`);
  }
  return (await resp.json()) as ExtractResult;
}
