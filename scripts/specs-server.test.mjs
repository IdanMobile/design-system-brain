import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createSpecRoutes } from "./specs-server.mjs";

function startServer(vaultDir) {
  const routes = createSpecRoutes({ vaultDir });
  const server = createServer((req, res) => {
    if (routes.matches(req)) {
      routes.handle(req, res);
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolveServer({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r))
      });
    });
  });
}

async function jsonRequest(url, init = {}) {
  const res = await fetch(url, init);
  const body = res.status === 204 ? null : await res.text();
  return { status: res.status, body: body ? JSON.parse(body) : null };
}

function sampleSpec(id) {
  return {
    storyId: id,
    schemaVersion: 2,
    intent: "",
    status: "proposed",
    approvedAt: null,
    approvedBy: null,
    specVersion: 1,
    elements: []
  };
}

test("GET unknown spec returns 404", async () => {
  const vault = mkdtempSync(join(tmpdir(), "spec-server-"));
  const server = await startServer(vault);
  try {
    const res = await fetch(`${server.url}/api/specs/lab-nothing--here`);
    assert.equal(res.status, 404);
  } finally {
    await server.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("PUT then GET roundtrip", async () => {
  const vault = mkdtempSync(join(tmpdir(), "spec-server-"));
  const server = await startServer(vault);
  try {
    const put = await jsonRequest(`${server.url}/api/specs/lab-x--y`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sampleSpec("lab-x--y"))
    });
    assert.equal(put.status, 200);
    assert.equal(put.body.storyId, "lab-x--y");
    assert.ok(existsSync(resolve(vault, "lab-x--y.spec.json")));

    const get = await jsonRequest(`${server.url}/api/specs/lab-x--y`);
    assert.equal(get.status, 200);
    assert.equal(get.body.storyId, "lab-x--y");
  } finally {
    await server.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("PUT with mismatched storyId returns 400", async () => {
  const vault = mkdtempSync(join(tmpdir(), "spec-server-"));
  const server = await startServer(vault);
  try {
    const res = await fetch(`${server.url}/api/specs/lab-x--y`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storyId: "lab-other--story", component: "X" })
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("GET /api/specs returns list of all specs", async () => {
  const vault = mkdtempSync(join(tmpdir(), "spec-server-"));
  const server = await startServer(vault);
  try {
    for (const id of ["a--default", "b--default"]) {
      await fetch(`${server.url}/api/specs/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sampleSpec(id))
      });
    }
    const list = await jsonRequest(`${server.url}/api/specs`);
    assert.equal(list.status, 200);
    const ids = list.body.specs.map((s) => s.storyId).sort();
    assert.deepEqual(ids, ["a--default", "b--default"]);
  } finally {
    await server.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("PUT rejects non-JSON body with 400", async () => {
  const vault = mkdtempSync(join(tmpdir(), "spec-server-"));
  const server = await startServer(vault);
  try {
    const res = await fetch(`${server.url}/api/specs/lab-x--y`, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: "not json"
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("PUT auto-fills approvedAt + approvedBy when status flips to approved", async () => {
  const vault = mkdtempSync(join(tmpdir(), "spec-server-"));
  const server = await startServer(vault);
  try {
    const approved = { ...sampleSpec("lab-x--y"), status: "approved" };
    const res = await jsonRequest(`${server.url}/api/specs/lab-x--y`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(approved)
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.approvedAt?.endsWith("Z"));
    assert.equal(res.body.approvedBy, "showcase");
  } finally {
    await server.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("PUT bumps specVersion when content changes", async () => {
  const vault = mkdtempSync(join(tmpdir(), "spec-server-"));
  const server = await startServer(vault);
  try {
    const id = "x--y";
    const first = sampleSpec(id);
    await jsonRequest(`${server.url}/api/specs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(first)
    });
    const second = { ...first, intent: "new intent" };
    const res = await jsonRequest(`${server.url}/api/specs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(second)
    });
    assert.equal(res.body.specVersion, 2);
  } finally {
    await server.close();
    rmSync(vault, { recursive: true, force: true });
  }
});
