import React from "react";

const systems = [
  { label: "OXYGEN", value: "98%", ok: true },
  { label: "FUEL", value: "64%", ok: true },
  { label: "HULL", value: "41%", ok: false },
  { label: "COMMS", value: "ONLINE", ok: true }
];

const crew = [
  { name: "CMDR VEGA", role: "Pilot", status: "ACTIVE" },
  { name: "DR CHEN", role: "Science", status: "EVA" },
  { name: "LT OKONKWO", role: "Engineer", status: "REPAIR" }
];

export function SpaceMissionControl() {
  return (
    <div className="lab-space-mission" data-figma-component="SpaceMissionControl">
      <header className="lab-space-mission-header">
        <span className="lab-space-mission-id">NX-7742</span>
        <h1>ORBIT CONTROL</h1>
        <span className="lab-space-mission-alert">⚠ ANOMALY</span>
      </header>

      <section className="lab-space-mission-radar">
        <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="95" fill="none" stroke="#1e3a5f" strokeWidth="2" />
          <circle cx="100" cy="100" r="65" fill="none" stroke="#1e3a5f" strokeWidth="1" />
          <circle cx="100" cy="100" r="35" fill="none" stroke="#1e3a5f" strokeWidth="1" />
          <line x1="100" y1="5" x2="100" y2="195" stroke="#1e3a5f" strokeWidth="1" />
          <line x1="5" y1="100" x2="195" y2="100" stroke="#1e3a5f" strokeWidth="1" />
          <path d="M100 100 L100 20 A80 80 0 0 1 170 100 Z" fill="rgba(34,211,238,0.15)" stroke="#22d3ee" strokeWidth="1" />
          <circle cx="130" cy="70" r="6" fill="#f97316" />
          <circle cx="60" cy="120" r="4" fill="#22c55e" />
          <circle cx="145" cy="130" r="5" fill="#ef4444" />
        </svg>
        <div className="lab-space-mission-radar-info">
          <p>TARGET LOCK</p>
          <strong>DEBRIS FIELD</strong>
          <span>Range 842 km • Closing</span>
        </div>
      </section>

      <section className="lab-space-mission-systems">
        {systems.map((s) => (
          <article key={s.label} className={s.ok ? "ok" : "bad"}>
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </article>
        ))}
      </section>

      <section className="lab-space-mission-log">
        <h2>MISSION LOG</h2>
        <p>&gt; T+04:22:18 Thruster calibration complete</p>
        <p>&gt; T+04:31:02 Solar array deployed 98%</p>
        <p className="warn">&gt; T+04:44:11 Micrometeorite impact sector 7</p>
        <p>&gt; T+04:45:00 Auto-seal initiated...</p>
      </section>

      <section className="lab-space-mission-crew">
        <h2>CREW STATUS</h2>
        {crew.map((c) => (
          <div key={c.name} className="lab-space-mission-crew-row">
            <span className="name">{c.name}</span>
            <span className="role">{c.role}</span>
            <span className="status">{c.status}</span>
          </div>
        ))}
      </section>

      <footer className="lab-space-mission-actions">
        <button type="button">Abort Burn</button>
        <button type="button" className="primary">Execute Maneuver</button>
      </footer>
    </div>
  );
}
