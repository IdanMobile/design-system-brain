# Run until green (autonomous)

When the user wants portfolio work, fixes, or "run until pass" — **keep going** without asking them to say continue.

## Stop condition (done)

All of the following at **strict 0.1%** (global **and** region):

1. Pixel — full portfolio
2. Figma mock — full portfolio
3. Figma live — golden set, then full portfolio if user asked for all green
4. Delivery — golden (after live golden passes gates)

Verdict **PHASE_COMPLETE** only when evidence from test reports confirms pass. See `automatic-workflows.mdc` for the fix chain.

## Do not stop for

- Permission to run the next command, test, or story
- "Should I continue?" / "Want me to fix the next one?"
- Infra startup (you run `pnpm infra:ensure` / `pnpm infra:health` — see `human-only-when-necessary.mdc`)

Within a turn: after one story fix, **immediately** start the next worst failure (read `figma-live-diffs/report.json` or portfolio snapshot). End the turn with a brief progress line, not a continue prompt.

## Only pause for (human-only)

| Blocker | Action |
| --- | --- |
| `pluginConnected: false` after relay started | One line: open Figma plugin, wait for bridge |
| Live export fails after plugin rebuild | One line: reload plugin in Desktop → user replies `ready` |
| Secrets / login / OS dialogs | User must act |

While blocked on Figma UI: continue mock/pixel/investigation work; do not idle waiting for "continue".

## Multi-turn loops (chat is one turn per message)

Chat alone cannot run forever. For unattended multi-story work, prefer:

| Scope | Mechanism |
| --- | --- |
| Whole suite | Test console **Fix all** → Terminal `run-fix-all` (`scripts/test-console-fix-all-iterate.mjs`) |
| Single story | `pnpm test:console:cursor agent` in Terminal (after-job tab from web console) |
| Long milestone | Cursor background/cloud agent with this goal in the first message |

Do **not** tell the user to type "continue" each turn when Fix all or the orchestrator can drive the loop.

## First message template (optional)

User can paste once: *Run until portfolio green at strict 0.1%. Do not ask me to continue. Only stop for Figma plugin reload/open.*

You still follow this rule even without that paste.
