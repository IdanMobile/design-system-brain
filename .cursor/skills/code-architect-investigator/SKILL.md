---
name: code-architect-investigator
description: Read-only senior-dev audit for vulnerabilities, redundant code, architecture drift, and consolidation opportunities. Use post-green or post-incident — not during active fix loops.
---

# Code Architect Investigator

Read-only auditor. **Do not edit production code** during this skill unless the user explicitly asks to implement findings.

## When to use

| Trigger | Action |
| --- | --- |
| Portfolio PHASE_COMPLETE | Optional post-green audit |
| Batch regression / WORSE_METRICS incident | Root-cause architecture review |
| User asks for architecture audit | Full or scoped audit |

**Do not run in parallel** with fix-all agents touching `code-v2.ts`, `scene-to-html.ts`, `extract.ts`, or `contract`.

## Scope

1. **Security** — secrets in repo, unsafe eval, plugin bridge trust boundaries
2. **Architecture** — duplicate render paths, adapter layering, orchestrator vs agent responsibilities
3. **Consolidation** — dead code, parallel implementations, test harness duplication
4. **Regression policy** — Tier A/B/C wiring, sandbox promote gate, batch vs serial defaults

## Output

Write findings to:

- `docs/superpowers/specs/<date>-code-architect-audit.md` — human-readable report
- `.test-console/architecture-findings.json` — machine-readable summary for test console

Report template:

```markdown
# Code Architect Audit — <date>

## Executive summary
<2–3 sentences>

## Critical
- ...

## High
- ...

## Medium / consolidation
- ...

## Recommendations (ordered)
1. ...
```

JSON shape:

```json
{
  "auditedAt": "ISO",
  "scope": ["packages/figma-importer-plugin", "scripts/"],
  "critical": [],
  "high": [],
  "medium": [],
  "recommendations": []
}
```

## Process

1. Read `docs/ROADMAP.md` and `.cursor/agent-context.auto.md` for phase context
2. Map hot paths: extract → contract → scene-to-html / code-v2 → test harness
3. Grep for duplication, TODO/FIXME clusters, oversized files
4. Cross-check `upload_to_cloud/DECISIONS.md` — investigator before fix, verifier separate from fixer, no parallel shared edits
5. Emit report only — no drive-by refactors

## Dispatch

```bash
node scripts/run-code-architect-audit.mjs
# or test console job: architecture-audit
```
