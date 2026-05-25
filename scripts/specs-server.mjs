/**
 * Mountable spec HTTP routes for the dev playground server.
 *
 * Owning server detects whether the request belongs to us via
 * `routes.matches(req)` and forwards it via `routes.handle(req, res)`.
 *
 * Routes:
 *   GET  /api/specs                   → list every spec in the vault
 *   GET  /api/specs/<storyId>         → read one spec
 *   PUT  /api/specs/<storyId>         → write/replace one spec
 *
 * Vanilla Node, no deps. Should only be mounted on a localhost server.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { join, resolve } from "node:path";

const API_PREFIX = "/api/specs";

export function createSpecRoutes({ vaultDir }) {
  if (!existsSync(vaultDir)) mkdirSync(vaultDir, { recursive: true });

  function filePathFor(storyId) {
    return resolve(vaultDir, `${storyId}.spec.json`);
  }

  function readSpec(storyId) {
    const file = filePathFor(storyId);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8"));
  }

  function writeSpec(spec) {
    writeFileSync(
      filePathFor(spec.storyId),
      JSON.stringify(spec, null, 2) + "\n",
      "utf8"
    );
  }

  function listSpecs() {
    if (!existsSync(vaultDir)) return [];
    return readdirSync(vaultDir)
      .filter((n) => n.endsWith(".spec.json"))
      .map((n) => JSON.parse(readFileSync(join(vaultDir, n), "utf8")));
  }

  function matches(req) {
    return (req.url ?? "").startsWith(API_PREFIX);
  }

  async function readJsonBody(req) {
    const ct = (req.headers["content-type"] ?? "").toLowerCase();
    if (!ct.startsWith("application/json")) {
      const err = new Error("Content-Type must be application/json");
      err.statusCode = 400;
      throw err;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    try {
      return JSON.parse(raw);
    } catch {
      const err = new Error("Malformed JSON body");
      err.statusCode = 400;
      throw err;
    }
  }

  function sendJson(res, status, body) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify(body));
  }

  function bumpSpecVersionIfChanged(prev, next) {
    if (!prev) return { ...next, specVersion: next.specVersion ?? 1 };
    const compare = (s) => ({ ...s, specVersion: 0 });
    const changed = JSON.stringify(compare(prev)) !== JSON.stringify(compare(next));
    return {
      ...next,
      specVersion: changed ? prev.specVersion + 1 : prev.specVersion
    };
  }

  async function handle(req, res) {
    try {
      const url = req.url ?? "";

      // GET /api/specs                  → list
      if (url === API_PREFIX && req.method === "GET") {
        sendJson(res, 200, { specs: listSpecs() });
        return;
      }

      // /api/specs/<storyId>
      const m = url.match(/^\/api\/specs\/([^/?]+)$/);
      if (m && req.method === "GET") {
        const storyId = decodeURIComponent(m[1]);
        const spec = readSpec(storyId);
        if (!spec) {
          sendJson(res, 404, { error: "spec not found", storyId });
          return;
        }
        sendJson(res, 200, spec);
        return;
      }
      if (m && req.method === "PUT") {
        const storyId = decodeURIComponent(m[1]);
        const body = await readJsonBody(req);
        if (body.storyId !== storyId) {
          sendJson(res, 400, {
            error: "storyId in URL does not match body",
            urlStoryId: storyId,
            bodyStoryId: body.storyId
          });
          return;
        }
        const prev = readSpec(storyId);
        const merged = bumpSpecVersionIfChanged(prev, body);
        if (merged.status === "approved" && !merged.approvedAt) {
          merged.approvedAt = new Date().toISOString();
          merged.approvedBy = merged.approvedBy ?? "showcase";
        }
        writeSpec(merged);
        sendJson(res, 200, merged);
        return;
      }

      sendJson(res, 404, { error: "no route", url, method: req.method });
    } catch (err) {
      const status = err.statusCode ?? 500;
      sendJson(res, status, { error: err.message ?? "internal" });
    }
  }

  return { matches, handle };
}
