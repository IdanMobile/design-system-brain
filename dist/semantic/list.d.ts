/**
 * Semantic API — List / ContentListBoard (`ds.list`).
 * Source of truth for props + behavior tests; see docs/semantic/ContentListBoard.md
 */
export type ListBadgeTone = "success" | "warning" | "danger" | "neutral";
export interface ListBadge {
    label: string;
    tone: ListBadgeTone;
}
export interface ListItem {
    id: string;
    title: string;
    owner?: string;
    status?: ListBadge;
    priority?: ListBadge;
}
export interface ListBreadcrumb {
    label: string;
    active?: boolean;
}
export interface ListQuickEdit {
    label: string;
    value: string;
}
/** Developer-facing props for ds.list — no styling overrides. */
export interface ListProps {
    breadcrumbs?: ListBreadcrumb[];
    title?: string;
    subtitle?: string;
    items?: ListItem[];
    isLoading?: boolean;
    isEmpty?: boolean;
    isError?: boolean;
    errorMessage?: string;
    disabled?: boolean;
    quickEdit?: ListQuickEdit;
    compact?: boolean;
    highlighted?: boolean;
    onCreate?: () => void;
    onItemAction?: (detail: {
        item: ListItem;
        index: number;
    }) => void;
    onQuickEditChange?: (detail: {
        value: string;
    }) => void;
    onRetry?: () => void;
}
/** Interaction matrix row ids — behavior harness references these. */
export declare const LIST_BEHAVIOR_MATRIX: readonly ["L-01", "L-02", "L-03", "L-04", "L-05", "L-06", "L-07", "L-08", "L-09", "L-10", "L-11", "L-12", "L-13", "L-14"];
export type ListBehaviorCaseId = (typeof LIST_BEHAVIOR_MATRIX)[number];
export declare const LIST_DEFAULT_ITEMS: ListItem[];
export declare const LIST_DEFAULT_BREADCRUMBS: ListBreadcrumb[];
/** Resolve render mode from state flags (see spec precedence). */
export type ListRenderMode = "loading" | "error" | "empty" | "populated";
export declare function resolveListRenderMode(props: Pick<ListProps, "isLoading" | "isError" | "isEmpty" | "items">): ListRenderMode;
