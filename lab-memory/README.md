# lab-memory vault

Git-backed Obsidian vault for agent semantic memory. This copy lives **inside** the main repo:

`/Users/user/Downloads/storybook-to-figma-lab/lab-memory`

## Open in Obsidian

1. Obsidian → **Open folder as vault** (folder icon, top-left)
2. Select this `lab-memory` folder
3. Dismiss the default empty "Obsidian Vault" if you no longer need it

## Folder structure

```text
lab-memory/
  README.md              ← this file
  Home.md                ← start here in Obsidian
  stories/               ← one note per storyId
  patterns/              ← reusable fix patterns
  orchestrator/          ← LLM priority briefs (dated)
  agents/                ← per-agent learnings
  runbooks/              ← figma, infra, worker-mac, human steps
  templates/             ← copy templates for new notes
```

Canonical templates also live in `upload_to_cloud/templates/` in the main repo.

## Policy

- **Never** store secrets, PATs, API keys, or `.env` content
- Agents append dated sections; humans edit for clarity
- Link artifact paths, R2 URLs, and GitHub PRs; do not embed large binaries

## Sync

This vault is part of `storybook-to-figma-lab` — commit with the main repo:

```bash
cd /Users/user/Downloads/storybook-to-figma-lab
git add lab-memory/
git commit -m "memory: <storyId> investigation"
```

Optional later: move to a private `lab-memory` GitHub repo (see `upload_to_cloud/HUMAN-PREP.md` H16).

Optional: Obsidian Git plugin for automatic commit/push.

## Who writes what

| Agent / role | Path |
| --- | --- |
| Investigator | `stories/<storyId>.md` — diagnosis section |
| Orchestrator LLM | `orchestrator/YYYY-MM-DD.md` |
| Verifier | `stories/<storyId>.md` — verification section |
| Git agent | `stories/<storyId>.md` — merge section |
| Human | `runbooks/*`, `patterns/*` curation |
| Test console hook | Auto appends metrics stub on fail/warn (`scripts/lab-memory-vault.mjs`) |
| Cursor / Gemini / Antigravity | Completes root-cause + fix-area sections in story notes |

## Cursor prompt snippet

```text
Before fixing a story, read lab-memory/stories/<storyId>.md if it exists.
After investigating, append diagnosis using lab-memory/templates/investigation.md format.
Never store secrets in the vault.
```

## Local automation (Phase 4-lite, implemented)

| Trigger | Vault update |
| --- | --- |
| Test console golden run fails | `scripts/lab-memory-vault.mjs` appends investigation stub |
| Fix / Fix all requested | Records failing stories before agent dispatch |
| Fix-all each attempt | Pre-agent metrics recorded |

Set `LAB_MEMORY_AUTO_COMMIT=1` to git-commit `lab-memory/` after each write (optional; full cloud Phase 4 adds API gate + R2).
