import React from "react";

type TabsPanelProps = {
  active?: "overview" | "activity" | "settings";
};

export function TabsPanel({ active = "activity" }: TabsPanelProps) {
  return (
    <div className="lab-tabs-panel" data-figma-component="TabsPanel">
      <div className="lab-tabs-row">
        <button className={active === "overview" ? "active" : ""}>Overview</button>
        <button className={active === "activity" ? "active" : ""}>Activity</button>
        <button className={active === "settings" ? "active" : ""}>Settings</button>
      </div>
      <div className="lab-tabs-body">
        <h4>Component Sync</h4>
        <p>12 updates in the last 24 hours.</p>
      </div>
    </div>
  );
}
