/**
 * Quick-component-generation gate — isolated from lab strict (0.1%) portfolio logic.
 *
 * Reports always use PIXEL_PERFECT_TOLERANCE. This module only decides whether
 * the quick orchestrator proceeds to the next step without fixers.
 */

import { PIXEL_PERFECT_TOLERANCE } from "./pixel-perfect-tolerance.mjs";

/** Proceed gate for quick publish (speed over pixel-perfect). */
export const QUICK_COMPONENT_GATE_TOLERANCE = 5.0;

/** Documented report tolerance — tests must not override this globally. */
export const QUICK_COMPONENT_REPORT_TOLERANCE = PIXEL_PERFECT_TOLERANCE;

/**
 * Whether the quick pipeline may continue after a step (no fixers).
 * Infra/config errors block; visual/logic failures proceed to Anthropic polish.
 *
 * @param {{ status?: string, percent?: number | null, error?: string | null }} cell
 * @param {number} [quickGatePct]
 */
export function quickStepProceeds(cell, quickGatePct = QUICK_COMPONENT_GATE_TOLERANCE) {
  const status = cell?.status ?? "not_tested";
  if (status === "pass" || status === "skipped") return true;
  if (status === "error") {
    const err = String(cell?.error ?? "");
    if (/ERR_CONNECTION_REFUSED|ECONNREFUSED|infra unavailable|not reachable|ETIMEDOUT/i.test(err)) {
      return true;
    }
    return false;
  }
  if (status === "not_tested") {
    const err = String(cell?.error ?? "");
    if (/blocked/i.test(err)) return true;
    return false;
  }
  if (typeof cell?.percent === "number" && cell.percent <= quickGatePct) return true;
  if (status === "fail" || status === "warn") return true;
  return false;
}

/**
 * Strict pass at lab tolerance (for Anthropic phase mode selection).
 * @param {{ status?: string, percent?: number | null }} cell
 */
export function strictStepPassed(cell) {
  const status = cell?.status ?? "not_tested";
  if (status === "pass" || status === "skipped") return true;
  if (typeof cell?.percent === "number" && cell.percent <= QUICK_COMPONENT_REPORT_TOLERANCE) {
    return status !== "fail";
  }
  return false;
}

/**
 * @param {Record<string, { status?: string, percent?: number | null }>} cells
 * @param {string[]} stepOrder
 */
export function anyStrictFailure(cells, stepOrder) {
  for (const stepId of stepOrder) {
    const cell = cells[stepId];
    if (!cell || cell.status === "not_tested" || cell.status === "skipped") continue;
    if (!strictStepPassed(cell)) return true;
  }
  return false;
}
