# Upload to cloud — agent platform plan

Self-contained plan for hosting the **test console dashboard** on the cloud, running a **Mac worker fleet** with specialized agents, and connecting everything to **GitHub**. This folder is **separate** from `docs/ROADMAP.md` (visual pipeline / design system work).

## When you are ready

Point the AI at this folder and say something like:

```text
Read upload_to_cloud/ and start Phase 0. Human prep items H1–H35 are done (or list what's still open).
Do not change docs/ROADMAP.md unless I ask.
```

Or for a specific phase:

```text
Execute upload_to_cloud/AGENT-PLATFORM.md Phase 1 only.
Follow locked decisions in upload_to_cloud/DECISIONS.md.
```

## Read order

| File | Purpose |
| --- | --- |
| [DECISIONS.md](./DECISIONS.md) | Locked architecture choices (do not re-litigate without explicit ask) |
| [FREE-TIER.md](./FREE-TIER.md) | **$0 cloud strategy** — free URLs, limits, what can’t be free |
| [HUMAN-PREP.md](./HUMAN-PREP.md) | **You** do these before agent implementation phases |
| [AGENT-PLATFORM.md](./AGENT-PLATFORM.md) | Architecture, agent roster, phases 0–9, validation gates |
| [templates/](./templates/) | Obsidian vault skeleton for semantic memory (`lab-memory` repo) |

## Relationship to this repo

| Concern | Where it lives |
| --- | --- |
| Pixel-perfect pipeline, `@lab/ui`, story fixes | `docs/ROADMAP.md` |
| Cloud dashboard, worker fleet, orchestrator, auto-merge | **This folder** |
| Today's local test console | `pnpm test:console` (evolves into cloud control plane) |

The agent platform **enables** ROADMAP work at scale; it does not replace ROADMAP validation commands.

## Human prep gate

Do **not** start Phase 1 code until [HUMAN-PREP.md](./HUMAN-PREP.md) § Gate checklist is satisfied (minimum: GitHub, Cloudflare, Mac worker, Figma plugin, Cursor CLI, vault repo).

## Status

| Phase | Status |
| --- | --- |
| Plan written | Done |
| Human prep | Not started |
| Phase 0+ implementation | Not started |

Update this table as you progress.
