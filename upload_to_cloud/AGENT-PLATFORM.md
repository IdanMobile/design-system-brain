# Agent platform — architecture & implementation phases

Companion: [DECISIONS.md](./DECISIONS.md), [HUMAN-PREP.md](./HUMAN-PREP.md).

## North star

Open `https://console.<your-domain>` from anywhere → see agent fleet status and live message feed → orchestrator assigns Investigator → step fixer → Verifier → Git agent auto-merges → portfolio updates. Mac workers run Figma, Storybook, relay, and **Ollama (Qwen 3.6)**; cloud hosts dashboard + control plane only.

---

## Architecture

```text
┌──────────────────────── Cloudflare ────────────────────────────┐
│ Pages          → Dashboard UI (fleet, feed, portfolio)            │
│ Workers        → Control API + rules engine                       │
│ Workers AI     → Orchestrator LLM (prioritize, summarize)       │
│ Durable Object → Event bus / WebSocket fanout                     │
│ D1             → agents, jobs, events, merge queue, portfolio     │
│ R2             → PNGs, reports, vault index snapshots             │
│ Access         → GitHub OAuth                                     │
└────────────────────────────┬─────────────────────────────────────┘
                             │ WSS (workers connect outbound)
┌────────────────────────────▼─────────────────────────────────────┐
│ Mac worker(s)                                                     │
│  lab-worker-supervisor → logical agents                           │
│  Ollama (Qwen 3.6), Figma Desktop, Storybook :6107, relay :3456          │
│  Obsidian vault (~/lab/lab-memory)                                │
│  git clone of storybook-to-figma-lab                              │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                      GitHub (code + lab-memory)
```

### Memory layers

| Store | Holds | Lifetime |
| --- | --- | --- |
| D1 | Agent status, jobs, events, merge queue | Operational |
| R2 | Compare PNGs, HTML reports | Artifacts |
| GitHub | Source code | Truth |
| Obsidian vault | Diagnoses, patterns, orchestrator rationale | Long-term semantic memory |

---

## Agent roster

Each **logical agent** registers with the control plane. One **supervisor process per Mac** runs them. Idle = heartbeating; working = Ollama agent job or pnpm job for that role.

| Agent ID | Purpose | Skills (repo paths) | Capabilities |
| --- | --- | --- | --- |
| `orchestrator` | Schedule, gate, assign, verdict | `.cursor/skills/project-orchestrator/` | Cloud; rules + LLM |
| `infra` | Storybook, relay, plugin build | `pnpm infra:ensure`, `infra:health` | `infra`, `macos` |
| `investigator` | Diagnose before edit | `investigate-figma-mismatch`, systematic-debugging | `read-only` |
| `pixel-fixer` | Step 1 | scene-to-html / extract path | `pixel`, `playwright` |
| `mock-figma-fixer` | Step 2 | `figma-renderer-until-pass` (emulator) | `figma-mock` |
| `live-figma-fixer` | Step 3 | until-pass (live) | `figma-live`, `macos`, `ollama` |
| `delivery-fixer` | Step 4 | roadmap Phase 2 | `delivery` |
| `verifier` | Tier A/B/C, portfolio refresh | verification-before-completion | `test`, `regression` |
| `git-agent` | Branch, PR, merge | (new skill in Phase 7) | `git`, `github` |

---

## Agent state machine

Dashboard vocabulary:

```text
offline | starting | idle | assigned | working | waiting_human
| waiting_agent:<id> | waiting_infra | restarting | paused
| completed | failed
```

Display per card: `status`, `currentTask`, `workerNode`, `since`, `blockedBy`, optional `progress`.

---

## Message bus (event types)

Append-only events in D1 + push over WebSocket:

| Type | Direction | Purpose |
| --- | --- | --- |
| `agent.register` | Worker → cloud | id, capabilities, nodeId |
| `agent.heartbeat` | Worker → cloud | status, currentTask |
| `orchestrator.assign` | Cloud → agent | jobId, storyId, step, context |
| `agent.progress` | Agent → all | log line, phase |
| `agent.request` | Agent → agent | inter-agent ask |
| `agent.respond` | Agent → agent | structured result |
| `agent.block` | Agent → orchestrator | cannot proceed |
| `agent.human_required` | Agent → dashboard | e.g. `figma_plugin_not_connected` |
| `agent.complete` | Agent → orchestrator | outcome, artifact refs |
| `artifact.uploaded` | Worker → cloud | R2 URL |
| `orchestrator.brief` | Cloud → all | LLM summary for dashboard |

