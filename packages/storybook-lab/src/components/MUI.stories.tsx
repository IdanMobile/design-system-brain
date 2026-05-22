import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { MUIShowcase } from "@lab/ui";

const meta: Meta = {
  title: "MUI",
  parameters: {
    layout: "fullscreen"
  }
};

export default meta;

type Story = StoryObj;

export const Showcase: Story = {
  render: () => <MUIShowcase />
};
