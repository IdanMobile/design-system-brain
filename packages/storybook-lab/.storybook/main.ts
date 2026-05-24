import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: { name: "@storybook/react-vite", options: {} },
  // Serve local fixture assets at the URL root so component default props
  // can reference `/fixtures/...` without depending on external services
  // like picsum.photos (which is rate-limited and flaky enough to cause the
  // figma-live extractor to capture an empty `<img>` for product cards).
  staticDirs: ["../public"]
};

export default config;
