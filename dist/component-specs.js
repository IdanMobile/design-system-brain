/**
 * Component API specs — hand-authored prop + behaviour signatures for every
 * delivery-package component.
 *
 * This is the **single source of truth** the dev playground showcase renders
 * on the right side of each story (the user-facing API). The logic audit also
 * uses it to expose a "baseline behaviour inventory" so missing wiring is
 * visible per component, not just observed via DOM probes.
 *
 * Why hand-authored and not auto-derived from TypeScript?
 *   - Components carry runtime semantics (e.g. "click latches", "input
 *     submits the form") that the type system doesn't capture.
 *   - We want the showcase to read like docs, not raw TS types.
 *   - Adding a component here is the audit checklist for shipping a real
 *     interactive component (props + events + states + a11y roles).
 */
const buttonSpec = {
    component: "Button",
    summary: "Pressable action button with primary/secondary/danger/ghost variants and optional leading/trailing icons. Behaviour is provided entirely by the @lab/ui design-system baseline — the component itself is a minimal visual shell with no JS state.",
    props: [
        { name: "variant", type: '"primary" | "secondary" | "danger" | "ghost"', default: '"primary"', description: "Visual style." },
        { name: "size", type: '"sm" | "md" | "lg"', default: '"md"' },
        { name: "iconLeft", type: "boolean", default: "false", description: "Renders the leading plus icon." },
        { name: "iconRight", type: "boolean", default: "false", description: "Renders the trailing arrow icon." },
        { name: "children", type: "React.ReactNode", default: '"Primary"', description: "Button label." }
    ],
    behaviours: [
        { id: "hover", label: "Hover", trigger: "Pointer enters the button", effect: "Brightness boost + shadow lift", source: "baseline" },
        { id: "active", label: "Active", trigger: "Mousedown", effect: "Sinks 1px, dims to brightness 0.94", source: "baseline" },
        { id: "focus", label: "Keyboard focus", trigger: "Tab key", effect: "Blue focus ring (:focus-visible)", source: "baseline" },
        { id: "press-toggle", label: "Pressed toggle", trigger: "Click", effect: "Toggles aria-pressed (baseline runtime stamps data-pressed-source=baseline)", source: "baseline" }
    ]
};
const loginPageSpec = {
    component: "LoginPage",
    summary: "Email/password sign-in card with social providers. Inputs are controlled; submit runs a 3-phase state machine.",
    props: [
        { name: "title", type: "string", default: '"Welcome back"' },
        { name: "subtitle", type: "string", default: '"Sign in to continue to your workspace."' },
        { name: "email", type: "string", default: '""', description: "Initial email value." },
        { name: "password", type: "string", default: '""', description: "Initial password value." }
    ],
    behaviours: [
        { id: "type-email", label: "Type email", trigger: "User types in the email input", effect: "Controlled value updates" },
        { id: "type-password", label: "Type password", trigger: "User types in the password input", effect: "Controlled value updates" },
        { id: "submit", label: "Submit", trigger: "Click Login", effect: "phase: idle → submitting → signed-in; title becomes 'Signed in as {email}'" },
        { id: "social", label: "Connect social", trigger: "Click Connect with Google/Facebook", effect: "state: idle → connecting → connected; label tracks state" }
    ]
};
const calendarSchedulerSpec = {
    component: "CalendarScheduler",
    summary: "Month grid with agenda list and inline event composer.",
    props: [
        { name: "compact", type: "boolean", default: "false", description: "Tighter cell sizing." },
        { name: "showWeekend", type: "boolean", default: "true", description: "Drops Sat/Sun columns when false." }
    ],
    behaviours: [
        { id: "open-composer", label: "Open composer", trigger: "Click Create Event", effect: "Inline title/time form expands (aria-expanded toggles)" },
        { id: "edit-draft", label: "Edit draft", trigger: "Type into Title or Time", effect: "Draft state updates" },
        { id: "save-event", label: "Save event", trigger: "Click Save event", effect: "Prepends new agenda item, closes composer, resets draft" }
    ]
};
const contentListBoardSpec = {
    component: "ContentListBoard",
    summary: "Kanban-style task board with breadcrumb, quick-edit input, and growable task list.",
    props: [
        { name: "compact", type: "boolean", default: "false" },
        { name: "highlighted", type: "boolean", default: "false", description: "Adds gradient highlight to the card." }
    ],
    behaviours: [
        { id: "new-task", label: "New task", trigger: "Click New Task", effect: "Appends a new TaskRow with status Ready, priority Medium" },
        { id: "quick-edit", label: "Quick edit", trigger: "Type into Quick edit", effect: "Controlled string updates" }
    ]
};
const filterSidePanelSpec = {
    component: "FilterSidePanel",
    summary: "Advanced filter sidebar with chip multiselect, color picker, range inputs, and apply/reset footer.",
    props: [
        { name: "side", type: '"left" | "right"', default: '"right"' },
        { name: "collapsed", type: "boolean", default: "false" }
    ],
    behaviours: [
        { id: "add-tag", label: "Add filter", trigger: "Click + Add", effect: "Pulls next suggestion into the chip list" },
        { id: "remove-tag", label: "Remove filter", trigger: "Click a chip", effect: "Removes the chip" },
        { id: "pick-swatch", label: "Pick color", trigger: "Click a swatch", effect: "Toggles aria-pressed on the swatch" },
        { id: "type-range", label: "Edit range", trigger: "Type into Min/Max/Search", effect: "Controlled values update; appliedAt is cleared" },
        { id: "reset", label: "Reset", trigger: "Click Reset", effect: "Restores seed tags, clears swatch, restores range defaults" },
        { id: "apply", label: "Apply", trigger: "Click Apply", effect: "Stamps appliedAt timestamp; status label switches to 'Applied · {time}'" }
    ]
};
const navigationBarsSpec = {
    component: "NavigationBars",
    summary: "Top dark nav bar + mobile bottom tab bar in one component (switch via `mobile` prop).",
    props: [
        { name: "mobile", type: "boolean", default: "false", description: "Renders the bottom tab bar instead of the top bar." }
    ],
    behaviours: [
        { id: "switch-tab", label: "Switch tab (mobile)", trigger: "Click Home/Search/Create/Profile", effect: "Sets active tab; aria-selected/className update" },
        { id: "link-active", label: "Activate top link", trigger: "Click Components/Tokens/Templates", effect: "Toggles aria-current='page' on the link" },
        { id: "cta", label: "Get Started CTA", trigger: "Click Get Started", effect: "state: idle → starting → started; label tracks state" }
    ]
};
const overlayStatesSpec = {
    component: "OverlayStates",
    summary: "Reusable overlay surface that renders as dialog, drawer, or sheet depending on `mode`.",
    props: [
        { name: "mode", type: '"dialog" | "drawer" | "sheet"', default: '"dialog"' }
    ],
    behaviours: [
        { id: "dialog-cancel", label: "Cancel (dialog)", trigger: "Click Cancel", effect: "dialog state → cancelled; title/body switch to 'Edit kept'" },
        { id: "dialog-discard", label: "Discard (dialog)", trigger: "Click Discard", effect: "dialog state → discarded; title/body switch to 'Changes discarded'" },
        { id: "drawer-reset", label: "Reset (drawer)", trigger: "Click Reset", effect: "drawer state → reset; body switches to 'Filters cleared.'" },
        { id: "drawer-apply", label: "Apply (drawer)", trigger: "Click Apply", effect: "drawer state → applied; body switches to 'Filters applied...'" }
    ]
};
const pricingPanelSpec = {
    component: "PricingPanel",
    summary: "Pricing card with single subscribe CTA — `idle → loading → done` state machine.",
    props: [
        { name: "plan", type: '"starter" | "pro"', default: '"starter"' }
    ],
    behaviours: [
        { id: "cta", label: "Subscribe / Trial CTA", trigger: "Click Start free trial / Upgrade now", effect: "state: idle → loading (aria-busy=true, disabled) → done; label and dataset reflect state" }
    ]
};
const productCardSpec = {
    component: "ProductCard",
    summary: "Product image + title/price card. Static visual — purchase action is a slot for the parent.",
    props: [
        { name: "title", type: "string", default: '"Helmet"' },
        { name: "price", type: "string", default: '"$120"' },
        { name: "image", type: "string", default: '"/fixtures/product-helmet.jpg"' }
    ],
    behaviours: []
};
const tabsPanelSpec = {
    component: "TabsPanel",
    summary: "Pill-tab navigation with single-selection (Overview / Activity / Settings).",
    props: [
        { name: "active", type: '"overview" | "activity" | "settings"', default: '"activity"' }
    ],
    behaviours: [
        { id: "switch", label: "Switch tab", trigger: "Click a tab", effect: "Sets current; aria-selected and .active class flip" }
    ]
};
const selectFieldSpec = {
    component: "SelectField",
    summary: "Combobox-style single select. Click to open, click an option to choose.",
    props: [
        { name: "label", type: "string", default: '"Category"' },
        { name: "value", type: "string", default: '"Spacesuits"' },
        { name: "expanded", type: "boolean", default: "false", description: "Initial open state." }
    ],
    behaviours: [
        { id: "toggle", label: "Toggle menu", trigger: "Click the select field", effect: "aria-expanded flips; listbox shows/hides" },
        { id: "pick", label: "Pick option", trigger: "Click an option", effect: "Sets selected value; closes menu; aria-selected updates on options" }
    ]
};
const muiShowcaseSpec = {
    component: "MUIShowcase",
    summary: "Material UI sample page — buttons, tabs, form controls, list, table, alerts, progress. Pressed state tracked per button.",
    props: [],
    behaviours: [
        { id: "mui-button", label: "Pressed toggle", trigger: "Click Contained / Outlined / Text / View Details / Continue", effect: "aria-pressed toggles per button" },
        { id: "mui-tabs", label: "Switch tab", trigger: "Click Overview/Design/Usage", effect: "tabValue updates; body text changes" },
        { id: "mui-form", label: "Type into form", trigger: "Type into Email TextField", effect: "Controlled MUI TextField updates" }
    ]
};
const analyticsChartsSpec = {
    component: "AnalyticsCharts",
    summary: "Dashboard with revenue/usage charts. Currently a static visual; click handlers are a slot for the parent.",
    props: [
        { name: "focus", type: '"revenue" | "usage"', default: '"revenue"' },
        { name: "dense", type: "boolean", default: "false" }
    ],
    behaviours: []
};
const complexDashboardCardSpec = {
    component: "ComplexDashboardCard",
    summary: "Multi-section dashboard card (header + KPI + chart). Static composition.",
    props: [],
    behaviours: []
};
const featureCardSpec = {
    component: "FeatureCard",
    summary: "Marketing feature card with icon, headline, and supporting copy.",
    props: [],
    behaviours: []
};
const loadingStatesSpec = {
    component: "LoadingStates",
    summary: "Skeleton/loading variants for cards and lists.",
    props: [],
    behaviours: []
};
const meetingHomeSpec = {
    component: "MeetingHomePage",
    summary: "Mobile meeting home with upcoming list and quick actions.",
    props: [],
    behaviours: []
};
const neonArcadeSpec = {
    component: "NeonArcadeScreen",
    summary: "Game-style arcade screen — neon HUD with score/level visuals.",
    props: [],
    behaviours: []
};
const cryptoChaosSpec = {
    component: "CryptoChaosDashboard",
    summary: "Maximalist crypto dashboard with tickers and charts.",
    props: [],
    behaviours: []
};
const foodFrenzySpec = {
    component: "FoodFrenzyScreen",
    summary: "Food-ordering arcade screen with item cards.",
    props: [],
    behaviours: []
};
const spaceMissionSpec = {
    component: "SpaceMissionControl",
    summary: "Mission control UI with telemetry panels.",
    props: [],
    behaviours: []
};
const retroTerminalSpec = {
    component: "RetroTerminalScreen",
    summary: "CRT-style terminal with green-on-black ASCII frames.",
    props: [],
    behaviours: []
};
const muiWorkspaceSpec = {
    component: "MUIWorkspaceScreen",
    summary: "Material UI workspace template — sidebar + content + form sections.",
    props: [],
    behaviours: []
};
const radioGroupFieldSpec = {
    component: "RadioGroupField",
    summary: "Radio group with label + horizontal options.",
    props: [],
    behaviours: []
};
const snackbarStackSpec = {
    component: "SnackbarStack",
    summary: "Stacked snackbar notifications (info / success / warning).",
    props: [],
    behaviours: []
};
export const COMPONENT_SPECS = {
    Button: buttonSpec,
    LoginPage: loginPageSpec,
    CalendarScheduler: calendarSchedulerSpec,
    ContentListBoard: contentListBoardSpec,
    FilterSidePanel: filterSidePanelSpec,
    NavigationBars: navigationBarsSpec,
    OverlayStates: overlayStatesSpec,
    PricingPanel: pricingPanelSpec,
    ProductCard: productCardSpec,
    TabsPanel: tabsPanelSpec,
    SelectField: selectFieldSpec,
    MUIShowcase: muiShowcaseSpec,
    AnalyticsCharts: analyticsChartsSpec,
    ComplexDashboardCard: complexDashboardCardSpec,
    FeatureCard: featureCardSpec,
    LoadingStates: loadingStatesSpec,
    MeetingHomePage: meetingHomeSpec,
    NeonArcadeScreen: neonArcadeSpec,
    CryptoChaosDashboard: cryptoChaosSpec,
    FoodFrenzyScreen: foodFrenzySpec,
    SpaceMissionControl: spaceMissionSpec,
    RetroTerminalScreen: retroTerminalSpec,
    MUIWorkspaceScreen: muiWorkspaceSpec,
    RadioGroupField: radioGroupFieldSpec,
    SnackbarStack: snackbarStackSpec
};
export function getComponentSpec(name) {
    return COMPONENT_SPECS[name];
}
