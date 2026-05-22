# Human preparation checklist

Complete these **before** [AGENT-PLATFORM.md](./AGENT-PLATFORM.md) Phase 1. Phase 0 can run in parallel with early prep.

Mark items `[x]` as you finish. Do not store secrets in Obsidian or in git.

---

## Gate checklist (minimum to start Phase 1)

All must be checked:

- [ ] **H1** GitHub private repo for `storybook-to-figma-lab`
- [ ] **H2** Cloudflare account (+ custom domain optional — see [FREE-TIER.md](./FREE-TIER.md) for `pages.dev` / `workers.dev`)
- [ ] **H3** Cloudflare: Workers, R2, D1, Access, Workers AI enabled
- [ ] **H4** Cursor subscription + `agent --version` works on worker Mac
- [ ] **H5** Figma Desktop licensed and logged in on worker Mac
- [ ] **H13–H15** GitHub remote, branch protection plan, PAT/App in password manager
- [ ] **H18–H24** R2 bucket, D1 DB, Worker project, Pages project, Access app, API routes
- [ ] **H25–H29** Repo cloned on worker, plugin built and imported in Figma
- [ ] **H30–H34** Obsidian vault (`lab-memory`) cloned and opened
- [ ] **H35** Cursor CLI authenticated on worker Mac

---

## A1 — Accounts & billing

| ID | Action | Done |
| --- | --- | --- |
| H1 | Create/use GitHub account; private repo for this project | [ ] |
| H2 | Cloudflare account; custom domain optional (`*.pages.dev` / `*.workers.dev` is free) | [ ] |
| H3 | Enable Workers, R2, D1, Access, Workers AI | [ ] |
| H4 | Cursor subscription; install CLI on dev Mac: `curl https://cursor.com/install -fsS \| bash` | [ ] |
| H5 | Figma account; Figma Desktop on worker Mac | [ ] |
| H6 | (Optional) MacStadium / AWS EC2 Mac if not using home Mac Mini | [ ] |

---

## A2 — Mac worker hardware & OS

| ID | Action | Spec / notes | Done |
| --- | --- | --- | --- |
| H7 | Procure worker Mac | M4 Pro, **64 GB RAM**, 1 TB SSD, macOS 14+ | [ ] |
| H8 | Dedicated macOS user e.g. `lab-worker` | Not your daily account | [ ] |
| H9 | Install toolchain | Xcode CLT, Homebrew, Node 22, pnpm, Git, Chrome, Figma, Obsidian, Cursor | [ ] |
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
- `CURSOR_*` stays **on Mac only**, never in Cloudflare

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

## A7 — Cursor CLI on worker

| ID | Action | Done |
| --- | --- | --- |
| H35 | Authenticate Cursor CLI on worker (`agent login` per Cursor docs) | [ ] |
| H36 | Confirm `.cursor/skills/` present in repo clone | [ ] |
| H37 | Smoke test local console: `pnpm test:console:build && pnpm test:console` | [ ] |

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

## After prep

1. Update [README.md](./README.md) status table  
2. Tell AI: `Read upload_to_cloud/ and start Phase 0` (or Phase 1 if gate complete)
