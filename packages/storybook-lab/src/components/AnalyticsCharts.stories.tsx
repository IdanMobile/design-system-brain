import type { Meta, StoryObj } from "@storybook/react";
import { AnalyticsCharts } from "@lab/ui";

const meta: Meta<typeof AnalyticsCharts> = { title: "Lab/AnalyticsCharts", component: AnalyticsCharts };
export default meta;

type Story = StoryObj<typeof AnalyticsCharts>;

export const Revenue: Story = {};
export const Usage: Story = { args: { focus: "usage" } };
export const Dense: Story = { args: { dense: true } };
