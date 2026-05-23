import React from "react";
import type { DevStoryEntry, StoryArgs } from "../../contract/src/stories.ts";
import {
  AnalyticsCharts,
  Button,
  CalendarScheduler,
  ComplexDashboardCard,
  ContentListBoard,
  FeatureCard,
  FilterSidePanel,
  LoadingStates,
  LoginPage,
  MeetingHomePage,
  NeonArcadeScreen,
  CryptoChaosDashboard,
  FoodFrenzyScreen,
  SpaceMissionControl,
  RetroTerminalScreen,
  NavigationBars,
  OverlayStates,
  PricingPanel,
  ProductCard,
  RadioGroupField,
  SelectField,
  SnackbarStack,
  TabsPanel,
  MUIShowcase,
  MUIWorkspaceScreen
} from "@lab/ui";

type ComponentMap = Record<string, React.ComponentType<StoryArgs>>;

const COMPONENTS: ComponentMap = {
  AnalyticsCharts,
  Button,
  CalendarScheduler,
  ComplexDashboardCard,
  ContentListBoard,
  FeatureCard,
  FilterSidePanel,
  LoadingStates,
  LoginPage,
  MeetingHomePage,
  NeonArcadeScreen,
  CryptoChaosDashboard,
  FoodFrenzyScreen,
  SpaceMissionControl,
  RetroTerminalScreen,
  MUIShowcase,
  MUIWorkspaceScreen,
  NavigationBars,
  OverlayStates,
  PricingPanel,
  ProductCard,
  RadioGroupField,
  SelectField,
  SnackbarStack,
  TabsPanel
};

export function renderDevStory(entry: DevStoryEntry): React.ReactNode {
  const Component = COMPONENTS[entry.component];
  if (!Component) {
    return (
      <p data-figma-component="MissingComponent">
        Unknown component: {entry.component}
      </p>
    );
  }
  const args = { ...(entry.args ?? {}) };
  const { children, ...rest } = args;
  return (
    <Component {...rest}>
      {children != null ? String(children) : undefined}
    </Component>
  );
}
