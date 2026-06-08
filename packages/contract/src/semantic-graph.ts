/**
 * SemanticGraph — ingress-agnostic component tree for React delivery egress.
 * Built from Universal JSON (Storybook extract or Figma manifest→contract).
 */

import type { DevComponentName } from "./stories";

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
] as const;

export type SemanticComponentId = (typeof SEMANTIC_COMPONENT_IDS)[number];

export type SemanticNode =
  | SemanticComponentNode
  | SemanticLayoutNode
  | SemanticTextNode;

export interface SemanticComponentNode {
  kind: "component";
  componentId: SemanticComponentId;
  props: Record<string, unknown>;
  layerId?: string;
  box?: { x: number; y: number; width: number; height: number };
}

export interface SemanticTextNode {
  kind: "text";
  value: string;
  layerId?: string;
  box?: { x: number; y: number; width: number; height: number };
  style?: Record<string, string | number>;
}

/** Layout shell — children may include layout-codegen fragments. */
export interface SemanticLayoutNode {
  kind: "layout";
  layerId: string;
  /** Pre-rendered JSX body lines for this subtree (layout lowerer). */
  layoutJsx?: string;
  children?: SemanticNode[];
  box?: { x: number; y: number; width: number; height: number };
}

export interface SemanticDocument {
  schemaVersion: "1.0";
  rootComponent: SemanticComponentId;
  storyArgs?: Record<string, unknown>;
  ingress: "figma" | "storybook";
  /** Single-root component stories (Button, FeatureCard, …). */
  root?: SemanticComponentNode;
  /** Screen/composite — positioned semantic replacements + layout shell. */
  bindings?: SemanticComponentNode[];
  layoutRoot?: SemanticLayoutNode;
}

export function isSemanticComponentId(id: string): id is SemanticComponentId {
  return (SEMANTIC_COMPONENT_IDS as readonly string[]).includes(id);
}

export function asDevComponentName(id: SemanticComponentId): DevComponentName {
  return id as DevComponentName;
}
