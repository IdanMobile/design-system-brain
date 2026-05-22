import React from "react";

type ContentListBoardProps = {
  compact?: boolean;
  highlighted?: boolean;
};

const rows = [
  { title: "Release Notes / Data Widgets", owner: "Nora", status: "Ready", priority: "High" },
  { title: "Billing Chart / Pie + Breakdown", owner: "Tom", status: "In review", priority: "Medium" },
  { title: "Calendar Module / Sprint Timeline", owner: "Dana", status: "Blocked", priority: "High" },
  { title: "Icon Tokens / Color Migration", owner: "Ruth", status: "Ready", priority: "Low" }
];

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8.5A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5V7Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function ContentListBoard({ compact = false, highlighted = false }: ContentListBoardProps) {
  return (
    <section className={`lab-content-board ${compact ? "compact" : ""} ${highlighted ? "highlighted" : ""}`} data-figma-component="ContentListBoard">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <span>Workspace</span>
        <i />
        <span>Components</span>
        <i />
        <span className="active">Library QA</span>
      </nav>

      <header className="board-header">
        <div className="title-wrap">
          <span className="icon"><FolderIcon /></span>
          <div>
            <h3>Component Task Board</h3>
            <p>List, badges, icons, dividers and edit text controls</p>
          </div>
        </div>
        <button type="button">New Task</button>
      </header>

      <div className="board-divider" />

      <label className="inline-edit">
        <span>Quick edit</span>
        <input value="Refine chart tooltip spacing and token usage" readOnly />
      </label>

      <ul className="task-list">
        {rows.map((row) => (
          <li key={row.title}>
            <div>
              <h4>{row.title}</h4>
              <p>Owner: {row.owner}</p>
            </div>
            <div className="badges">
              <span className={`badge ${row.status === "Blocked" ? "danger" : row.status === "In review" ? "warning" : "success"}`}>{row.status}</span>
              <span className="badge neutral">{row.priority}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
