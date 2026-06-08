import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEV_STORIES,
  type DevStoryEntry
} from "../../contract/src/index.ts";
import { renderDevStory } from "./registry";
import { HoverOutline } from "./HoverOutline";
import { LayerPanel } from "./LayerPanel";
import { buildLayerTree, flatten, type LayerNode } from "./layer-tree";
import "./showcase.css";

interface ManualPreviewManifest {
  generatedAt?: string;
  delivery?: Array<{ storyId: string }>;
}

function groupByComponent(stories: DevStoryEntry[]): [string, DevStoryEntry[]][] {
  const map = new Map<string, DevStoryEntry[]>();
  for (const entry of stories) {
    const list = map.get(entry.component) ?? [];
    list.push(entry);
    map.set(entry.component, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

interface StoryCardProps {
  entry: DevStoryEntry;
}

function StoryCard({ entry }: StoryCardProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [tree, setTree] = useState<{ roots: LayerNode[]; flat: LayerNode[] }>({ roots: [], flat: [] });
  const [hoveredLayer, setHoveredLayer] = useState<LayerNode | null>(null);

  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;
    function rebuild() {
      const root = container!.firstElementChild as HTMLElement | null;
      if (!root) {
        setTree({ roots: [], flat: [] });
        return;
      }
      const { roots } = buildLayerTree(root);
      setTree({ roots, flat: flatten(roots) });
    }
    rebuild();
    const root = container.firstElementChild;
    if (!root) return;
    const obs = new MutationObserver(rebuild);
    obs.observe(root, { childList: true, subtree: true, attributes: true });
    return () => obs.disconnect();
  }, [entry.id]);

  const onHoverLayer = useCallback((layer: LayerNode | null) => {
    setHoveredLayer(layer);
  }, []);

  return (
    <article className="showcase-card">
      <header>
        <code title={entry.id}>{entry.id}</code>
        <a href={`?story=${encodeURIComponent(entry.id)}`}>Open alone ↗</a>
      </header>
      <div className="showcase-card-body">
        <div className="showcase-card__preview" ref={previewRef}>
          {renderDevStory(entry)}
          <HoverOutline containerRef={previewRef} target={hoveredLayer?.node ?? null} />
        </div>
        <LayerPanel
          storyId={entry.id}
          rootLayers={tree.roots}
          flatLayers={tree.flat}
          hoveredLayerId={hoveredLayer?.id ?? null}
          onHoverLayer={onHoverLayer}
        />
      </div>
    </article>
  );
}

export function Showcase() {
  const [manifest, setManifest] = useState<ManualPreviewManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/manual-preview.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${res.status}`))))
      .then((data: ManualPreviewManifest) => {
        if (!cancelled) {
          setManifest(data);
          setLoadError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setManifest({ delivery: [] });
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const packageStories = useMemo(() => {
    const ids = new Set((manifest?.delivery ?? []).map((d) => d.storyId));
    if (ids.size === 0) return [];
    return DEV_STORIES.filter((entry) => ids.has(entry.id));
  }, [manifest]);

  const grouped = useMemo(() => groupByComponent(packageStories), [packageStories]);

  if (manifest === null) {
    return (
      <div className="showcase-page">
        <p className="showcase-meta">Loading delivery showcase…</p>
      </div>
    );
  }

  if (packageStories.length === 0) {
    return (
      <div className="showcase-page">
        <header className="showcase-header">
          <div>
            <h1>Delivery showcase</h1>
            <p>
              No JSX delivery packages in the current Test portfolio yet. Run Logic
              audit (or pack a story) and refresh the portfolio.
            </p>
          </div>
          {loadError ? (
            <p className="showcase-meta">Manifest unavailable ({loadError}) — showing empty list.</p>
          ) : (
            <p className="showcase-meta">
              Updated {manifest.generatedAt ? new Date(manifest.generatedAt).toLocaleString() : "—"}
            </p>
          )}
        </header>
      </div>
    );
  }

  return (
    <div className="showcase-page">
      <header className="showcase-header">
        <div>
          <h1>Delivery showcase</h1>
          <p>
            Preview a story, open its layer tree on the right, pick the layer
            you want to add behaviour to, and describe it in plain English. The
            AI translates that into runtime behaviour and a developer API.
          </p>
        </div>
        <p className="showcase-meta">
          {packageStories.length} stor{packageStories.length === 1 ? "y" : "ies"} from
          the current Test portfolio
          {manifest.generatedAt
            ? ` · updated ${new Date(manifest.generatedAt).toLocaleString()}`
            : ""}{" "}
          · isolated view: <code>?story=&lt;story-id&gt;</code>
        </p>
      </header>

      {grouped.map(([component, stories]) => (
        <section key={component} className="showcase-section">
          <h2>{component}</h2>
          <div className="showcase-grid">
            {stories.map((entry) => (
              <StoryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
