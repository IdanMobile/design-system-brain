/**
 * WebSocket relay between the Node live-test harness and the Figma plugin UI.
 *
 *   Test harness  --render-export-->  relay  -->  plugin UI  -->  plugin main
 *   Test harness  <--export-result--  relay  <--  plugin UI  <--  exportAsync PNG
 *
 * Default port: 3456 (override with FIGMA_LIVE_PORT).
 */

import { WebSocketServer } from "ws";

const PORT = Number(process.env.FIGMA_LIVE_PORT || 3456);
const REQUEST_TIMEOUT_MS = Number(process.env.FIGMA_LIVE_TIMEOUT_MS || 600_000);

/** @type {import('ws').WebSocket | null} */
let pluginWs = null;

/** @type {Map<string, { testWs: import('ws').WebSocket, timer: ReturnType<typeof setTimeout> }>} */
const pending = new Map();

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.type === "register" && msg.role === "plugin") {
      pluginWs = ws;
      send(ws, { type: "registered", role: "plugin" });
      console.log("[figma-live-relay] Figma plugin connected");
      return;
    }

    if (msg.type === "health") {
      send(ws, {
        type: "health",
        relay: "ok",
        pluginConnected: pluginWs != null && pluginWs.readyState === 1
      });
      return;
    }

    if (msg.type === "render-export") {
      const { requestId, json } = msg;
      if (!requestId || typeof json !== "string") {
        send(ws, {
          type: "export-error",
          requestId: requestId ?? "unknown",
          error: "Invalid render-export message (need requestId + json string)."
        });
        return;
      }
      if (!pluginWs || pluginWs.readyState !== 1) {
        send(ws, {
          type: "export-error",
          requestId,
          error:
            "Figma plugin not connected. Open Figma Desktop, run “Universal JSON Importer Lab”, and keep the plugin window open."
        });
        return;
      }
      if (pending.has(requestId)) {
        send(ws, {
          type: "export-error",
          requestId,
          error: `Duplicate requestId: ${requestId}`
        });
        return;
      }
      const timer = setTimeout(() => {
        pending.delete(requestId);
        send(ws, {
          type: "export-error",
          requestId,
          error: `Timed out after ${REQUEST_TIMEOUT_MS}ms waiting for Figma export.`
        });
      }, REQUEST_TIMEOUT_MS);
      pending.set(requestId, { testWs: ws, timer });
      send(pluginWs, { type: "render-export", requestId, json });
      return;
    }

    if (msg.type === "export-result" || msg.type === "export-error") {
      const entry = pending.get(msg.requestId);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(msg.requestId);
      send(entry.testWs, msg);
      return;
    }
  });

  ws.on("close", () => {
    if (ws === pluginWs) {
      pluginWs = null;
      console.log("[figma-live-relay] Figma plugin disconnected");
    }
  });
});

wss.on("listening", () => {
  console.log(`[figma-live-relay] Listening on ws://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  wss.close();
  process.exit(0);
});
