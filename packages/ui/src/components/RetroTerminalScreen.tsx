import React from "react";

const logLines = [
  "> boot sequence initiated...",
  "> loading kernel modules [OK]",
  "> bypassing firewall layer 7",
  "> decrypting vault shard 4/12",
  "> access granted: root@mainframe",
  "> downloading schematics ████████░░ 80%",
  "> WARNING: trace detected",
  "> rerouting via proxy node 7",
  "> upload complete. wiping logs..."
];

export function RetroTerminalScreen() {
  return (
    <div className="lab-retro-terminal" data-figma-component="RetroTerminalScreen">
      <div className="lab-retro-terminal-glow" aria-hidden="true" />
      <header className="lab-retro-terminal-header">
        <span>root@ghostnet:~</span>
        <span className="blink">█</span>
      </header>

      <pre className="lab-retro-terminal-ascii" aria-hidden="true">{`
  ██████╗ ██╗  ██╗ ██████╗ ███████╗████████╗
  ██╔════╝ ██║  ██║██╔═══██╗██╔════╝╚══██╔══╝
  ██║  ███╗███████║██║   ██║███████╗   ██║
  ██║   ██║██╔══██║██║   ██║╚════██║   ██║
  ╚██████╔╝██║  ██║╚██████╔╝███████║   ██║
      `}</pre>

      <section className="lab-retro-terminal-panel">
        <h1>OPERATION: MIDNIGHT SUN</h1>
        <p>Target: orbital relay station ORS-9</p>
        <p>Payload: 2.4 TB exfiltration bundle</p>
      </section>

      <section className="lab-retro-terminal-log">
        {logLines.map((line, i) => (
          <p key={i} className={line.includes("WARNING") ? "warn" : line.includes("OK") ? "ok" : undefined}>
            {line}
          </p>
        ))}
      </section>

      <section className="lab-retro-terminal-stats">
        <article><span>CPU</span><strong>94%</strong></article>
        <article><span>NET</span><strong>1.2 GB/s</strong></article>
        <article><span>HEAT</span><strong className="hot">CRITICAL</strong></article>
      </section>

      <div className="lab-retro-terminal-progress">
        <span>Exfil progress</span>
        <div className="bar"><div className="fill" /></div>
      </div>

      <footer className="lab-retro-terminal-footer">
        <button type="button">[F1] Disconnect</button>
        <button type="button" className="danger">[F12] Detonate</button>
      </footer>
    </div>
  );
}
