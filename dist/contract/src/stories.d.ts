/**
 * Shared Storybook story registry — single source for golden sets, developer
 * playground routing, and delivery pixel tests.
 */
export type StoryArgs = Record<string, string | number | boolean | undefined>;
export type DevComponentName = "AnalyticsCharts" | "Button" | "CalendarScheduler" | "ComplexDashboardCard" | "ContentListBoard" | "FeatureCard" | "FilterSidePanel" | "LoadingStates" | "LoginPage" | "MeetingHomePage" | "NeonArcadeScreen" | "CryptoChaosDashboard" | "FoodFrenzyScreen" | "SpaceMissionControl" | "RetroTerminalScreen" | "MUIShowcase" | "MUIWorkspaceScreen" | "NavigationBars" | "OverlayStates" | "PricingPanel" | "ProductCard" | "RadioGroupField" | "SelectField" | "SnackbarStack" | "TabsPanel";
export interface DevStoryEntry {
    id: string;
    component: DevComponentName;
    args?: StoryArgs;
    /** Temporary: package export missing — must ship wrapped component; see docs/delivery-principles.md */
    storybookOnly?: boolean;
}
/** Quick smoke set for pixel / delivery harnesses. */
export declare const QUICK_SMOKE: string[];
/** Full golden gate (includes Storybook-only stories). */
export declare const GOLDEN_SET: string[];
/** Golden stories with a delivery package render path. */
export declare const DEV_GOLDEN_SET: string[];
export declare const DEV_STORIES: DevStoryEntry[];
export declare const DEV_STORY_BY_ID: Record<string, DevStoryEntry>;
export declare function isDevPackageStory(storyId: string): boolean;
export declare function isStorybookOnlyStory(storyId: string): boolean;
/** Page-scale fixture (e.g. MUI showcase) — relaxed Figma raster tolerance; full delivery. */
export declare function isLargeFixtureStory(storyId: string): boolean;
/** Component name for a story id, if registered in DEV_STORIES. */
export declare function componentForStory(storyId: string): DevComponentName | null;
/** All story ids sharing the same dev component (Tier B regression family). */
export declare function storiesForComponent(component: DevComponentName): string[];
/** All story ids in the same component family as `storyId`. */
export declare function storiesInSameFamily(storyId: string): string[];
