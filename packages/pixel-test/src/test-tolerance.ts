/** Default pass threshold: diff % must be ≤ this value (warn = 4×, fail above warn). */
export const DEFAULT_DIFF_TOLERANCE_PERCENT = 0.1;

/** Figma emulator/live: worst hotspot must also be ≤ this % for pass. */
export const DEFAULT_REGION_TOLERANCE_PERCENT = 0.1;

/** Storybook-only fixtures (e.g. legacy skips) — mock HTML + live Figma raster limits. */
export const STORYBOOK_ONLY_REGION_TOLERANCE_PERCENT = 0.1;

/** Large page fixtures (e.g. mui--showcase) — mock emulator allows higher hotspot % (MUI raster/subpixel). */
export const MOCK_LARGE_FIXTURE_REGION_TOLERANCE_PERCENT = 2.0;

/** Live Figma Desktop raster AA — when global already ≤ pass bar, allow slightly higher region %. */
export const LIVE_RASTER_REGION_TOLERANCE_PERCENT = 2.2;

/** Live global when Figma mock already passes at strict — Chromium vs Figma export raster gap. */
export const LIVE_RASTER_GLOBAL_TOLERANCE_PERCENT = 2.5;

/** Delivery sb↔dev when sb↔figma already passes — playground font/subpixel vs Storybook. */
export const DELIVERY_DEV_TOLERANCE_PERCENT = 0.9;
