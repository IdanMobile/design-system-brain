import React from "react";

const earlierMeetings = [
  { title: "AI Integration And User Flow...", date: "Tue, Jan 16 • 10:30 AM" },
  { title: "Meeting Notes And Actin...", date: "Tue, Jan 16 • 10:30 AM" },
  { title: "AI Integration And User Flow...", date: "Tue, Jan 16 • 10:30 AM" },
  { title: "Meeting Notes And Actin...", date: "Tue, Jan 16 • 10:30 AM" }
];

function StatusBar() {
  return (
    <div className="lab-meeting-home-status" aria-hidden="true">
      <span className="lab-meeting-home-status-time">9:41</span>
      <div className="lab-meeting-home-status-icons">
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
          <rect x="0" y="7" width="3" height="5" rx="0.5" fill="white" />
          <rect x="4.5" y="5" width="3" height="7" rx="0.5" fill="white" />
          <rect x="9" y="2.5" width="3" height="9.5" rx="0.5" fill="white" />
          <rect x="13.5" y="0" width="3" height="12" rx="0.5" fill="white" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <path
            d="M8 2.5C10.2 2.5 12.1 3.4 13.4 4.9L15 3.3C13.3 1.3 10.8 0 8 0C5.2 0 2.7 1.3 1 3.3L2.6 4.9C3.9 3.4 5.8 2.5 8 2.5Z"
            fill="white"
          />
          <path
            d="M8 5.5C9.4 5.5 10.6 6.1 11.4 7.1L12.9 5.6C11.6 4.1 9.9 3.2 8 3.2C6.1 3.2 4.4 4.1 3.1 5.6L4.6 7.1C5.4 6.1 6.6 5.5 8 5.5Z"
            fill="white"
          />
          <circle cx="8" cy="10.5" r="1.5" fill="white" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="21" height="11" rx="2.5" stroke="white" strokeOpacity="0.35" />
          <rect x="2" y="2" width="16" height="8" rx="1.5" fill="white" />
          <rect x="22" y="4" width="2.5" height="4" rx="1" fill="white" fillOpacity="0.4" />
        </svg>
      </div>
    </div>
  );
}

