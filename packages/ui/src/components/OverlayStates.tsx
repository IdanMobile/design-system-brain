import React from "react";

type OverlayStatesProps = {
  mode?: "dialog" | "drawer" | "sheet";
};

export function OverlayStates({ mode = "dialog" }: OverlayStatesProps) {
  return (
    <div className="lab-overlay-canvas" data-figma-component="OverlayStates">
      <div className="backdrop" />
      {mode === "dialog" && (
        <div className="dialog">
          <h4>Discard changes?</h4>
          <p>Your unsaved edits will be lost.</p>
          <div className="actions">
            <button>Cancel</button>
            <button className="danger">Discard</button>
          </div>
        </div>
      )}
      {mode === "drawer" && (
        <div className="drawer">
          <h4>Filters</h4>
          <p>Category, status and date range</p>
          <div className="actions">
            <button>Reset</button>
            <button className="primary">Apply</button>
          </div>
        </div>
      )}
      {mode === "sheet" && (
        <div className="sheet">
          <div className="handle" />
          <h4>Share</h4>
          <p>Invite teammates to this canvas.</p>
        </div>
      )}
    </div>
  );
}
