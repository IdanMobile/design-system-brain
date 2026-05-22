---
name: roadmap-iteration
description: >-
  Execute docs/ROADMAP.md with the right lab + Superpowers skills, validation
  commands, and regression tiers. Use when working a roadmap phase, planning the
  next fix iteration, or after test-console dispatches a fix.
---

# Roadmap iteration

**Plan:** [docs/ROADMAP.md](../../../docs/ROADMAP.md) — phases, checkboxes, validation gates.

**Supervisor:** [.cursor/skills/project-orchestrator/SKILL.md](../project-orchestrator/SKILL.md) — status, review, dispatch. Load orchestrator first for "what's next" or multi-step campaigns; load this skill when executing a specific ROADMAP §.

## Skill load order (every iteration)

1. **project-orchestrator** (optional) — orient / post-flight / dispatch when managing the project.
2. **This skill** — pick phase + validation gate.
3. **Lab skills** (repo) — domain workflow.
4. **Superpowers** (plugin) — process discipline.

```
project-orchestrator → roadmap-iteration → figma-renderer-until-pass + investigate-figma-mismatch
                      → using-superpowers (if unsure which skill applies)
                      → systematic-debugging (before any fix)
                      → verification-before-completion (before claiming done)
```

## Lab skills (this repo)

| Skill | Path | When |
| --- | --- | --- |
| **project-orchestrator** | `.cursor/skills/project-orchestrator/SKILL.md` | Status, review, dispatch |
| **roadmap-iteration** | `.cursor/skills/roadmap-iteration/SKILL.md` | Map task → phase → gates |
| **figma-renderer-until-pass** | `.cursor/skills/figma-renderer-until-pass/SKILL.md` | `run until pass`, live/mock fix loops, console fix |
| **investigate-figma-mismatch** | `.cursor/skills/investigate-figma-mismatch/SKILL.md` | Compare PNG, artifact JSON, root cause |
| **listen-to-test-console** | `.cursor/skills/listen-to-test-console/SKILL.md` | Open console, `test:console:cursor agent` |

References: `figma-renderer-until-pass/reference.md`, `investigate-figma-mismatch/reference.md`.

**Workspace rule:** `.cursor/rules/test-console-autonomous.mdc` — fix immediately; no chat `listen`/`pending`.

## Superpowers skills (Cursor plugin)

Enable in `.cursor/settings.json` → `"superpowers": { "enabled": true }`. Update: `/plugin-update superpowers`.

| Superpowers skill | Use in roadmap |
| --- | --- |
| `using-superpowers` | Start of session; pick skills deliberately |
| `systematic-debugging` | **Before** editing `code-v2.ts`, `scene-to-html.ts`, extract — Phase 1.2 |
| `verification-before-completion` | **After** each validation block — must run commands, not assume |
| `test-driven-development` | Phase 2+ unit tests; new contract/semantic types |
| `writing-plans` / `executing-plans` | Multi-story campaigns (Phase 1.2 sweep, Phase 2 pilot) |
| `brainstorming` | Platform/contract design only — not per-pixel tweaks |
| `dispatching-parallel-agents` | Independent stories **only** if no shared file touched |
| `requesting-code-review` / `code-reviewer` | After large `code-v2` or `scene-to-html` refactors |
| `finishing-a-development-branch` | Phase gate complete → merge/PR choice |

Deprecated Superpowers **commands** (`/brainstorm`, `/write-plan`) — use **skills** via chat, not slash commands.

## Phase → skills → validation

### Phase 1.2 — Live Figma green

| Step | Skills | Chat prompt (optional) |
| --- | --- | --- |
| Investigate worst story | `systematic-debugging`, `investigate-figma-mismatch` | `make fixes after live test` |
| Fix + rebuild | `figma-renderer-until-pass` | (autonomous if console dispatched) |
| Prove done | `verification-before-completion` | `pnpm figma:live-iterate --strict` exit 0 |

### Phase 1.3–1.4 — Gates + regression

| Step | Skills | Notes |
| --- | --- | --- |
| Implement gates | `writing-plans` if multi-file | Update lab skills when done (see ROADMAP skill updates) |
| Verify gate | `verification-before-completion` | Block step 3 when step 2 fail |
| Shared-file fix | `figma-renderer-until-pass` + Tier C | `pnpm test:regression` |

### Phase 1.5 — AI visual assessment

| Step | Skills | Notes |
| --- | --- | --- |
| Build harness | `test-driven-development` | Read `result.json` → `aiAssessment` |
| Fix with AI notes | `investigate-figma-mismatch` + assessment in prompt | Update `figma-renderer-until-pass` when wired |

### Phase 2 — Semantic / `ds.list`

| Step | Skills | Notes |
| --- | --- | --- |
| Design API | `brainstorming` → spec in `docs/superpowers/specs/` | Not pixel-fix session |
| Implement | `test-driven-development`, `executing-plans` | Delivery golden = ship gate |
| Review | `requesting-code-review` | |

### Phase 3–4

| Phase | Skills |
| --- | --- |
| Figma ingress | `brainstorming`, `writing-plans`, `systematic-debugging` |
| CI / publish | `verification-before-completion`, `finishing-a-development-branch` |

## Regression tiers (mandatory after fixes)

From ROADMAP — agent must run without being asked when shared code changes:

| Tier | When | Commands |
| --- | --- | --- |
| **A** | Any story fix at step N | Re-run steps `1..N` for **that** `--story` |
| **B** | Component family touched | All `lab-<component>--*` stories |
| **C** | `code-v2.ts`, `scene-to-html.ts`, `extract.ts`, contract | `pnpm test:regression` |

Tier A/B via `pnpm test:regression -- --tier a|b --story <id> --suite <step>`.

## Sequential four tests (per story)

Do not skip. Order: pixel → figma mock → figma live → delivery.

Portfolio: `test-portfolio/report.html`. After fix at step N, re-run **1..N** for that story (Tier A).

## Precise iteration loop (one story)

```text
1. roadmap-iteration     → confirm phase + gate
2. systematic-debugging  → compare PNG + JSON, no code yet
3. investigate-figma-mismatch → classify: extract | scene-to-html | code-v2
4. [edit]
5. plugin build (if code-v2)
6. infra:ensure + live test (human ready only if Figma bridge fails)
7. figma-renderer-until-pass → --story re-test
8. Tier A/B/C regression
9. verification-before-completion → strict golden or phase validation
```

## Skill updates (keep in sync with ROADMAP)

When completing roadmap items, update lab skills in the same PR:

| ROADMAP item | Update these skills |
| --- | --- |
| 1.3 Sequential gates | `figma-renderer-until-pass`, `roadmap-iteration`, `test-console-agent-bridge` prompts |
| 1.4 `test:regression` | `figma-renderer-until-pass`, `roadmap-iteration` |
| 1.5 AI assessment | `investigate-figma-mismatch`, `figma-renderer-until-pass` (read `aiAssessment`) |
| 2.x Semantic API | New `.cursor/skills/semantic-delivery/SKILL.md` (create) |
| Phase 1 gate done | `figma-renderer-until-pass/reference.md` thresholds + golden list |

Track checkbox: [ ] in `docs/ROADMAP.md` § Skill maintenance.

## Figma plugin (separate from Superpowers)

Official Figma MCP + skills under Cursor plugin `figma` — use for **Figma file** work, not lab pixel loop:

- `figma-use` before `use_figma`
- Lab importer: `packages/figma-importer-plugin/`

Do not confuse with `figma-renderer-until-pass` (lab harness).
