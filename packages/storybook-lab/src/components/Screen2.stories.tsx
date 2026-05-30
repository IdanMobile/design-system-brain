import type { Meta, StoryObj } from "@storybook/react";
import { Screen2 } from "../../../ui/src/components/Screen2/Screen2";

const meta: Meta<typeof Screen2> = {
  title: "Lab/Screen2",
  component: Screen2,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof Screen2>;

export const Default: Story = {};
