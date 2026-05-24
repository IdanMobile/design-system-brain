# Lab memory (Obsidian vault)

Vault path: `lab-memory/` (open in Obsidian). Applies to **Cursor**, **Gemini CLI**, and **Antigravity** agents in this repo.

## Before investigating or fixing a story

When you know the `storyId` (test console, portfolio, or user message):

1. Read `lab-memory/stories/<storyId>.md` **if it exists** — prior diagnosis, verification, patterns.
2. If missing and you will investigate, create it from `lab-memory/templates/story.md` (fill `storyId` in title).
3. Skim linked `lab-memory/patterns/` notes referenced from the story file.

## After investigation (before code edits)

Append a dated section to `lab-memory/stories/<storyId>.md` using the structure in `lab-memory/templates/investigation.md`:

- Compare regions, root cause, recommended fix area, job/step ids, artifact paths
- Link `[[patterns/...]]` when a reusable pattern applies
- **Never** store secrets, PATs, API keys, or `.env` content in the vault

## After verify / merge (when applicable)

Append verification or merge sections using `lab-memory/templates/merge.md` shape.

## Local automation (Phase 4-lite)

Test console hooks (`scripts/lab-memory-vault.mjs`) append investigation stubs when a story **fails or warns** (metrics + artifact paths). Agents still fill **Root cause** and **Recommended fix area**.

Optional auto-commit after each vault write:

```bash
export LAB_MEMORY_AUTO_COMMIT=1
```

Full cloud Phase 4 (Investigator API gate, R2 diagnosis JSON) — see `upload_to_cloud/AGENT-PLATFORM.md`.
