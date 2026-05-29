/**
 * WebSocket relay between the Node live-test harness and the Figma plugin UI.
 *
 *   Test harness  --render-export-->  relay  -->  plugin UI  -->  plugin main
 *   Test harness  <--export-result--  relay  <--  plugin UI  <--  exportAsync PNG
 *
 * Figma import/export is serialized in a queue (one plugin job at a time).
 * Multiple harness workers may run Storybook work in parallel.
 *
 * Default port: 3456 (override with FIGMA_LIVE_PORT).
 */

import { WebSocketServer } from "ws";

const PORT = Number(process.env.FIGMA_LIVE_PORT || 3456);
const REQUEST_TIMEOUT_MS = Number(process.env.FIGMA_LIVE_TIMEOUT_MS || 600_000);

/** @type {import('ws').WebSocket | null} */
let pluginWs = null;

/** @type {Set<import('ws').WebSocket>} */
const extractionSinks = new Set();

/** @type {Map<string, { testWs: import('ws').WebSocket, timer: ReturnType<typeof setTimeout>, release: () => void }>} */
const pending = new Map();

/** @type {{ testWs: import('ws').WebSocket, requestId: string, json: string, exportScale?: number }[]} */
const pluginQueue = [];

let pluginBusy = false;

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function failExport(testWs, requestId, error) {
  send(testWs, { type: "export-error", requestId, error });
}

function releasePluginSlot() {
  pluginBusy = false;
  dispatchNextExport();
}

function dispatchNextExport() {
  if (pluginBusy || pluginQueue.length === 0) return;
  if (!pluginWs || pluginWs.readyState !== 1) {
    while (pluginQueue.length > 0) {
      const job = pluginQueue.shift();
      failExport(
        job.testWs,
        job.requestId,
        "Figma plugin not connected. Open Figma Desktop, run “Universal JSON Importer Lab”, and keep the plugin window open."
      );
    }
    return;
  }

  const job = pluginQueue.shift();
  pluginBusy = true;

  const timer = setTimeout(() => {
    const entry = pending.get(job.requestId);
    if (entry) {
      pending.delete(job.requestId);
      entry.release();
    }
    failExport(
      job.testWs,
      job.requestId,
      `Timed out after ${REQUEST_TIMEOUT_MS}ms waiting for Figma export.`
    );
  }, REQUEST_TIMEOUT_MS);

  pending.set(job.requestId, {
    testWs: job.testWs,
    timer,
    release: releasePluginSlot
  });

  send(pluginWs, {
    type: "render-export",
    requestId: job.requestId,
    json: job.json,
    ...(typeof job.exportScale === "number" && job.exportScale > 0
      ? { exportScale: job.exportScale }
      : {})
  });
}

function enqueueExport(testWs, requestId, json, exportScale) {
  pluginQueue.push({ testWs, requestId, json, exportScale });
  dispatchNextExport();
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
      dispatchNextExport();
      return;
    }

    if (msg.type === "register" && msg.role === "extraction-sink") {
      extractionSinks.add(ws);
      send(ws, { type: "registered", role: "extraction-sink" });
      console.log("[figma-live-relay] Extraction sink connected");
      return;
    }

    if (msg.type === "figma-screen-extraction") {
      // Forwarded from the plugin UI — broadcast to all connected sinks.
      let count = 0;
      for (const sink of extractionSinks) {
        if (sink.readyState === 1) { send(sink, msg); count++; }
      }
      console.log(`[figma-live-relay] figma-screen-extraction "${msg.name}" → ${count} sink(s)`);
      return;
    }

    if (msg.type === "health") {
      send(ws, {
        type: "health",
        relay: "ok",
        pluginConnected: pluginWs != null && pluginWs.readyState === 1,
        exportQueueDepth: pluginQueue.length,
        pluginBusy
      });
      return;
    }

    if (msg.type === "render-export") {
      const { requestId, json, exportScale } = msg;
      if (!requestId || typeof json !== "string") {
        send(ws, {
          type: "export-error",
          requestId: requestId ?? "unknown",
          error: "Invalid render-export message (need requestId + json string)."
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
      enqueueExport(ws, requestId, json, exportScale);
      return;
    }

    if (msg.type === "export-result" || msg.type === "export-error") {
      const entry = pending.get(msg.requestId);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(msg.requestId);
      send(entry.testWs, msg);
      entry.release();
      return;
    }
  });

  ws.on("close", () => {
    if (ws === pluginWs) {
      pluginWs = null;
      pluginBusy = false;
      console.log("[figma-live-relay] Figma plugin disconnected");
      while (pluginQueue.length > 0) {
        const job = pluginQueue.shift();
        failExport(job.testWs, job.requestId, "Figma plugin disconnected.");
      }
    }
    if (extractionSinks.delete(ws)) {
      console.log("[figma-live-relay] Extraction sink disconnected");
    }
  });
});

wss.on("listening", () => {
  console.log(`[figma-live-relay] Listening on ws://localhost:${PORT} (export queue on)`);
});

process.on("SIGINT", () => {
  wss.close();
  process.exit(0);
});
