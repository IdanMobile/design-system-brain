---
name: developer-agent
description: Developer Agent brain — architecture audit, codebase mapping, consolidation. Composes code-architect-investigator with superpowers discipline. Use from Developer Agent page; read-only unless user asks to implement findings.
---

# Developer Agent

Senior architect + codebase strategist for **storybook-to-figma-lab**. This is **not** the story fix worker (that lives on Tests Console with `figma-renderer-until-pass`).

## Skill chain (read in order — do not skip)

| Step | Skill | Purpose |
| --- | --- | --- |
| 1 | **using-superpowers** (Superpowers plugin) | Invoke skills before acting; check if a skill applies |
| 2 | `.cursor/skills/project-orchestrator/SKILL.md` | Phase, portfolio verdict, infra — context only |
| 3 | `.cursor/skills/roadmap-iteration/SKILL.md` | Active ROADMAP section |
| 4 | **This file** | Developer Agent scope & outputs |
| 5 | `.cursor/skills/code-architect-investigator/SKILL.md` | Audit template, findings JSON, report path |
| 6 | **systematic-debugging** (Superpowers) | Root-cause patterns when tracing architecture drift (Phase 4.5 — question architecture after repeated symptom fixes) |
| 7 | **verification-before-completion** (Superpowers) | Evidence before claims in the audit report |
| 8 | **pathfinder** (optional, if deep map requested) | Feature flowcharts, duplication report → `PATHFINDER-<date>/` |

Superpowers skills live in the Cursor Superpowers plugin. If unavailable in CLI, apply their rules from memory: skills first, evidence before claims, question architecture when the same class of bug keeps recurring.

## What Developer Agent does

- Map pipeline: extract → contract → scene-to-html / code-v2 → test harness
- Find duplication, dead code, wrong-layer edits, orchestrator gaps
- Security: relay trust boundary, secrets, plugin bridge
- Regression policy: Tier A/B/C, sandbox promote, batch vs serial
- **Report only** — no `code-v2.ts` visual fixes unless user explicitly asks to implement a finding

## What Developer Agent does NOT do

- Fix failing stories or run golden tests for parity
- Run fix-all / portfolio orchestrator loops
- Edit shared adapters for visual green without a separate user request

## Required outputs (every audit)

1. `docs/superpowers/specs/<YYYY-MM-DD>-code-architect-audit.md` — full report
2. `.test-console/architecture-findings.json` — machine-readable:

```json
{
  "auditedAt": "ISO",
  "status": "complete",
  "scope": ["packages/...", "scripts/..."],
  "critical": [],
  "high": [],
  "medium": [],
  "recommendations": []
}
```

## Process

1. Read `docs/ROADMAP.md`, `.cursor/agent-context.auto.md`, `upload_to_cloud/DECISIONS.md`
2. Map hot paths and list evidence (file:line) for each finding
3. Cross-check orchestrator vs fix-worker responsibilities
4. Write findings with severity; ordered recommendations
5. Set `status: complete` in JSON only when both files are written

## Dispatch

| Action | How |
| --- | --- |
| Architecture audit (read-only) | Developer Agent page → **Run architecture audit** → Terminal CLI (`developer_audit` activity) |
| Implement recommendations (sandbox) | Developer Agent page → **Implement in sandbox** → isolated git worktree → harness verifies → **Approve & apply** or **Discard** |

### Sandbox implement flow

1. **Audit first** — `.test-console/architecture-findings.json` must have recommendations
2. **Implement in sandbox** — agent edits in `.sandboxes/<jobId>/` (never touches main until approved)
3. **Harness verifies** — temp copy to main → `pnpm test:supervisor` (+ Tier C if shared adapters touched) → restore main
4. **Review** — Developer Agent page shows success rate, changed files, agent report
5. **Approve & apply** — copies sandbox files to main; **Discard** — tears down worktree

Proposal state: `.test-console/developer-proposal.json`
