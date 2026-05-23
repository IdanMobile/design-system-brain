/**
 * Architecture / developer brain console — project map, decisions, audit findings.
 * NOT the story fix-agent UI (that lives on Tests Console). Shown on Developer Agent page.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { hasCursorAgent } from "./test-console-cursor-cli.mjs";
import { loadRunSettings } from "./test-console-run-settings.mjs";
import { developerAgentAuditPrompt, developerAgentImplementPrompt } from "./agent-workflow-preamble.mjs";
import { loadDeveloperProposal, proposalForApi, hasGitRepository } from "./developer-proposal.mjs";
import { buildDeveloperActivityView } from "./developer-activity.mjs";

const PIPELINE = [
  {
    id: "extract",
    label: "Extract",
    command: "pnpm extract:all",
    files: ["packages/extractor-playwright/", "artifacts/"],
    proves: "Storybook DOM → UniversalLayer JSON artifacts"
  },
  {
    id: "contract",
    label: "Contract",
    files: ["packages/contract/"],
    proves: "Schema, story registry, semantic helpers"
  },
  {
    id: "pixel",
    label: "Pixel renderer",
    command: "pnpm test:pixel:golden",
    files: ["packages/pixel-test/src/scene-to-html.ts"],
    proves: "JSON → HTML reference (step 1 gate)"
  },
  {
    id: "figma-mock",
    label: "Figma mock renderer",
    command: "pnpm figma:iterate:strict",
    files: ["packages/figma-importer-plugin/src/code-v2.ts"],
    proves: "Plugin renderer vs Storybook (step 2)"
  },
  {
    id: "figma-live",
    label: "Figma live",
    command: "pnpm figma:live-iterate --strict",
    files: ["packages/figma-importer-plugin/src/code-v2.ts", "scripts/figma-live-iterate.mjs"],
    proves: "Real Desktop export vs Storybook (step 3)"
  },
  {
    id: "delivery",
    label: "Delivery",
    command: "pnpm test:delivery:golden",
    files: ["packages/ui/", "packages/developer-playground/"],
    proves: "Storybook · @lab/ui · Figma mock 3-way (step 4)"
  }
];

const PACKAGES = [
  { name: "@lab/contract", role: "UniversalLayer v2 schema, story IDs, component families" },
  { name: "@lab/extractor-playwright", role: "Storybook → JSON extraction" },
  { name: "@lab/pixel-test", role: "scene-to-html mock + pixel/delivery golden tests" },
  { name: "@lab/figma-importer-plugin", role: "code-v2.ts Figma import renderer (mock + live)" },
  { name: "@lab/ui", role: "Hand-written React components (future ds.* API)" },
  { name: "@lab/storybook-lab", role: "Story fixtures and lab components" },
  { name: "@lab/test-console", role: "Dashboard UI + job API (this app)" }
];

const AGENT_ROLES = [
  {
    role: "Developer Agent",
    skill: ".cursor/skills/developer-agent/SKILL.md",
    when: "Architecture page — audit brain; composes lab + Superpowers skills"
  },
  {
    role: "Code architect",
    skill: ".cursor/skills/code-architect-investigator/SKILL.md",
    when: "Read-only audit outputs (findings JSON + spec report)"
  },
  {
    role: "Superpowers · using-superpowers",
    skill: "using-superpowers (plugin)",
    when: "Always check applicable skills before acting"
  },
  {
    role: "Superpowers · systematic-debugging",
    skill: "systematic-debugging (plugin)",
    when: "Root-cause + question architecture when patterns repeat"
  },
  {
    role: "Superpowers · verification-before-completion",
    skill: "verification-before-completion (plugin)",
    when: "file:line evidence for every audit finding"
  },
  {
    role: "Orchestrator (context)",
    skill: ".cursor/skills/project-orchestrator/SKILL.md",
    when: "Phase gates, portfolio verdict — read-only for audits"
  },
  {
    role: "Fix worker (Tests Console only)",
    skill: ".cursor/skills/figma-renderer-until-pass/SKILL.md",
    when: "Story parity fixes — NOT Developer Agent"
  },
  {
    role: "Investigator (visual)",
    skill: ".cursor/skills/investigate-figma-mismatch/SKILL.md",
    when: "PNG/artifact diff before renderer edits — Tests Console"
  },
  {
    role: "Regression verifier",
    skill: "scripts/regression-tiers.mjs",
    when: "Tier A/B/C after shared adapter edits"
  },
  {
    role: "Sandbox gate",
    skill: "scripts/sandbox-promote.mjs",
    when: "Discard agent edits when metrics regress"
  }
];

const KEY_BRAIN_FILES = [
  { path: "packages/figma-importer-plugin/src/code-v2.ts", role: "Figma import renderer" },
  { path: "packages/pixel-test/src/scene-to-html.ts", role: "Pixel HTML renderer" },
  { path: "packages/contract/src/v2.ts", role: "UniversalLayer contract" },
  { path: "scripts/test-console-fix-all-iterate.mjs", role: "Fix-all supervisor loop" },
  { path: "scripts/test-console-portfolio-orchestrator.mjs", role: "Portfolio golden-path supervisor" },
  { path: "scripts/test-console-worker-supervisor.mjs", role: "Worker verdicts (WORSE_METRICS, etc.)" },
  { path: "scripts/sandbox-promote.mjs", role: "Promote/discard gate" },
  { path: "scripts/regression-tiers.mjs", role: "Tier A/B/C regression policy" },
  { path: "scripts/agent-workflow-preamble.mjs", role: "Agent prompt role chain" },
  { path: ".cursor/rules/automatic-workflows.mdc", role: "Lab agent role chain & regression policy" },
  { path: "docs/ROADMAP.md", role: "Phase plan & north star" }
];

/** Lab policy for Developer Agent — not upload_to_cloud (cloud fleet planning). */
const LAB_DECISIONS = [
  {
    id: "SEQ",
    title: "Sequential test gates",
    implication: "Per story: pixel → figma mock → figma live → delivery (strict 0.1%)"
  },
  {
    id: "INV",
    title: "Investigate before fix",
    implication: "Tests Console fix workers read PNG/artifacts before shared adapter edits"
  },
  {
    id: "VER",
    title: "Verifier separate from fixer",
    implication: "sandbox-promote compares metrics and git-restore on regression"
  },
  {
    id: "TIER",
    title: "Shared adapter lock",
    implication: "No parallel fixes after code-v2 / scene-to-html / extract / contract until Tier C"
  },
  {
    id: "HUMAN",
    title: "Human-only Figma UI",
    implication: "Plugin reload/open when relay bridge fails after automation"
  }
];

