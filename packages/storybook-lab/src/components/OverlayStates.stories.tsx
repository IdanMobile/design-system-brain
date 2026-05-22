import type { Meta, StoryObj } from "@storybook/react";
import { OverlayStates } from "@lab/ui";

const meta: Meta<typeof OverlayStates> = { title: "Lab/OverlayStates", component: OverlayStates };
export default meta;

type Story = StoryObj<typeof OverlayStates>;

export const Dialog: Story = {};
export const Drawer: Story = { args: { mode: "drawer" } };
export const BottomSheet: Story = { args: { mode: "sheet" } };
