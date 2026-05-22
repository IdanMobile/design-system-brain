#!/usr/bin/env node
/**
 * One sweep: mock golden (strict) → live golden (strict).
 * Queues Cursor inbox messages on failure, live handoff, or success.
 */

import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initAgentBridge } from "./test-console-agent-bridge.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://127.0.0.1:6107";

const SUITES = {
  figma: { dir: "figma-diffs", label: "Figma emulator" },
  figmaLive: { dir: "figma-live-diffs", label: "Figma live" }
};

const agent = initAgentBridge(ROOT);

function safeSegment(id) {
  return id.replace(/[<>:"/\\|?*]/g, "-").replace(/-+/g, "-");
}

function summarizeReport(suiteId) {
  return { suiteId, label: SUITES[suiteId]?.label ?? suiteId };
}

async function storybookUp() {
  try {
    const res = await fetch(`${STORYBOOK_URL}/index.json`, {
      signal: AbortSignal.timeout(3000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function relayHealth() {
  return new Promise((resolveHealth) => {
    const ws = new WebSocket("ws://localhost:3456");
    const timer = setTimeout(() => {
      ws.close();
      resolveHealth({ ok: false, pluginConnected: false });
    }, 2500);
    ws.onopen = () => ws.send(JSON.stringify({ type: "health" }));
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data));
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

function run(cmd, args) {
  console.log(`\n▶ ${cmd} ${args.join(" ")}\n`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", env: process.env });
  return r.status ?? 1;
}

(async () => {
  console.log("══ Run until pass (one sweep) ══\n");

  if (!(await storybookUp())) {
    agent.enqueuePrerequisite(
      [
        "Run until pass blocked: Storybook is not running.",
        "",
        "In the test console click Serve Storybook, or run:",
        "  pnpm storybook:serve",
        "",
        "Then click Run until pass again."
      ].join("\n")
    );
    process.exit(2);
  }

  console.log("── Phase 1: Figma emulator (mock) ──");
  run("node", ["scripts/figma-iterate.mjs"]);

  if (!agent.isSuiteStrictGreen("figma", SUITES)) {
    agent.enqueueSuiteFailure("figma", SUITES, summarizeReport, safeSegment, {
      phase: "mock",
      hint:
        "Phase 1 failed. Fix code-v2.ts or extractor, rebuild plugin, re-run Run until pass from console."
    });
    process.exit(1);
  }
  console.log("\n✓ Phase 1 strict green.\n");

  const relay = await relayHealth();
  if (!relay.ok || !relay.pluginConnected) {
    agent.enqueueLiveHandoff();
    process.exit(2);
  }

  console.log("── Phase 2: Figma live ──");
  run("node", ["scripts/figma-live-iterate.mjs"]);

  if (!agent.isSuiteStrictGreen("figmaLive", SUITES)) {
    agent.enqueueSuiteFailure("figmaLive", SUITES, summarizeReport, safeSegment, {
      phase: "live",
      hint:
        "Phase 2 failed. Fix code-v2.ts, rebuild plugin, reload in Figma, reply ready, click Run until pass again."
    });
    process.exit(1);
  }

  agent.enqueueRunUntilPassComplete();
  console.log("\n✓ Run until pass sweep: mock + live strict green.\n");
  process.exit(0);
})();
