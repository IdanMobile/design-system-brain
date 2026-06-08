import { useCallback, useEffect, useState } from "react";
import type { LlmProvider, LlmSettingsPublic } from "./types";
import { DEFAULT_LLM_MODELS } from "./llm-defaults";

type Props = {
  settings: LlmSettingsPublic | null;
  onSaved: (next: LlmSettingsPublic) => void;
};

export function LlmSettingsCard({ settings, onSaved }: Props) {
  const [provider, setProvider] = useState<LlmProvider>("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setProvider(settings.provider);
    setModel(settings.model);
    setApiKey("");
  }, [settings]);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/llm-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: model.trim() || undefined,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {})
        })
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const next = (await res.json()) as LlmSettingsPublic;
      onSaved(next);
      setApiKey("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [provider, model, apiKey, onSaved]);

  const onProviderChange = (next: LlmProvider) => {
    setProvider(next);
    if (!model.trim() || Object.values(DEFAULT_LLM_MODELS).includes(model.trim())) {
      setModel(DEFAULT_LLM_MODELS[next]);
    }
  };

  return (
    <section className="card llm-settings-card">
      <h2>LLM (showcase)</h2>
      <p className="llm-settings-intro">
        Powers the ✨ <strong>Improve with AI</strong> button on the developer playground element
        panel. Saved here is used by <code>/api/specs/extract</code> when playground is running.
        Without a key, the local heuristic still works.
      </p>
      {settings ? (
        <p className="llm-settings-status">
          Status:{" "}
          {settings.apiKeySet ? (
            <>
              <span className="llm-settings-ok">configured</span>
              {settings.apiKeyPreview ? ` (${settings.apiKeyPreview})` : null}
              {" · "}
              source: {settings.source}
            </>
          ) : (
            <span className="llm-settings-warn">heuristic only — no API key</span>
          )}
        </p>
      ) : null}
      <div className="llm-settings-grid">
        <label className="llm-settings-field">
          <span>Provider</span>
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as LlmProvider)}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
          </select>
        </label>
        <label className="llm-settings-field">
          <span>Model</span>
          <input
            type="text"
            value={model}
            placeholder={DEFAULT_LLM_MODELS[provider]}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
        <label className="llm-settings-field llm-settings-field-wide">
          <span>API key {settings?.apiKeySet ? "(leave blank to keep current)" : ""}</span>
          <input
            type="password"
            value={apiKey}
            autoComplete="off"
            placeholder={settings?.apiKeySet ? "••••••••" : "sk-… or AIza…"}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
      </div>
      {error ? <p className="llm-settings-error">{error}</p> : null}
      <div className="llm-settings-actions">
        <button type="button" className="pill-start" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save LLM settings"}
        </button>
        <a
          href={settings?.playgroundShowcaseUrl ?? "http://127.0.0.1:6108/?view=showcase"}
          target="_blank"
          rel="noreferrer"
          className="llm-settings-link"
        >
          Open showcase ↗
        </a>
      </div>
    </section>
  );
}
