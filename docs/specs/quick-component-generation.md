# Quick component generation

Guing **Publish** → lab test console **`POST /api/quick-component-generation`** → automatic figma-entry row (no fixers) → React TSX package → Anthropic polish → response to caller.

## Isolation from normal lab

| | Normal lab | This endpoint only |
|---|---|---|
| Report tolerance | 0.1% | 0.1% (unchanged) |
| Proceed gate | strict pass | ≤ 5% or non-error fail |
| Fixers | yes | **never** |
| Row pipeline | `runRowPipelineSteps` | `runQuickComponentGeneration` |

## API

### `POST /api/quick-component-generation`

```json
{
  "screenId": "screen_3",
  "componentName": "Screen3",
  "library": "mui",
  "manifest": { },
  "pngBase64": "..."
}
```

Response `202`:

```json
{
  "ok": true,
  "jobId": "...",
  "pollUrl": "/api/quick-component-generation/<jobId>"
}
```

### `GET /api/quick-component-generation/:jobId`

Returns job status + `quickComponentResult` when complete (includes `generatedPackage.files` and `tarballBase64`).

## Env

| Variable | Purpose |
|---|---|
| `QUICK_COMPONENT_MOCK_ANTHROPIC=1` | Skip Anthropic; return input files |
| `QUICK_COMPONENT_SKIP_STEPS` | Comma list e.g. `vsFigmaLive` (simulate/dev) |
| `LAB_LLM_API_KEY` | Anthropic key when mock off |

## Scripts

```bash
pnpm test:quick-component:gate
pnpm test:quick-component:simulate
```
