/**
 * Shared Storybook story registry — single source for golden sets, developer
 * playground routing, and delivery pixel tests.
 */

export type StoryArgs = Record<string, string | number | boolean | undefined>;

export type DevComponentName =
  | "AnalyticsCharts"
  | "Button"
  | "CalendarScheduler"
  | "ComplexDashboardCard"
  | "ContentListBoard"
  | "FeatureCard"
  | "FilterSidePanel"
  | "LoadingStates"
  | "LoginPage"
  | "MeetingHomePage"
  | "NeonArcadeScreen"
  | "CryptoChaosDashboard"
  | "FoodFrenzyScreen"
  | "SpaceMissionControl"
  | "RetroTerminalScreen"
  | "MUIShowcase"
  | "MUIWorkspaceScreen"
  | "NavigationBars"
  | "OverlayStates"
  | "PricingPanel"
  | "ProductCard"
  | "RadioGroupField"
  | "SelectField"
  | "SnackbarStack"
  | "TabsPanel";

export interface DevStoryEntry {
  id: string;
  component: DevComponentName;
  args?: StoryArgs;
  /** Temporary: package export missing — must ship wrapped component; see docs/delivery-principles.md */
  storybookOnly?: boolean;
}

/** Quick smoke set for pixel / delivery harnesses. */
export const QUICK_SMOKE = ["mui--showcase", "lab-pricingpanel--pro", "lab-analyticscharts--usage"];

/** Full golden gate (includes Storybook-only stories). */
export const GOLDEN_SET = [
  "mui--showcase",
  "lab-pricingpanel--pro",
  "lab-pricingpanel--starter",
  "lab-productcard--default",
  "lab-productcard--dark",
  "lab-analyticscharts--usage",
  "lab-analyticscharts--revenue",
  "lab-tabspanel--settings-active",
  "lab-snackbarstack--default",
  "lab-contentlistboard--highlighted",
  "lab-featurecard--default",
  "lab-loadingstates--card-skeleton"
];

/** Golden stories with a delivery package render path. */
export const DEV_GOLDEN_SET = [...GOLDEN_SET];