**Hard rule:** no fixer `assign` until Investigator `complete` for same job (4A).

---

## Fix pipeline (one story)

```text
1. Orchestrator (rules) picks candidate story/step
2. Orchestrator (LLM) ranks + writes brief → Obsidian + dashboard
3. assign → Investigator (always)
4. Investigator → diagnosis → Obsidian + R2
5. assign → step fixer (diagnosis attached)
6. fixer may request → Infra; may emit human_required
7. assign → Verifier (Tier A; Tier C if shared files)
8. on pass → Git agent → PR → CI → auto-merge (3B)
9. update portfolio, Obsidian timeline, orchestrator brief
```

### Auto-merge eligibility (all required)

1. Investigator `complete`
2. Verifier Tier A for story (steps 1..N)
3. If shared files touched → Tier C pass on worker
4. GitHub Actions CI: `test:pixel:golden`, `figma:iterate:strict` (live strict on worker before merge queue, not in GHA)
5. PR path allowlist for job scope
6. Max 1 open PR touching `code-v2.ts` (or other shared paths)
7. Tag `pre-agent-<jobId>` before merge; **Pause auto-merge** off

---

## Implementation phases

### Phase 0 — Baseline & bridge (1–3 days)

**Goal:** GitHub remote; local test console works on worker Mac.

| ID | Owner | Task |
| --- | --- | --- |
| 0.1 | Agent | Confirm `pnpm test:console:build && pnpm test:console` on worker |
| 0.2 | Human | Optional Tailscale for remote peek at local `:6110` |
| 0.3 | Human | `pnpm infra:ensure && pnpm infra:health` with Figma plugin connected |
| 0.4 | Agent | Add `lab-memory/runbooks/worker-mac.md` |

**Validation**

```bash
pnpm infra:health          # agentCanProceedLive: true
pnpm test:console          # http://127.0.0.1:6110
```

**Exit:** Worker runs today's lab end-to-end.

---

### Phase 1 — Control plane skeleton (1–2 weeks)

**Goal:** Workers register; dashboard lists agents.

| ID | Owner | Task |
| --- | --- | --- |
| 1.1 | Agent | `workers/lab-control/` Worker + Wrangler config |
| 1.2 | Agent | D1 schema: `workers`, `agents`, `events`, `jobs` |
| 1.3 | Agent | REST: register, heartbeat, `GET /agents` |
| 1.4 | Agent | Bearer auth via `WORKER_REGISTRATION_TOKEN` |
| 1.5 | Agent | Test console: `VITE_API_URL` + Fleet tab stub |
| 1.6 | Human | Deploy Worker + D1; set secrets |

**Validation**

```bash
curl -H "Authorization: Bearer $TOKEN" https://api.<domain>/agents
```

**Exit:** Hosted Pages shows fleet (empty or registered).

**Prerequisite:** [HUMAN-PREP.md](./HUMAN-PREP.md) gate checklist.

---

### Phase 2 — Event bus & live feed (1 week)

| ID | Task |
| --- | --- |
| 2.1 | Durable Object `EventBus`: append + broadcast |
| 2.2 | `POST /events`, `WSS /stream` |
| 2.3 | Dashboard WebSocket feed component |
| 2.4 | Supervisor v0: heartbeat-only logical agents |
| 2.5 | Human: deploy DO binding |

**Exit:** Dashboard shows live heartbeats via Access-protected URL.

---

### Phase 3 — Worker supervisor (1–2 weeks)

| ID | Task |
| --- | --- |
| 3.1 | `scripts/lab-worker-supervisor.mjs` — outbound WSS |
| 3.2 | Register agent roster + capabilities |
| 3.3 | Infra agent: `pnpm infra:ensure` on assign |
| 3.4 | Verifier agent: Tier A commands + R2 log upload |
| 3.5 | launchd plist for supervisor auto-start |
| 3.6 | Human: install plist; reboot test |

**Exit:** Remote “ensure infra” runs on worker; feed shows progress.

---

### Phase 4 — Investigator pipeline (1 week)

| ID | Task |
| --- | --- |
| 4.1 | API 409 if fixer assign without investigator complete |
| 4.2 | Assign payload: storyId, step, R2 compare URLs |
| 4.3 | Investigator: Ollama + investigate skill envelope |
| 4.4 | Diagnosis JSON schema → R2 |
| 4.5 | Git commit to `lab-memory/stories/<id>.md` |
| 4.6 | Fast-path if artifacts unchanged (`cached: true`) |

