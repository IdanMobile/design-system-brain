#!/usr/bin/env node
/**
 * Dispatch code-architect-investigator in Terminal (read-only audit).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildArchitectAuditPrompt } from "./architecture-console.mjs";
import { hasCursorAgent, cursorAgentInvocation, parseStreamJsonAgentLine } from "./test-console-cursor-cli.mjs";
import { resolveDevAgentModel, loadRunSettings } from "./test-console-run-settings.mjs";
import { spawn } from "node:child_process";
import {
  startDeveloperActivity,
  setDeveloperActivityPhase,
  setDeveloperActivityAgentLabel,
  appendDeveloperActivityLog,
  finishDeveloperActivity
} from "./developer-activity.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const settings = loadRunSettings();
  if (!hasCursorAgent(settings.devAgentCli)) {
    console.error(`Agent CLI (${settings.devAgentCli}) not found.`);
    process.exit(1);
  }

  const jobId = `audit-${Date.now()}`;
  const model = resolveDevAgentModel(settings);

  mkdirSync(join(ROOT, ".test-console"), { recursive: true });
  startDeveloperActivity(ROOT, {
    kind: "audit",
    jobId,
    terminalTitle: "Architect audit",
    model,
    detail: "Preparing code architect audit prompt"
  });

  const prompt = buildArchitectAuditPrompt();
  const promptFile = join(ROOT, ".test-console", "architect-audit.prompt.txt");
  writeFileSync(promptFile, prompt, "utf8");

  appendDeveloperActivityLog(ROOT, "[architect] Code architect investigator — read-only audit");
  console.log("[architect] Code architect investigator — read-only audit\n");
  console.log("[architect] Outputs: docs/superpowers/specs/*-code-architect-audit.md");
  console.log("[architect]          .test-console/architecture-findings.json\n");

  setDeveloperActivityPhase(ROOT, "agent", "Agent investigating architecture (read-only)");
  console.log(`[architect] Model: ${model}\n`);

  const { bin, args } = cursorAgentInvocation(prompt, { streamProgress: true, model, cliName: settings.devAgentCli });

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
        appendDeveloperActivityLog(ROOT, `[stderr] ${trimmed}`);
        continue;
      }
      const parsed = parseStreamJsonAgentLine(trimmed);
      if (parsed.label) {
        console.log(`[architect] ${parsed.label}`);
        setDeveloperActivityAgentLabel(ROOT, parsed.label);
      }
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
      appendDeveloperActivityLog(ROOT, `spawn error: ${err.message}`);
      resolveRun(1);
    });
  });

  setDeveloperActivityPhase(ROOT, "report", "Writing audit report and findings JSON");

  console.log(`\n[architect] Finished exit ${exitCode}`);
  if (exitCode === 0) {
    finishDeveloperActivity(ROOT, "complete", "Audit complete — refresh page for findings");
  } else {
    finishDeveloperActivity(ROOT, "failed", `Audit agent exited with code ${exitCode}`);
  }
  console.log("[architect] Refresh Developer Agent in the browser to see findings.");
  process.exit(exitCode);
}

main();
