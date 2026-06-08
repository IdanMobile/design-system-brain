import type { Meta, StoryObj } from "@storybook/react";
import { ScreenNotificationAvater } from "@lab/ui";

const meta: Meta<typeof ScreenNotificationAvater> = {
  title: "Lab/ScreenNotificationAvater",
  component: ScreenNotificationAvater,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof ScreenNotificationAvater>;

export const Default: Story = {};
