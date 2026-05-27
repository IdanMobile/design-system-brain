import type { Meta, StoryObj } from "@storybook/react";
import { Screen1 } from "@lab/ui";

const meta: Meta<typeof Screen1> = {
  title: "Lab/Screen1",
  component: Screen1,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof Screen1>;

export const Default: Story = {};
