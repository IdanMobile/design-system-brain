import { spawnSync } from "node:child_process";

/** PIDs listening on TCP port (LISTEN). */
export function pidsListeningOnPort(port) {
  const r = spawnSync("lsof", ["-t", `-i:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout?.trim()) return [];
  return [
    ...new Set(
      r.stdout
        .trim()
        .split("\n")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  ];
}

export function killListenersOnPort(port, signal = "SIGTERM") {
  const killed = [];
  for (const pid of pidsListeningOnPort(port)) {
    try {
      process.kill(pid, signal);
      killed.push(pid);
    } catch {
      /* already dead */
    }
  }
  return killed;
}

export async function waitForPortDown(port, deadlineMs = 10_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (pidsListeningOnPort(port).length === 0) {
      try {
        await fetch(`http://127.0.0.1:${port}/api/state`, {
          signal: AbortSignal.timeout(800)
        });
      } catch {
        return true;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return pidsListeningOnPort(port).length === 0;
}
