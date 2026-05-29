import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { once } from "node:events";
import { createLlmExtractRoute } from "./specs-llm.mjs";

const repoRoot = resolve(import.meta.dirname, "..");

async function spinUp({ env = {} } = {}) {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const route = createLlmExtractRoute({ repoRoot });
  const server = createServer(async (req, res) => {
    if (route.matches(req)) return route.handle(req, res);
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      server.close();
      await once(server, "close");
    }
  };
}

test("matches POST /api/specs/extract only", () => {
  const route = createLlmExtractRoute({ repoRoot });
  assert.equal(route.matches({ url: "/api/specs/extract", method: "POST", headers: {} }), true);
  assert.equal(route.matches({ url: "/api/specs/extract", method: "GET", headers: {} }), false);
  assert.equal(route.matches({ url: "/api/specs/foo", method: "POST", headers: {} }), false);
});

test("returns heuristic output when LAB_LLM_API_KEY is unset", async () => {
  delete process.env.LAB_LLM_API_KEY;
  const { url, stop } = await spinUp();
  try {
    const resp = await fetch(`${url}/api/specs/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Sign In",
        description: "click to sign in",
        tag: "button"
      })
    });
    assert.equal(resp.status, 200);
    const json = await resp.json();
    assert.equal(json.extractedBy, "heuristic");
    assert.ok(typeof json.behaviour === "string" && json.behaviour.length > 0);
    assert.ok(Array.isArray(json.devApi));
    assert.ok(json.devApi.find((a) => a.name === "onSignInClicked"));
    assert.match(json.note ?? "", /not set/i);
  } finally {
    await stop();
  }
});

test("rejects non-JSON body with 400", async () => {
  delete process.env.LAB_LLM_API_KEY;
  const { url, stop } = await spinUp();
  try {
    const resp = await fetch(`${url}/api/specs/extract`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json"
    });
    assert.equal(resp.status, 400);
  } finally {
    await stop();
  }
});

test("handles empty description with heuristic fallback", async () => {
  delete process.env.LAB_LLM_API_KEY;
  const { url, stop } = await spinUp();
  try {
    const resp = await fetch(`${url}/api/specs/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Mystery", description: "", tag: "button" })
    });
    assert.equal(resp.status, 200);
    const json = await resp.json();
    assert.equal(json.extractedBy, "heuristic");
    assert.match(json.behaviour, /please describe/i);
  } finally {
    await stop();
  }
});
