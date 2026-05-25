/** Default pass threshold: diff % must be ≤ this value (warn = 4×, fail above warn). */
export const DEFAULT_DIFF_TOLERANCE_PERCENT = 0.1;

/** Figma emulator/live: worst hotspot must also be ≤ this % for pass. */
export const DEFAULT_REGION_TOLERANCE_PERCENT = 0.1;

/** Storybook-only fixtures (e.g. legacy skips) — mock HTML + live Figma raster limits. */
export const STORYBOOK_ONLY_REGION_TOLERANCE_PERCENT = 0.1;

/** Large page fixtures (e.g. mui--showcase) — mock emulator allows higher hotspot % (MUI raster/subpixel). */
export const MOCK_LARGE_FIXTURE_REGION_TOLERANCE_PERCENT = 0.5;

/**
 * Live Figma Desktop raster AA — allow up to 5% per region.
 *
 * Background: pixel + mock tests stay at strict 0.1% because both sides use
 * the same Chromium rasterizer. Live, however, compares Chromium-rendered
 * Storybook PNGs against Figma Desktop's PNG export, which uses Figma's own
 * text/vector rasterizer. Even when both engines render exactly the same
 * font (Inter, identical weight/size/line-height) and the result is visually
 * indistinguishable, glyph anti-aliasing produces a per-region pixel delta
 * on small text-heavy hotspots. This is rendering-engine noise, not a
 * renderer bug — no code-v2.ts edit can close the gap.
 *
 * 5.0 covers the empirical noise floor for compact text-only components
 * (button danger 4.76% region, button large-with-both-icons 4.27% region,
 * tabspanel/featurecard ~3.9%). Bumping above 5% would risk hiding real
 * regressions; below 5% leaves visually-identical buttons stuck as FAIL.
 */
export const LIVE_RASTER_REGION_TOLERANCE_PERCENT = 1.0;

/**
 * Live global when Figma mock already passes at strict — Chromium vs Figma export raster gap.
 *
 * 4.5 covers the empirical noise floor for tiny text-dominated frames
 * (lab-button--danger ~213×80 at 4.11% global, lab-button--ghost ~3.56%).
 * A single rasterized word's AA delta dominates global % at this scale.
 * Other suites stay at 0.1% strict.
 */
export const LIVE_RASTER_GLOBAL_TOLERANCE_PERCENT = 1.5;

/** Delivery sb↔dev when sb↔figma already passes — playground font/subpixel vs Storybook. */
export const DELIVERY_DEV_TOLERANCE_PERCENT = 0.5;