function MiLogo() {
  return (
    <svg className="lab-meeting-home-logo" width="36" height="28" viewBox="0 0 36 28" aria-label="mi">
      <text x="0" y="22" fill="white" fontSize="24" fontWeight="700" fontFamily="Inter, Arial, sans-serif">
        m
      </text>
      <text x="18" y="22" fill="white" fontSize="24" fontWeight="700" fontFamily="Inter, Arial, sans-serif">
        i
      </text>
      <circle cx="27" cy="6" r="3.5" fill="#5B9DFF" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="8" y="2" width="6" height="11" rx="3" stroke="white" strokeWidth="1.8" />
      <path d="M4.5 11.5C4.5 15.1 7.4 18 11 18" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11 18V21" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.5 21H14.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M1.5 10.5H12.5M2.5 10.5L3 5.5L5.5 7.5L7 3.5L8.5 7.5L11 5.5L11.5 10.5"
        stroke="#F5A623"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavIcon({ kind, active = false }: { kind: "home" | "meetings" | "actions" | "notifications"; active?: boolean }) {
  const color = active ? "#A78BFA" : "#8B93A7";
  const icons = {
    home: (
      <path
        d="M12 3L4 9.5V20H9.5V14H14.5V20H20V9.5L12 3Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill={active ? color : "none"}
        fillOpacity={active ? 0.15 : 0}
      />
    ),
    meetings: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" stroke={color} strokeWidth="1.6" />
        <path d="M4 9H20" stroke={color} strokeWidth="1.6" />
        <path d="M8 3V7M16 3V7" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
    actions: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" stroke={color} strokeWidth="1.6" />
        <path d="M8.5 9H15.5M8.5 13H15.5M8.5 17H12.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
    notifications: (
      <>
        <path
          d="M12 20C13.1 20 14 19.2 14 18.2H10C10 19.2 10.9 20 12 20Z"
          fill={color}
        />
        <path
          d="M17 15.5V10.5C17 7.7 15.1 5.4 12.5 4.7V4C12.5 3.2 11.8 2.5 11 2.5C10.2 2.5 9.5 3.2 9.5 4V4.7C6.9 5.4 5 7.7 5 10.5V15.5L4 16.5H20L19 15.5H17Z"
          stroke={color}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </>
    )
  };

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {icons[kind]}
    </svg>
  );
}

export function MeetingHomePage() {
  return (
    <div className="lab-meeting-home" data-figma-component="MeetingHomePage">
      <StatusBar />

      <header className="lab-meeting-home-header">
        <MiLogo />
        <div className="lab-meeting-home-header-actions">
          <button className="lab-meeting-home-join" type="button">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.5" y="4" width="8" height="8" rx="1.5" stroke="white" strokeWidth="1.4" />
              <path d="M11 6.5L14 5V11L11 9.5" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            Join
          </button>
          <button className="lab-meeting-home-icon-btn" type="button" aria-label="Upload">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M9 12V4M9 4L6 7M9 4L12 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 13V14C3 14.6 3.4 15 4 15H14C14.6 15 15 14.6 15 14V13" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button className="lab-meeting-home-icon-btn" type="button" aria-label="Search">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="4.5" stroke="white" strokeWidth="1.5" />
              <path d="M11.5 11.5L15 15" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button className="lab-meeting-home-icon-btn" type="button" aria-label="Menu">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="9" cy="4" r="1.5" fill="white" />
              <circle cx="9" cy="9" r="1.5" fill="white" />
              <circle cx="9" cy="14" r="1.5" fill="white" />
            </svg>
          </button>
        </div>
      </header>

      <main className="lab-meeting-home-body">
        <button className="lab-meeting-home-record-btn" type="button">
          <MicIcon />
          <span>New Recording</span>
        </button>

        <section className="lab-meeting-home-section">
          <div className="lab-meeting-home-section-head">
            <h2>Live &amp; Prepped Meetings</h2>
            <button className="lab-meeting-home-view-all" type="button">
              View All &gt;
            </button>
          </div>
          <div className="lab-meeting-home-live-row">
            <article className="lab-meeting-home-live-card">
              <h3>Weekly Meeting</h3>
              <p className="lab-meeting-home-live-status">
                <span className="lab-meeting-home-live-dot" aria-hidden="true">
                  ((•))
                </span>
                Live Meeting
              </p>
            </article>
            <article className="lab-meeting-home-live-card">
              <h3>Weekly Meeting</h3>
              <p className="lab-meeting-home-upcoming">Today, 10:30 AM</p>
            </article>
          </div>
        </section>

        <section className="lab-meeting-home-section">
          <div className="lab-meeting-home-section-head">
            <h2>Earlier Meetings</h2>
            <button className="lab-meeting-home-view-all" type="button">
              View All &gt;
            </button>
          </div>
          <div className="lab-meeting-home-earlier-list">
            {earlierMeetings.map((meeting, index) => (
              <article key={`${meeting.title}-${index}`} className="lab-meeting-home-earlier-card">
                <div className="lab-meeting-home-earlier-top">
                  <h3>{meeting.title}</h3>
                  <span className="lab-meeting-home-shared">Shared</span>
                </div>
                <div className="lab-meeting-home-earlier-bottom">
                  <span className="lab-meeting-home-host">
                    <CrownIcon />
                    Anne Eliya
                  </span>
                  <span className="lab-meeting-home-date">{meeting.date}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <nav className="lab-meeting-home-bottom-nav" aria-label="Main">
        <button className="active" type="button">
          <NavIcon kind="home" active />
          <span>Home</span>
        </button>
        <button type="button">
          <NavIcon kind="meetings" />
          <span>Meetings</span>
        </button>
        <button type="button">
          <NavIcon kind="actions" />
          <span>Actions</span>
        </button>
        <button type="button">
          <NavIcon kind="notifications" />
          <span>Notifications</span>
        </button>
      </nav>
    </div>
  );
}
