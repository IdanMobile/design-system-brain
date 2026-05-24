import type { Meta, StoryObj } from "@storybook/react";
import { ProductCard } from "@lab/ui";

const meta: Meta<typeof ProductCard> = { title: "Lab/ProductCard", component: ProductCard };
export default meta;
export const Default: StoryObj<typeof ProductCard> = {};
export const Dark: StoryObj<typeof ProductCard> = {
  args: { variant: "dark", status: "Low stock", showBadge: true }
};
export const Compact: StoryObj<typeof ProductCard> = {
  args: { variant: "compact", title: "Travel Pack\nM3", status: "Ships in 2 days" }
};
export const AlternateImage: StoryObj<typeof ProductCard> = {
  args: {
    image: "/fixtures/product-camera.jpg",
    title: "Vintage Camera\nV12",
    status: "Back in stock"
  }
};
