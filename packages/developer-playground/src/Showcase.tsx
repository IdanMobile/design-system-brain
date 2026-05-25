import React, { useMemo, useState } from "react";
import {
  DEV_STORIES,
  type DevStoryEntry
} from "../../contract/src/index.ts";
import { renderDevStory } from "./registry";
import { PackageDownload } from "./PackageDownload";
import { ElementOverlay } from "./ElementOverlay";
import { ElementPanel } from "./ElementPanel";
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
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  return (
    <article className="showcase-card">
      <header>
        <code title={entry.id}>{entry.id}</code>
        <a href={`?story=${encodeURIComponent(entry.id)}`}>Open alone ↗</a>
      </header>
      <div className="showcase-card-body">
        <div className="showcase-stage lab-stage">
          <ElementOverlay
            selectedId={selectedElementId}
            onSelect={setSelectedElementId}
          >
            {renderDevStory(entry)}
          </ElementOverlay>
        </div>
        <ElementPanel
          storyId={entry.id}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
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
            Click any interactive element to describe what it should do. The AI
            translates plain English into runtime behaviour and a developer API.
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
