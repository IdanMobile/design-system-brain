# Lab memory — home

Compounding knowledge for **storybook-to-figma-lab**. Open this vault in Obsidian from the repo folder `lab-memory/`.

## Three zones (do not mix tracks)

| Zone | Folder | Purpose |
| --- | --- | --- |
| **Visual** | [[visual/README]] | Storybook → Figma parity — **patterns** + **investigations** |
| **Logic** | [[logic/README]] | Element behavior specs (`*.spec.json`) — showcase approval |
| **Ops** | [[ops/README]] | Runbooks, orchestrator briefs, per-agent notes |

UniversalLayer IR (`packages/contract/src/v2.ts`) is the product; Storybook is the current web ingress teacher.

## Agent workflow (visual fixes)

1. Read **`visual/patterns/`** linked from the investigation note.
2. Read **`visual/investigations/active/<storyId>.md`** (or `archive/` if that is where the note lives).
3. Append investigation **before** code edits (`templates/investigation.md`).
4. After PASS, add or update a **pattern** if the fix generalizes.

```bash
pnpm lab-memory:report
```

## Quick links

- [[visual/patterns/render-html-button-appearance]]
- [[visual/patterns/infra-storybook-timeout]]
- [[visual/investigations/_index]]
- [[ops/runbooks/figma-plugin]]
- [[ops/runbooks/infra]]
