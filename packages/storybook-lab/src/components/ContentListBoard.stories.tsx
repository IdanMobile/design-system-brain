import type { Meta, StoryObj } from "@storybook/react";
import { ContentListBoard } from "@lab/ui";

const meta: Meta<typeof ContentListBoard> = { title: "Lab/ContentListBoard", component: ContentListBoard };
export default meta;

type Story = StoryObj<typeof ContentListBoard>;

export const Default: Story = {};
export const Compact: Story = { args: { compact: true } };
export const Highlighted: Story = { args: { highlighted: true } };
