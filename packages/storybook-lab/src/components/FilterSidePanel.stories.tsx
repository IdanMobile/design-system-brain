import type { Meta, StoryObj } from "@storybook/react";
import { FilterSidePanel } from "@lab/ui";

const meta: Meta<typeof FilterSidePanel> = { title: "Lab/FilterSidePanel", component: FilterSidePanel };
export default meta;

type Story = StoryObj<typeof FilterSidePanel>;

export const RightPanel: Story = {};
export const LeftPanel: Story = { args: { side: "left" } };
export const Collapsed: Story = { args: { collapsed: true } };
