import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEV_STORIES,
  type DevStoryEntry
} from "../../contract/src/index.ts";
import { renderDevStory } from "./registry";
import { PackageDownload } from "./PackageDownload";
import { HoverOutline } from "./HoverOutline";
import { LayerPanel } from "./LayerPanel";
import { buildLayerTree, flatten, type LayerNode } from "./layer-tree";
import "./showcase.css";

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
  const packageStories = useMemo(() => DEV_STORIES, []);
  const grouped = useMemo(() => groupByComponent(packageStories), [packageStories]);

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
          {packageStories.length} stories · isolated view:{" "}
          <code>?story=&lt;story-id&gt;</code>
        </p>
      </header>

      <PackageDownload />

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
