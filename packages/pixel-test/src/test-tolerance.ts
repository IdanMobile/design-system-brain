/** Global and per-region pass threshold (% diff). Warn = 4×; fail above warn. */
export const PIXEL_PERFECT_TOLERANCE = 0.1;

export type ToleranceStatus = "pass" | "warn" | "fail";

/** @param tolerance — defaults to PIXEL_PERFECT_TOLERANCE; CLI may override. */
export function statusFromPercent(
  percent: number,
  tolerance: number = PIXEL_PERFECT_TOLERANCE
): ToleranceStatus {
  if (percent <= tolerance) return "pass";
  if (percent <= tolerance * 4) return "warn";
  return "fail";
}

/** Global + worst-region gate — both must pass/warn for overall status. */
export function statusFromGates(
  globalPercent: number,
  worstRegionPercent: number,
  tolerance: number = PIXEL_PERFECT_TOLERANCE
): ToleranceStatus {
  const global = statusFromPercent(globalPercent, tolerance);
  const region = statusFromPercent(worstRegionPercent, tolerance);
  if (global === "fail" || region === "fail") return "fail";
  if (global === "warn" || region === "warn") return "warn";
  return "pass";
}
