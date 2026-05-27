/**
 * Concurrency limits for portfolio harnesses.
 *
 * - STORYBOOK_PARALLEL — cap simultaneous Storybook / Playwright loads (default 12).
 * - TEST_PARALLEL — max in-process story workers (figma live can use full value; export is queued on relay).
 */

const DEFAULT_STORYBOOK_PARALLEL = 12;
const MAX_TEST_PARALLEL = 100;

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

/** Cap concurrent Storybook navigation / extract (prevents goto timeouts under load). */
export function getStorybookConcurrency(): number {
  const explicit = process.env.STORYBOOK_PARALLEL;
  if (explicit != null && explicit !== "") {
    return Math.min(readPositiveInt(explicit, DEFAULT_STORYBOOK_PARALLEL), MAX_TEST_PARALLEL);
  }
  const test = readPositiveInt(process.env.TEST_PARALLEL, 4);
  return Math.min(test, DEFAULT_STORYBOOK_PARALLEL);
}

/** In-process story pool size. Figma live export is serialized on the relay; Storybook work stays capped. */
export function getHarnessConcurrency(suite: "pixel" | "figma" | "figmaLive" | "delivery" | "logic"): number {
  if (suite === "logic") return 1;
  return getStorybookConcurrency();
}
