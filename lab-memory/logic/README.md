# Story specs (v2 — element approval)

One file per story (`<storyId>.spec.json`). Source of truth for what each
story's interactive elements are supposed to do. Canonical edit path is the
dev playground showcase (click an element → describe → approve);
hand-editable as an escape hatch.

See `docs/superpowers/specs/2026-05-25-element-approval-redesign-design.md`
for the model. v1 specs (props + events + behaviours arrays) live in
`lab-memory/logic/archive/` as a one-way archive after running
`pnpm specs:bootstrap-v2`.

## Schema (v2)

```json
{
  "storyId": "<id>",
  "schemaVersion": 2,
  "intent": "One sentence: what is this story?",
  "status": "proposed" | "approved",
  "approvedAt": null | "<ISO timestamp>",
  "approvedBy": null | "showcase",
  "specVersion": 1,
  "elements": [
    {
      "id": "el-<slug>",
      "selector": "[data-lab-id=\"el-<slug>\"]",
      "displayName": "Login",
      "description": "click to sign in",
      "source": "ai" | "designer",
      "aiSuggestion": "Click triggers the \"Login\" action",
      "aiExtracted": {
        "behaviour": "On click",
        "devApi": [{ "name": "onLoginClicked", "signature": "() => void" }],
        "extractedBy": "heuristic" | "llm",
        "extractedAt": "<ISO timestamp>"
      },
      "status": "proposed" | "approved",
      "approvedAt": null | "<ISO timestamp>"
    }
  ]
}
```

## Workflow

1. `pnpm specs:bootstrap-v2` — archives any v1 files into `specs-legacy/` and
   writes a fresh v2 file (empty `elements`) for every story in
   `DEV_STORIES`.
2. `pnpm test:logic:audit` — discovers interactive elements via
   `data-lab-id` (stamped by `@lab/ui/element-ids-runtime.ts`) and
   populates `elements[]`. Each unapproved element gets an `aiSuggestion`;
   each element with a non-empty `description` also gets an `aiExtracted`
   block (`behaviour` + `devApi`) via the local heuristic.
3. Designer opens the showcase → **Detected behaviours** lists audit findings
   (edit / remove / approve). **+ Add behaviour** opens a Figma-style layer tree.
   Pick a **Behaviour type** preset (Click, Hover, Edit text, Search, …) or
   **Custom**, edit the description, optionally click **✨ Improve with AI**
   (only useful when `LAB_LLM_API_KEY` is set), then **✓ Approve**.
4. Next audit run: element is `pass`; if approved elements disappear later
   the verdict flips to `regression`; if a new element appears it shows up
   as `new-element` in the report.

## AI polish

The **✨ Improve with AI** button calls `/api/specs/extract`. The endpoint
falls back to the local heuristic when `LAB_LLM_API_KEY` is unset, so the
button is always safe to click — designers will just get the same output
the audit already produced. See `.env.example` for the variables.
