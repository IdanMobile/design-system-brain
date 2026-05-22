# lab-memory vault

Git-backed Obsidian vault for agent semantic memory. Clone to worker Mac:

```bash
git clone git@github.com:<org>/lab-memory.git ~/lab/lab-memory
```

Open `~/lab/lab-memory` in Obsidian.

## Folder structure

Create these folders (templates live in main repo under `upload_to_cloud/templates/`):

```text
lab-memory/
  README.md              ← this file (copy on first setup)
  stories/               ← one note per storyId
  patterns/              ← reusable fix patterns
  orchestrator/          ← LLM priority briefs (dated)
  agents/                ← per-agent learnings
  runbooks/              ← figma, infra, worker-mac, human steps
  templates/             ← copy from upload_to_cloud/templates/
```

## Policy

- **Never** store secrets, PATs, API keys, or `.env` content
- Agents append dated sections; humans edit for clarity
- Link R2 artifact URLs and GitHub PRs; do not embed large binaries

## Sync

Commit and push after agent writes (worker supervisor or git-agent):

```bash
cd ~/lab/lab-memory
git add -A && git commit -m "memory: <storyId> investigation" && git push
```

Optional: Obsidian Git plugin for automatic sync.

## Who writes what

| Agent | Path |
| --- | --- |
| Investigator | `stories/<storyId>.md` — diagnosis section |
| Orchestrator LLM | `orchestrator/YYYY-MM-DD.md` |
| Verifier | `stories/<storyId>.md` — verification section |
| Git agent | `stories/<storyId>.md` — merge section |
| Human | `runbooks/*`, `patterns/*` curation |
