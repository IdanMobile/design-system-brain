# Infra runbook

## Health check

```bash
pnpm infra:health
```

Key fields:

| Field | Meaning |
| --- | --- |
| `storybookUp` | Storybook serving fixtures (default `:6107`) |
| `relayUp` | Figma live relay (default `:3456`) |
| `pluginConnected` | Dev plugin UI connected to relay |
| `agentCanProceedLive` | Safe to run figma live / run-until-pass |

## Ensure everything is up

```bash
pnpm infra:ensure
```

Starts Storybook and relay in the background if down.

## Common fixes

| Symptom | Action |
| --- | --- |
| Storybook down | `pnpm storybook:serve` |
| Relay down | `pnpm figma:relay` |
| Plugin not connected | Open Figma → Universal JSON Importer Lab |
| After `code-v2.ts` edit | `pnpm figma:plugin:build-reload` |

## Playwright browsers

One-time: `pnpm install:browsers`
