import type { Meta, StoryObj } from "@storybook/react";
import { RadioGroupField } from "@lab/ui";

const meta: Meta<typeof RadioGroupField> = { title: "Lab/RadioGroupField", component: RadioGroupField };
export default meta;

type Story = StoryObj<typeof RadioGroupField>;

export const Default: Story = {};
export const PickupSelected: Story = { args: { selected: "pickup" } };
export const Disabled: Story = { args: { disabled: true } };
