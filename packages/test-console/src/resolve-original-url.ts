import type { PortfolioRow } from "./types";
import { safeStorySegment } from "./story-segment";

/** Client fallback when API row lacks originalUrl (legacy portfolio.json). */
export function resolveRowOriginalUrl(row: PortfolioRow): string | null {
  if (row.originalUrl) return row.originalUrl;

  const seg = safeStorySegment(row.storyId);
  if (row.entryPoint === "figma") {
    return `/repo/artifacts/figma-screens/${row.storyId}.png`;
  }

  return `/repo/pixel-diffs/${seg}/storybook.png`;
}
