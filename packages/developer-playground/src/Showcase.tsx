import React, { useMemo } from "react";
import { DEV_STORIES, type DevStoryEntry } from "../../contract/src/stories.ts";
import { renderDevStory } from "./registry";
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

export function Showcase() {
  const packageStories = useMemo(() => DEV_STORIES, []);
  const grouped = useMemo(() => groupByComponent(packageStories), [packageStories]);

  return (
    <div className="showcase-page">
      <header className="showcase-header">
        <div>
          <h1>Delivery showcase</h1>
          <p>Every story in the delivery package — same app used in delivery tests.</p>
        </div>
        <p className="showcase-meta">
          {packageStories.length} stories · isolated view:{" "}
          <code>?story=&lt;story-id&gt;</code>
        </p>
      </header>

      {grouped.map(([component, stories]) => (
        <section key={component} className="showcase-section">
          <h2>{component}</h2>
          <div className="showcase-grid">
            {stories.map((entry) => (
              <article key={entry.id} className="showcase-card">
                <header>
                  <code title={entry.id}>{entry.id}</code>
                  <a href={`?story=${encodeURIComponent(entry.id)}`}>Open alone ↗</a>
                </header>
                <div className="showcase-stage lab-stage">{renderDevStory(entry)}</div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
