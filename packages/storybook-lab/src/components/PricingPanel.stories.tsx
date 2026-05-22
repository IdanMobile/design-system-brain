import type { Meta, StoryObj } from "@storybook/react";
import { PricingPanel } from "@lab/ui";

const meta: Meta<typeof PricingPanel> = { title: "Lab/PricingPanel", component: PricingPanel };
export default meta;

type Story = StoryObj<typeof PricingPanel>;

export const Starter: Story = {};
export const Pro: Story = { args: { plan: "pro" } };
