import React from "react";

type TabId = "overview" | "activity" | "settings";

type TabsPanelProps = {
  active?: TabId;
};

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" }
];

export function TabsPanel({ active = "activity" }: TabsPanelProps) {
  const [current, setCurrent] = React.useState<TabId>(active);
  return (
    <div className="lab-tabs-panel" data-figma-component="TabsPanel">
      <div className="lab-tabs-row" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={current === tab.id}
            data-pressed-managed="true"
            className={current === tab.id ? "active" : ""}
            onClick={() => setCurrent(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="lab-tabs-body">
        <h4>Component Sync</h4>
        <p>12 updates in the last 24 hours.</p>
      </div>
    </div>
  );
}
