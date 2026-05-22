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

  if (!entry) {
    return (
      <div className="lab-stage" id="preview-root">
        <p style={{ padding: 24, color: "#64748b" }}>Unknown story id: {storyId}</p>
      </div>
    );
  }

  if (entry.storybookOnly) {
    return (
      <div className="lab-stage" id="preview-root">
        <p style={{ padding: 24, color: "#64748b" }}>
          Story &quot;{storyId}&quot; is not in the delivery package yet.
        </p>
      </div>
    );
  }

  return (
    <div className="lab-stage" id="preview-root">
      {renderDevStory(entry)}
    </div>
  );
}
