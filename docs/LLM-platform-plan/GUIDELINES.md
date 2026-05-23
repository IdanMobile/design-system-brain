# Guidelines — non-negotiable rules

**Version:** 0.1.0 · 2026-05-22

All AI and human work on the LLM platform must follow these rules. When in doubt, read [`AGENTS.md`](./AGENTS.md) first.

---

## 1. Side project boundary

- This plan lives in `docs/LLM-platform-plan/` and is **independent** of storybook-to-figma-lab’s `docs/ROADMAP.md`.
- Lab work is **optional reference**, not a dependency or execution backlog for the platform.
- Do not block platform design on lab milestone completion.

---

## 2. Pixel-perfect is the contract

- Every egress target must pass **automated visual CI** before it is considered done.
- **Web stack default:** ≤ **0.1%** global diff and ≤ **0.1%** worst-region diff (strict profile).
- Documented tolerance profiles (live raster, native platform) are allowed only when explicitly defined in DesignerLock metadata — never silent relaxation.
- “Looks close” is not acceptable for designer-required deliverables.

---

## 3. IR first (Universal Hub)

- All ingress normalizes to **UniversalLayer** (visual IR).
- Semantic and behavioral layers sit **above** visual IR — never skip straight to platform code.
- No target-specific hacks in ingress; no Figma-isms in React emitters without lowering through IR.
- Target order of IR stack:
  1. **UniversalLayer** — geometry, paint, typography, effects  
  2. **SemanticGraph** — components, props, tokens, screens  
  3. **BehaviorSpec** — interactions, state, developer API  
  4. **DesignerLock** — authority source + golden reference + tolerance profile  

---

## 4. ML proposes; CI disposes

- Models may **draft** IR, classify components, or propose fixes.
- **No model output ships** without schema validation + pixel (or platform golden) gates.
- Do not train a general LLM from scratch for this platform — specialize base models on IR as target language.
- Deterministic code owns correctness-critical paths (exact boxes, colors, z-order, paint order).

---

## 5. Compiler, not chatbot

- Architecture is **ingress → IR → egress lowerers**, not one-shot prompt → React.
- Egress uses **typed emitters** (templates + semantic graph), not unconstrained code generation in app repos.
- LLM fills gaps (alignment, classification, ambiguous image regions); emitters guarantee compile-safe output.

---

## 6. Logic-only development (end state)

- Generated UI is **immutable surface area** in application repos.
- Visual or layout changes flow: **design → IR → regen → CI green**.
- Developers connect **data, state, and callbacks** only — per BehaviorSpec / developer API.
- CSS hand-tuning in app code is an anti-pattern once delivery is automated.

---

## 7. Multi-platform fidelity

- React/Vite/CSS targets: pixel diff against designer lock (same rendering family).
- Flutter / Swift / Kotlin: **platform golden PNGs** per target — same IR, native rendering physics.
- Do not claim CSS-identical pixels across native and web.

---

## 8. Ingress ambiguity (especially images)

- Image/sketch ingress produces **draft IR** + confidence scores.
- Low-confidence or novel layouts require **human confirm** before lock — unless a reference exists for automatic pixel gate.
- Never auto-ship image-only ingress to production egress without verification.

---

## 9. Human gates (cannot automate away)

| Action | When |
| --- | --- |
| Approve image → IR draft | Low-confidence ingress |
| Sign behavior / semantic spec | Before behavior CI |
| Approve platform golden | First native render for a screen |
| Designer sign-off on lock | Authority = figma \| storybook \| image |

See [`HUMAN-PREP.md`](./HUMAN-PREP.md).

---

## 10. Data and IP

- IR contains embedded imagery and design IP — treat logs as confidential.
- No customer designs in public fine-tunes without explicit consent.
- Offer on-prem inference path for regulated clients (see [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md)).

---

## 11. Phase discipline

- Work current platform phase (see [`AGENTS.md`](./AGENTS.md) Active phase) before jumping ahead.
- Each phase has exit criteria in [`PHASES.md`](./PHASES.md) and go/no-go gates in [`RISKS-AND-GATES.md`](./RISKS-AND-GATES.md).
- Do not skip visual CI to rush semantic or ML work — layers build on proven fidelity.

---

## 12. Documentation changes

- Update **AGENTS.md** (Active phase), **PHASES.md**, and **MANIFEST.yaml** when phase or focus changes.
- Keep GUIDELINES short and testable — move detail to ARCHITECTURE or domain docs.
