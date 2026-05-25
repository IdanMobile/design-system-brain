import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ElementSpec,
  StorySpec
} from "../../contract/src/spec-types.ts";
import { fetchSpec, saveSpec } from "./spec-api";
import { callExtract, type ExtractResult } from "./spec-extract-client";

interface ElementPanelProps {
  storyId: string;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "loaded"; spec: StorySpec; draft: Partial<ElementSpec> | null }
  | { kind: "error"; message: string };

export function ElementPanel({ storyId, selectedElementId, onSelectElement }: ElementPanelProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetchSpec(storyId)
      .then((spec) => {
        if (cancelled) return;
        if (!spec) setState({ kind: "missing" });
        else setState({ kind: "loaded", spec, draft: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [storyId]);

  useEffect(() => {
    setState((prev) => prev.kind === "loaded" ? { ...prev, draft: null } : prev);
    setFeedback(null);
  }, [selectedElementId]);

  const selectedElement: ElementSpec | null = useMemo(() => {
    if (state.kind !== "loaded" || !selectedElementId) return null;
    return state.spec.elements.find((e) => e.id === selectedElementId) ?? null;
  }, [state, selectedElementId]);

  const persistElement = useCallback(
    async (next: ElementSpec) => {
      if (state.kind !== "loaded") return;
      setBusy(true);
      setFeedback(null);
      try {
        const updatedSpec: StorySpec = {
          ...state.spec,
          elements: state.spec.elements.map((e) => (e.id === next.id ? next : e))
        };
        const saved = await saveSpec(updatedSpec);
        setState({ kind: "loaded", spec: saved, draft: null });
        setFeedback("Saved.");
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [state]
  );

  const persistStoryIntent = useCallback(
    async (intent: string) => {
      if (state.kind !== "loaded") return;
      setBusy(true);
      try {
        const saved = await saveSpec({ ...state.spec, intent });
        setState({ kind: "loaded", spec: saved, draft: null });
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [state]
  );

  const approveStoryAsStatic = useCallback(async () => {
    if (state.kind !== "loaded") return;
    setBusy(true);
    try {
      const saved = await saveSpec({
        ...state.spec,
        status: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy: "showcase"
      });
      setState({ kind: "loaded", spec: saved, draft: null });
      setFeedback("Story approved as static.");
    } finally {
      setBusy(false);
    }
  }, [state]);

  if (state.kind === "loading") return <aside className="element-panel"><p>Loading…</p></aside>;
  if (state.kind === "missing") return (
    <aside className="element-panel">
      <p>No spec — run <code>pnpm specs:bootstrap-v2</code>.</p>
    </aside>
  );
  if (state.kind === "error") return (
    <aside className="element-panel element-panel--error">
      <p>Error: {state.message}</p>
    </aside>
  );

  if (state.spec.elements.length === 0) {
    return (
      <aside className="element-panel">
        <p className="element-panel__intent-label">Intent</p>
        <textarea
          className="element-panel__intent"
          value={state.spec.intent}
          onBlur={(e) => persistStoryIntent(e.target.value)}
          onChange={(e) =>
            setState((p) =>
              p.kind === "loaded"
                ? { ...p, spec: { ...p.spec, intent: e.target.value } }
                : p
            )
          }
          placeholder="One sentence: what is this story?"
          rows={2}
        />
        <p className="element-panel__hint">
          {state.spec.status === "approved"
            ? "Approved as static — no interactive elements."
            : "No interactive elements detected. Run pnpm test:logic:audit to confirm, then approve below."}
        </p>
        {state.spec.status !== "approved" && (
          <button className="element-panel__approve" disabled={busy} onClick={approveStoryAsStatic}>
            Approve story as static
          </button>
        )}
        {feedback && <p className="element-panel__feedback">{feedback}</p>}
      </aside>
    );
  }

  if (selectedElement) {
    return (
      <ElementView
        storyId={storyId}
        element={selectedElement}
        busy={busy}
        feedback={feedback}
        onChange={(patch) =>
          setState((p) =>
            p.kind === "loaded"
              ? { ...p, draft: { ...(p.draft ?? {}), ...patch } }
              : p
          )
        }
        draft={state.draft}
        onClose={() => onSelectElement(null)}
        onApprove={async (extractedOverride) => {
          const merged: ElementSpec = {
            ...selectedElement,
            ...(state.draft ?? {}),
            aiExtracted: extractedOverride ?? selectedElement.aiExtracted,
            status: "approved",
            approvedAt: new Date().toISOString()
          };
          await persistElement(merged);
        }}
        onSaveDraft={async (extractedOverride) => {
          const merged: ElementSpec = {
            ...selectedElement,
            ...(state.draft ?? {}),
            aiExtracted: extractedOverride ?? selectedElement.aiExtracted
          };
          await persistElement(merged);
        }}
        onReset={() =>
          setState((p) =>
            p.kind === "loaded"
              ? {
                  ...p,
                  draft: {
                    description: "",
                    source: "ai"
                  }
                }
              : p
          )
        }
      />
    );
  }

  return (
    <aside className="element-panel">
      <p className="element-panel__intent-label">Intent</p>
      <textarea
        className="element-panel__intent"
        value={state.spec.intent}
        onBlur={(e) => persistStoryIntent(e.target.value)}
        onChange={(e) =>
          setState((p) =>
            p.kind === "loaded"
              ? { ...p, spec: { ...p.spec, intent: e.target.value } }
              : p
          )
        }
        placeholder="One sentence: what does this story do?"
        rows={2}
      />
      <p className="element-panel__count">
        All elements ({state.spec.elements.length})
      </p>
      <ul className="element-panel__list">
        {state.spec.elements.map((el) => {
          const icon = el.status === "approved" ? "✓" : "◯";
          const tail = el.description || el.aiSuggestion || "(no description)";
          return (
            <li
              key={el.id}
              className={`element-panel__row element-panel__row--${el.status}`}
              onClick={() => onSelectElement(el.id)}
            >
              <span className="element-panel__row-icon">{icon}</span>
              <span className="element-panel__row-name">{el.displayName}</span>
              <span className="element-panel__row-tail">{tail}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

interface ElementViewProps {
  storyId: string;
  element: ElementSpec;
  draft: Partial<ElementSpec> | null;
  busy: boolean;
  feedback: string | null;
  onChange: (patch: Partial<ElementSpec>) => void;
  onClose: () => void;
  onApprove: (extractedOverride?: ElementSpec["aiExtracted"]) => Promise<void>;
  onSaveDraft: (extractedOverride?: ElementSpec["aiExtracted"]) => Promise<void>;
  onReset: () => void;
}

function ElementView({ storyId, element, draft, busy, feedback, onChange, onClose, onApprove, onSaveDraft, onReset }: ElementViewProps) {
  const description = draft?.description ?? element.description;
  const displayName = draft?.displayName ?? element.displayName;
  const dirty = draft !== null;
  const [polishing, setPolishing] = useState(false);
  const [polishNote, setPolishNote] = useState<string | null>(null);
  const [polished, setPolished] = useState<ExtractResult | null>(null);

  const live = polished ?? element.aiExtracted;

  const onPolishClick = useCallback(async () => {
    setPolishing(true);
    setPolishNote(null);
    try {
      const res = await callExtract({
        storyId,
        elementId: element.id,
        displayName,
        description,
        tag: "", role: "", ariaLabel: "", text: ""
      });
      setPolished(res);
      if (res.note) setPolishNote(res.note);
      else setPolishNote(`Extracted by ${res.extractedBy}${res.model ? ` (${res.model})` : ""}`);
    } catch (err) {
      setPolishNote(err instanceof Error ? err.message : String(err));
    } finally {
      setPolishing(false);
    }
  }, [storyId, element.id, displayName, description]);

  return (
    <aside className="element-panel element-panel--element">
      <header className="element-panel__head">
        <span className="element-panel__badge" data-status={element.status}>
          {element.status === "approved" ? "Approved" : "Proposed"}
        </span>
        <button className="element-panel__close" onClick={onClose} aria-label="Close">×</button>
      </header>

      <label className="element-panel__field">
        <span>Layer</span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => onChange({ displayName: e.target.value, source: "designer" })}
        />
      </label>

      <label className="element-panel__field">
        <span>What should this do?</span>
        <textarea
          value={description}
          onChange={(e) => onChange({ description: e.target.value, source: "designer" })}
          placeholder={element.aiSuggestion ? `e.g. ${element.aiSuggestion}` : "Plain English. e.g. 'click to reveal a search input'"}
          rows={3}
        />
      </label>

      <div className="element-panel__polish-row">
        <button
          className="element-panel__ghost element-panel__polish"
          disabled={polishing || !description.trim()}
          onClick={onPolishClick}
        >
          {polishing ? "✨ Polishing…" : "✨ Improve with AI"}
        </button>
        {polishNote && <span className="element-panel__feedback">{polishNote}</span>}
      </div>

      {live && (
        <>
          <div className="element-panel__card element-panel__card--behaviour">
            <p className="element-panel__card-title">Runtime behaviour</p>
            <p className="element-panel__card-body">{live.behaviour}</p>
          </div>
          <div className="element-panel__card element-panel__card--api">
            <p className="element-panel__card-title">Developer API</p>
            {live.devApi.length === 0 ? (
              <p className="element-panel__card-body">—</p>
            ) : (
              <ul>
                {live.devApi.map((api) => (
                  <li key={api.name}><code>{api.name}: {api.signature}</code></li>
                ))}
              </ul>
            )}
            <p className="element-panel__card-footer">
              extracted by {live.extractedBy}
            </p>
          </div>
        </>
      )}

      <footer className="element-panel__foot">
        <button
          className="element-panel__approve"
          disabled={busy}
          onClick={() => onApprove(polished ?? undefined)}
        >
          {element.status === "approved" ? "Re-approve" : "✓ Approve"}
        </button>
        <button
          disabled={busy || (!dirty && !polished)}
          onClick={() => onSaveDraft(polished ?? undefined)}
        >
          Save draft
        </button>
        <button className="element-panel__ghost" onClick={onReset}>Reset to AI suggestion</button>
      </footer>
      {feedback && <p className="element-panel__feedback">{feedback}</p>}
    </aside>
  );
}