**Local Mac (implemented now):** `scripts/lab-memory-vault.mjs` writes investigation stubs when the test console records a fail/warn; set `LAB_MEMORY_AUTO_COMMIT=1` for git commits. Cloud API gate (4.1–4.3) still Phase 4.

**Exit:** Full investigator gate + vault notes.

---

### Phase 5 — Fixer agents + R2 artifacts (2 weeks)

| ID | Task |
| --- | --- |
| 5.1 | Fixer prompts include diagnosis + vault excerpt |
| 5.2 | Live fixer: serial lock; `human_required` events |
| 5.3 | Portfolio/diffs served from R2 URLs |
| 5.4 | Human: ack plugin reload in UI when needed |

**Exit:** One story completes investigate → fix → verify via cloud.

---

### Phase 6 — LLM orchestrator (1 week)

| ID | Task |
| --- | --- |
| 6.1 | Scheduler: load portfolio failures from D1 |
| 6.2 | Workers AI: prioritize using portfolio + vault index on R2 |
| 6.3 | Validate LLM output with rules before assign |
| 6.4 | Dashboard “Orchestrator brief” panel |
| 6.5 | Brief written to `vault/orchestrator/YYYY-MM-DD.md` |
| 6.6 | Human: review first 10 scheduling decisions |

**Exit:** Automated queue with LLM assist; rules block illegal steps.

---

### Phase 7 — Git agent + auto-merge (1–2 weeks)

| ID | Task |
| --- | --- |
| 7.1 | Branch `agent/<story>/<step>/<jobId>`, PR via GitHub API |
| 7.2 | `.github/workflows/agent-ci.yml` |
| 7.3 | Merge queue in D1 |
| 7.4 | Auto-merge squash + rollback tags |
| 7.5 | Shared-file PR concurrency limit |
| 7.6 | Dashboard **Pause auto-merge** toggle |
| 7.7 | Human: branch protection required checks |

**Exit:** Verifier pass can land on `main` without manual merge.

---

### Phase 8 — Full fleet UX (1 week)

| ID | Task |
| --- | --- |
| 8.1 | Fleet grid with all states |
| 8.2 | Job graph (request/respond edges) |
| 8.3 | Worker node panel (Figma connected, queue depth) |
| 8.4 | Portfolio sync: `test:portfolio:refresh` → D1 |
| 8.5 | Human: UAT from phone browser |

**Exit:** Real-time “control room” experience complete.

---

### Phase 9 — Scale (optional)

| ID | Task |
| --- | --- |
| 9.1 | Second Mac or Linux pixel worker |
| 9.2 | Capability routing (`figma-live` → Mac only) |
| 9.3 | Linux: pixel-fixer + investigator only |

---

## Agent protocol v1 (implement Phase 1–2)

Full TypeScript types should live in `packages/contract/src/agent-platform.ts` when implementation starts.

**Job payload (assign):**

```json
{
  "jobId": "uuid",
  "agentId": "live-figma-fixer",
  "storyId": "lab-button--compact",
  "step": "figmaLive",
  "diagnosis": { },
  "artifactUrls": ["https://..."],
  "vaultExcerpt": "optional markdown"
}
```

**Heartbeat:**

```json
{
  "agentId": "infra",
  "status": "idle",
  "currentTask": null,
  "workerNodeId": "mac-worker-1",
  "ts": "ISO-8601"
}
```

---

## Timeline estimate

| Block | Duration |
| --- | --- |
| Human prep | 3–7 days |
| Phases 0–2 | 2–3 weeks |
| Phases 3–5 | 4–5 weeks |
| Phases 6–8 | 3–4 weeks |

Platform build can overlap with ROADMAP §1.2 story fixes on the same worker.

---

## AI start prompts

**Phase 0 only:**

```text
Read upload_to_cloud/. Execute AGENT-PLATFORM.md Phase 0 only.
Follow DECISIONS.md. Do not edit docs/ROADMAP.md.
```

**After human prep gate:**

```text
Read upload_to_cloud/. Human prep gate is complete.
Execute Phase 1: scaffold workers/lab-control/ and D1 schema.
```

**Full platform (only when explicitly asked):**

```text
Read upload_to_cloud/ and execute phases 0–8 sequentially.
Stop and report after each phase validation.
```
