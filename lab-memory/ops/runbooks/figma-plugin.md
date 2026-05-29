# Figma plugin runbook

**Plugin:** Universal JSON Importer Lab  
**Repo path:** `packages/figma-importer-plugin/`  
**Renderer:** `packages/figma-importer-plugin/src/code-v2.ts`

## First-time setup

1. Build: `pnpm --filter @lab/figma-importer-plugin build`
2. Figma Desktop → **Plugins** → **Development** → **Import plugin from manifest**
3. Select `packages/figma-importer-plugin/manifest.json` in this repo
4. Open **Universal JSON Importer Lab** in any Figma file
5. Keep the plugin panel open (bridge must stay connected)

## Daily / before live tests

```bash
cd /Users/user/Downloads/storybook-to-figma-lab
pnpm infra:ensure && pnpm infra:health
```

Expect `agentCanProceedLive: true` when Storybook, relay, and plugin are connected.

## After renderer code changes

```bash
pnpm figma:plugin:build-reload
```

On macOS this rebuilds and sends **Cmd+Option+P** to reload the last dev plugin.

If reload fails:

1. Figma Desktop → Plugins → Development → **Universal JSON Importer Lab**
2. Reply `ready` in Cursor chat, then re-run the live test

## Relay

- Default port: `3456`
- Start: `pnpm figma:relay` (or `pnpm infra:ensure`)

## Human-only steps

- First open of Figma / plugin after reboot
- Plugin reload when automation does not reconnect
- Login / OS dialogs
