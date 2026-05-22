/**
 * Long-running setup services — started in Terminal (not detached from test-console server).
 */

export const SERVICE_TERMINAL = {
  relay: {
    command: "pnpm figma:relay",
    keepOpen: true,
    tooltip:
      "WebSocket bridge on port 3456. Connects live Figma tests to the Desktop importer plugin so PNG exports flow back to the harness. Required for Figma live — not for the emulator. Leave this terminal open."
  },
  storybook: {
    command: "pnpm storybook:serve",
    keepOpen: true,
    tooltip:
      "Serves the built Storybook on http://127.0.0.1:6107. Almost every test screenshots stories from here — start this first when the pill is red. Leave this terminal open."
  },
  playground: {
    command: "pnpm playground:serve",
    keepOpen: true,
    tooltip:
      "Serves the Delivery showcase on http://127.0.0.1:6108. Use ?view=showcase for all stories, or ?story= for one variant. Needed for delivery tests. Leave this terminal open."
  },
  plugin: {
    command: "pnpm --filter @lab/figma-importer-plugin build",
    keepOpen: false,
    tooltip:
      "Compiles packages/figma-importer-plugin/src/code-v2.ts → dist/code.js. Run after renderer fixes, then reload the importer plugin in Figma Desktop before live re-tests."
  }
};
