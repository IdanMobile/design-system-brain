#!/usr/bin/env node
/**
 * Reload the last-run Figma development plugin via Cmd+Option+P (macOS).
 * Polls the live relay until the plugin UI reconnects.
 *
 *   pnpm figma:plugin-reload
 */

import { spawnSync } from "node:child_process";

const PORT = Number(process.env.FIGMA_LIVE_PORT || 3456);
const WAIT_MS = Number(process.env.FIGMA_PLUGIN_RELOAD_WAIT_MS || 2500);
const RECONNECT_TIMEOUT_MS = Number(process.env.FIGMA_PLUGIN_RECONNECT_MS || 45000);

function reloadViaKeystroke() {
  if (process.platform !== "darwin") {
    console.error("[figma-plugin-reload] Requires macOS (Figma shortcut Cmd+Option+P)");
    process.exit(2);
  }
  const script = [
    'tell application "Figma" to activate',
    "delay 0.4",
    'tell application "System Events" to tell process "Figma"',
    '  keystroke "p" using {command down, option down}',
    "end tell"
  ].join("\n");
  const r = spawnSync("osascript", ["-e", script], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr?.trim() || "[figma-plugin-reload] osascript failed");
    process.exit(r.status ?? 1);
  }
  console.log("[figma-plugin-reload] Sent Cmd+Option+P to Figma Desktop");
}

async function relayHealth() {
  return new Promise((resolveHealth) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ok */
      }
      resolveHealth({ ok: false, pluginConnected: false });
    }, 2500);
    ws.onopen = () => ws.send(JSON.stringify({ type: "health" }));
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        clearTimeout(timer);
        ws.close();
        resolveHealth({
          ok: msg.relay === "ok",
          pluginConnected: Boolean(msg.pluginConnected)
        });
      } catch {
        resolveHealth({ ok: false, pluginConnected: false });
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolveHealth({ ok: false, pluginConnected: false });
    };
  });
}

async function waitForPlugin(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const health = await relayHealth();
    if (health.ok && health.pluginConnected) {
      console.log("[figma-plugin-reload] Plugin reconnected to relay");
      return true;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  console.warn(
    `[figma-plugin-reload] Plugin did not reconnect within ${timeoutMs}ms — open Universal JSON Importer Lab if needed`
  );
  return false;
}

async function main() {
  reloadViaKeystroke();
  await new Promise((r) => setTimeout(r, WAIT_MS));
  const ok = await waitForPlugin(RECONNECT_TIMEOUT_MS);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
