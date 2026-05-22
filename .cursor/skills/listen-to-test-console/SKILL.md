---
name: listen-to-test-console
description: Storybook-to-Figma test console — start dashboard, dispatch fixes via terminal CLI (not chat listen/pending). Use for "open test console", "test console cursor agent", or when user pastes a console fix prompt.
---

# Test console (CLI-driven)

Dashboard: **http://127.0.0.1:6110** — status, run actions, reports. Job completion queues a fix prompt for the **terminal CLI**, not for chat polling.

## "open test console" — start UI only

When the user says **open test console**:

1. `pnpm test:console` — detached server (must exit quickly; never block chat).
2. Optionally `pnpm test:console:agent open` — open browser only.

**Do not** run `pending` or `listen --once` in Cursor chat.

Tell the user (once, briefly) that clicking a test action opens Terminal and dispatches Cursor CLI automatically. Manual fallback:

```bash
pnpm test:console:cursor agent
```

## Terminal CLI (primary fix path)

| Command | Use |
|---------|-----|
| `pnpm test:console:cursor pending` | Print queued fix prompt (no dispatch) |
| `pnpm test:console:cursor agent` | Run `cursor agent -p` with pending prompt |
| `pnpm test:console:cursor pending --cli` | Print + dispatch background agent |

Optional terminal peek (does not ack queue):

```bash
pnpm test:console:agent open --wait
```

## When chat receives a fix command

Act in the **same turn** when the user:

- Pastes a `--- Test console → Cursor ---` block
- Says **run until pass** / **make fixes after live test**
- Was started by **`pnpm test:console:cursor agent`**

Then load `figma-renderer-until-pass` + `investigate-figma-mismatch`, fix worst story, rebuild, re-test. **No approval prompt.**

Only block for **ready** after a live plugin rebuild (one line).

## Do not

- Poll `pnpm test:console:agent pending` at chat start or after opening the console
- Run `listen` / `listen --once` in chat (`listen` exits unless `TEST_CONSOLE_ALLOW_LISTEN=1`)
- Block chat with `pnpm test:console:foreground` or `open --wait` in agent shells
- Ask for approval after a console fix message

**Terminal-only:** Fix prompts from the web console open a Terminal tab and run `cursor agent -p` there. The IDE chat stop hook is disabled — prompts do not appear in Composer.

If the user **pastes** a `--- Test console → Cursor ---` block into chat manually, treat it as an explicit fix command (same as before).

API: `http://127.0.0.1:6110`. Inbox: `.test-console/agent-inbox.json`.
