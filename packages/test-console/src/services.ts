/** Service pill metadata (mirrors scripts/test-console-services.mjs). */

export type ServiceKey = "storybook" | "playground" | "relay" | "plugin";

export interface ServiceDef {
  key: ServiceKey;
  label: string;
  port?: string;
  tooltip: string;
  terminalCommand: string;
}

export const SERVICES: ServiceDef[] = [
  {
    key: "storybook",
    label: "Storybook",
    port: ":6107",
    terminalCommand: "pnpm storybook:serve",
    tooltip:
      "Serves the built Storybook on http://127.0.0.1:6107. Almost every test screenshots stories from here — start this first when the pill is red. Leave the terminal open."
  },
  {
    key: "playground",
    label: "Delivery showcase",
    port: ":6108",
    terminalCommand: "pnpm playground:serve",
    tooltip:
      "Serves the Delivery showcase on http://127.0.0.1:6108. Use ?view=showcase for all stories, or ?story= for one variant. Needed for delivery tests. Leave this terminal open."
  },
  {
    key: "relay",
    label: "Figma relay",
    port: ":3456",
    terminalCommand: "pnpm figma:relay",
    tooltip:
      "WebSocket bridge on ws://localhost:3456. Connects live Figma tests to the Desktop importer plugin so PNG exports flow back to the harness. Required for Figma live — not for the emulator. After starting, open the importer plugin in Figma and keep it connected."
  },
  {
    key: "plugin",
    label: "Plugin built",
    terminalCommand: "pnpm --filter @lab/figma-importer-plugin build",
    tooltip:
      "Compiles code-v2.ts → dist/code.js. Run after renderer fixes, then reload the importer plugin in Figma Desktop before live re-tests."
  }
];
