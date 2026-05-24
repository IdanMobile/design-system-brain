import React from "react";
import { DEV_STORY_BY_ID } from "../../contract/src/stories.ts";
import { renderDevStory } from "./registry";
import { Showcase } from "./Showcase";

export function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "showcase") {
    return <Showcase />;
  }

  const storyId = params.get("story") ?? "lab-featurecard--default";
  const entry = DEV_STORY_BY_ID[storyId];

  // Single-story preview must mirror Storybook's iframe wrapping so the
  // delivery 3-way diff stays consistent. Storybook wraps the story in
  // `#storybook-root` with body{margin:0} + 16px padding, yielding
  // [data-figma-component] width = viewport - 32px. We replicate that
  // here (instead of the `.lab-stage` wrapper which has 40px padding +
  // browser-default 8px body margin, which would make `width:100%`
  // components render ~64px narrower and shift centered cards).
  const previewStyle: React.CSSProperties = { padding: 16 };
  if (!entry) {
    return (
      <div id="preview-root" style={previewStyle}>
        <p style={{ padding: 24, color: "#64748b" }}>Unknown story id: {storyId}</p>
      </div>
    );
  }

  if (entry.storybookOnly) {
    return (
      <div id="preview-root" style={previewStyle}>
        <p style={{ padding: 24, color: "#64748b" }}>
          Story &quot;{storyId}&quot; is not in the delivery package yet.
        </p>
      </div>
    );
  }

  return (
    <div id="preview-root" style={previewStyle}>
      {renderDevStory(entry)}
    </div>
  );
}
