import type { Meta, StoryObj } from "@storybook/react";
import { NeonArcadeScreen } from "@lab/ui";

const meta: Meta<typeof NeonArcadeScreen> = {
  title: "Lab/NeonArcadeScreen",
  component: NeonArcadeScreen,
  parameters: { layout: "centered" }
};
export default meta;

type Story = StoryObj<typeof NeonArcadeScreen>;

export const Default: Story = {};
