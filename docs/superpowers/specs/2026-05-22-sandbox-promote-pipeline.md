# Sandbox promote pipeline

**Date:** 2026-05-22  
**Status:** Implemented (Phase A + optional worktree)

## Problem

Batch fix-all agents can edit shared adapters (`code-v2.ts`) and regress many stories at once with no automatic rollback.

## Solution

Verifier separate from fixer — harness compares metrics before/after each batch round (or serial attempt) and discards edits when any story regresses.

## Phase A — restore on main (default)

1. **Baseline** — `captureSuiteMetrics` for remaining failing stories before agent
2. **Agent** — fixer runs (Cursor CLI)
3. **Build + re-test** — harness runs plugin build and per-story tests
4. **Evaluate** — `evaluatePromotion(baseline, after)`
5. **Discard** — `git restore` changed files when `discard === true`
6. **Promote** — keep edits when improved and none worse

Serial mode: auto-restore on supervisor `WORSE_METRICS`.

## Phase B — optional worktree (`FIX_ALL_SANDBOX=worktree`)

1. Create git worktree under `.sandboxes/<jobId>`
2. Agent runs in worktree (`runManagedAgent.workspaceRoot`)
3. Promote changed files to main before build/test
4. Teardown worktree after promote or discard

## Batch safety

- Track consecutive batch regressions
- After **2** consecutive discards → stop batch, return `suggestSerial: true`
- Portfolio orchestrator retries with `FIX_ALL_SERIAL=1`

## Env flags

| Variable | Effect |
| --- | --- |
| `FIX_ALL_SERIAL=1` | One story at a time (default when ≤1 story) |
| `FIX_ALL_SANDBOX=main` | Disable worktree isolation (git-restore gate on main only) |
| `FIX_ALL_SANDBOX=worktree` | Explicit worktree (default when unset) |

## Files

- `scripts/sandbox-promote.mjs` — metrics, evaluate, git restore
- `scripts/sandbox-worktree.mjs` — worktree create/teardown/promote
- `scripts/test-console-fix-all-iterate.mjs` — batch + serial wiring
- `scripts/test-console-portfolio-orchestrator.mjs` — serial retry on suggestSerial

## Promote criteria

- **Discard:** any story worse (status downgrade, percent +0.01%, or hotspot +0.01%)
- **Promote:** no worse AND (more passes OR fewer fails OR any story improved)
- **Neutral:** edits kept but no measurable improvement (logged)

## Related

- Regression tiers: Tier A/B/C after story pass
- Code architect investigator: post-incident read-only audit (`.cursor/skills/code-architect-investigator/SKILL.md`)
