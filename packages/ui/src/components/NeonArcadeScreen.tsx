import React from "react";

const leaderboard = [
  { rank: 1, name: "PIXEL_PHANTOM", score: "984,220", glow: true },
  { rank: 2, name: "NEON_RIDER", score: "871,004" },
  { rank: 3, name: "GLITCH_QUEEN", score: "802,991" },
  { rank: 4, name: "YOU", score: "644,120", highlight: true }
];

export function NeonArcadeScreen() {
  return (
    <div className="lab-neon-arcade" data-figma-component="NeonArcadeScreen">
      <div className="lab-neon-arcade-scanlines" aria-hidden="true" />
      <header className="lab-neon-arcade-header">
        <span className="lab-neon-arcade-coin">◈ 42</span>
        <h1>NEON BLAST</h1>
        <span className="lab-neon-arcade-lives">♥ ♥ ♥</span>
      </header>
      <section className="lab-neon-arcade-hero">
        <div className="lab-neon-arcade-score-box">
          <span className="lab-neon-arcade-label">HIGH SCORE</span>
          <strong>1,204,880</strong>
          <span className="lab-neon-arcade-sub">WAVE 17 • COMBO x32</span>
        </div>
        <svg className="lab-neon-arcade-ship" width="120" height="80" viewBox="0 0 120 80" aria-hidden="true">
          <polygon points="60,8 95,72 60,58 25,72" fill="#FF00FF" stroke="#00FFFF" strokeWidth="2" />
          <polygon points="60,20 75,55 60,48 45,55" fill="#00FFFF" opacity="0.6" />
          <rect x="56" y="0" width="8" height="16" rx="2" fill="#FFFF00" />
        </svg>
      </section>
      <section className="lab-neon-arcade-powerups">
        {["SHIELD", "RAPID", "BOMB", "GHOST"].map((item) => (
          <button key={item} className="lab-neon-arcade-powerup" type="button">
            <span>{item}</span>
            <small>READY</small>
          </button>
        ))}
      </section>
      <section className="lab-neon-arcade-board">
        <div className="lab-neon-arcade-board-head">
          <h2>GLOBAL RANK</h2>
          <span>LIVE</span>
        </div>
        {leaderboard.map((row) => (
          <div
            key={row.rank}
            className={`lab-neon-arcade-row${row.highlight ? " you" : ""}${row.glow ? " top" : ""}`}
          >
            <span className="rank">#{row.rank}</span>
            <span className="name">{row.name}</span>
            <span className="score">{row.score}</span>
          </div>
        ))}
      </section>
      <button className="lab-neon-arcade-play" type="button">
        INSERT COIN — PLAY AGAIN
      </button>
    </div>
  );
}
