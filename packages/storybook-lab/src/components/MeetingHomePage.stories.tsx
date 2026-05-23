import type { Meta, StoryObj } from "@storybook/react";
import { MeetingHomePage } from "@lab/ui";

const meta: Meta<typeof MeetingHomePage> = {
  title: "Lab/MeetingHomePage",
  component: MeetingHomePage,
  parameters: {
    layout: "centered"
  }
};
export default meta;

type Story = StoryObj<typeof MeetingHomePage>;

export const Default: Story = {};
