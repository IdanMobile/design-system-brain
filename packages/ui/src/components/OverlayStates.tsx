import React from "react";

type OverlayStatesProps = {
  mode?: "dialog" | "drawer" | "sheet";
};

type DialogOutcome = "open" | "cancelled" | "discarded";
type DrawerOutcome = "open" | "reset" | "applied";

export function OverlayStates({ mode = "dialog" }: OverlayStatesProps) {
  const [dialog, setDialog] = React.useState<DialogOutcome>("open");
  const [drawer, setDrawer] = React.useState<DrawerOutcome>("open");

  return (
    <div className="lab-overlay-canvas" data-figma-component="OverlayStates">
      <div className="backdrop" />
      {mode === "dialog" && (
        <div className="dialog" data-state={dialog}>
          <h4>
            {dialog === "discarded"
              ? "Changes discarded"
              : dialog === "cancelled"
                ? "Edit kept"
                : "Discard changes?"}
          </h4>
          <p>
            {dialog === "discarded"
              ? "Your draft was removed."
              : dialog === "cancelled"
                ? "We kept your unsaved edits."
                : "Your unsaved edits will be lost."}
          </p>
          <div className="actions">
            <button
              type="button"
              aria-pressed={dialog === "cancelled"}
              data-pressed-managed="true"
              onClick={() => setDialog("cancelled")}
            >
              {dialog === "cancelled" ? "Cancelled" : "Cancel"}
            </button>
            <button
              type="button"
              className="danger"
              aria-pressed={dialog === "discarded"}
              data-pressed-managed="true"
              onClick={() => setDialog("discarded")}
            >
              {dialog === "discarded" ? "Discarded" : "Discard"}
            </button>
          </div>
        </div>
      )}
      {mode === "drawer" && (
        <div className="drawer" data-state={drawer}>
          <h4>Filters</h4>
          <p>
            {drawer === "applied"
              ? "Filters applied to the workspace."
              : drawer === "reset"
                ? "Filters cleared."
                : "Category, status and date range"}
          </p>
          <div className="actions">
            <button
              type="button"
              aria-pressed={drawer === "reset"}
              data-pressed-managed="true"
              onClick={() => setDrawer("reset")}
            >
              {drawer === "reset" ? "Reset done" : "Reset"}
            </button>
            <button
              type="button"
              className="primary"
              aria-pressed={drawer === "applied"}
              data-pressed-managed="true"
              onClick={() => setDrawer("applied")}
            >
              {drawer === "applied" ? "Applied" : "Apply"}
            </button>
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
