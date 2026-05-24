# Worker Mac runbook

**Machine:** M1 Pro, 16 GB RAM (solo dev)  
**Repo:** `/Users/user/Downloads/storybook-to-figma-lab`

## Toolchain

- Node 22, pnpm, Git, Chrome
- Figma Desktop, Obsidian (this vault)
- Cursor IDE for agent fixes

## Start a fix session

```bash
cd /Users/user/Downloads/storybook-to-figma-lab
pnpm infra:ensure && pnpm infra:health
pnpm test:console:build && pnpm test:console
```

Dashboard: http://127.0.0.1:6110

Dispatch fix from Terminal:

```bash
pnpm test:console:cursor agent
```

## Test compilation order (per story)

1. Pixel
2. Figma mock
3. Figma live (Mac + plugin required)
4. Delivery

## Memory

- Investigations → `lab-memory/stories/<storyId>.md`
- Patterns → `lab-memory/patterns/`
- This vault opened in Obsidian at `lab-memory/`

## Not on this machine

- Full **cloud** platform (`upload_to_cloud/` Phases 1–9) — **deferred**
- Ollama / Qwen 3.6 — skipped (16 GB RAM; using **Cursor** instead)
