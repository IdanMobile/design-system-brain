import type { Meta, StoryObj } from "@storybook/react";
import { CryptoChaosDashboard } from "@lab/ui";

const meta: Meta<typeof CryptoChaosDashboard> = {
  title: "Lab/CryptoChaosDashboard",
  component: CryptoChaosDashboard,
  parameters: { layout: "centered" }
};
export default meta;

type Story = StoryObj<typeof CryptoChaosDashboard>;

export const Default: Story = {};
