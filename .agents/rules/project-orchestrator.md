# Project orchestrator (supervisor)

When this rule applies, **read and follow** [.cursor/skills/project-orchestrator/SKILL.md](../skills/project-orchestrator/SKILL.md) **before** implementing or dispatching fixes.

- **Orient / status** → portfolio + ROADMAP → verdict + single next dispatch
- **Post-flight** → verification checklist; no "done" without command output
- **Dispatch** → worker skill or subagent per routing table; include ROADMAP § and validation commands in subagent prompt

Do not poll `test:console:agent listen` in chat. Implementation work uses worker skills (`figma-renderer-until-pass`, etc.), not the orchestrator by default.
