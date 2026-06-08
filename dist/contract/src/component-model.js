/**
 * React component prop models for the showcase developer panel.
 * Curated from `@lab/ui` component source — update when props change.
 */
import { DEV_STORY_BY_ID } from "./stories";
const MODELS = {
    AnalyticsCharts: [
        { name: "focus", type: '"revenue" | "usage"', optional: true },
        { name: "dense", type: "boolean", optional: true }
    ],
    Button: [
        { name: "variant", type: '"primary" | "secondary" | "danger" | "ghost"', optional: true },
        { name: "size", type: '"sm" | "md" | "lg"', optional: true },
        { name: "iconLeft", type: "boolean", optional: true },
        { name: "iconRight", type: "boolean", optional: true },
        { name: "children", type: "React.ReactNode", optional: true }
    ],
    CalendarScheduler: [
        { name: "compact", type: "boolean", optional: true },
        { name: "showWeekend", type: "boolean", optional: true }
    ],
    ComplexDashboardCard: [],
    ContentListBoard: [
        { name: "compact", type: "boolean", optional: true },
        { name: "highlighted", type: "boolean", optional: true }
    ],
    FeatureCard: [
        { name: "variant", type: '"default" | "success" | "warning"', optional: true },
        { name: "title", type: "string", optional: true },
        { name: "description", type: "string", optional: true },
        { name: "statLabel", type: "string", optional: true },
        { name: "statValue", type: "string", optional: true }
    ],
    FilterSidePanel: [
        { name: "side", type: '"left" | "right"', optional: true },
        { name: "collapsed", type: "boolean", optional: true }
    ],
    LoadingStates: [{ name: "mode", type: '"card" | "list"', optional: true }],
    LoginPage: [
        { name: "title", type: "string", optional: true },
        { name: "subtitle", type: "string", optional: true },
        { name: "email", type: "string", optional: true },
        { name: "password", type: "string", optional: true }
    ],
    MeetingHomePage: [],
    NeonArcadeScreen: [],
    CryptoChaosDashboard: [],
    FoodFrenzyScreen: [],
    SpaceMissionControl: [],
    RetroTerminalScreen: [],
    Screen1: [],
    MUIShowcase: [],
    MUIWorkspaceScreen: [],
    NavigationBars: [{ name: "mobile", type: "boolean", optional: true }],
    OverlayStates: [
        { name: "mode", type: '"dialog" | "drawer" | "bottom-sheet"', optional: true }
    ],
    PricingPanel: [{ name: "plan", type: '"starter" | "pro"', optional: true }],
    ProductCard: [
        { name: "title", type: "string", optional: true },
        { name: "price", type: "string", optional: true },
        { name: "compact", type: "boolean", optional: true },
        { name: "dark", type: "boolean", optional: true }
    ],
    RadioGroupField: [
        { name: "selected", type: "string", optional: true },
        { name: "disabled", type: "boolean", optional: true }
    ],
    SelectField: [
        { name: "label", type: "string", optional: true },
        { name: "value", type: "string", optional: true },
        { name: "expanded", type: "boolean", optional: true }
    ],
    SnackbarStack: [{ name: "dense", type: "boolean", optional: true }],
    TabsPanel: [{ name: "active", type: '"activity" | "settings"', optional: true }]
};
export function propsForComponent(component) {
    return MODELS[component] ?? [];
}
export function formatPropsInterface(component) {
    const props = propsForComponent(component);
    if (props.length === 0) {
        return `// ${component} — no public props (self-contained screen)`;
    }
    const lines = props.map((p) => `  ${p.name}${p.optional ? "?" : ""}: ${p.type};`);
    return `type ${component}Props = {\n${lines.join("\n")}\n};`;
}
function formatJsxProp(key, value) {
    if (value === undefined || value === null)
        return null;
    if (typeof value === "boolean")
        return value ? `  ${key}` : `  ${key}={false}`;
    if (typeof value === "string")
        return `  ${key}="${value.replace(/"/g, '\\"')}"`;
    if (typeof value === "number")
        return `  ${key}={${value}}`;
    return `  ${key}={${JSON.stringify(value)}}`;
}
/** JSX usage for this story's component + args. */
export function formatJsxUsage(storyId) {
    const entry = DEV_STORY_BY_ID[storyId];
    if (!entry)
        return null;
    const { component, args = {} } = entry;
    const propDefs = propsForComponent(component);
    const lines = [];
    for (const [key, value] of Object.entries(args)) {
        const line = formatJsxProp(key, value);
        if (line)
            lines.push(line);
    }
    if (lines.length === 0 && propDefs.length === 0) {
        return `<${component} />`;
    }
    if (lines.length === 0) {
        const optionalHints = propDefs
            .filter((p) => p.optional)
            .slice(0, 4)
            .map((p) => `  ${p.name}=…`);
        if (optionalHints.length === 0)
            return `<${component} />`;
        return `<${component}\n${optionalHints.join("\n")}\n/>`;
    }
    return `<${component}\n${lines.join("\n")}\n/>`;
}
export function reactModelForStory(storyId) {
    const entry = DEV_STORY_BY_ID[storyId];
    if (!entry)
        return null;
    return {
        component: entry.component,
        propsInterface: formatPropsInterface(entry.component),
        jsxUsage: formatJsxUsage(storyId) ?? `<${entry.component} />`
    };
}
