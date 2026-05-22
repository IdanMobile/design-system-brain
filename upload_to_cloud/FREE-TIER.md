# Free tier strategy

Maximize **$0 cloud spend** for Phases 0–8 (solo lab, one Mac worker, 46 stories). Cloudflare + GitHub free tiers are sufficient at this scale.

**Locked stack:** [DECISIONS.md](./DECISIONS.md) § 2A (Cloudflare-native).

---

## Recommended free stack

| Layer | Service | Cost |
| --- | --- | --- |
| Dashboard UI | Cloudflare **Pages** | Free |
| Control API + WebSocket | Cloudflare **Workers** + **Durable Objects** | Free (within daily limits) |
| State | Cloudflare **D1** | Free |
| Artifacts (PNGs, reports) | Cloudflare **R2** | Free (~10 GB) |
| Auth | Cloudflare **Access** (Zero Trust free, ≤50 users) | Free |
| Orchestrator LLM briefs | **Workers AI** | Free daily quota |
| Code + CI | **GitHub** private repo + Actions | Free tier minutes |
| Semantic memory | **Obsidian** + git `lab-memory` repo | Free (skip Obsidian Sync) |
| Mac admin (optional) | **Tailscale** personal | Free |
| Worker runtime | **Your Mac** (Figma, Cursor CLI, Storybook) | Hardware you own |

---

## $0 URL path (no custom domain)

Skip domain registration until you want a branded URL.

| What | Free URL pattern |
| --- | --- |
| Dashboard | `https://<project>.pages.dev` |
| Control API | `https://<worker>.<account>.workers.dev` |

**Human prep adjustment:** [HUMAN-PREP.md](./HUMAN-PREP.md) H2 / H24 — Cloudflare account required; **custom domain optional**. Use `pages.dev` / `workers.dev` in Wrangler and Pages config.

---

## What cannot be free

| Item | Why | Cheapest option |
| --- | --- | --- |
| **Mac worker** | Figma Desktop, macOS plugin reload, live golden | Mac you already own (dedicated user) |
| **Cursor** | Cursor CLI agents | Your existing subscription |
| **Figma Desktop** | Live export tests | Free tier often enough for dev |
| **Power** | 24/7 home Mac | Small electricity cost |

**Avoid for budget:** MacStadium / AWS EC2 Mac ([HUMAN-PREP.md](./HUMAN-PREP.md) H6) unless you have no Mac to dedicate.

---

## Cloudflare free limits (watch these)

Limits change — verify in the [Cloudflare dashboard](https://dash.cloudflare.com) before production. Rough guidance for **one user, one worker**:

| Product | Free tier (typical) | Mitigation if you approach limits |
| --- | --- | --- |
| **Workers** | ~100k requests/day | Prefer WebSocket over polling; batch API calls |
| **Durable Objects** | Included with Workers plan caps | One bus DO; don’t shard early |
| **D1** | GB storage + daily read/write caps | Prune old events; heartbeat every **15–30s** not 5s |
| **R2** | ~10 GB storage, no egress fee to Workers | Lifecycle delete old diff runs; keep latest per story |
| **Pages** | Generous bandwidth; build minutes/month | Build on push only |
| **Workers AI** | Daily neuron/request quota | **Rules-first** scheduler; LLM every **5–15 min** not every assign |
| **Access** | 50 users on Zero Trust free | Enough for solo + small team |

---

## GitHub free tier

| Use | Notes |
| --- | --- |
| Private repo | Free |
| **Actions** on PRs | Free tier **minutes/month** on private repos |
| Auto-merge | Free (API + branch protection) |

**CI scope (keep minutes low):** run **pixel + mock strict** on PR only. **Live Figma strict** runs on Mac worker before merge queue — not in GitHub Actions (no Figma in GHA). See [AGENT-PLATFORM.md](./AGENT-PLATFORM.md) Phase 7.

---

## Workers AI vs paid LLM (decision 1B)

| Mode | Cost | When |
| --- | --- | --- |
| **Workers AI only** | Free quota | Default: orchestrator brief + priority hints |
| **Rules-only fallback** | $0 | If quota exhausted — scheduler still works |
| External API (OpenAI/Anthropic) | Paid | Only if you explicitly opt in later |

Implement: try Workers AI → on quota error, emit brief from rules + portfolio counts only.

---

## Cost-control defaults (implement in Phase 1+)

1. **Heartbeats:** 30s interval when idle; 10s when `working`
2. **Event retention:** delete or archive D1 events older than 30 days
3. **R2 lifecycle:** delete artifact prefixes older than 14 days (keep `latest/` per story)
4. **LLM:** max 1 orchestrator brief per 10 minutes unless human triggers refresh
5. **Dashboard:** WebSocket for feed; no 1s polling on `/api/state`
6. **GitHub Actions:** path filters — only run when `packages/**` or `scripts/**` change

---

## Optional paid upgrades (later)

| Upgrade | When |
| --- | --- |
| Custom domain | Branding (~$10–15/yr) |
| Cloud Mac | No home Mac to leave on 24/7 |
| R2 over ~10 GB | Long history of all diff PNGs |
| Obsidian Sync | You want mobile vault without git |
| Second Mac worker | Phase 9 throughput |

---

## Phase 0 shortcut (all free)

Before Cloudflare Phase 1:

1. GitHub private repo (free)
2. Local Mac worker + `pnpm test:console` (free)
3. **Tailscale** on Mac + laptop to peek at `:6110` (free)

No Cloudflare spend until Phase 1.

---

## Checklist: “are we still free?”

Before each phase deploy:

- [ ] No custom domain required yet (`pages.dev` / `workers.dev` OK)
- [ ] No MacStadium / EC2 Mac provisioned
- [ ] No external LLM API keys in Workers
- [ ] R2 lifecycle or manual cleanup documented
- [ ] GitHub Actions workflow scoped (not full live strict every push)
- [ ] Workers AI calls rate-limited in orchestrator code

---

## Related docs

- [HUMAN-PREP.md](./HUMAN-PREP.md) — accounts to create
- [AGENT-PLATFORM.md](./AGENT-PLATFORM.md) — what gets deployed where
- [DECISIONS.md](./DECISIONS.md) — locked architecture
