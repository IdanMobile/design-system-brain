import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@lab/ui";

const meta: Meta<typeof Button> = { title: "Lab/Button", component: Button };
export default meta;

type Story = StoryObj<typeof Button>;
export const Primary: Story = { args: { variant: "primary", children: "Primary" } };
export const PrimaryWithIcon: Story = { args: { variant: "primary", iconLeft: true, children: "Primary" } };
export const Secondary: Story = { args: { variant: "secondary", children: "Secondary" } };
export const Danger: Story = { args: { variant: "danger", children: "Delete Item" } };
export const Ghost: Story = { args: { variant: "ghost", children: "Learn More", iconRight: true } };
export const Compact: Story = { args: { variant: "primary", size: "sm", children: "Compact" } };
export const LargeWithBothIcons: Story = {
  args: { variant: "secondary", size: "lg", iconLeft: true, iconRight: true, children: "Continue" }
};
