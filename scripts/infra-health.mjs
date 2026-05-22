#!/usr/bin/env node
/**
 * Infra health for agents — JSON stdout. Run instead of asking the user to start services.
 *
 *   pnpm infra:health
 *   node scripts/infra-health.mjs --start-missing   # background storybook + relay if down
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://127.0.0.1:6107";
const startMissing = process.argv.includes("--start-missing");

async function storybookOk() {
  try {
    const res = await fetch(`${STORYBOOK_URL}/index.json`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

function relayHealth() {
  return new Promise((resolveHealth) => {
    const ws = new WebSocket("ws://localhost:3456");
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ok */
      }
      resolveHealth({ relay: false, pluginConnected: false });
    }, 2500);
    ws.onopen = () => ws.send(JSON.stringify({ type: "health" }));
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        clearTimeout(timer);
        ws.close();
        resolveHealth({
          relay: msg.relay === "ok",
          pluginConnected: Boolean(msg.pluginConnected)
        });
      } catch {
        resolveHealth({ relay: false, pluginConnected: false });
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolveHealth({ relay: false, pluginConnected: false });
    };
  });
}

function spawnDetached(command, args) {
  const child = spawn(command, args, {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    env: process.env
  });
  child.unref();
}

async function ensureStarted(sb, relay) {
  if (!sb && startMissing) {
    spawnDetached("pnpm", ["storybook:serve"]);
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!relay.relay && startMissing) {
    spawnDetached("node", ["scripts/figma-live-relay.mjs"]);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function main() {
  let sb = await storybookOk();
  let relay = await relayHealth();
  if (startMissing) await ensureStarted(sb, relay);
  sb = await storybookOk();
  relay = await relayHealth();

  const humanRequired = [];
  if (!sb) humanRequired.push("storybook_unreachable_after_agent_start");
  if (!relay.relay) humanRequired.push("relay_unreachable_after_agent_start");
  if (relay.relay && !relay.pluginConnected) {
    humanRequired.push("figma_plugin_not_connected_open_in_desktop");
  }

  const out = {
    storybook: { url: STORYBOOK_URL, ok: sb },
    relay: { url: "ws://localhost:3456", ok: relay.relay, pluginConnected: relay.pluginConnected },
    agentCanProceedLive: sb && relay.relay && relay.pluginConnected,
    humanRequired,
    artifactsOk: existsSync(resolve(ROOT, "artifacts/stories.index.json"))
  };

  console.log(JSON.stringify(out, null, 2));
  process.exit(humanRequired.length && !process.argv.includes("--json-only") ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
