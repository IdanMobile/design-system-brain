#!/usr/bin/env node
/**
 * Dispatch code-architect-investigator in Terminal (read-only audit).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildArchitectAuditPrompt } from "./architecture-console.mjs";
import { hasCursorAgent, cursorAgentInvocation, parseStreamJsonAgentLine } from "./test-console-cursor-cli.mjs";
import { resolveAgentModel, loadRunSettings } from "./test-console-run-settings.mjs";
import { spawn } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  if (!hasCursorAgent()) {
    console.error("Cursor CLI not found. Install: https://cursor.com/docs/cli/overview");
    process.exit(1);
  }

  mkdirSync(join(ROOT, ".test-console"), { recursive: true });
  const prompt = buildArchitectAuditPrompt();
  const promptFile = join(ROOT, ".test-console", "architect-audit.prompt.txt");
  writeFileSync(promptFile, prompt, "utf8");

  console.log("[architect] Code architect investigator — read-only audit\n");
  console.log("[architect] Outputs: docs/superpowers/specs/*-code-architect-audit.md");
  console.log("[architect]          .test-console/architecture-findings.json\n");

  const model = resolveAgentModel(loadRunSettings());
  const { bin, args } = cursorAgentInvocation(prompt, { streamProgress: true, model });

  console.log(`[architect] Model: ${model}\n`);

  const child = spawn(bin, args, {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let buf = "";
  let exitCode = 1;

  const flush = (chunk, isErr) => {
    buf += chunk;
    const parts = buf.split("\n");
    buf = parts.pop() ?? "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (isErr) {
        console.error(`[architect] stderr: ${trimmed}`);
        continue;
      }
      const parsed = parseStreamJsonAgentLine(trimmed);
      if (parsed.label) console.log(`[architect] ${parsed.label}`);
      if (parsed.terminal) exitCode = parsed.exitCode ?? 0;
    }
  };

  await new Promise((resolveRun) => {
    child.stdout.on("data", (c) => flush(String(c), false));
    child.stderr.on("data", (c) => flush(String(c), true));
    child.on("close", (code) => {
      resolveRun(code ?? exitCode ?? 1);
    });
    child.on("error", (err) => {
      console.error(`[architect] spawn error: ${err.message}`);
      resolveRun(1);
    });
  });

  console.log(`\n[architect] Finished exit ${exitCode}`);
  console.log("[architect] Refresh Developer Agent in the browser to see findings.");
  process.exit(exitCode);
}

main();
