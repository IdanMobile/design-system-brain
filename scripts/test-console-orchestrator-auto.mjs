/**
 * Persisted portfolio orchestrator AUTO mode (supervisor stays alive and rescans).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AUTO_PATH = join(ROOT, ".test-console", "orchestrator-auto.json");

export const AUTO_WATCH_MS = Number(process.env.PORTFOLIO_ORCHESTRATOR_AUTO_WATCH_MS ?? 60_000);
export const AUTO_RETRY_MS = Number(process.env.PORTFOLIO_ORCHESTRATOR_AUTO_RETRY_MS ?? 30_000);

export function loadOrchestratorAuto() {
  if (!existsSync(AUTO_PATH)) return { enabled: false, updatedAt: null };
  try {
    const raw = JSON.parse(readFileSync(AUTO_PATH, "utf8"));
    return { enabled: Boolean(raw.enabled), updatedAt: raw.updatedAt ?? null };
  } catch {
    return { enabled: false, updatedAt: null };
  }
}

export function setOrchestratorAuto(enabled) {
  mkdirSync(join(ROOT, ".test-console"), { recursive: true });
  const payload = { enabled: Boolean(enabled), updatedAt: new Date().toISOString() };
  writeFileSync(AUTO_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

export async function fetchOrchestratorAuto(api) {
  try {
    const data = await api("/api/orchestrator/auto");
    return Boolean(data?.enabled);
  } catch {
    return loadOrchestratorAuto().enabled;
  }
}

export async function sleepWithKillCheck(ms, killFlagPath, existsSyncFn = existsSync) {
  const step = 500;
  let left = ms;
  while (left > 0) {
    if (killFlagPath && existsSyncFn(killFlagPath)) return false;
    const chunk = Math.min(step, left);
    await new Promise((r) => setTimeout(r, chunk));
    left -= chunk;
  }
  return true;
}
