import type { Meta, StoryObj } from "@storybook/react";
import { SelectField } from "@lab/ui";

const meta: Meta<typeof SelectField> = { title: "Lab/SelectField", component: SelectField };
export default meta;

type Story = StoryObj<typeof SelectField>;

export const Closed: Story = {};
export const Expanded: Story = { args: { expanded: true } };
