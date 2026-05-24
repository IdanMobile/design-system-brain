import React from "react";

type FilterSidePanelProps = {
  side?: "left" | "right";
  collapsed?: boolean;
};

const seedTags = ["Dashboard", "Billing", "Mobile", "Design System"];
const members = ["Ari", "Mika", "Noam", "Leah"];
const swatches = ["#2563EB", "#14B8A6", "#F97316", "#8B5CF6", "#EF4444", "#84CC16"];

const extraTagSuggestions = [
  "Analytics",
  "Onboarding",
  "Payments",
  "Notifications",
  "Realtime",
  "Settings"
];

export function FilterSidePanel({ side = "right", collapsed = false }: FilterSidePanelProps) {
  const [tags, setTags] = React.useState<string[]>(seedTags);
  const [appliedSwatch, setAppliedSwatch] = React.useState<string | null>(null);
  const [minValue, setMinValue] = React.useState("120");
  const [maxValue, setMaxValue] = React.useState("920");
  const [searchText, setSearchText] = React.useState("q3 launch status");
  const [appliedAt, setAppliedAt] = React.useState<string | null>(null);

  const addTag = (): void => {
    const next = extraTagSuggestions.find((t) => !tags.includes(t)) ?? `Filter ${tags.length + 1}`;
    setTags((prev) => [...prev, next]);
    setAppliedAt(null);
  };

  const removeTag = (tag: string) => (): void => {
    setTags((prev) => prev.filter((t) => t !== tag));
    setAppliedAt(null);
  };

  const resetAll = (): void => {
    setTags(seedTags);
    setAppliedSwatch(null);
    setMinValue("120");
    setMaxValue("920");
    setSearchText("q3 launch status");
    setAppliedAt(null);
  };

  const applyFilters = (): void => {
    setAppliedAt(new Date().toLocaleTimeString());
  };

  return (
    <aside className={`lab-filter-panel ${side} ${collapsed ? "collapsed" : ""}`} data-figma-component="FilterSidePanel">
      <header>
        <h3>Advanced Filters</h3>
        <span className="status">{appliedAt ? `Applied · ${appliedAt}` : "Live"}</span>
      </header>

      <section>
        <p className="label">Multi-select: Product Areas</p>
        <div className="multi-select">
          {tags.map((tag) => (
            <span
              key={tag}
              role="button"
              tabIndex={0}
              data-pressed-managed="true"
              aria-pressed="true"
              onClick={removeTag(tag)}
              title="Remove filter"
            >
              {tag}
            </span>
          ))}
          <button type="button" data-pressed-managed="true" onClick={addTag}>
            + Add
          </button>
        </div>
      </section>

      <div className="divider" />

      <section>
        <p className="label">Assignees</p>
        <div className="multi-select compact">
          {members.map((member) => <span key={member}>{member}</span>)}
        </div>
      </section>

      <section>
        <p className="label">Color picker</p>
        <div className="swatches">
          {swatches.map((color) => (
            <i
              key={color}
              style={{ background: color }}
              role="button"
              tabIndex={0}
              aria-pressed={appliedSwatch === color}
              data-pressed-managed="true"
              data-active={appliedSwatch === color ? "true" : "false"}
              onClick={() =>
                setAppliedSwatch((prev) => (prev === color ? null : color))
              }
            />
          ))}
        </div>
      </section>

      <section className="edit-grid">
        <label>
          <span>Min Value</span>
          <input
            value={minValue}
            onChange={(event) => setMinValue(event.target.value)}
          />
        </label>
        <label>
          <span>Max Value</span>
          <input
            value={maxValue}
            onChange={(event) => setMaxValue(event.target.value)}
          />
        </label>
        <label>
          <span>Search text</span>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </label>
      </section>

      <footer>
        <button
          type="button"
          className="ghost"
          data-pressed-managed="true"
          onClick={resetAll}
        >
          Reset
        </button>
        <button
          type="button"
          className="primary"
          aria-pressed={Boolean(appliedAt)}
          data-pressed-managed="true"
          onClick={applyFilters}
        >
          {appliedAt ? "Applied" : "Apply"}
        </button>
      </footer>
    </aside>
  );
}
