import type { Meta, StoryObj } from "@storybook/react";
import { RetroTerminalScreen } from "@lab/ui";

const meta: Meta<typeof RetroTerminalScreen> = {
  title: "Lab/RetroTerminalScreen",
  component: RetroTerminalScreen,
  parameters: { layout: "centered" }
};
export default meta;

type Story = StoryObj<typeof RetroTerminalScreen>;

export const Default: Story = {};
