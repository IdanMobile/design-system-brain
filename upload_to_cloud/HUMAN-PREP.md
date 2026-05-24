# Human preparation checklist

**Active path (chosen):** **Solo Mac** — your existing machine (M1 Pro, 16 GB), **Cursor** for agents, **Obsidian** `lab-memory/`, local test console. **Ignore full cloud prep** (Cloudflare, Ollama, 64 GB worker) unless you explicitly reopen it.

Cloud fleet prep (H2–H24, Ollama A7) is **deferred** — kept below for reference only.

Phase 0 = local lab on your Mac ([`lab-memory/runbooks/worker-mac.md`](../lab-memory/runbooks/worker-mac.md)). Phase 1+ cloud code in [AGENT-PLATFORM.md](./AGENT-PLATFORM.md) is **not started**.

Mark items `[x]` as you finish. Do not store secrets in Obsidian or in git.

---

## Solo Mac gate (what you need now)

- [x] **H1** GitHub repo for `storybook-to-figma-lab`
- [ ] **H5** Figma Desktop installed and logged in
- [ ] **H25–H28** Repo on Mac, plugin built and imported in Figma
- [ ] **H30–H34** Obsidian vault at `lab-memory/` opened ([`lab-memory/README.md`](../lab-memory/README.md))
- [ ] **S1** Cursor subscription (Pro or Ultra if you hit limits)
- [ ] **S2** `pnpm install` + `pnpm infra:health` → `agentCanProceedLive: true` with plugin connected
- [ ] **S3** `pnpm test:console:build && pnpm test:console` → http://127.0.0.1:6110
- [ ] **S4** Cursor CLI works: `pnpm test:console:cursor pending` (optional: `agent --version`)

**Daily fix loop:** test console → fail → `pnpm test:console:cursor agent` → Obsidian shows auto notes in `lab-memory/stories/`.

---

## Cloud gate (deferred — skip for now)

Complete these **before** [AGENT-PLATFORM.md](./AGENT-PLATFORM.md) Phase 1 **only if** you return to the cloud platform:

- [x] **H1** GitHub private repo for `storybook-to-figma-lab`
- [ ] **H2** Cloudflare account (+ custom domain optional — see [FREE-TIER.md](./FREE-TIER.md) for `pages.dev` / `workers.dev`)
- [ ] **H3** Cloudflare: Workers, R2, D1, Access, Workers AI enabled
- [ ] **H4** Ollama installed + Qwen 3.6 model pulled on worker Mac
- [ ] **H5** Figma Desktop licensed and logged in on worker Mac
- [ ] **H13–H15** GitHub remote, branch protection plan, PAT/App in password manager
- [ ] **H18–H24** R2 bucket, D1 DB, Worker project, Pages project, Access app, API routes
- [ ] **H25–H29** Repo cloned on worker, plugin built and imported in Figma
- [ ] **H30–H34** Obsidian vault (`lab-memory`) cloned and opened
- [ ] **H35** Ollama serving Qwen 3.6; agent smoke test passes on worker Mac

---

## A1 — Accounts & billing

| ID | Action | Done |
| --- | --- | --- |
| H1 | Create/use GitHub account; private repo for this project | [ ] |
| H2 | Cloudflare account; custom domain optional (`*.pages.dev` / `*.workers.dev` is free) | [ ] |
| H3 | Enable Workers, R2, D1, Access, Workers AI | [ ] |
| H4 | Install Ollama on worker Mac: `brew install ollama`; start service: `ollama serve` | [ ] |
| H5 | Figma account; Figma Desktop on worker Mac | [ ] |
| H6 | (Optional) MacStadium / AWS EC2 Mac if not using home Mac Mini | [ ] |

---

## A2 — Mac worker hardware & OS

| ID | Action | Spec / notes | Done |
| --- | --- | --- | --- |
| H7 | Procure worker Mac | M4 Pro, **64 GB RAM**, 1 TB SSD, macOS 14+ | [ ] |
| H8 | Dedicated macOS user e.g. `lab-worker` | Not your daily account | [ ] |
| H9 | Install toolchain | Xcode CLT, Homebrew, Node 22, pnpm, Git, Chrome, Figma, Obsidian, Ollama | [ ] |
| H10 | Playwright browsers | In repo: `pnpm install:browsers` | [ ] |
| H11 | Reliability | Ethernet, disable sleep on AC, optional UPS | [ ] |
| H12 | Admin access only | Screen Sharing or Tailscale (not public internet) | [ ] |

---

## A3 — GitHub

| ID | Action | Done |
| --- | --- | --- |
| H13 | Push repo to GitHub private remote | [ ] |
| H14 | Branch protection on `main`: require PR + status checks (wire checks in Phase 7) | [ ] |
| H15 | PAT or GitHub App: repo + PR merge scopes → password manager only | [ ] |
| H16 | Private repo **`lab-memory`** for Obsidian vault (or use `docs/memory/` in main repo) | [ ] |
| H17 | Stub `.github/workflows/agent-ci.yml` (filled in Phase 7) | [ ] |

---

## A4 — Cloudflare

| ID | Action | Done |
| --- | --- | --- |
| H18 | R2 bucket `lab-artifacts` | [ ] |
| H19 | D1 database `lab-control` — save database ID | [ ] |
| H20 | Workers project `lab-control-api` | [ ] |
| H21 | Pages project `lab-console` (empty build OK initially) | [ ] |
| H22 | Cloudflare Access: GitHub OAuth on Pages + API | [ ] |
| H23 | Generate worker registration token (long random) → password manager | [ ] |
| H24 | Routes: custom domain **or** `<project>.pages.dev` + `<worker>.workers.dev` ([FREE-TIER.md](./FREE-TIER.md)) | [ ] |

Suggested Wrangler secret names (Phase 1):

