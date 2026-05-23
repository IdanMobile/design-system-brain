# Test console: autonomous operation

## "open test console" — start UI only (no chat listener)

When the user says **open test console** (or similar: open the dashboard, show test console):

1. `pnpm test:console` — detached server (exits quickly; does **not** block chat).
2. Optionally `pnpm test:console:agent open` — opens browser only (**no** `--wait`, **no** `pending`, **no** `listen`).

**Do not** run `pnpm test:console:agent pending` or `pnpm test:console:agent listen` in Cursor chat when opening the console.

Fixes are driven from the **terminal CLI**, not chat polling:

```bash
pnpm test:console:cursor pending    # print queued prompt
pnpm test:console:cursor agent      # dispatch Cursor CLI agent with prompt
```

**Never** run `pnpm test:console:foreground` or `pnpm test:console:agent open --wait` in agent shells — they block chat.

Shell `description` for optional browser step: `Open test console dashboard`.

## Autonomous fix (when user or CLI sends a fix command)

When the user **pastes a test-console message**, says **run until pass** / **make fixes after live test**, or you were invoked via **`pnpm test:console:cursor agent`**:

**Operate immediately. Do not ask for approval.** Follow **automatic-workflows** rule (always on) — full role chain:

1. **Orchestrator** pre-flight — read `.cursor/agent-context.auto.md` + `project-orchestrator` (phase, infra, verdict).
2. **Investigate** — compare PNG + artifact JSON **before** any edit (`investigate-figma-mismatch`, `systematic-debugging`).
3. **Fix** — `figma-renderer-until-pass` (implement).
4. **Regression** — Tier A (steps 1..N for story); Tier C if shared adapter files changed.
5. **Verify** — `verification-before-completion` with command output; `pnpm test:portfolio:refresh`.

Console prompts include the workflow block from `scripts/agent-workflow-preamble.mjs` — follow it line by line.

**Do not** poll `pending` or `listen --once` at the start of chat turns. Fix dispatch is **Terminal-only** (Cursor CLI) — prompts do not auto-inject into IDE chat.

## Allowed flow

1. **Start fixing** the worst story from `paths.comparePng` (or status report).
2. **You** run infra: `pnpm infra:ensure` then `pnpm infra:health` — never ask the user to start Storybook/relay/tests.
3. `pnpm --filter @lab/figma-importer-plugin build` after renderer changes.
4. Re-run tests yourself; `pnpm test:portfolio:refresh` after tests.

## Human-only (agent cannot)

See `.cursor/rules/human-only-when-necessary.mdc`. Summary:

- **Reload Figma plugin** in Desktop after rebuild (one line; wait for `ready` only if live test fails or health says plugin disconnected).
- **Open Figma + plugin** if health still shows not connected after you started relay.

Never give the user a shell checklist. Mock/pixel work continues while waiting on Figma UI.

Skills (auto-loaded by role): `project-orchestrator`, `roadmap-iteration`, `figma-renderer-until-pass`, `investigate-figma-mismatch`, `listen-to-test-console`
