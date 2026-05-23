import type { Meta, StoryObj } from "@storybook/react";
import { MUIWorkspaceScreen } from "@lab/ui";

const meta: Meta<typeof MUIWorkspaceScreen> = {
  title: "Lab/MUIWorkspaceScreen",
  component: MUIWorkspaceScreen,
  parameters: { layout: "centered" }
};
export default meta;

type Story = StoryObj<typeof MUIWorkspaceScreen>;

export const Default: Story = {};
