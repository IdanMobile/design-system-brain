# Brain Foundry — Deployment Guide

## Local Development

```bash
# Start brain alongside guing local dev
ANTHROPIC_API_KEY=sk-ant-... node api-server/server.mjs

# Or with Docker
docker compose up --build

# Point guing at brain
BRAIN_FOUNDRY_URL=http://localhost:6120 npm --prefix server/functions run serve
```

## Cloud Run (GCP)

### Build and push

```bash
PROJECT_ID=your-gcp-project
gcloud builds submit --tag gcr.io/$PROJECT_ID/brain-foundry .

gcloud run deploy brain-foundry \
  --image gcr.io/$PROJECT_ID/brain-foundry \
  --region us-central1 \
  --platform managed \
  --min-instances 1 \
  --max-instances 5 \
  --concurrency 2 \
  --cpu 2 \
  --memory 4Gi \
  --timeout 300 \
  --set-env-vars ANTHROPIC_API_KEY=your-key \
  --allow-unauthenticated
```

### Key settings

| Setting | Value | Reason |
|---|---|---|
| `min-instances=1` | Keep 1 warm | Chromium cold start is ~10s |
| `concurrency=2` | 1-2 per instance | Render isolation — each forge runs one Chromium |
| `cpu=2, memory=4Gi` | 2 vCPU / 4 GB | Chromium + Node + Storybook |
| `timeout=300` | 5 min | 3-attempt forge loop can take 2-3 min |

## Cost Estimates (LLM dominates)

| Scale | Syncs/day | Monthly | LLM | Hosting | Total |
|---|---|---|---|---|---|
| Small | 10 (~300/mo) | ~$30-90 | ~$40-70 | ~$70-160 |
| Medium | 100 (~3k/mo) | ~$300-900 | ~$70-150 | ~$400-1,050 |
| Large | 1000 (~30k/mo) | ~$3k-9k | ~$300-800 | ~$3.3k-9.8k |

**Cost mitigations built in:**
- Component-hash caching (skip regeneration of unchanged Figma nodes)
- Stop at first passing attempt (no wasted attempts)
- Capped at `maxAttempts` (default 3)

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Claude API key |
| `BRAIN_MODEL` | No | `claude-sonnet-4-6` | Claude model for generation |
| `PORT` | No | `6120` | HTTP port |

## Security Notes

- Run foundry in a **network-egress-restricted** container (no outbound except Claude API)
- Mount NO secrets — only ANTHROPIC_API_KEY via Cloud Run Secret Manager
- The foundry executes LLM-generated code to render it — treat render workspace as untrusted
- Each forge request gets an isolated Storybook write scope (temp directories)