export const DEV_STORIES: DevStoryEntry[] = [
  { id: "mui--showcase", component: "MUIShowcase" },
  { id: "lab-analyticscharts--revenue", component: "AnalyticsCharts" },
  { id: "lab-analyticscharts--usage", component: "AnalyticsCharts", args: { focus: "usage" } },
  { id: "lab-analyticscharts--dense", component: "AnalyticsCharts", args: { dense: true } },
  {
    id: "lab-button--primary",
    component: "Button",
    args: { variant: "primary", children: "Primary" }
  },
  {
    id: "lab-button--primary-with-icon",
    component: "Button",
    args: { variant: "primary", iconLeft: true, children: "Primary" }
  },
  {
    id: "lab-button--secondary",
    component: "Button",
    args: { variant: "secondary", children: "Secondary" }
  },
  {
    id: "lab-button--danger",
    component: "Button",
    args: { variant: "danger", children: "Delete Item" }
  },
  {
    id: "lab-button--ghost",
    component: "Button",
    args: { variant: "ghost", children: "Learn More", iconRight: true }
  },
  {
    id: "lab-button--compact",
    component: "Button",
    args: { variant: "primary", size: "sm", children: "Compact" }
  },
  {
    id: "lab-button--large-with-both-icons",
    component: "Button",
    args: {
      variant: "secondary",
      size: "lg",
      iconLeft: true,
      iconRight: true,
      children: "Continue"
    }
  },
  { id: "lab-calendarscheduler--monthly", component: "CalendarScheduler" },
  {
    id: "lab-calendarscheduler--weekdays-only",
    component: "CalendarScheduler",
    args: { showWeekend: false }
  },
  { id: "lab-calendarscheduler--compact", component: "CalendarScheduler", args: { compact: true } },
  { id: "lab-complexdashboardcard--default", component: "ComplexDashboardCard" },
  { id: "lab-contentlistboard--default", component: "ContentListBoard" },
  { id: "lab-contentlistboard--compact", component: "ContentListBoard", args: { compact: true } },
  {
    id: "lab-contentlistboard--highlighted",
    component: "ContentListBoard",
    args: { highlighted: true }
  },
  { id: "lab-featurecard--default", component: "FeatureCard" },
  {
    id: "lab-featurecard--success",
    component: "FeatureCard",
    args: {
      variant: "success",
      title: "Pipeline Healthy",
      description: "All visual checks passed in under 3 minutes.",
      statLabel: "Pass Rate",
      statValue: "100%"
    }
  },
  {
    id: "lab-featurecard--warning",
    component: "FeatureCard",
    args: {
      variant: "warning",
      title: "Review Needed",
      description: "Two components exceeded the pixel diff threshold.",
      statLabel: "Issues",
      statValue: "2"
    }
  },
  { id: "lab-filtersidepanel--right-panel", component: "FilterSidePanel" },
  { id: "lab-filtersidepanel--left-panel", component: "FilterSidePanel", args: { side: "left" } },
  { id: "lab-filtersidepanel--collapsed", component: "FilterSidePanel", args: { collapsed: true } },
  { id: "lab-loadingstates--card-skeleton", component: "LoadingStates" },
  { id: "lab-loadingstates--list-skeleton", component: "LoadingStates", args: { mode: "list" } },
  { id: "lab-loginpage--default", component: "LoginPage" },
  {
    id: "lab-loginpage--filled-credentials",
    component: "LoginPage",
    args: {
      email: "team@lab.dev",
      password: "password123",
      subtitle: "Sign in and continue where you left off."
    }
  },
  { id: "lab-meetinghomepage--default", component: "MeetingHomePage" },
  { id: "lab-neonarcadescreen--default", component: "NeonArcadeScreen" },
  { id: "lab-cryptochaosdashboard--default", component: "CryptoChaosDashboard" },
  { id: "lab-foodfrenzyscreen--default", component: "FoodFrenzyScreen" },
  { id: "lab-spacemissioncontrol--default", component: "SpaceMissionControl" },
  { id: "lab-retroterminalscreen--default", component: "RetroTerminalScreen" },
  { id: "lab-muiworkspacescreen--default", component: "MUIWorkspaceScreen" },
  { id: "lab-navigationbars--top-navigation", component: "NavigationBars" },
  { id: "lab-navigationbars--bottom-navigation", component: "NavigationBars", args: { mobile: true } },
  { id: "lab-overlaystates--dialog", component: "OverlayStates" },
  { id: "lab-overlaystates--drawer", component: "OverlayStates", args: { mode: "drawer" } },
  { id: "lab-overlaystates--bottom-sheet", component: "OverlayStates", args: { mode: "sheet" } },
  { id: "lab-pricingpanel--starter", component: "PricingPanel" },
  { id: "lab-pricingpanel--pro", component: "PricingPanel", args: { plan: "pro" } },
  { id: "lab-productcard--default", component: "ProductCard" },
  {
    id: "lab-productcard--dark",
    component: "ProductCard",
    args: { variant: "dark", status: "Low stock", showBadge: true }
  },
  {
    id: "lab-productcard--compact",
    component: "ProductCard",
    args: { variant: "compact", title: "Travel Pack\nM3", status: "Ships in 2 days" }
  },
  {
    id: "lab-productcard--alternate-image",
    component: "ProductCard",
    args: {
      image: "https://picsum.photos/seed/camera/600/600",
      title: "Vintage Camera\nV12",
      status: "Back in stock"
    }
  },
  { id: "lab-radiogroupfield--default", component: "RadioGroupField" },
  {
    id: "lab-radiogroupfield--pickup-selected",
    component: "RadioGroupField",
    args: { selected: "pickup" }
  },
  { id: "lab-radiogroupfield--disabled", component: "RadioGroupField", args: { disabled: true } },
  { id: "lab-selectfield--closed", component: "SelectField" },
  { id: "lab-selectfield--expanded", component: "SelectField", args: { expanded: true } },
  { id: "lab-snackbarstack--default", component: "SnackbarStack" },
  { id: "lab-snackbarstack--dense", component: "SnackbarStack", args: { dense: true } },
  { id: "lab-tabspanel--activity-active", component: "TabsPanel" },
  { id: "lab-tabspanel--settings-active", component: "TabsPanel", args: { active: "settings" } }
];

export const DEV_STORY_BY_ID: Record<string, DevStoryEntry> = Object.fromEntries(
  DEV_STORIES.map((s) => [s.id, s])
);

export function isDevPackageStory(storyId: string): boolean {
  const entry = DEV_STORY_BY_ID[storyId];
  return Boolean(entry && !entry.storybookOnly);
}

export function isStorybookOnlyStory(storyId: string): boolean {
  const entry = DEV_STORY_BY_ID[storyId];
  return Boolean(entry?.storybookOnly);
}

/** Page-scale fixture (e.g. MUI showcase) — relaxed Figma raster tolerance; full delivery. */
export function isLargeFixtureStory(storyId: string): boolean {
  return storyId === "mui--showcase";
}

/** Component name for a story id, if registered in DEV_STORIES. */
export function componentForStory(storyId: string): DevComponentName | null {
  return DEV_STORY_BY_ID[storyId]?.component ?? null;
}

/** All story ids sharing the same dev component (Tier B regression family). */
export function storiesForComponent(component: DevComponentName): string[] {
  return DEV_STORIES.filter((s) => s.component === component).map((s) => s.id);
}

/** All story ids in the same component family as `storyId`. */
export function storiesInSameFamily(storyId: string): string[] {
  const component = componentForStory(storyId);
  if (!component) return [storyId];
  return storiesForComponent(component);
}
