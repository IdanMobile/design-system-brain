import React from "react";

type ContentListBoardProps = {
  compact?: boolean;
  highlighted?: boolean;
};

interface TaskRow {
  id: string;
  title: string;
  owner: string;
  status: "Ready" | "In review" | "Blocked";
  priority: "High" | "Medium" | "Low";
}

const seedRows: TaskRow[] = [
  { id: "task-1", title: "Release Notes / Data Widgets", owner: "Nora", status: "Ready", priority: "High" },
  { id: "task-2", title: "Billing Chart / Pie + Breakdown", owner: "Tom", status: "In review", priority: "Medium" },
  { id: "task-3", title: "Calendar Module / Sprint Timeline", owner: "Dana", status: "Blocked", priority: "High" },
  { id: "task-4", title: "Icon Tokens / Color Migration", owner: "Ruth", status: "Ready", priority: "Low" }
];

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8.5A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5V7Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function ContentListBoard({ compact = false, highlighted = false }: ContentListBoardProps) {
  const [rows, setRows] = React.useState<TaskRow[]>(seedRows);
  const [quickEdit, setQuickEdit] = React.useState(
    "Refine chart tooltip spacing and token usage"
  );

  const addTask = (): void => {
    const nextIndex = rows.length + 1;
    setRows((prev) => [
      ...prev,
      {
        id: `task-${nextIndex}`,
        title: `New Task #${nextIndex}`,
        owner: "Unassigned",
        status: "Ready",
        priority: "Medium"
      }
    ]);
  };

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
        <button type="button" data-pressed-managed="true" onClick={addTask}>
          New Task
        </button>
      </header>

      <div className="board-divider" />

      <label className="inline-edit">
        <span>Quick edit</span>
        <input
          value={quickEdit}
          onChange={(event) => setQuickEdit(event.target.value)}
        />
      </label>

      <ul className="task-list">
        {rows.map((row) => (
          <li key={row.id}>
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
