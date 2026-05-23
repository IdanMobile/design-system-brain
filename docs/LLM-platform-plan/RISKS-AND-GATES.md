# Risks and gates

**Version:** 0.1.0 · 2026-05-22

---

## Technical risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| **Sim-to-real gap** (mock vs live Figma) | False confidence | Separate tolerance profiles; live worker CI |
| **Image ingress ambiguity** | Wrong structure shipped | Draft + human confirm; confidence routing |
| **Native pixel drift** | “Pixel perfect” claim breaks | Platform golden PNGs, not CSS clone |
| **ML overfit one screen** | Portfolio regressions | Family-held-out eval; regression suite |
| **Schema drift** | Broken egress | Version IR; validator in CI |
| **Generated code rot** | Devs hand-edit UI | Immutable UI policy; regen from IR |
| **Figma API changes** | Egress breaks | Pin API; abstraction layer |
| **Training data IP leak** | Legal/reputation | Consent, on-prem, no public customer fine-tune |

---

## Quality gates (operational)

| Gate | Applies | Criteria |
| --- | --- | --- |
| **Schema** | Every IR read/write | JSON Schema valid |
| **Pixel strict** | Web egress | ≤ 0.1% global + worst region |
| **Pixel profile** | Live/native | DesignerLock profile only |
| **Semantic** | P2+ | Props match BehaviorSpec |
| **Behavior** | P2+ | Playwright matrix pass |
| **Regression** | Shared adapter/model | Full golden subset pass |

---

## Go / no-go gates (phase completion)

### G0 — P0 complete

- [ ] IR schema published + validator CLI  
- [ ] 3 reference IR documents validated  
- [ ] AGENTS, GUIDELINES, ARCHITECTURE consistent  

### G1 — P1 complete

- [ ] One ingress + one egress pair green at strict pixel CI  
- [ ] 10+ screens in golden set with DesignerLock  

### G2 — P2 complete

- [ ] 5 components: SemanticGraph + BehaviorSpec + behavior CI  
- [ ] Sample app uses DS API without hand layout  

### G3 — P3 complete

- [ ] 20 Figma round-trips within strict tolerance  
- [ ] Paired dataset documented  

### G4 — P4 ML ready

- [ ] 10K+ examples in corpus  
- [ ] Specialist ≥ rule baseline on held-out set  
- [ ] Image ingress workflow operational  

### G5 — P6 beta

- [ ] One design team, 4-week dogfood  
- [ ] < 5% manual UI override rate  
- [ ] SLA documented  

---

## Open decisions

Resolve before or during noted phase:

| Decision | Phase | Options |
| --- | --- | --- |
| Single vs multi authority per screen | P0 | One lock; merge rules TBD |
| First egress pair | P1 | DOM→Figma vs DOM→React |
| First native target | P5 | Flutter vs SwiftUI |
| Image auto-accept threshold | P4 | Confidence score vs always human |
| Cloud vs on-prem default | P6 | SaaS vs VPC |

Track decisions in a `DECISIONS.md` file when the platform repo is created.

---

## Failure modes (product)

| Symptom | Likely cause | Response |
| --- | --- | --- |
| “Almost perfect” UI | Tolerance too loose | Tighten DesignerLock profile |
| Devs editing generated CSS | Immutable policy missing | Enforce lint; regen workflow |
| Model worse on new DS | Train distribution narrow | Synthetic + new family holdout |
| Figma round-trip drift | Auto-layout mapping gap | Rule fix before ML |

---

## Side project boundary (risk)

**Risk:** Lab urgency consumes platform design time, or platform docs confuse lab agents.

**Mitigation:**

- [`AGENTS.md`](./AGENTS.md) trigger phrase enters side-project mode  
- [`.cursor/rules/llm-platform-plan.mdc`](../../.cursor/rules/llm-platform-plan.mdc) routes on mention  
- No requirements from lab ROADMAP in platform PHASES  

---

## See also

- [`GUIDELINES.md`](./GUIDELINES.md)  
- [`PHASES.md`](./PHASES.md)  
- [`WORKFLOWS.md`](./WORKFLOWS.md) — W1  
