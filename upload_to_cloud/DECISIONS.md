# Locked decisions

These were chosen during planning (2026-05). Implementation should follow them unless you explicitly reopen a decision.

| # | Decision | Implication |
| --- | --- | --- |
| **1B** | **Rules + LLM orchestrator** | Hard gates in code (ROADMAP sequential tests, investigator gate, shared-file lock). LLM (Workers AI or external) only for prioritization, scheduling nuance, and human-readable fleet summaries. LLM output is validated before any `assign`. |
| **2A** | **Cloudflare-native** | Pages (dashboard UI), Workers (API), Durable Objects (WebSocket bus), D1 (state), R2 (artifacts), Access (auth), Workers AI (orchestrator LLM). |
| **3B** | **Auto-merge after Verifier + CI** | Git agent opens PR; GitHub Actions runs pixel + mock strict; merge only when Verifier Tier A/C passed on worker **and** CI green. Dashboard **Pause auto-merge** killswitch required. |
| **4A** | **Investigator always before fix** | Every fix pipeline starts with Investigator `complete`. Fast-path allowed if artifacts unchanged (`cached: true`) but event still emitted. |
| **5A** | **Ollama + Qwen 3.6 on Mac worker** | *Deferred.* Was: local Ollama on 64 GB worker. **Superseded by 6S** for solo dev. |
| **6S** | **Solo Mac + Cursor (active)** | Your existing Mac (M1 Pro 16 GB): Cursor for fix agents, local `pnpm test:console`, Figma Desktop, Obsidian `lab-memory/`. Full cloud platform (2A, Phases 1–9) **deferred** until explicit ask. |
| **+** | **Obsidian git vault** | Long-term semantic memory in `lab-memory/` in-repo (implemented). Not a replacement for D1/R2 when cloud exists. No secrets in vault. |

## Non-negotiable constraints (from main repo)

These apply to all agents regardless of cloud vs local:

- Sequential tests per story: pixel → figma mock → figma live → delivery
- Live Figma requires macOS, Figma Desktop, relay `:3456`, plugin connected
- Plugin auto-reload today is macOS-only (`scripts/figma-plugin-reload.mjs`)
- No parallel fixes after shared adapter edits (`code-v2.ts`, `scene-to-html.ts`, `extract.ts`, contract) until Tier C passes
- ~1 concurrent live Figma job per Mac worker
- Human only for Figma Desktop UI edge cases (plugin reload when automation fails)

## Explicitly out of scope for v1

- Running Figma Desktop or Ollama on Cloudflare Workers
- Replacing `docs/ROADMAP.md` with this plan
- Full Kubernetes / multi-cloud control plane before 5+ workers
