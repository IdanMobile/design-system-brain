# Lab memory (Obsidian vault)

Vault path: `lab-memory/` (open in Obsidian). Applies to **Cursor**, **Gemini CLI**, and **Antigravity** agents.

## Three zones

| Zone | Path | Use |
| --- | --- | --- |
| **Visual** | `lab-memory/visual/` | Pixel / Figma / delivery parity |
| **Logic** | `lab-memory/logic/specs/` | Element behavior JSON — **not** visual diffs |
| **Ops** | `lab-memory/ops/` | Runbooks, orchestrator briefs |

## Before investigating or fixing a story

When you know the `storyId`:

1. Read **`lab-memory/visual/patterns/`** notes linked from the investigation (`[[visual/patterns/...]]`).
2. Read **`lab-memory/visual/investigations/active/<storyId>.md`** (or `archive/` if present).
3. Do **not** confuse with `lab-memory/logic/specs/<storyId>.spec.json` (logic track only).

## After investigation (before code edits)

Append to the investigation note using `lab-memory/templates/investigation.md`:

- Root cause, recommended fix area, artifacts
- Link `[[visual/patterns/...]]` when reusable
- **Never** store secrets in the vault

## After PASS

- Automation appends **Resolved** on the investigation note
- Add or update **`visual/patterns/`** for generalized fixes

```bash
pnpm lab-memory:report
```

Optional: `export LAB_MEMORY_AUTO_COMMIT=1`

Cloud Phase 4 — see `upload_to_cloud/AGENT-PLATFORM.md`.
