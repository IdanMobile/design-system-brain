import type { Meta, StoryObj } from "@storybook/react";
import { SpaceMissionControl } from "@lab/ui";

const meta: Meta<typeof SpaceMissionControl> = {
  title: "Lab/SpaceMissionControl",
  component: SpaceMissionControl,
  parameters: { layout: "centered" }
};
export default meta;

type Story = StoryObj<typeof SpaceMissionControl>;

export const Default: Story = {};
