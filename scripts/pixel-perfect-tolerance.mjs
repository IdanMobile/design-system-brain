/**
 * Single pixel-perfect gate for all visual tests (global + per-region).
 * Re-exports from packages/pixel-test/src/test-tolerance.ts (source of truth).
 */

export {
  PIXEL_PERFECT_TOLERANCE,
  statusFromPercent,
  statusFromGates,
} from "../packages/pixel-test/src/test-tolerance.ts";
