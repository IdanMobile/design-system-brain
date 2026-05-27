---
name: figma-screen-until-pass
description: >-
  Fix Guing Figma-as-entry screens until strict 0.1% — Manifest → Contract →
  Figma live → Storybook → 4-way → Logic. Use when test console Figma tab
  dispatches Fix / Fix all, or user pastes a figma entry fix prompt.
---

# Figma screen until pass

## When to use

- Test console **Figma** tab — row **Fix** or step **Fix all**
- Prompt mentions `Figma entry ·`, `screen_1`, `figma-screen-diffs`
- User asks to close Guing manifest roundtrip gaps

**Not** for Storybook-ingress portfolio (`lab-*--default` stories) — use `figma-renderer-until-pass` instead.

## Pipeline (sequential — never skip)

1. **Manifest → Contract** — adapter only (`figma-manifest-to-contract.mjs`)
2. **Contract → Figma** — live export (`code-v2.ts`, relay + plugin)
3. **Storybook** — contract HTML + bake original PNG into `@lab/ui`
4. **4-way (strict)** — original · Figma live · Storybook · React HTML
5. **Logic audit** — spec JSON in `lab-memory/logic/specs/`

Fix the **earliest** failing/warn step only.

## Before edits

1. Read `.cursor/agent-context.auto.md`
2. Read `lab-memory/visual/patterns/figma-guing-screen-roundtrip.md`
3. Read `lab-memory/visual/investigations/active/<screenId>.md` if present
4. Open compare PNG + step `report.html` from prompt paths
5. Append investigation note (`lab-memory/templates/investigation.md`)

## Fix areas by step

| Step | Primary files |
| --- | --- |
| manifestContract | `scripts/figma-manifest-to-contract.mjs` |
| contractFigma | `packages/figma-importer-plugin/src/code-v2.ts`, adapter, `figma-screen-reference-align.mjs` |
| storybook | `scripts/bake-figma-screen-ui.mjs`, `packages/ui/src/components/Screen*/`, storybook static rebuild |
| fourWay | Triage failing **pair** in four-way report — do not assume importer |
| logic | `lab-memory/logic/specs/<screenId>.spec.json`, `figma-screen-logic-test.mjs` |

## Human-only

- Figma plugin reload after `code-v2.ts` rebuild
- Open plugin if `infra:health` shows `pluginConnected: false`

Agent runs: `pnpm infra:ensure`, tests, `pnpm test:portfolio:refresh`, Storybook/playground rebuild.

## Delivery bake rule

Storybook delivery must show **original Guing PNG**, not Figma live re-import. After `pnpm ui:bake:screen*`, always `pnpm storybook:build` and restart serve — stale static causes phantom diffs.

## Verify

```bash
pnpm test:figma:screen -- --artifact artifacts/figma-screens/<screen>.manifest.json
pnpm test:figma:screen:four-way -- --artifact artifacts/figma-screens/<screen>.manifest.json
pnpm test:portfolio:refresh
```

PASS = global **and** region ≤ 0.1% (header/phone may use 0.6% where configured).

## Patterns doc

Generalized fixes live in `lab-memory/visual/patterns/figma-guing-screen-roundtrip.md` — update after PASS.
