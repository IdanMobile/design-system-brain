import type { Meta, StoryObj } from "@storybook/react";
import { LoadingStates } from "@lab/ui";

const meta: Meta<typeof LoadingStates> = { title: "Lab/LoadingStates", component: LoadingStates };
export default meta;

type Story = StoryObj<typeof LoadingStates>;

export const CardSkeleton: Story = {};
export const ListSkeleton: Story = { args: { mode: "list" } };
