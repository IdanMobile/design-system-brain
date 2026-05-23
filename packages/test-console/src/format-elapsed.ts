/** Human-readable duration for job runtime display. */
export function formatElapsedMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return `${min}m ${rem}s`;
  const hr = Math.floor(min / 60);
  const minRem = min % 60;
  return `${hr}h ${minRem}m`;
}

/** Live elapsed or completed "took …" label from ISO timestamps. */
export function jobRuntimeLabel(
  startedAt?: string,
  endedAt?: string,
  nowMs = Date.now()
): string | undefined {
  if (!startedAt) return undefined;
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return undefined;
  const end = endedAt ? Date.parse(endedAt) : nowMs;
  if (Number.isNaN(end)) return undefined;
  const ms = Math.max(0, end - start);
  return endedAt ? `took ${formatElapsedMs(ms)}` : formatElapsedMs(ms);
}
