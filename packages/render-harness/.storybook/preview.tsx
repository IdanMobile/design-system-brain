import React from "react";
import type { Preview } from "@storybook/react";
import "../src/design-tokens/tokens.css";
import "../src/design-tokens/fonts.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
  },
};

export default preview;
