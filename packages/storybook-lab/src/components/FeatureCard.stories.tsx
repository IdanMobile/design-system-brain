import type { Meta, StoryObj } from "@storybook/react";
import { FeatureCard } from "@lab/ui";

const meta: Meta<typeof FeatureCard> = { title: "Lab/FeatureCard", component: FeatureCard };
export default meta;

type Story = StoryObj<typeof FeatureCard>;

export const Default: Story = {};
export const Success: Story = {
  args: {
    variant: "success",
    title: "Pipeline Healthy",
    description: "All visual checks passed in under 3 minutes.",
    statLabel: "Pass Rate",
    statValue: "100%"
  }
};
export const Warning: Story = {
  args: {
    variant: "warning",
    title: "Review Needed",
    description: "Two components exceeded the pixel diff threshold.",
    statLabel: "Issues",
    statValue: "2"
  }
};
