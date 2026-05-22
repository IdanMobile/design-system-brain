/**
 * Optional git worktree sandbox for fix-all agents (FIX_ALL_SANDBOX=worktree).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync, cpSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {string} repoRoot
 * @param {string} jobId
 */
export function createSandboxWorktree(repoRoot, jobId) {
  const short = String(jobId).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 12);
  const branch = `agent/sandbox-${short}`;
  const sandboxesDir = join(repoRoot, ".sandboxes");
  mkdirSync(sandboxesDir, { recursive: true });
  const wtPath = join(sandboxesDir, short);

  if (existsSync(wtPath)) {
    removeSandboxWorktree(repoRoot, wtPath, branch);
  }

  const add = spawnSync("git", ["worktree", "add", "-B", branch, wtPath], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (add.status !== 0) {
    return {
      ok: false,
      error: add.stderr?.trim() || add.stdout?.trim() || "git worktree add failed"
    };
  }

  const mainNm = join(repoRoot, "node_modules");
  const wtNm = join(wtPath, "node_modules");
  if (existsSync(mainNm) && !existsSync(wtNm)) {
    try {
      symlinkSync(mainNm, wtNm);
    } catch {
      /* optional */
    }
  }

  return { ok: true, path: wtPath, branch, jobId: short };
}

/**
 * @param {string} repoRoot
 * @param {string} wtPath
 * @param {string} branch
 */
export function removeSandboxWorktree(repoRoot, wtPath, branch) {
  spawnSync("git", ["worktree", "remove", "--force", wtPath], { cwd: repoRoot, encoding: "utf8" });
  spawnSync("git", ["branch", "-D", branch], { cwd: repoRoot, encoding: "utf8" });
}

/**
 * Copy promoted files from sandbox worktree into main repo.
 * @param {string} mainRoot
 * @param {string} sandboxPath
 * @param {string[]} files
 */
export function promoteSandboxFiles(mainRoot, sandboxPath, files) {
  const promoted = [];
  for (const rel of files) {
    if (!rel || rel.startsWith(".test-console/")) continue;
    const src = join(sandboxPath, rel);
    const dest = join(mainRoot, rel);
    if (!existsSync(src)) continue;
    cpSync(src, dest);
    promoted.push(rel);
  }
  return promoted;
}

/**
 * @param {{ path: string, branch: string, jobId: string }} sandbox
 * @param {string} mainRoot
 */
export function teardownSandbox(sandbox, mainRoot) {
  if (!sandbox?.path) return;
  removeSandboxWorktree(mainRoot, sandbox.path, sandbox.branch);
}
