/**
 * Single pixel-perfect gate for all visual tests (global + per-region).
 * Warn = 4×; fail above warn.
 */

export const PIXEL_PERFECT_TOLERANCE = 0.1;

/** @param {number} percent */
export function statusFromPercent(percent) {
  if (percent <= PIXEL_PERFECT_TOLERANCE) return "pass";
  if (percent <= PIXEL_PERFECT_TOLERANCE * 4) return "warn";
  return "fail";
}

/** @param {number} globalPercent @param {number} worstRegionPercent */
export function statusFromGates(globalPercent, worstRegionPercent) {
  const global = statusFromPercent(globalPercent);
  const region = statusFromPercent(worstRegionPercent);
  if (global === "fail" || region === "fail") return "fail";
  if (global === "warn" || region === "warn") return "warn";
  return "pass";
}
