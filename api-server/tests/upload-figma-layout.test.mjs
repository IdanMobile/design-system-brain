import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { setAnthropicClient } from '../routes/upload-figma-layout.mjs';

const MOCK_TSX = `export const Button: React.FC = () => <button>Click</button>;`;
const MOCK_STORIES = `export default { component: Button }; export const Default = {};`;

const mockClient = {
  messages: {
    create: async () => ({
      content: [{ type: 'text', text: JSON.stringify({ componentSource: MOCK_TSX, storiesSource: MOCK_STORIES }) }],
    }),
  },
};

const VALID_PAYLOAD = {
  componentName: 'Button',
  library: 'mui',
  pngBase64: 'a'.repeat(200),
  tokens: { colors: [{ name: 'Primary', cssVar: '--color-primary-500', value: '#2563eb' }], typography: [], shadows: [], radius: [], gaps: [] },
  tokensCss: '--color-primary-500: #2563eb;\n--radius-md: 8px;',
  styleManifest: {
    base: { cssVars: { backgroundColor: 'var(--color-primary-500)' } },
    variantOverrides: { 'state=hover': { cssVars: { backgroundColor: 'var(--color-primary-600)' } } },
    slots: { hasIconSlot: false },
    variantAxes: { Size: ['sm', 'md', 'lg'] },
  },
};

after(() => setAnthropicClient(null));

async function startServer() {
  const app = createApp();
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const { port } = server.address();
  return { port, stop: () => new Promise(r => server.close(r)) };
}

test('returns 200 with generatedFiles and packageDependencies', async () => {
  setAnthropicClient(mockClient);
  const { port, stop } = await startServer();

  const res = await fetch(`http://localhost:${port}/upload-figma-layout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(VALID_PAYLOAD),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.generatedFiles));
  assert.equal(body.generatedFiles[0].path, 'src/components/Button/Button.tsx');
  assert.equal(body.generatedFiles[0].content, MOCK_TSX);
  assert.ok('@mui/material' in body.packageDependencies);

  await stop();
});

test('returns 400 for missing required fields', async () => {
  setAnthropicClient(mockClient);
  const { port, stop } = await startServer();

  const res = await fetch(`http://localhost:${port}/upload-figma-layout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ componentName: 'Button' }),
  });

  assert.equal(res.status, 400);
  await stop();
});

test('handles Claude response wrapped in markdown fences', async () => {
  setAnthropicClient({
    messages: { create: async () => ({ content: [{ type: 'text', text: '```json\n' + JSON.stringify({ componentSource: MOCK_TSX, storiesSource: null }) + '\n```' }] }) },
  });
  const { port, stop } = await startServer();

  const res = await fetch(`http://localhost:${port}/upload-figma-layout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(VALID_PAYLOAD),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.generatedFiles.length, 1); // no stories when storiesSource is null
  assert.equal(body.generatedFiles[0].content, MOCK_TSX);

  await stop();
});
