# lab-memory vault

Git-backed Obsidian vault for agent semantic memory (inside `storybook-to-figma-lab`).

**Start in Obsidian:** open folder `lab-memory/` → read [[Home]].

## Structure

```text
lab-memory/
  Home.md
  visual/                    ← Storybook → Figma parity
    patterns/                ← durable adapter rules (read first)
    investigations/
      active/                ← current debug notes
      archive/               ← stale pending stubs
  logic/                     ← element behavior (separate track)
    specs/*.spec.json        ← one per portfolio story
    archive/                 ← v1 spec archive
  ops/                       ← runbooks, orchestrator, agents
  templates/                 ← copy templates for new notes
```

Scripts resolve paths via `scripts/lab-memory-paths.mjs`.

## Policy

- **Never** store secrets, PATs, API keys, or `.env` content
- Visual fixes: generalize into **`visual/patterns/`**, not story-id hacks
- Logic specs: edit via showcase or `logic/specs/` — not mixed into investigation prose

## Commands

```bash
pnpm lab-memory:report
```

Optional: `export LAB_MEMORY_AUTO_COMMIT=1` after vault writes.

## Who writes what

| Role | Path |
| --- | --- |
| Investigator | `visual/investigations/active/<storyId>.md` |
| Test console hook | Auto-stub on fail/warn; Resolved on PASS |
| Logic audit / showcase | `logic/specs/<storyId>.spec.json` |
| Human | `ops/runbooks/*`, curate `visual/patterns/*` |

## Cursor snippet

```text
Before fixing: read visual/patterns linked from visual/investigations/active/<storyId>.md
After investigate: append templates/investigation.md before code edits
Never store secrets in the vault
```
