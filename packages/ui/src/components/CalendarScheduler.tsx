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

export function CalendarScheduler({ compact = false, showWeekend = true }: CalendarSchedulerProps) {
  const days = showWeekend ? weekdays : weekdays.slice(0, 5);
  const columns = days.length;
  const cells = monthCells.filter((_, index) => showWeekend || (index % 7) < 5);

  return (
    <section className={`lab-calendar-scheduler ${compact ? "compact" : ""}`} data-figma-component="CalendarScheduler">
      <header className="lab-calendar-header">
        <div>
          <p className="eyebrow">Planning</p>
          <h3>Product Launch Calendar</h3>
        </div>
        <div className="lab-calendar-actions">
          <span className="badge">Q3 Sprint</span>
          <button type="button">Create Event</button>
        </div>
      </header>

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
        <article>
          <p>10:30 - Design QA</p>
          <h4>Dashboard widgets and status badges</h4>
          <span>Owners: Maya, Eli</span>
        </article>
        <article>
          <p>13:00 - Engineering Sync</p>
          <h4>Pie chart tooltip and multi-select filters</h4>
          <span>Owners: Platform Team</span>
        </article>
        <article>
          <p>16:45 - Stakeholder Update</p>
          <h4>Release checklist and panel walkthrough</h4>
          <span>Owners: PM + Design</span>
        </article>
      </div>
    </section>
  );
}
