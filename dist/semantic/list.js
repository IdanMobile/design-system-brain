/**
 * Semantic API — List / ContentListBoard (`ds.list`).
 * Source of truth for props + behavior tests; see docs/semantic/ContentListBoard.md
 */
/** Interaction matrix row ids — behavior harness references these. */
export const LIST_BEHAVIOR_MATRIX = [
    "L-01",
    "L-02",
    "L-03",
    "L-04",
    "L-05",
    "L-06",
    "L-07",
    "L-08",
    "L-09",
    "L-10",
    "L-11",
    "L-12",
    "L-13",
    "L-14"
];
export const LIST_DEFAULT_ITEMS = [
    {
        id: "1",
        title: "Release Notes / Data Widgets",
        owner: "Nora",
        status: { label: "Ready", tone: "success" },
        priority: { label: "High", tone: "neutral" }
    },
    {
        id: "2",
        title: "Billing Chart / Pie + Breakdown",
        owner: "Tom",
        status: { label: "In review", tone: "warning" },
        priority: { label: "Medium", tone: "neutral" }
    },
    {
        id: "3",
        title: "Calendar Module / Sprint Timeline",
        owner: "Dana",
        status: { label: "Blocked", tone: "danger" },
        priority: { label: "High", tone: "neutral" }
    },
    {
        id: "4",
        title: "Icon Tokens / Color Migration",
        owner: "Ruth",
        status: { label: "Ready", tone: "success" },
        priority: { label: "Low", tone: "neutral" }
    }
];
export const LIST_DEFAULT_BREADCRUMBS = [
    { label: "Workspace" },
    { label: "Components" },
    { label: "Library QA", active: true }
];
export function resolveListRenderMode(props) {
    if (props.isLoading)
        return "loading";
    if (props.isError)
        return "error";
    if (props.isEmpty || (props.items?.length ?? 0) === 0)
        return "empty";
    return "populated";
}
