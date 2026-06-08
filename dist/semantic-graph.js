/**
 * SemanticGraph — ingress-agnostic component tree for React delivery egress.
 * Built from Universal JSON (Storybook extract or Figma manifest→contract).
 */
export const SEMANTIC_COMPONENT_IDS = [
    "Button",
    "Checkbox",
    "Text",
    "AnalyticsCharts",
    "CalendarScheduler",
    "ComplexDashboardCard",
    "ContentListBoard",
    "FeatureCard",
    "FilterSidePanel",
    "LoadingStates",
    "LoginPage",
    "MeetingHomePage",
    "NavigationBars",
    "OverlayStates",
    "PricingPanel",
    "ProductCard",
    "RadioGroupField",
    "SelectField",
    "SnackbarStack",
    "TabsPanel",
    "Screen1",
    "Screen2",
    "ScreenNotificationAvater",
    "MUIShowcase",
    "MUIWorkspaceScreen",
    "NeonArcadeScreen",
    "CryptoChaosDashboard",
    "FoodFrenzyScreen",
    "SpaceMissionControl",
    "RetroTerminalScreen"
];
export function isSemanticComponentId(id) {
    return SEMANTIC_COMPONENT_IDS.includes(id);
}
export function asDevComponentName(id) {
    return id;
}
