# Human preparation and roles

**Version:** 0.1.0 · 2026-05-22

---

## Roles

| Role | Responsibility |
| --- | --- |
| **Designer** | Source layouts, naming, variants, sign-off goldens |
| **Design engineer** | Tokens, component taxonomy, IR naming conventions |
| **Platform engineer** | IR, ingress/egress, CI, plugin/API infrastructure |
| **App developer** | Business logic, data hooks, callbacks only (P2+) |
| **ML engineer** | Datasets, fine-tune, eval (P4+) |
| **Design ops / PM** | Phase gates, dogfood, change management |

---

## Designer checklist

- [ ] Deliverables exist as named screens/components with variants (loading, empty, error, filled)
- [ ] Layer naming supports semantic detection (component roots, variant labels)
- [ ] Fonts and assets available at extract/import time
- [ ] For Figma ingress (P3): structure mirrors component taxonomy
- [ ] Sign off golden PNG when CI passes for locked screens
- [ ] Declare authority when multiple sources exist (Figma vs Storybook vs image)

---

## Design engineer checklist

- [ ] Token catalog defined and mappable to IR `tokens`
- [ ] Component type enum agreed (Button, Input, List, …)
- [ ] Variant matrix documented per component
- [ ] Slot regions defined for composite components
- [ ] Review P0 schema before implementation starts

---

## Developer checklist (P2+)

- [ ] Import from generated DS package only — no copied layout code
- [ ] Wire props/callbacks per BehaviorSpec
- [ ] No hand-edited margins, padding, or colors in app repos
- [ ] File gaps as BehaviorSpec updates, not CSS fixes

---

## Human-only actions (cannot automate)

| Action | When | Phase |
| --- | --- | --- |
| Approve image → IR draft | Low-confidence ingress | P4 |
| Sign BehaviorSpec | Before behavior CI | P2 |
| Sign SemanticGraph for new component family | Before codegen rollout | P2 |
| Approve platform golden PNG | First native render | P5 |
| Open/reload Figma Desktop plugin | If using Figma egress with Desktop API | P1, P3 |
| Legal/consent for training data | Before external fine-tune | P4 |

---

## Organization prep (before P4)

1. **Design system inventory** — components, tokens, target platforms  
2. **Golden portfolio policy** — new components add IR + CI assets  
3. **Change management** — design change = IR regen = CI, not ad-hoc screenshots  
4. **Data consent** — internal designs OK for logs? Customer designs restricted?  
5. **Side project staffing** — platform vs lab are separate efforts; avoid conflating on-call  

---

## Per-phase human focus

| Phase | Primary human work |
| --- | --- |
| P0 | Schema workshops; example IR authoring |
| P1 | Golden set curation; tolerance sign-off |
| P2 | Behavior specs; API review with app teams |
| P3 | Paired Figma + reference files |
| P4 | Image review queue; label component boundaries |
| P5 | Native golden approval; emitter template review |
| P6 | Dogfood, SSO, support playbooks |

---

## DesignerLock sign-off workflow

1. CI passes on candidate screen (pixel or platform golden).  
2. Designer (or delegate) confirms matches design intent.  
3. Platform engineer records `DesignerLock` (authority, hash, profile).  
4. Screen enters golden set — regressions block release.  

---

## See also

- [`GUIDELINES.md`](./GUIDELINES.md) §8–9  
- [`PHASES.md`](./PHASES.md)  
- [`WORKFLOWS.md`](./WORKFLOWS.md)  
