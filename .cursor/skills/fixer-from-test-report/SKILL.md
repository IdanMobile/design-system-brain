---
name: fixer-from-test-report
description: Consume test-report.json from failing tests; edit only allowlisted fixer files in sandbox; no screenshot-driven UI fixes.
---

# Fixer from TestReport

See `.agents/skills/fixer-from-test-report/SKILL.md` — same content.

Tests produce **`test-report.json`**. Fixers consume it.

1. Read report → `failedTest`, `mismatches`, allowlist.
2. Sandbox worktree only (default).
3. Verify with `failedTest.verifyCommand`.
4. No PNG-as-UI fixes.

Routing: `scripts/fixer-routing.mjs`
