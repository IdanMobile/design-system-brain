import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';

test('GET /health returns { ok: true, service: brain-api-server }', async () => {
  const app = createApp();
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();

  const res = await fetch(`http://localhost:${port}/health`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, 'brain-api-server');

  await new Promise(r => server.close(r));
});
