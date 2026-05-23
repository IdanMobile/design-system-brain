# Model strategy

**Version:** 0.1.0 · 2026-05-22

---

## Core principle

**ML proposes; CI disposes.** Models draft IR, classify components, align trees, or propose fixes. Schema validation and pixel (or platform golden) gates accept or reject. No model output ships on trust alone.

**Do not train a general LLM from scratch** for this platform. Specialize base models with UniversalLayer and DSL as target languages.

---

## Model fleet (not one god-model)

| Model | Job | Base (2026) | Train method | Phase |
| --- | --- | --- | --- | --- |
| **Fix agent** | Diagnose CI failure → patch | Claude / GPT via API | Prompt + tools | P1+ |
| **Component classifier** | Layer subtree → DS type | 1–3B JSON/vision | SFT on labeled IR | P2 |
| **Prop inferrer** | Visual + context → semantic props | 7B instruct | SFT on Storybook args / specs | P2 |
| **Figma↔DOM aligner** | Match subtrees across sources | 3–8B multimodal | SFT on pairs | P3 |
| **Layout vision** | Image → draft UniversalLayer | Qwen2-VL 7B | SFT + RLVR | P4 |
| **Renderer specialist** | JSON → Figma DSL | 300M–3B code | Distill from rule-based renderer | P4 |
| **Behavior inferrer** | Spec gaps from audit | 7B instruct | SFT on BehaviorSpecs | P2+ |

---

## Recommended base models

| Use case | Primary | Fallback | On-prem |
| --- | --- | --- | --- |
| Agent / orchestration | Claude Sonnet, GPT-4.1 | Cursor agent | — |
| JSON / code generation | Qwen2.5-Coder 7B/32B | DeepSeek-Coder | Llama Codestral |
| Vision / layout | Qwen2-VL 7B | LLaVA-NeXT | Llama 3.2 Vision |
| Small specialists | Phi-3 / SmolLM2 | Custom 300M transformer | Same |

---

## Training curriculum (per specialist)

### 1. Supervised fine-tuning (SFT)

- **Teacher:** deterministic ingress, rule-based egress, human-approved drafts  
- **Target:** IR JSON, Figma DSL, semantic labels  
- **Loss:** token cross-entropy with schema-constrained decoding  

### 2. Preference optimization (DPO)

- **Pairs:** patch A passed CI + Tier regression; patch B failed or regressed  
- **Source:** fix-loop logs ([`DATA-PIPELINE.md`](./DATA-PIPELINE.md))  

### 3. RL from verifiable rewards (RLVR)

- **Reward:** pixel diff score, schema valid, behavior tests pass  
- **Use for:** renderer specialist, layout vision — not open-ended codegen  
- **Harness:** same CI as production ([`RISKS-AND-GATES.md`](./RISKS-AND-GATES.md))  

---

## Inference design

| Concern | Approach |
| --- | --- |
| Invalid Figma ops | JSON Schema / grammar decoding |
| Large screens | Subtree chunking with parent context |
| Latency | Small specialists on GPU; agent via API |
| Confidence | Scores on image ingress; route to human review |

### Hardware (inference)

| Model size | VRAM | Latency target |
| --- | --- | --- |
| 1–3B specialist | 8–16 GB | < 2s / subtree |
| 7B vision | 24 GB | < 5s / screen |
| 32B coder (batch) | 2× A100 80GB | Offline jobs |

Detail: [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md).

---

## When to use ML vs deterministic code

| Use ML | Use deterministic code |
| --- | --- |
| Image segmentation | Exact box coordinates from DOM |
| Component classification | Schema validation |
| Figma↔DOM alignment | z-order, paint order |
| Ambiguous prop naming | Token resolution |
| Draft IR from sketch | Final locked IR after gate |

---

## Evaluation

| Eval | Metric |
| --- | --- |
| IR validity | Schema pass rate |
| Visual | Global + region diff vs DesignerLock |
| Semantic | Prop/API match to BehaviorSpec |
| Generalization | Held-out component **families** |
| Regression | Cross-story suite after shared model update |

Gate **G4** ([`RISKS-AND-GATES.md`](./RISKS-AND-GATES.md)): specialist ≥ rule baseline on held-out stories before replacing deterministic renderer paths.

---

## Data requirements (summary)

| Phase | Volume | Source |
| --- | --- | --- |
| P2 | 500+ labeled components | IR + manual labels |
| P3 | 200+ Figma↔reference pairs | Paired goldens |
| P4 | 50K+ JSON→output traces | Egress logs |
| P4 | 10K+ fix triples | Fix loop history |

Full detail: [`DATA-PIPELINE.md`](./DATA-PIPELINE.md).

---

## See also

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — ML placement diagram  
- [`GUIDELINES.md`](./GUIDELINES.md) §4  
- [`WORKFLOWS.md`](./WORKFLOWS.md) — W5  
