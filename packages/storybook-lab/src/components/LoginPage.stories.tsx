import type { Meta, StoryObj } from "@storybook/react";
import { LoginPage } from "@lab/ui";

const meta: Meta<typeof LoginPage> = { title: "Lab/LoginPage", component: LoginPage };
export default meta;

type Story = StoryObj<typeof LoginPage>;

export const Default: Story = {};

export const FilledCredentials: Story = {
  args: {
    email: "team@lab.dev",
    password: "password123",
    subtitle: "Sign in and continue where you left off."
  }
};
