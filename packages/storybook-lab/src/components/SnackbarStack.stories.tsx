import type { Meta, StoryObj } from "@storybook/react";
import { SnackbarStack } from "@lab/ui";

const meta: Meta<typeof SnackbarStack> = { title: "Lab/SnackbarStack", component: SnackbarStack };
export default meta;

type Story = StoryObj<typeof SnackbarStack>;

export const Default: Story = {};
export const Dense: Story = { args: { dense: true } };
