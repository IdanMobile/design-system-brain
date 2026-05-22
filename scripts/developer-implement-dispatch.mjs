#!/usr/bin/env node
/**
 * Developer Agent — implement architecture recommendations in isolated git worktree.
 * Verifies on main (temp promote → test → restore), then waits for human Approve on UI.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { buildDeveloperImplementPrompt } from "./architecture-console.mjs";
import { hasCursorAgent, cursorAgentInvocation, parseStreamJsonAgentLine } from "./test-console-cursor-cli.mjs";
import { resolveAgentModel, loadRunSettings } from "./test-console-run-settings.mjs";
import { createSandboxWorktree, teardownSandbox } from "./sandbox-worktree.mjs";
import {
  diffWorkspaceSnapshots,
  snapshotWorkspace
} from "./test-console-worker-supervisor.mjs";
import {
  loadDeveloperProposal,
  saveDeveloperProposal,
  verifyWorktreeChanges,
  findProposalReport
} from "./developer-proposal.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function runAgentInSandbox(worktreePath, prompt, jobId) {
  mkdirSync(join(worktreePath, ".test-console"), { recursive: true });
  const promptFile = join(worktreePath, ".test-console", `${jobId}.implement.prompt.txt`);
  writeFileSync(promptFile, prompt, "utf8");

  const model = resolveAgentModel(loadRunSettings());
  const { bin, args } = cursorAgentInvocation(prompt, { streamProgress: true, model });

  console.log(`[developer] Model: ${model}`);
  console.log(`[developer] Sandbox: ${worktreePath}\n`);

  const child = spawn(bin, args, {
    cwd: worktreePath,
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
        console.error(`[developer] stderr: ${trimmed}`);
        continue;
      }
      const parsed = parseStreamJsonAgentLine(trimmed);
      if (parsed.label) console.log(`[developer] ${parsed.label}`);
      if (parsed.terminal) exitCode = parsed.exitCode ?? 0;
    }
  };

  await new Promise((resolveRun) => {
    child.stdout.on("data", (c) => flush(String(c), false));
    child.stderr.on("data", (c) => flush(String(c), true));
    child.on("close", (code) => resolveRun(code ?? exitCode ?? 1));
    child.on("error", (err) => {
      console.error(`[developer] spawn error: ${err.message}`);
      resolveRun(1);
    });
  });

  return exitCode;
}

async function main() {
  if (!hasCursorAgent()) {
    console.error("Cursor CLI not found. Install: https://cursor.com/docs/cli/overview");
    process.exit(1);
  }

  const existing = loadDeveloperProposal(ROOT);
  if (existing?.status === "pending_approval" && existing.sandbox?.path && existsSync(existing.sandbox.path)) {
    console.error("[developer] A proposal is already pending approval — Approve or Discard on Developer Agent page first.");
    process.exit(1);
  }
  if (existing?.status === "running") {
    console.error("[developer] An implement job is already running.");
    process.exit(1);
  }

  const jobId = `impl-${Date.now()}`;
  saveDeveloperProposal(ROOT, {
    jobId,
    status: "running",
    createdAt: new Date().toISOString(),
    changedFiles: [],
    verification: null,
    report: null
  });

  console.log("[developer] Creating isolated sandbox worktree…\n");
  const created = createSandboxWorktree(ROOT, jobId);
  if (!created.ok) {
    saveDeveloperProposal(ROOT, {
      status: "failed",
      error: created.error ?? "worktree create failed",
      completedAt: new Date().toISOString()
    });
    console.error(`[developer] ${created.error}`);
    process.exit(1);
  }

  /** @type {{ path: string, branch: string, jobId: string }} */
  const sandbox = { path: created.path, branch: created.branch, jobId: created.jobId };

  try {
    const prompt = buildDeveloperImplementPrompt(ROOT);
    const gitBefore = snapshotWorkspace(created.path);

    console.log("[developer] Running agent in sandbox (architecture recommendations)…\n");
    const agentExitCode = await runAgentInSandbox(created.path, prompt, jobId);

    const filesChanged = diffWorkspaceSnapshots(gitBefore, snapshotWorkspace(created.path)).filter(
      (f) => !f.startsWith(".test-console/")
    );

    console.log(`\n[developer] Agent exit ${agentExitCode}`);
    console.log(
      `[developer] Changed files: ${filesChanged.length ? filesChanged.join(", ") : "(none)"}\n`
    );

    if (!filesChanged.length) {
      saveDeveloperProposal(ROOT, {
        status: "failed",
        sandbox,
        agentExitCode,
        changedFiles: [],
        error: "Agent made no tracked file changes",
        completedAt: new Date().toISOString()
      });
      teardownSandbox(sandbox, ROOT);
      console.log("[developer] No changes — sandbox torn down. Refresh Developer Agent page.");
      process.exit(agentExitCode || 1);
    }

    console.log("[developer] Verifying (temp apply → test:supervisor [+ regression if adapters] → restore main)…\n");
    const verification = verifyWorktreeChanges(ROOT, created.path, filesChanged);
    const report = findProposalReport(ROOT, created.path);

    const successRatePct = Math.round((verification.after?.successRate ?? 0) * 1000) / 10;
    const successRateBeforePct = Math.round((verification.baseline?.successRate ?? 0) * 1000) / 10;

    console.log(`[developer] Supervisor exit: ${verification.supervisorExit}`);
    if (verification.regressionExit !== null) {
      console.log(`[developer] Regression exit: ${verification.regressionExit}`);
    }
    console.log(
      `[developer] Portfolio success rate: ${successRateBeforePct}% → ${successRatePct}%` +
        (verification.comparison?.passDelta
          ? ` (${verification.comparison.passDelta >= 0 ? "+" : ""}${verification.comparison.passDelta} passes)`
          : "")
    );
    console.log(`[developer] Verification: ${verification.ok ? "PASS" : "FAIL — review before approving"}\n`);

    saveDeveloperProposal(ROOT, {
      status: "pending_approval",
      sandbox,
      agentExitCode,
      changedFiles: filesChanged,
      verification: {
        ok: verification.ok,
        supervisorExit: verification.supervisorExit,
        regressionExit: verification.regressionExit,
        portfolioOk: verification.portfolioOk,
        supervisorOk: verification.supervisorOk,
        regressionOk: verification.regressionOk,
        successRateBefore: successRateBeforePct,
        successRateAfter: successRatePct,
        successRateDelta: Math.round((verification.comparison?.successRateDelta ?? 0) * 1000) / 10,
        passDelta: verification.comparison?.passDelta ?? 0,
        failDelta: verification.comparison?.failDelta ?? 0,
        improved: verification.comparison?.improved ?? false,
        regressed: verification.comparison?.regressed ?? false,
        suiteDeltas: verification.comparison?.deltas ?? []
      },
      report,
      completedAt: new Date().toISOString()
    });

    console.log("[developer] Proposal pending human approval.");
    console.log("[developer] Open Developer Agent → Approve & apply (or Discard).");
    console.log("[developer] Sandbox kept at:", created.path);
    process.exit(verification.ok ? 0 : 2);
  } catch (err) {
    saveDeveloperProposal(ROOT, {
      status: "failed",
      sandbox,
      error: err instanceof Error ? err.message : String(err),
      completedAt: new Date().toISOString()
    });
    teardownSandbox(sandbox, ROOT);
    throw err;
  }
}

main();
