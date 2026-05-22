import type { Meta, StoryObj } from "@storybook/react";
import { TabsPanel } from "@lab/ui";

const meta: Meta<typeof TabsPanel> = { title: "Lab/TabsPanel", component: TabsPanel };
export default meta;

type Story = StoryObj<typeof TabsPanel>;

export const ActivityActive: Story = {};
export const SettingsActive: Story = { args: { active: "settings" } };
