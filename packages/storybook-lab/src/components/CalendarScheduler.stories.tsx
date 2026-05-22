import type { Meta, StoryObj } from "@storybook/react";
import { CalendarScheduler } from "@lab/ui";

const meta: Meta<typeof CalendarScheduler> = { title: "Lab/CalendarScheduler", component: CalendarScheduler };
export default meta;

type Story = StoryObj<typeof CalendarScheduler>;

export const Monthly: Story = {};
export const WeekdaysOnly: Story = { args: { showWeekend: false } };
export const Compact: Story = { args: { compact: true } };
