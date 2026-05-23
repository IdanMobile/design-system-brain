import type { Meta, StoryObj } from "@storybook/react";
import { FoodFrenzyScreen } from "@lab/ui";

const meta: Meta<typeof FoodFrenzyScreen> = {
  title: "Lab/FoodFrenzyScreen",
  component: FoodFrenzyScreen,
  parameters: { layout: "centered" }
};
export default meta;

type Story = StoryObj<typeof FoodFrenzyScreen>;

export const Default: Story = {};
