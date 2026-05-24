import React from "react";

type CalendarSchedulerProps = {
  compact?: boolean;
  showWeekend?: boolean;
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const monthCells = [
  { day: 27, muted: true }, { day: 28, muted: true }, { day: 29, muted: true }, { day: 30, muted: true }, { day: 1 }, { day: 2 }, { day: 3 },
  { day: 4 }, { day: 5 }, { day: 6 }, { day: 7 }, { day: 8 }, { day: 9 }, { day: 10 },
  { day: 11 }, { day: 12 }, { day: 13 }, { day: 14 }, { day: 15 }, { day: 16 }, { day: 17 },
  { day: 18 }, { day: 19 }, { day: 20 }, { day: 21 }, { day: 22 }, { day: 23 }, { day: 24 },
  { day: 25 }, { day: 26 }, { day: 27 }, { day: 28 }, { day: 29 }, { day: 30 }, { day: 31 }
];

interface AgendaItem {
  id: string;
  time: string;
  title: string;
  owners: string;
}

const seedAgenda: AgendaItem[] = [
  { id: "a-1", time: "10:30 - Design QA", title: "Dashboard widgets and status badges", owners: "Owners: Maya, Eli" },
  { id: "a-2", time: "13:00 - Engineering Sync", title: "Pie chart tooltip and multi-select filters", owners: "Owners: Platform Team" },
  { id: "a-3", time: "16:45 - Stakeholder Update", title: "Release checklist and panel walkthrough", owners: "Owners: PM + Design" }
];

export function CalendarScheduler({ compact = false, showWeekend = true }: CalendarSchedulerProps) {
  const days = showWeekend ? weekdays : weekdays.slice(0, 5);
  const columns = days.length;
  const cells = monthCells.filter((_, index) => showWeekend || (index % 7) < 5);

  const [agenda, setAgenda] = React.useState<AgendaItem[]>(seedAgenda);
  const [composing, setComposing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState("Sprint review");
  const [draftTime, setDraftTime] = React.useState("09:00");

  const addEvent = (): void => {
    const id = `event-${agenda.length + 1}`;
    setAgenda((prev) => [
      { id, time: `${draftTime} - New event`, title: draftTitle || "Untitled event", owners: "Owners: You" },
      ...prev
    ]);
    setComposing(false);
    setDraftTitle("Sprint review");
    setDraftTime("09:00");
  };

  return (
    <section className={`lab-calendar-scheduler ${compact ? "compact" : ""}`} data-figma-component="CalendarScheduler">
      <header className="lab-calendar-header">
        <div>
          <p className="eyebrow">Planning</p>
          <h3>Product Launch Calendar</h3>
        </div>
        <div className="lab-calendar-actions">
          <span className="badge">Q3 Sprint</span>
          <button
            type="button"
            aria-expanded={composing}
            aria-controls="lab-calendar-composer"
            data-pressed-managed="true"
            onClick={() => setComposing((prev) => !prev)}
          >
            {composing ? "Close composer" : "Create Event"}
          </button>
        </div>
      </header>

      {composing && (
        <div id="lab-calendar-composer" className="lab-calendar-composer" role="group" aria-label="New event">
          <label>
            <span>Title</span>
            <input
              type="text"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
            />
          </label>
          <label>
            <span>Time</span>
            <input
              type="text"
              value={draftTime}
              onChange={(event) => setDraftTime(event.target.value)}
            />
          </label>
          <button type="button" data-pressed-managed="true" onClick={addEvent}>
            Save event
          </button>
        </div>
      )}

      <div className="lab-calendar-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {days.map((day) => (
          <strong key={day} className="weekday">{day}</strong>
        ))}
        {cells.map((cell, index) => (
          <div key={`${cell.day}-${index}`} className={`date-cell ${cell.muted ? "muted" : ""} ${cell.day === 14 ? "active" : ""}`}>
            <span>{cell.day}</span>
            {cell.day === 9 && <small className="dot amber">Review</small>}
            {cell.day === 14 && <small className="dot blue">Launch</small>}
            {cell.day === 22 && <small className="dot green">Retro</small>}
          </div>
        ))}
      </div>

      <div className="lab-calendar-divider" />

      <div className="lab-agenda-list">
        {agenda.map((item) => (
          <article key={item.id}>
            <p>{item.time}</p>
            <h4>{item.title}</h4>
            <span>{item.owners}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
