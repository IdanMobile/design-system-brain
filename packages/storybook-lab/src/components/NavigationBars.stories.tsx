import type { Meta, StoryObj } from "@storybook/react";
import { NavigationBars } from "@lab/ui";

const meta: Meta<typeof NavigationBars> = { title: "Lab/NavigationBars", component: NavigationBars };
export default meta;

type Story = StoryObj<typeof NavigationBars>;

export const TopNavigation: Story = {};
export const BottomNavigation: Story = { args: { mobile: true } };
