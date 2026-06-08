/**
 * Mountable LLM-extraction route for the dev playground server.
 *
 *   POST /api/specs/extract
 *     body: { storyId, elementId, displayName, description, tag, role,
 *             ariaLabel, text }
 *     returns: AiExtracted { behaviour, devApi, extractedBy: "llm" | "heuristic",
 *                            extractedAt, model?, prompt?, raw? }
 *
 * When `LAB_LLM_API_KEY` is unset, the endpoint still works but returns the
 * local heuristic output (so the UI never has to special-case "no key").
 * Config: Tests Console → LLM (showcase) writes `.test-console/llm-settings.json`,
 * or env vars `LAB_LLM_PROVIDER` / `LAB_LLM_API_KEY` / `LAB_LLM_MODEL`.
 *
 * Vanilla Node, no deps.
 */

import { resolve } from "node:path";
import { resolveLabLlmConfig, DEFAULT_LLM_MODELS } from "./lab-llm-settings.mjs";

const API_PATH = "/api/specs/extract";

export function createLlmExtractRoute({ repoRoot }) {
  const heuristicMod = import(
    resolve(repoRoot, "packages/pixel-test/src/spec-extract-heuristic.ts")
  );

  function matches(req) {
    return (req.url ?? "") === API_PATH && (req.method ?? "GET").toUpperCase() === "POST";
  }

  async function readJsonBody(req) {
    const ct = (req.headers["content-type"] ?? "").toLowerCase();
    if (!ct.startsWith("application/json")) {
      const err = new Error("Content-Type must be application/json");
      err.statusCode = 400;
      throw err;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    try {
      return JSON.parse(raw);
    } catch {
      const err = new Error("Malformed JSON body");
      err.statusCode = 400;
      throw err;
    }
  }

  function sendJson(res, status, body) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify(body));
  }

  async function callOpenAI(prompt, apiKey, model) {
    const body = {
      model: model || "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You translate a designer's plain-English description of an interactive UI element into a strict JSON object with this shape: { \"behaviour\": string, \"devApi\": [{\"name\": string, \"signature\": string}] }. " +
            "Behaviour is a single short imperative sentence. devApi entries use camelCase names. " +
            "Return ONLY the JSON object — no markdown, no commentary."
        },
        { role: "user", content: prompt }
      ]
    };
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`openai ${resp.status}: ${detail.slice(0, 200)}`);
    }
    const json = await resp.json();
    const raw = json.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw);
    return { parsed, raw };
  }

  async function callAnthropic(prompt, apiKey, model) {
    const body = {
      model: model || "claude-3-5-haiku-latest",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content:
            "Translate this designer description of an interactive UI element into JSON of the shape `{\"behaviour\": string, \"devApi\": [{\"name\": string, \"signature\": string}]}`. Return ONLY the JSON, no commentary.\n\n" +
            prompt
        }
      ]
    };
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`anthropic ${resp.status}: ${detail.slice(0, 200)}`);
    }
    const json = await resp.json();
    const text = json.content?.[0]?.text ?? "";
    const parsed = JSON.parse(text);
    return { parsed, raw: text };
  }

  async function callGemini(prompt, apiKey, model) {
    const modelId = model || DEFAULT_LLM_MODELS.gemini;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Translate this designer description of an interactive UI element into JSON of the shape `{\"behaviour\": string, \"devApi\": [{\"name\": string, \"signature\": string}]}`. Return ONLY the JSON, no commentary.\n\n" +
                prompt
            }
          ]
        }
      ]
    };
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`gemini ${resp.status}: ${detail.slice(0, 200)}`);
    }
    const json = await resp.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = JSON.parse(text);
    return { parsed, raw: text };
  }

  function buildPrompt(input) {
    return [
      `Element layer: ${input.displayName || "(unnamed)"}`,
      `Tag: ${input.tag || "?"}`,
      `Role: ${input.role || "—"}`,
      `aria-label: ${input.ariaLabel || "—"}`,
      `Visible text: ${input.text || "—"}`,
      "",
      `Designer description:`,
      input.description || "(empty — produce a sensible default for a button)"
    ].join("\n");
  }

  async function heuristicFallback(input) {
    const mod = await heuristicMod;
    return mod.extractFromDescription({
      displayName: input.displayName ?? "",
      description: input.description ?? "",
      tag: input.tag ?? "button",
      role: input.role ?? "",
      ariaLabel: input.ariaLabel ?? "",
      text: input.text ?? ""
    });
  }

  async function handle(req, res) {
    try {
      const body = await readJsonBody(req);
      const { apiKey, provider, model } = resolveLabLlmConfig(repoRoot);

      if (!apiKey) {
        const out = await heuristicFallback(body);
        sendJson(res, 200, {
          ...out,
          extractedBy: "heuristic",
          note: "LLM not configured — set provider + API key in Tests Console → LLM (showcase)"
        });
        return;
      }

      const prompt = buildPrompt(body);
      let parsed;
      let raw = "";
      try {
        if (provider === "anthropic") {
          ({ parsed, raw } = await callAnthropic(prompt, apiKey, model));
        } else if (provider === "gemini") {
          ({ parsed, raw } = await callGemini(prompt, apiKey, model));
        } else {
          ({ parsed, raw } = await callOpenAI(prompt, apiKey, model));
        }
      } catch (llmErr) {
        const out = await heuristicFallback(body);
        sendJson(res, 200, {
          ...out,
          extractedBy: "heuristic",
          note: `LLM call failed, fell back to heuristic: ${llmErr.message}`
        });
        return;
      }

      const behaviour = typeof parsed.behaviour === "string" ? parsed.behaviour : "";
      const devApi = Array.isArray(parsed.devApi)
        ? parsed.devApi
            .filter((e) => e && typeof e.name === "string" && typeof e.signature === "string")
            .map((e) => ({ name: e.name, signature: e.signature }))
        : [];

      sendJson(res, 200, {
        behaviour,
        devApi,
        extractedBy: "llm",
        extractedAt: new Date().toISOString(),
        model: model ?? DEFAULT_LLM_MODELS[provider] ?? DEFAULT_LLM_MODELS.openai,
        provider,
        raw
      });
    } catch (err) {
      const status = err.statusCode ?? 500;
      sendJson(res, status, { error: err.message ?? "internal" });
    }
  }

  return { matches, handle };
}
