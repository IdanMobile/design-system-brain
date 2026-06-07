import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { uploadFigmaLayoutHandler } from './routes/upload-figma-layout.mjs';
import { pixelDiffHandler } from './routes/pixel-diff.mjs';
import { forgeComponentHandler } from './routes/forge-component.mjs';

// Load .env from the api-server directory (best-effort, no extra deps needed)
try {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '.env');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key) process.env[key] = val;
  }
} catch { /* no .env file — that's fine */ }

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'brain-api-server' }));
  app.post('/upload-figma-layout', uploadFigmaLayoutHandler);
  app.post('/pixel-diff', pixelDiffHandler);
  app.post('/forge-component', forgeComponentHandler);
  return app;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const PORT = Number(process.env.PORT ?? 6120);
  if (!Number.isFinite(PORT)) throw new Error('Invalid PORT env var');
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Brain API server on http://localhost:${PORT}`);
    console.log(`Model: ${process.env.BRAIN_MODEL ?? 'claude-sonnet-4-6'}`);
    console.log(`ANTHROPIC_BASE_URL: ${process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com (default)'}`);
    console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set ✓' : 'NOT SET ✗'}`);
  });
}
