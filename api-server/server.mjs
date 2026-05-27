import express from 'express';
import cors from 'cors';
import { uploadFigmaLayoutHandler } from './routes/upload-figma-layout.mjs';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'brain-api-server' }));
  app.post('/upload-figma-layout', uploadFigmaLayoutHandler);
  return app;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const PORT = Number(process.env.PORT ?? 6120);
  if (!Number.isFinite(PORT)) throw new Error('Invalid PORT env var');
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Brain API server on http://localhost:${PORT}`);
    console.log(`Model: ${process.env.BRAIN_MODEL ?? 'claude-sonnet-4-6'}`);
    console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set ✓' : 'NOT SET ✗'}`);
  });
}
