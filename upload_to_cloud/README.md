# Upload to cloud — agent platform plan

Self-contained plan for hosting the **test console dashboard** on the cloud, running a **Mac worker fleet** with specialized agents, and connecting everything to **GitHub**. This folder is **separate** from `docs/ROADMAP.md` (visual pipeline / design system work).

## Active path (chosen): solo Mac

**Cloud platform is deferred.** You are working on your **existing Mac** (M1 Pro, 16 GB):

| Piece | Where |
| --- | --- |
| Fixes | **Cursor** IDE + `pnpm test:console:cursor agent` |
| Tests | Local test console `pnpm test:console` |
| Memory | Obsidian **`lab-memory/`** (auto notes on test fail) |
| Figma live | Figma Desktop on this Mac |

Prep checklist: [HUMAN-PREP.md](./HUMAN-PREP.md) § **Solo Mac gate**  
Runbook: [`lab-memory/runbooks/worker-mac.md`](../lab-memory/runbooks/worker-mac.md)

Do **not** start Cloudflare / Ollama / 64 GB worker prep unless you explicitly reopen the cloud plan.

---

## Cloud plan (reference — not active)

When you are ready for Phases 1–9:

```text
Read upload_to_cloud/ and start Phase 1.
Follow locked decisions in upload_to_cloud/DECISIONS.md.
Do not change docs/ROADMAP.md unless I ask.
```

## Read order

| File | Purpose |
| --- | --- |
| [DECISIONS.md](./DECISIONS.md) | Locked architecture choices |
| [HUMAN-PREP.md](./HUMAN-PREP.md) | Solo Mac gate (active) + cloud prep (deferred) |
| [FREE-TIER.md](./FREE-TIER.md) | $0 cloud strategy (when/if cloud) |
| [AGENT-PLATFORM.md](./AGENT-PLATFORM.md) | Cloud architecture, phases 0–9 |
| [templates/](./templates/) | Obsidian vault templates |

## Relationship to this repo

| Concern | Where it lives |
| --- | --- |
| Pixel-perfect pipeline, `@lab/ui`, story fixes | `docs/ROADMAP.md` |
| Cloud dashboard, worker fleet, orchestrator | **This folder (deferred)** |
| Today's workflow | `pnpm test:console` + Cursor + `lab-memory/` |

## Status

| Track | Status |
| --- | --- |
| **Solo Mac** (Cursor + Obsidian + local console) | **Active** |
| Cloud plan written | Done (reference) |
| Cloud human prep (H2–H24, Ollama) | **Deferred** |
| Cloud Phase 1+ implementation | **Not started** |

Update this table if you switch back to cloud.
