# Vision

**Version:** 0.1.0 · 2026-05-22

---

## North star

A maintained design-system platform where:

1. **Designers** work in familiar tools (Figma, Storybook, sketches, references).
2. **UniversalLayer IR** is the canonical hub — visual, semantic, and behavioral.
3. **Every egress target** is **pixel-verified** against the designer’s locked reference.
4. **Developers** import typed APIs and connect **data + business logic only**.

Example end-state developer experience:

```tsx
const { data, isLoading, error } = useOrders();
return (
  <OrdersScreen
    data={data}
    isLoading={isLoading}
    error={error}
    onOrderSelect={(id) => router.push(`/orders/${id}`)}
  />
);
```

`OrdersScreen` and its children are **generated and CI-locked** — not hand-styled in the app repo.

---

## Product promise

```text
Any ingress → One IR → All egresses → Pixel proof → Logic-only dev
```

---

## Quality contract (non-negotiable)

| Dimension | Standard |
| --- | --- |
| **Visual (web)** | ≤ 0.1% global + ≤ 0.1% worst region (strict); alternate profiles only via DesignerLock |
| **Delivery** | Storybook · design-system package · Figma — three-way parity where applicable |
| **Behavior** | Playwright matrix from signed-off BehaviorSpec |
| **Generated UI** | Immutable in apps; changes flow design → IR → regen → CI |

---

## Ingress (design from anywhere)

| Source | Role |
| --- | --- |
| Storybook / DOM | High-fidelity teacher for web visual IR |
| Figma | Design-led authority; editable round-trip |
| Image / PDF / sketch | Draft ingress + human confirm or pixel gate |
| Other design systems | Token + component normalization into IR |

---

## Egress (all platforms)

| Target | Guarantee |
| --- | --- |
| Figma | Editable layers; pixel gate vs lock |
| Storybook | Fixtures and variants from IR |
| React / Vite (and web DS) | Typed components; pixel gate |
| Flutter / Swift / Kotlin | Platform golden PNGs from same IR |

---

## Non-goals (early platform)

- Replacing Figma as the primary design tool for all teams
- One-shot image → production app with zero human review
- Training a general-purpose LLM from scratch
- Hand-editable layout code in application repositories
- Identical CSS rendering on native platforms (use platform goldens instead)

---

## Success metrics

| Horizon | Metric |
| --- | --- |
| P1 complete | One ingress + one egress green at strict pixel CI |
| P2 complete | 5+ components with SemanticGraph + BehaviorSpec + behavior CI |
| P3 complete | Figma → IR → Figma round-trip on 20+ paired screens |
| P4 complete | Image → draft IR workflow with logged training corpus |
| P5 complete | 2+ native targets with platform golden CI |
| P6 complete | Hosted platform; design team dogfood with <5% manual UI override |

---

## Strategic moat

The moat is **lossless IR + automated visual CI + semantic/behavior layers**, not the largest LLM. Anyone can demo screenshot-to-code; few build verifiable compiler infrastructure with regional pixel gates and multi-target lowering.

---

## See also

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system design  
- [`PHASES.md`](./PHASES.md) — build order  
- [`GUIDELINES.md`](./GUIDELINES.md) — rules  
