import React from "react";

type FilterSidePanelProps = {
  side?: "left" | "right";
  collapsed?: boolean;
};

const tags = ["Dashboard", "Billing", "Mobile", "Design System"];
const members = ["Ari", "Mika", "Noam", "Leah"];
const swatches = ["#2563EB", "#14B8A6", "#F97316", "#8B5CF6", "#EF4444", "#84CC16"];

export function FilterSidePanel({ side = "right", collapsed = false }: FilterSidePanelProps) {
  return (
    <aside className={`lab-filter-panel ${side} ${collapsed ? "collapsed" : ""}`} data-figma-component="FilterSidePanel">
      <header>
        <h3>Advanced Filters</h3>
        <span className="status">Live</span>
      </header>

      <section>
        <p className="label">Multi-select: Product Areas</p>
        <div className="multi-select">
          {tags.map((tag) => <span key={tag}>{tag}</span>)}
          <button type="button">+ Add</button>
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
          {swatches.map((color) => <i key={color} style={{ background: color }} />)}
        </div>
      </section>

      <section className="edit-grid">
        <label>
          <span>Min Value</span>
          <input value="120" readOnly />
        </label>
        <label>
          <span>Max Value</span>
          <input value="920" readOnly />
        </label>
        <label>
          <span>Search text</span>
          <input value="q3 launch status" readOnly />
        </label>
      </section>

      <footer>
        <button type="button" className="ghost">Reset</button>
        <button type="button" className="primary">Apply</button>
      </footer>
    </aside>
  );
}
