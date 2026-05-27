/**
 * Right-side panel: React model, hybrid detected behaviours, layer tree.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ElementSpec, StorySpec } from "../../contract/src/spec-types.ts";
import {
  BEHAVIOR_PRESETS,
  applyPresetTemplate,
  inferPresetFromDescription,
  type BehaviorPresetId
} from "../../contract/src/behavior-presets.ts";
import { reactModelForStory } from "../../contract/src/component-model.ts";
import { fetchSpec, saveSpec } from "./spec-api";
import { callExtract, type ExtractResult } from "./spec-extract-client";
import type { LayerNode } from "./layer-tree";
import {
  mergeInteractiveWithSpec,
  newElementsFromLayers,
} from "./detect-from-layers";
import { emptyStorySpec } from "./empty-spec";

interface LayerPanelProps {
  storyId: string;
  rootLayers: LayerNode[];
  flatLayers: LayerNode[];
  hoveredLayerId: string | null;
  onHoverLayer: (layer: LayerNode | null) => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "loaded"; spec: StorySpec; draft: Partial<ElementSpec> | null }
  | { kind: "error"; message: string };

type View = "list" | "tree" | { kind: "editing"; elementId: string };

export function LayerPanel({ storyId, rootLayers, flatLayers, hoveredLayerId, onHoverLayer }: LayerPanelProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [view, setView] = useState<View>("list");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const dismissedIdsRef = useRef(new Set<string>());
  const syncingRef = useRef(false);

  const reactModel = useMemo(() => reactModelForStory(storyId), [storyId]);

  useEffect(() => {
    dismissedIdsRef.current.clear();
  }, [storyId]);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetchSpec(storyId)
      .then((spec) => {
        if (cancelled) return;
        setState({ kind: "loaded", spec: spec ?? emptyStorySpec(storyId), draft: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [storyId]);

  const elementsById = useMemo(() => {
    if (state.kind !== "loaded") return new Map<string, ElementSpec>();
    return new Map(state.spec.elements.map((e) => [e.id, e]));
  }, [state]);

  const detectedElements = useMemo(() => {
    if (state.kind !== "loaded") return [];
    const kept = state.spec.elements.filter((e) => !dismissedIdsRef.current.has(e.id));
    return mergeInteractiveWithSpec(kept, flatLayers).filter(
      (e) => !dismissedIdsRef.current.has(e.id)
    );
  }, [state, flatLayers]);

  // Persist newly discovered interactive layers so audit + approvals share one spec.
  useEffect(() => {
    if (state.kind !== "loaded" || flatLayers.length === 0 || syncingRef.current) return;
    const fresh = newElementsFromLayers(state.spec.elements, flatLayers).filter(
      (e) => !dismissedIdsRef.current.has(e.id)
    );
    if (fresh.length === 0) return;
    syncingRef.current = true;
    let cancelled = false;
    saveSpec({ ...state.spec, elements: [...state.spec.elements, ...fresh] })
      .then((saved) => {
        if (!cancelled) setState({ kind: "loaded", spec: saved, draft: null });
      })
      .catch(() => {})
      .finally(() => {
        syncingRef.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [state, flatLayers, storyId]);

  const persistSpec = useCallback(async (spec: StorySpec) => {
    setBusy(true);
    setFeedback(null);
    try {
      const saved = await saveSpec(spec);
      setState({ kind: "loaded", spec: saved, draft: null });
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const persistElement = useCallback(
    async (next: ElementSpec) => {
      if (state.kind !== "loaded") return;
      setBusy(true);
      setFeedback(null);
      try {
        const existing = state.spec.elements.find((e) => e.id === next.id);
        const elements = existing
          ? state.spec.elements.map((e) => (e.id === next.id ? next : e))
          : [...state.spec.elements, next];
        const saved = await saveSpec({ ...state.spec, elements });
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

  const removeElement = useCallback(
    async (elementId: string) => {
      if (state.kind !== "loaded") return;
      dismissedIdsRef.current.add(elementId);
      const elements = state.spec.elements.filter((e) => e.id !== elementId);
      await persistSpec({ ...state.spec, elements });
      setFeedback("Removed.");
      if (typeof view === "object" && view.kind === "editing" && view.elementId === elementId) {
        setView("list");
      }
    },
    [state, view, persistSpec]
  );

  const persistStoryIntent = useCallback(
    async (intent: string) => {
      if (state.kind !== "loaded") return;
      try {
        const saved = await saveSpec({ ...state.spec, intent });
        setState({ kind: "loaded", spec: saved, draft: null });
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : String(err));
      }
    },
    [state]
  );

  const startEditing = useCallback(
    (layer: LayerNode) => {
      setView({ kind: "editing", elementId: layer.id });
      setFeedback(null);
      if (state.kind !== "loaded") return;
      if (!elementsById.has(layer.id)) {
        const suggestion = layer.isInteractive
          ? `Click triggers the "${layer.displayName}" action`
          : "";
        const seed: ElementSpec = {
          id: layer.id,
          selector: layer.labId ? `[data-lab-id="${layer.labId}"]` : "",
          displayName: layer.displayName,
          description: "",
          behaviorPreset: layer.isInteractive ? "click" : "custom",
          source: "designer",
          aiSuggestion: suggestion,
          aiExtracted: null,
          status: "proposed",
          approvedAt: null,
        };
        setState({
          kind: "loaded",
          spec: { ...state.spec, elements: [...state.spec.elements, seed] },
          draft: null,
        });
      }
    },
    [state, elementsById]
  );

  if (state.kind === "loading") return <aside className="layer-panel"><p>Loading…</p></aside>;
  if (state.kind === "error") {
    return (
      <aside className="layer-panel layer-panel--error"><p>Error: {state.message}</p></aside>
    );
  }

  if (typeof view === "object" && view.kind === "editing") {
    const element = detectedElements.find((e) => e.id === view.elementId);
    if (!element) {
      setView("list");
      return null;
    }
    return (
      <ElementView
        storyId={storyId}
        element={element}
        draft={state.draft}
        busy={busy}
        feedback={feedback}
        onChange={(patch) =>
          setState((p) =>
            p.kind === "loaded" ? { ...p, draft: { ...(p.draft ?? {}), ...patch } } : p
          )
        }
        onClose={() => setView("list")}
        onRemove={() => removeElement(element.id)}
        onApprove={async (extractedOverride) => {
          const merged: ElementSpec = {
            ...element,
            ...(state.draft ?? {}),
            aiExtracted: extractedOverride ?? element.aiExtracted,
            status: "approved",
            approvedAt: new Date().toISOString(),
          };
          await persistElement(merged);
        }}
        onSaveDraft={async (extractedOverride) => {
          const merged: ElementSpec = {
            ...element,
            ...(state.draft ?? {}),
            aiExtracted: extractedOverride ?? element.aiExtracted,
          };
          await persistElement(merged);
        }}
      />
    );
  }

  return (
    <aside className="layer-panel">
      {reactModel && (
        <section className="layer-panel__react-model">
          <p className="layer-panel__label">{reactModel.component} props</p>
          <pre className="layer-panel__code">{reactModel.propsInterface}</pre>
        </section>
      )}

      <section className="layer-panel__story">
        <p className="layer-panel__label">Story intent</p>
        <textarea
          className="layer-panel__intent"
          value={state.spec.intent}
          onBlur={(e) => persistStoryIntent(e.target.value)}
          onChange={(e) =>
            setState((p) =>
              p.kind === "loaded" ? { ...p, spec: { ...p.spec, intent: e.target.value } } : p
            )
          }
          placeholder="One sentence: what is this story?"
          rows={2}
        />
      </section>

      <section className="layer-panel__detected">
        <p className="layer-panel__label">
          Detected behaviours ({detectedElements.length})
        </p>
        <p className="layer-panel__hint">
          Interactive layers from the preview — edit, remove, or approve each one.
        </p>
        {detectedElements.length === 0 ? (
          <p className="layer-panel__hint">No interactive layers in this preview yet.</p>
        ) : (
          <ul className="layer-panel__behaviour-cards">
            {detectedElements.map((el) => {
              const layer = flatLayers.find((l) => l.id === el.id) ?? null;
              const summary =
                el.description ||
                el.aiExtracted?.behaviour ||
                el.aiSuggestion ||
                "(needs description)";
              return (
                <li
                  key={el.id}
                  className={`behaviour-card behaviour-card--${el.status}`}
                  onMouseEnter={() => layer && onHoverLayer(layer)}
                  onMouseLeave={() => onHoverLayer(null)}
                >
                  <div className="behaviour-card__head">
                    <span className="behaviour-card__name">{el.displayName}</span>
                    <span className="layer-panel__badge" data-status={el.status}>
                      {el.status === "approved" ? "Approved" : "Proposed"}
                    </span>
                  </div>
                  {el.aiSuggestion && !el.description && (
                    <p className="behaviour-card__ai">
                      <span className="behaviour-card__ai-label">AI suggests:</span> {el.aiSuggestion}
                    </p>
                  )}
                  <p className="behaviour-card__summary">{summary}</p>
                  {el.aiExtracted && el.aiExtracted.devApi.length > 0 && (
                    <p className="behaviour-card__api">
                      {el.aiExtracted.devApi.map((a) => a.name).join(", ")}
                    </p>
                  )}
                  <div className="behaviour-card__actions">
                    <button
                      type="button"
                      className="behaviour-card__btn"
                      onClick={() => setView({ kind: "editing", elementId: el.id })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="behaviour-card__btn behaviour-card__btn--danger"
                      disabled={busy}
                      onClick={() => removeElement(el.id)}
                    >
                      Remove
                    </button>
                    {el.status !== "approved" && (
                      <button
                        type="button"
                        className="behaviour-card__btn behaviour-card__btn--approve"
                        disabled={busy}
                        onClick={() =>
                          persistElement({
                            ...el,
                            status: "approved",
                            approvedAt: new Date().toISOString(),
                          })
                        }
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="layer-panel__tree">
        <button
          type="button"
          className="layer-panel__tree-toggle"
          onClick={() => setView(view === "tree" ? "list" : "tree")}
        >
          {view === "tree" ? "− Hide layers" : "+ Add behaviour"}
        </button>
        {view === "tree" && (
          <LayerTreeView
            layers={rootLayers}
            elementsById={elementsById}
            hoveredLayerId={hoveredLayerId}
            onHover={onHoverLayer}
            onPick={startEditing}
          />
        )}
      </section>

      {feedback && <p className="layer-panel__feedback">{feedback}</p>}
    </aside>
  );
}

interface LayerTreeViewProps {
  layers: LayerNode[];
  elementsById: Map<string, ElementSpec>;
  hoveredLayerId: string | null;
  onHover: (layer: LayerNode | null) => void;
  onPick: (layer: LayerNode) => void;
}

function LayerTreeView({ layers, elementsById, hoveredLayerId, onHover, onPick }: LayerTreeViewProps) {
  if (layers.length === 0) {
    return <p className="layer-panel__hint">No layers to show — preview is empty.</p>;
  }
  return (
    <ul className="layer-tree">
      {layers.map((layer) => (
        <LayerRow
          key={layer.id}
          layer={layer}
          elementsById={elementsById}
          hoveredLayerId={hoveredLayerId}
          onHover={onHover}
          onPick={onPick}
        />
      ))}
    </ul>
  );
}

interface LayerRowProps {
  layer: LayerNode;
  elementsById: Map<string, ElementSpec>;
  hoveredLayerId: string | null;
  onHover: (layer: LayerNode | null) => void;
  onPick: (layer: LayerNode) => void;
}

function LayerRow({ layer, elementsById, hoveredLayerId, onHover, onPick }: LayerRowProps) {
  const [collapsed, setCollapsed] = useState(layer.depth > 1 && layer.children.length > 0);
  const spec = elementsById.get(layer.id);
  const status = spec?.status ?? null;
  const hovered = hoveredLayerId === layer.id;
  const hasChildren = layer.children.length > 0;
  const inSpec = Boolean(spec);

  return (
    <li>
      <div
        className={`layer-row${hovered ? " layer-row--hovered" : ""}${inSpec ? " layer-row--in-spec" : ""}`}
        style={{ paddingLeft: 8 + layer.depth * 14 }}
        onMouseEnter={() => onHover(layer)}
        onMouseLeave={() => onHover(null)}
        onClick={() => onPick(layer)}
      >
        {hasChildren ? (
          <button
            type="button"
            className="layer-row__chevron"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className="layer-row__chevron layer-row__chevron--empty" />
        )}
        <span className={`layer-row__icon layer-row__icon--${layer.isInteractive ? "interactive" : "static"}`}>
          {iconFor(layer)}
        </span>
        <span className="layer-row__name">{layer.displayName}</span>
        <span className="layer-row__tag">{layer.tag}</span>
        {status === "approved" && <span className="layer-row__dot" title="Approved" />}
        {status === "proposed" && <span className="layer-row__dot layer-row__dot--proposed" title="In spec" />}
      </div>
      {hasChildren && !collapsed && (
        <ul className="layer-tree">
          {layer.children.map((child) => (
            <LayerRow
              key={child.id}
              layer={child}
              elementsById={elementsById}
              hoveredLayerId={hoveredLayerId}
              onHover={onHover}
              onPick={onPick}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function iconFor(layer: LayerNode): string {
  if (layer.isInteractive) {
    if (layer.tag === "input" || layer.tag === "textarea") return "T";
    if (layer.tag === "select") return "▾";
    if (layer.tag === "a") return "↗";
    return "B";
  }
  if (layer.tag === "img" || layer.tag === "svg") return "▢";
  if (/^h\d$/.test(layer.tag) || layer.tag === "p" || layer.tag === "span") return "—";
  return "□";
}

interface ElementViewProps {
  storyId: string;
  element: ElementSpec;
  draft: Partial<ElementSpec> | null;
  busy: boolean;
  feedback: string | null;
  onChange: (patch: Partial<ElementSpec>) => void;
  onClose: () => void;
  onRemove: () => void;
  onApprove: (extractedOverride?: ElementSpec["aiExtracted"]) => Promise<void>;
  onSaveDraft: (extractedOverride?: ElementSpec["aiExtracted"]) => Promise<void>;
}

function ElementView({
  storyId,
  element,
  draft,
  busy,
  feedback,
  onChange,
  onClose,
  onRemove,
  onApprove,
  onSaveDraft,
}: ElementViewProps) {
  const description = draft?.description ?? element.description;
  const displayName = draft?.displayName ?? element.displayName;
  const presetFromDraft = draft?.behaviorPreset ?? element.behaviorPreset;
  const [preset, setPreset] = useState<BehaviorPresetId>(
    presetFromDraft ?? inferPresetFromDescription(description)
  );
  const dirty = draft !== null;
  const [polishing, setPolishing] = useState(false);
  const [polishNote, setPolishNote] = useState<string | null>(null);
  const [polished, setPolished] = useState<ExtractResult | null>(null);
  const [extracting, setExtracting] = useState(false);

  const live = polished ?? element.aiExtracted;

  const runExtract = useCallback(
    async (desc: string, name: string) => {
      if (!desc.trim()) return;
      setExtracting(true);
      try {
        const res = await callExtract({
          storyId,
          elementId: element.id,
          displayName: name,
          description: desc,
          tag: "",
          role: "",
          ariaLabel: "",
          text: "",
        });
        setPolished(res);
      } catch {
        /* keep previous cards */
      } finally {
        setExtracting(false);
      }
    },
    [storyId, element.id]
  );

  const onPresetChange = useCallback(
    (next: BehaviorPresetId) => {
      setPreset(next);
      setPolished(null);
      if (next === "custom") {
        onChange({ behaviorPreset: "custom", source: "designer" });
        return;
      }
      const text = applyPresetTemplate(next, displayName);
      onChange({ behaviorPreset: next, description: text, source: "designer" });
      void runExtract(text, displayName);
    },
    [displayName, onChange, runExtract]
  );

  useEffect(() => {
    if (presetFromDraft) setPreset(presetFromDraft);
  }, [presetFromDraft]);

  const onPolishClick = useCallback(async () => {
    setPolishing(true);
    setPolishNote(null);
    try {
      const res = await callExtract({
        storyId,
        elementId: element.id,
        displayName,
        description,
        tag: "",
        role: "",
        ariaLabel: "",
        text: "",
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

  const onDescriptionBlur = useCallback(() => {
    if (description.trim()) void runExtract(description, displayName);
  }, [description, displayName, runExtract]);

  return (
    <aside className="layer-panel layer-panel--editing">
      <header className="layer-panel__head">
        <button type="button" className="layer-panel__back" onClick={onClose} aria-label="Back">
          ← Back
        </button>
        <span className="layer-panel__badge" data-status={element.status}>
          {element.status === "approved" ? "Approved" : "Proposed"}
        </span>
      </header>

      <label className="layer-panel__field">
        <span>Layer</span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => onChange({ displayName: e.target.value, source: "designer" })}
        />
      </label>

      <label className="layer-panel__field">
        <span>Behaviour type</span>
        <select
          className="layer-panel__select"
          value={preset}
          onChange={(e) => onPresetChange(e.target.value as BehaviorPresetId)}
        >
          {BEHAVIOR_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {element.aiSuggestion && (
        <p className="layer-panel__hint behaviour-card__ai">
          <span className="behaviour-card__ai-label">Detected:</span> {element.aiSuggestion}
        </p>
      )}

      <label className="layer-panel__field">
        <span>{preset === "custom" ? "Custom description" : "Description (editable)"}</span>
        <textarea
          value={description}
          onChange={(e) => {
            onChange({ description: e.target.value, source: "designer", behaviorPreset: "custom" });
            setPreset("custom");
            setPolished(null);
          }}
          onBlur={onDescriptionBlur}
          placeholder="Plain English — or pick a behaviour type above"
          rows={3}
        />
      </label>

      <div className="layer-panel__polish-row">
        <button
          type="button"
          className="layer-panel__ghost layer-panel__polish"
          disabled={polishing || extracting || !description.trim()}
          onClick={onPolishClick}
        >
          {polishing ? "✨ Polishing…" : extracting ? "Updating…" : "✨ Improve with AI"}
        </button>
        {polishNote && <span className="layer-panel__feedback">{polishNote}</span>}
      </div>

      {live && (
        <>
          <div className="layer-panel__card layer-panel__card--behaviour">
            <p className="layer-panel__card-title">Runtime behaviour</p>
            <p className="layer-panel__card-body">{live.behaviour}</p>
          </div>
          <div className="layer-panel__card layer-panel__card--api">
            <p className="layer-panel__card-title">Developer API</p>
            {live.devApi.length === 0 ? (
              <p className="layer-panel__card-body">—</p>
            ) : (
              <ul>
                {live.devApi.map((api) => (
                  <li key={api.name}>
                    <code>
                      {api.name}: {api.signature}
                    </code>
                  </li>
                ))}
              </ul>
            )}
            <p className="layer-panel__card-footer">extracted by {live.extractedBy}</p>
          </div>
        </>
      )}

      <footer className="layer-panel__foot">
        <button
          type="button"
          className="layer-panel__approve"
          disabled={busy}
          onClick={() => onApprove(polished ?? undefined)}
        >
          {element.status === "approved" ? "Re-approve" : "✓ Approve"}
        </button>
        <button
          type="button"
          disabled={busy || (!dirty && !polished)}
          onClick={() => onSaveDraft(polished ?? undefined)}
        >
          Save draft
        </button>
        <button
          type="button"
          className="layer-panel__ghost layer-panel__btn-remove"
          disabled={busy}
          onClick={onRemove}
        >
          Remove
        </button>
      </footer>
      {feedback && <p className="layer-panel__feedback">{feedback}</p>}
    </aside>
  );
}
