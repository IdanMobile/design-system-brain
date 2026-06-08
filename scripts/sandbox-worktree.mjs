/**
 * Optional git worktree sandbox for fix-all agents (FIX_ALL_SANDBOX=worktree).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { ADAPTER_BACKUP_FILES } from "./sandbox-promote.mjs";

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

  seedSandboxAdapterFromMain(repoRoot, wtPath);
  return { ok: true, path: wtPath, branch, jobId: short };
}

/**
 * Copy main working-tree adapter files into sandbox — worktree only has committed HEAD.
 * @param {string} mainRoot
 * @param {string} sandboxPath
 */
export function seedSandboxAdapterFromMain(mainRoot, sandboxPath) {
  const seeded = [];
  for (const rel of ADAPTER_BACKUP_FILES) {
    const src = join(mainRoot, rel);
    const dest = join(sandboxPath, rel);
    if (!existsSync(src)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
    seeded.push(rel);
  }
  return seeded;
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

/** Never promote test noise or sandbox-local paths back to main. */
const SANDBOX_PROMOTE_DENY_PREFIXES = [
  ".test-console/",
  ".sandboxes/",
  ".restore-backup",
  "figma-screen-diffs/",
  "figma-live-diffs/",
  "artifacts/",
  "test-portfolio/",
  "node_modules/",
];

/** Count as a real fixer edit (adapter / contract pipeline). */
const SANDBOX_PROMOTE_CODE_PREFIXES = [
  "packages/figma-importer-plugin/src/",
  "packages/pixel-test/src/",
  "packages/contract/",
  "scripts/figma-manifest-to-contract.mjs",
  "scripts/extract.ts",
  "scripts/scene-to-html.ts",
];

/**
 * @param {string} rel
 */
export function isSandboxPromotableCodeFile(rel) {
  if (!rel) return false;
  return SANDBOX_PROMOTE_CODE_PREFIXES.some(
    (prefix) => rel === prefix || rel.startsWith(prefix)
  );
}

/**
 * @param {string[]} files
 * @param {{ requireCodeEdit?: boolean, codeFileCount?: number, watchdogTripped?: boolean, agentExitCode?: number, editCount?: number | null }} [opts]
 */
export function filterPromotableSandboxFiles(files, opts = {}) {
  const {
    requireCodeEdit = true,
    codeFileCount = 0,
    watchdogTripped = false,
    agentExitCode = 0,
    editCount = null,
  } = opts;

  // Watchdog kill — never promote (agent did not finish).
  if (watchdogTripped || agentExitCode === 143) {
    return [];
  }

  // No git diff on code files AND agent edit counter zero — nothing to promote.
  if (typeof editCount === "number" && editCount === 0 && codeFileCount === 0) {
    return [];
  }

  const filtered = files.filter((rel) => {
    if (!rel || rel.startsWith(".git/")) return false;
    if (SANDBOX_PROMOTE_DENY_PREFIXES.some((p) => rel.startsWith(p))) return false;
    if (rel.endsWith("/report.html") || rel.endsWith("/report.json")) return false;
    if (rel.endsWith("/portfolio.json")) return false;
    if (/\.(png|jpg|webp)$/i.test(rel) && !rel.startsWith("packages/")) return false;
    return true;
  });

  if (!requireCodeEdit) return filtered;

  const codeFiles = filtered.filter(isSandboxPromotableCodeFile);
  return codeFiles.length > 0 ? codeFiles : [];
}

/**
 * Copy promoted files from sandbox worktree into main repo.
 * @param {string} mainRoot
 * @param {string} sandboxPath
 * @param {string[]} files
 * @param {{ requireCodeEdit?: boolean, codeFileCount?: number, watchdogTripped?: boolean, agentExitCode?: number }} [opts]
 */
export function promoteSandboxFiles(mainRoot, sandboxPath, files, opts = {}) {
  const allowed = filterPromotableSandboxFiles(files, opts);
  const promoted = [];
  for (const rel of allowed) {
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