const CONSTRAINTS = [
  "Sequential tests per story: pixel → figma mock → figma live → delivery",
  "Live Figma requires macOS, relay :3456, Desktop plugin connected",
  "No parallel fixes after shared adapter edits until Tier C passes",
  "Investigator before fix; verifier separate from fixer (sandbox promote)",
  "Human only: Figma Desktop plugin reload when automation fails"
];

/**
 * @param {string} repoRoot
 */
function loadFindings(repoRoot) {
  const path = join(repoRoot, ".test-console", "architecture-findings.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {string} repoRoot
 */
function loadLatestAudit(repoRoot) {
  const dir = join(repoRoot, "docs", "superpowers", "specs");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.includes("code-architect-audit") && f.endsWith(".md"))
    .sort()
    .reverse();
  if (!files.length) return null;
  const name = files[0];
  const content = readFileSync(join(dir, name), "utf8");
  return {
    filename: name,
    path: `docs/superpowers/specs/${name}`,
    excerpt: content.slice(0, 4000),
    fullLength: content.length
  };
}

/**
 * @param {string} repoRoot
 */
function loadSpecs(repoRoot) {
  const dir = join(repoRoot, "docs", "superpowers", "specs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse()
    .map((name) => ({ name, path: `docs/superpowers/specs/${name}` }));
}

/**
 * @param {string} repoRoot
 */
function loadAgentContext(repoRoot) {
  const path = join(repoRoot, ".cursor", "agent-context.auto.md");
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

/**
 * @param {string} repoRoot
 */
function parseActivePhase(contextMd) {
  if (!contextMd) return "See docs/ROADMAP.md";
  const m = contextMd.match(/ROADMAP[^\n]*/);
  return m ? m[0].replace(/^## Active phase\n/, "").trim() : "ROADMAP §1.2";
}

/**
 * @param {string} repoRoot
 */
function loadKeyFiles(repoRoot) {
  return KEY_BRAIN_FILES.map(({ path, role }) => {
    const abs = join(repoRoot, path);
    if (!existsSync(abs)) return { path, role, lines: null, exists: false };
    const content = readFileSync(abs, "utf8");
    return {
      path,
      role,
      lines: content.split("\n").length,
      exists: true,
      modifiedAt: statSync(abs).mtime.toISOString()
    };
  });
}

/**
 * @param {string} repoRoot
 */
export function buildArchitectureConsoleState(repoRoot) {
  const agentContext = loadAgentContext(repoRoot);
  const findings = loadFindings(repoRoot);
  const proposal = proposalForApi(loadDeveloperProposal(repoRoot));
  return {
    generatedAt: new Date().toISOString(),
    hasCursorCli: hasCursorAgent(loadRunSettings().devAgentCli),
    hasGitRepo: hasGitRepository(repoRoot),
    northStar:
      "Universal JSON hub → pixel-perfect Figma + @lab/ui; devs use props-only API (ds.list(…)).",
    activePhase: parseActivePhase(agentContext),
    pipeline: PIPELINE,
    packages: PACKAGES,
    agentRoles: AGENT_ROLES,
    decisions: LAB_DECISIONS,
    constraints: CONSTRAINTS,
    findings,
    latestAudit: loadLatestAudit(repoRoot),
    specs: loadSpecs(repoRoot),
    keyFiles: loadKeyFiles(repoRoot),
    agentContextMarkdown: agentContext,
    proposal,
    activity: buildDeveloperActivityView(repoRoot, proposal, findings)
  };
}

/**
 * @param {string} repoRoot
 */
export function buildDeveloperImplementPrompt(repoRoot) {
  const findings = loadFindings(repoRoot);
  const recommendations = findings?.recommendations?.slice(0, 5) ?? [];
  return developerAgentImplementPrompt({ recommendations });
}

export function buildArchitectAuditPrompt() {
  return developerAgentAuditPrompt();
}
