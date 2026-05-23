# Executive summary

**Universal Design Compiler** — side project · plan v0.1.0

---

## One sentence

Take design from **anywhere** (Figma, Storybook, images, other design systems), normalize to **UniversalLayer IR**, and emit **pixel-verified** Figma, Storybook, design-system code, and native UI — so developers only wire **business logic**.

---

## The promise

```text
Any ingress → One IR → All egresses → Pixel proof → Logic-only dev
```

---

## What makes this different

| Typical AI UI tools | This platform |
| --- | --- |
| “Looks similar” screenshots | Automated pixel CI (≤0.1% strict) |
| One-shot prompt → code | Compiler: ingress → IR → lowerers |
| Hand-edited generated UI | Immutable UI; changes via IR regen |
| Single target (React) | Figma + Storybook + DS code + native |
| LLM is the product | LLM assists; **CI is the authority** |

---

## IR stack (three layers + lock)

1. **UniversalLayer** — visual: geometry, paint, type, effects  
2. **SemanticGraph** — components, props, tokens, screens  
3. **BehaviorSpec** — interactions, states, developer API  
4. **DesignerLock** — who is truth (figma/storybook/image) + golden hash  

---

## Platform phases (high level)

| Phase | Focus |
| --- | --- |
| **P0** | IR spec (current) |
| **P1** | Visual CI + one ingress/egress pair |
| **P2** | Semantic API + behavior |
| **P3** | Figma ingress + round-trip |
| **P4** | ML data plane + image ingress |
| **P5** | Multi-platform egress (Flutter, Swift, …) |
| **P6** | Hosted product |

Detail: [`PHASES.md`](./PHASES.md).

---

## ML role (not one god-model)

Small **fleet**: layout vision, component classifier, aligner, renderer specialist, fix agent.  
Train on IR as target language; **pixel harness = reward**.  
Do not train a general LLM from scratch.

Detail: [`MODEL-STRATEGY.md`](./MODEL-STRATEGY.md).

---

## For AI

Say: **“look in LLM-platform-plan”** → read [`AGENTS.md`](./AGENTS.md).

---

## Relationship to storybook-to-figma-lab

**Independent side project.** The lab may inspire patterns (see [`APPENDIX-LAB-REFERENCE.md`](./APPENDIX-LAB-REFERENCE.md)) but is not this plan’s execution roadmap.