- `WORKER_REGISTRATION_TOKEN`
- `GITHUB_TOKEN` (Phase 7)
- `OLLAMA_*` stays **on Mac only**, never in Cloudflare (default host `http://127.0.0.1:11434`)

---

## A5 — Figma & plugin on worker Mac

| ID | Action | Done |
| --- | --- | --- |
| H25 | Clone repo to e.g. `~/lab/storybook-to-figma-lab`; `pnpm install` | [ ] |
| H26 | `pnpm --filter @lab/figma-importer-plugin build` | [ ] |
| H27 | Figma → Plugins → Development → Import plugin from repo manifest | [ ] |
| H28 | Open **Universal JSON Importer Lab**; keep Figma running after login | [ ] |
| H29 | Add runbook `lab-memory/runbooks/figma-plugin.md` | [ ] |

Verify:

```bash
cd ~/lab/storybook-to-figma-lab
pnpm infra:ensure && pnpm infra:health
# agentCanProceedLive: true after plugin connected
```

---

## A6 — Obsidian vault (semantic memory)

| ID | Action | Done |
| --- | --- | --- |
| H30 | Clone `lab-memory` to e.g. `~/lab/lab-memory` | [ ] |
| H31 | Obsidian → Open folder as vault | [ ] |
| H32 | Copy folder structure from [templates/vault-README.md](./templates/vault-README.md) | [ ] |
| H33 | Enable git sync (manual or Obsidian Git plugin) | [ ] |
| H34 | Policy: no secrets, PATs, or `.env` in vault | [ ] |

---

## A7 — Cursor on your Mac (solo path)

| ID | Action | Done |
| --- | --- | --- |
| S1 | Cursor subscription; Cursor IDE on this Mac | [ ] |
| H36 | Confirm `.cursor/skills/` present in repo | [ ] |
| H37 | Smoke test: `pnpm test:console:build && pnpm test:console` | [ ] |
| S4 | Terminal dispatch: `pnpm test:console:cursor agent` after a failing test | [ ] |

Fix agents run via **Cursor CLI** (not Ollama on 16 GB RAM). Optional: Gemini CLI from test console settings.

---

## A7b — Ollama + Qwen 3.6 (cloud worker only — deferred)

<details>
<summary>Only if you later buy a 24 GB+ Mac worker and skip Cursor for local LLM</summary>

Local LLM runs fixer/investigator agents on a **dedicated** worker Mac. Cloud orchestrator briefs still use Workers AI ([DECISIONS.md](./DECISIONS.md) § 1B / 2A).

| ID | Action | Done |
| --- | --- | --- |
| H35 | Pull Qwen 3.6; confirm `ollama list` shows the model | [ ] |

**Default model:** `batiai/qwen3.6-35b` — `:q6` on 64 GB worker, `:iq4` on 24 GB+.

```bash
brew install ollama && brew services start ollama
ollama pull batiai/qwen3.6-35b:iq4   # 24 GB+ Mac
```

Not recommended on **16 GB** (M1 Pro) — use Cursor instead.

</details>

---

## A7 legacy — Ollama section (reference)

<details>
<summary>Original Ollama prep (superseded by solo Cursor path)</summary>

**Default model:** `batiai/qwen3.6-35b` (Qwen 3.6 35B-A3B MoE — strong for agentic coding, runs fully local).

Pick a quant tag for your RAM (worker spec is 64 GB — `:q6` recommended):

| Tag | Disk | Min RAM | Notes |
| --- | --- | --- | --- |
| `:iq4` | ~18 GB | 24 GB | Good default; native tool calling |
| `:q6` | ~27 GB | 36 GB | **Recommended for 64 GB worker** — best on-device quality |
| `:iq3` | ~13 GB | 16 GB | Smaller Macs only; weaker tool JSON |

```bash
# Install + pull (64 GB worker — use q6)
brew install ollama
ollama serve   # or: brew services start ollama
ollama pull batiai/qwen3.6-35b:q6

# Smoke test
ollama run batiai/qwen3.6-35b:q6 "Reply with exactly: OK"
curl -s http://127.0.0.1:11434/api/tags | head
```

**Env vars (Mac only, optional overrides):**

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama API base |
| `OLLAMA_MODEL` | `batiai/qwen3.6-35b:q6` | Model tag for agent dispatch |

Implementation note: cloud Phase 3 would add an Ollama adapter; **solo path uses Cursor CLI today.**

</details>

---

## A8 — Security

| ID | Action | Done |
| --- | --- | --- |
| H38 | Separate password for worker Mac vs personal | [ ] |
| H39 | GitHub PAT minimally scoped | [ ] |
| H40 | Cloudflare Access on all console/API URLs | [ ] |
| H41 | No inbound ports on Mac; worker connects **outbound** to Cloudflare | [ ] |
| H42 | Plan dashboard **Pause auto-merge** toggle (built Phase 7) | [ ] |

---

## Ownership

| Work | Human | AI agent |
| --- | --- | --- |
| Accounts, hardware, Figma UI | ✓ | |
| Cloudflare dashboard first deploy | ✓ (first time) | assist |
| Worker/D1/Worker code | | ✓ |
| Plugin reload when alerted | ✓ | |
| Pause auto-merge | ✓ | builds UI |

---

## After prep (solo Mac)

1. Work from [`docs/ROADMAP.md`](../docs/ROADMAP.md) and local test console  
2. Memory in Obsidian `lab-memory/` (auto-updated on test fail)  
3. Revisit cloud only when you say: `Read upload_to_cloud/ and start Phase 1`

## After prep (cloud — deferred)

1. Update [README.md](./README.md) status table  
2. Tell AI: `Read upload_to_cloud/ and start Phase 0` (or Phase 1 if cloud gate complete)
