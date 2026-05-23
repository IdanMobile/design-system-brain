# Appendix — lab reference (optional)

**Version:** 0.1.0 · 2026-05-22

This appendix describes **patterns from storybook-to-figma-lab** that may inform the LLM platform. The lab is **not a dependency**, **not a backlog**, and **not** synchronized with platform phases P0–P6.

---

## What the lab is

A research/execution repo proving:

- Storybook DOM → UniversalLayer JSON (extract)  
- JSON → Figma (plugin renderer)  
- Pixel / mock / live / delivery CI  
- Agent-driven fix loops  

It lives separately under `docs/ROADMAP.md` in that repository.

---

## Patterns worth reusing (conceptual)

| Lab pattern | Platform use |
| --- | --- |
| UniversalLayer v1 visual contract | P0 schema starting point |
| Sequential visual tests (pixel → mock → live) | P1 CI inspiration |
| Regional diff hotspots | Same reward signal for RLVR |
| Strict 0.1% tolerance concept | Default DesignerLock profile |
| Lossless extract (computed styles, sorted children) | Ingress teacher design |
| Fix loop (failure artifact → patch → re-test) | P4 fix triple logging |
| Delivery 3-way idea | Multi-target parity concept |

---

## What not to port blindly

| Lab artifact | Why cautious |
| --- | --- |
| `code-v2.ts` rule explosion | Platform may use ML lowerer + smaller rule core |
| Live Figma Desktop requirement | Product may offer mock-only tier |
| Test console / Fix all | Platform needs its own orchestration (P6) |
| Lab story portfolio (48 stories) | Platform golden set is separate |
| ROADMAP phase numbers | Use P0–P6 only for platform |

---

## Conceptual mapping (not 1:1 schedule)

| Lab concept | Platform phase |
| --- | --- |
| Visual contract | P0 |
| One ingress + one egress + CI | P1 |
| Semantic / logic audit docs | P2 |
| Figma ingress (roadmap “later”) | P3 |
| ML logging from fix loops | P4 |

**No timeline coupling** — platform moves independently.

---

## If implementing platform code later

Recommended: **new repository** (`llm-platform` or similar) with:

- `@platform/ir` — schema from P0  
- `@platform/ci` — pixel + schema gates  
- Ingress/egress packages per target  

Keep `docs/LLM-platform-plan/` as the plan source until migration.

---

## When AI should read this file

Only when:

- User asks how lab relates to platform, or  
- [`WORKFLOWS.md`](./WORKFLOWS.md) W9 reference lab patterns  

Otherwise prefer [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`PHASES.md`](./PHASES.md).

---

## See also

- [`AGENTS.md`](./AGENTS.md) — side project boundary  
- [`GUIDELINES.md`](./GUIDELINES.md) §1  
