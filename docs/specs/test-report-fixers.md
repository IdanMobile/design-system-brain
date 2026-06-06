# TestReport + fixer routing

Tests **produce** `test-report.json`; fixers **consume** it in a sandbox.

## Fixers

| FixerId | Allowlisted code |
|---|---|
| `figma-manifest-export` | Guing plugin (external) |
| `manifest-to-contract` | `figma-manifest-to-contract.mjs` |
| `storybook-to-contract` | `extract.ts` |
| `contract-to-storybook` | `render-html.ts` |
| `contract-to-figma` | `code-v2.ts`, `scene-to-html.ts` |
| `code-creator` | `@lab/ui`, playground, bake script |
| `logic-audit` | logic specs + harness |

## Rules

- Screenshots are for **investigation only** — never change UI to match PNGs.
- Fixes must be **general algorithms**, not per-screen pixel hacks.
- Sandbox worktree by default; **regression → discard** (see `sandbox-promote.mjs`).

## Files

- `scripts/fixer-routing.mjs` — testId → fixer map
- `scripts/test-report-build.mjs` — build/write JSON + HTML reports
- `scripts/figma-screen-test-report.mjs` — figma-screen step sync
- `packages/contract/src/test-report.ts` — TypeScript types

## Artifacts

| Track | Path |
| --- | --- |
| Figma screen | `figma-screen-diffs/by-screen/<screenId>/<stepId>/test-report.{json,html}` |
| Storybook story | `<suite>/by-story/<slug>/test-report.{json,html}` |

Fixers open **test-report.html** in the test console (report link) or read JSON directly.
