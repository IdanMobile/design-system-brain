# TODO — Storybook to Figma Lab

The pipeline is on UniversalLayer v1.0 — a single schema covering DOM,
SVG, and image surfaces. Legacy v0.1 paths were retired after the
pixel-diff harness proved v1.0 round-trips lossless across every story.

## Bootstrap

- [x] `pnpm install`
- [x] `pnpm install:browsers`
- [x] `pnpm storybook` (live) or `pnpm --filter @lab/storybook-lab build` and serve `storybook-static/`

## Pipeline

```
Storybook DOM → packages/extractor-playwright/src/extract.ts → UniversalLayer v1.0 JSON
                                                              ↓
                packages/figma-importer-plugin/src/code.ts → renderDocumentV2 → Figma scene
                                                              ↑
                          (live Storybook DOM) ←——————————→ packages/pixel-test

Developer product:  packages/ui (@lab/ui) ← consumed by packages/developer-playground (Vite)
                    pnpm test:delivery — Storybook vs @lab/ui vs Figma (delivery-diffs/report.html)
```

## Run

| What | Command |
| --- | --- |
| Extract one story | `pnpm --filter @lab/extractor-playwright extract:button` |
| Extract every story | `pnpm --filter @lab/extractor-playwright extract:all` |
| Smoke pixel diff (3 stories) | `pnpm --filter @lab/pixel-test test` |
| Golden pixel diff (~12 stories) | `pnpm --filter @lab/pixel-test test:golden` |
| Full pixel diff (every story) | `pnpm --filter @lab/pixel-test test:all` |
| Plugin build | `pnpm --filter @lab/figma-importer-plugin build` |
| Figma renderer fix loop | `pnpm figma:iterate` (see `.cursor/skills/figma-renderer-until-pass`) |
| Figma golden gate (strict) | `pnpm figma:iterate:strict` |

The extractor and harness expect Storybook at `http://127.0.0.1:6107`
(override with `--url <base>`). Start it with either of:

```
pnpm storybook:serve          # serve the prebuilt storybook-static/ on 6107
pnpm storybook                # live dev server (vite) on 6006 — pass --url
```

If `storybook-static/` doesn't exist yet:

```
pnpm storybook:build
```

## Quality bar

Pixel-diff thresholds (`--tolerance` default `0.1%`):

- `PASS` — diff ≤ tolerance
- `WARN` — diff ≤ 4 × tolerance (typically font/subpixel AA noise)
- `FAIL` — anything else (real structural or color delta)

Every diff writes `pixel-diffs/<storyId>/{storybook,rendered,diff}.png` and
`report.html`.

## Roadmap (phased plan + validation gates)

Full step-by-step plan: **[docs/ROADMAP.md](./docs/ROADMAP.md)**  
| Role | Skill |
| --- | --- |
| Supervisor | **[.cursor/skills/project-orchestrator/SKILL.md](./.cursor/skills/project-orchestrator/SKILL.md)** |
| Executor | **[.cursor/skills/roadmap-iteration/SKILL.md](./.cursor/skills/roadmap-iteration/SKILL.md)** |

| Phase | Focus |
| --- | --- |
| **1** | Live Figma green, sequential 4-test gates, regression tiers, AI visual assess |
| **2** | Semantic contract + `ds.list`-style API on `@lab/ui` |
| **3** | Figma → JSON ingress + round-trip |
| **4** | Published DS package + CI |

**Now (Phase 1 P0):** `pnpm figma:live-iterate --strict` → 0 failures on golden set.

## Open (legacy checklist)

- [ ] Run `extract:all` against every story to repopulate `artifacts/` with v1.0 JSON
- [ ] Import a batch into Figma via the plugin's "Import folder" flow
- [ ] Manually QA the WARN cases (≥1% diff) to confirm they really are AA-only
