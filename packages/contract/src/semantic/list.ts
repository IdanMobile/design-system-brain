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
  onItemAction?: (detail: { item: ListItem; index: number }) => void;
  onQuickEditChange?: (detail: { value: string }) => void;
  onRetry?: () => void;
}

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
] as const;

export type ListBehaviorCaseId = (typeof LIST_BEHAVIOR_MATRIX)[number];

export const LIST_DEFAULT_ITEMS: ListItem[] = [
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

export const LIST_DEFAULT_BREADCRUMBS: ListBreadcrumb[] = [
  { label: "Workspace" },
  { label: "Components" },
  { label: "Library QA", active: true }
];

/** Resolve render mode from state flags (see spec precedence). */
export type ListRenderMode = "loading" | "error" | "empty" | "populated";

export function resolveListRenderMode(props: Pick<ListProps, "isLoading" | "isError" | "isEmpty" | "items">): ListRenderMode {
  if (props.isLoading) return "loading";
  if (props.isError) return "error";
  if (props.isEmpty || (props.items?.length ?? 0) === 0) return "empty";
  return "populated";
}
