/**
 * Automatic role-based workflow lines for Cursor agent prompts.
 * Used by test-console-agent-bridge and documented in .cursor/rules/automatic-workflows.mdc
 */

export const SKILLS = {
  orchestrator: ".cursor/skills/project-orchestrator/SKILL.md",
  roadmap: ".cursor/skills/roadmap-iteration/SKILL.md",
  untilPass: ".cursor/skills/figma-renderer-until-pass/SKILL.md",
  investigate: ".cursor/skills/investigate-figma-mismatch/SKILL.md",
  architect: ".cursor/skills/code-architect-investigator/SKILL.md",
  developerAgent: ".cursor/skills/developer-agent/SKILL.md",
  console: ".cursor/skills/listen-to-test-console/SKILL.md",
  roadmapDoc: "docs/ROADMAP.md",
  labMemoryRule: ".cursor/rules/lab-memory.mdc"
};

/** Obsidian vault — read before investigate, append after. */
export const LAB_MEMORY_LINES = [
  "Read lab-memory/stories/<storyId>.md if it exists (create from lab-memory/templates/story.md if missing).",
  "After investigate, before code edits: append lab-memory/templates/investigation.md to the story note.",
  "Never store secrets in lab-memory/."
];

/**
 * @param {string[]} lines
 * @param {number} startAt
 * @returns {number} next step number
 */
function appendLabMemorySteps(lines, startAt) {
  lines.push(`${startAt}. Lab memory (${SKILLS.labMemoryRule}): ${LAB_MEMORY_LINES[0]}`);
  lines.push(`${startAt + 1}. ${LAB_MEMORY_LINES[1]}`);
  lines.push(`${startAt + 2}. ${LAB_MEMORY_LINES[2]}`);
  return startAt + 3;
}

/** Superpowers plugin skills (by name — load when available in Cursor). */
export const SUPERPOWERS = {
  usingSuperpowers: "using-superpowers",
  systematicDebugging: "systematic-debugging",
  verificationBeforeCompletion: "verification-before-completion",
  writingPlans: "writing-plans",
  brainstorming: "brainstorming"
};

/** @typedef {'fix_live' | 'fix_mock' | 'fix_pixel' | 'fix_delivery' | 'fix_all' | 'fix_all_batch' | 'test_run' | 'code_shared' | 'code_story' | 'orchestrate' | 'portfolio_golden' | 'developer_audit' | 'developer_implement'} WorkflowActivity */

/**
 * @param {WorkflowActivity} activity
 * @param {{ mode?: string, suiteId?: string, storyId?: string, sharedFilesTouched?: boolean }} ctx
 */
export function workflowPreamble(activity, ctx = {}) {
  const { mode, suiteId, storyId, sharedFilesTouched } = ctx;
  const lines = [
    "── Automatic workflow (do not skip roles) ──",
    `1. Read ${SKILLS.orchestrator} — pre-flight: confirm phase + infra + verdict.`,
    `2. Read ${SKILLS.roadmap} — active section: docs/ROADMAP.md (default §1.2 until live strict green).`
  ];

  switch (activity) {
    case "fix_live": {
      let n = appendLabMemorySteps(lines, 3);
      lines.push(
        `${n}. Worker: ${SKILLS.untilPass} + ${SKILLS.investigate} — systematic-debugging BEFORE edits.`,
        `${n + 1}. Fix: code-v2.ts → plugin build → YOU run live test (pnpm infra:ensure first). Ask human ready ONLY if bridge/export fails.`,
        `${n + 2}. Regression Tier A: re-run pixel + mock + live for this story (pnpm test:regression -- --tier a --story … --suite figmaLive).`,
        sharedFilesTouched
          ? `${n + 3}. Regression Tier C: pnpm test:regression (or test:pixel:golden + figma:iterate:strict + figma:live-iterate --strict).`
          : `${n + 3}. Tier C: pnpm test:regression only if you touched shared adapter files.`,
        `${n + 4}. Post-flight: verification-before-completion — paste command exit codes.`
      );
      break;
    }
    case "fix_mock":
    case "fix_pixel":
    case "fix_delivery": {
      let n = appendLabMemorySteps(lines, 3);
      lines.push(
        `${n}. Worker: ${SKILLS.untilPass} + ${SKILLS.investigate}.`,
        mode === "pixel"
          ? `${n + 1}. Fix: scene-to-html.ts / extract.ts — not code-v2 unless import path.`
          : mode === "delivery"
            ? `${n + 1}. Fix: @lab/ui + delivery path; steps 1–3 must already pass for story.`
            : `${n + 1}. Fix: code-v2.ts (mock) → plugin build if importer changed.`,
        storyId ? `${n + 2}. Tier A: pnpm test:regression -- --tier a --story ${storyId} --suite <pixel|figma|figmaLive|delivery>.` : `${n + 2}. Tier A: re-run prior steps 1..N for target story after fix.`,
        sharedFilesTouched
          ? `${n + 3}. Tier C: pnpm test:regression (full strict goldens on shared adapter change).`
          : `${n + 3}. Tier C: pnpm test:regression if code-v2.ts, scene-to-html.ts, extract.ts, or contract changed.`,
        `${n + 4}. Post-flight: verification-before-completion.`
      );
      break;
    }
    case "fix_all": {
      let n = appendLabMemorySteps(lines, 3);
      lines.push(
        `${n}. Worker: ${SKILLS.untilPass} + ${SKILLS.investigate} — ONE story per agent run (serial mode).`,
        `${n + 1}. Harness rebuilds/tests after you; do not run full suite yourself.`,
        `${n + 2}. Post-flight per story: Tier A; after shared edit → Tier C before next story.`
      );
      break;
    }
    case "fix_all_batch": {
      let n = appendLabMemorySteps(lines, 3);
      lines.push(
        `${n}. Worker: ${SKILLS.investigate} FIRST on ALL listed stories — read batch investigation report + compare PNGs; append lab-memory per story.`,
        `${n + 1}. Worker: ${SKILLS.untilPass} — implement **shared fixes for every story in one session** (not one-by-one).`,
        `${n + 2}. Prefer code-v2.ts / scene-to-html.ts / extract.ts changes that green multiple stories at once.`,
        `${n + 3}. Do NOT run golden tests yourself — harness re-tests all listed stories after plugin build.`,
        `${n + 4}. Harness sandbox gate: metrics regress → auto git restore; 2 batch regressions → FIX_ALL_SERIAL=1.`,
        `${n + 5}. Tier C if shared adapter touched — pnpm test:regression.`
      );
      break;
    }
    case "test_run":
      lines.push(
        "3. Run requested test only; do not fix unless it fails.",
        "4. On fail: auto-switch to fix_* workflow for that suite.",
        "5. Post-flight: pnpm test:portfolio:refresh; orchestrator verdict."
      );
      break;
    case "code_shared":
      lines.push(
        "3. Before edit: systematic-debugging + investigate if visual.",
        "4. After edit: Tier C mandatory — pnpm test:regression.",
        "5. Post-flight: project-orchestrator REGRESSION or ON_TRACK verdict."
      );
      break;
    case "code_story":
      lines.push(
        "3. Tier A for affected story after change.",
        "4. Post-flight: verification-before-completion for that story's step."
      );
      break;
    case "orchestrate":
      lines.push(
        "3. Do NOT implement — output Orchestrator report template only.",
        "4. Dispatch one worker or subagent with ROADMAP § + validation commands."
      );
      break;
    case "portfolio_golden": {
      let n = appendLabMemorySteps(lines, 3);
      lines.push(
        `${n}. Supervisor: ${SKILLS.orchestrator} — drive full portfolio to PHASE_COMPLETE.`,
        `${n + 1}. Worker chain per story/step: ${SKILLS.investigate} BEFORE edits → ${SKILLS.untilPass} implement.`,
        `${n + 2}. Sequential gates: pixel → figma mock → figma live → delivery (strict 0.1% global + hotspot).`,
        `${n + 3}. Do NOT stop for approval. Do NOT ask the human to say continue.`,
        `${n + 4}. Human-only: reload/open Figma plugin after code-v2 rebuild (one line; wait for ready if live fails).`,
        `${n + 5}. Tier A after each story fix; Tier C (pnpm test:regression) if code-v2.ts, scene-to-html.ts, extract.ts, or contract changed.`,
        `${n + 6}. Stop only when all portfolio stories pass all steps — verdict PHASE_COMPLETE.`
      );
      break;
    }
    case "developer_audit":
      lines.push(
        `3. Superpowers: ${SUPERPOWERS.usingSuperpowers} — check skills before any action.`,
        `4. Read ${SKILLS.developerAgent} — Developer Agent scope (NOT story fix worker).`,
        `5. Read ${SKILLS.architect} — audit template + JSON/report outputs.`,
        `6. Context: ${SKILLS.orchestrator} + ${SKILLS.roadmap} + docs/ROADMAP.md + .cursor/rules/automatic-workflows.mdc (lab policy only — not upload_to_cloud).`,
        `7. Superpowers: ${SUPERPOWERS.systematicDebugging} — trace root causes; question architecture if same symptom class repeats.`,
        `8. Superpowers: ${SUPERPOWERS.verificationBeforeCompletion} — cite file:line evidence for every finding.`,
        "9. READ-ONLY — do NOT fix stories, run golden tests, or edit code-v2.ts for parity.",
        "10. Write docs/superpowers/specs/<date>-code-architect-audit.md + .test-console/architecture-findings.json (status: complete)."
      );
      break;
    case "developer_implement":
      lines.push(
        `3. Superpowers: ${SUPERPOWERS.usingSuperpowers} — check skills before any action.`,
        `4. Read ${SKILLS.developerAgent} — implement architecture recommendations ONLY (not story parity).`,
        `5. Superpowers: ${SUPERPOWERS.writingPlans} — small scoped plan before edits.`,
        `6. Context: .test-console/architecture-findings.json recommendations + docs/ROADMAP.md.`,
        `7. Superpowers: ${SUPERPOWERS.verificationBeforeCompletion} — cite file:line in proposal report.`,
        "8. Edit ONLY what recommendations require — prefer scripts/docs/wiring over visual adapters.",
        "9. Do NOT run golden tests — harness verifies after you finish (temp apply → test → restore).",
        "10. Do NOT commit. Write docs/superpowers/specs/<date>-developer-proposal.md (summary, files, risk, expected impact).",
        "11. Human approves via Developer Agent page → Approve & apply."
      );
      break;
    default:
      break;
  }

  if (suiteId && storyId) {
    lines.push(`Target: ${storyId} (${suiteId}).`);
  }

  lines.push("── End automatic workflow ──");
  return lines;
}

/** @param {'live' | 'emulator' | 'pixel'} mode */
export function activityFromMode(mode, opts = {}) {
  if (opts.fixAllBatch) return "fix_all_batch";
  if (opts.fixAll) return "fix_all";
  if (mode === "live") return "fix_live";
  if (mode === "pixel") return "fix_pixel";
  return "fix_mock";
}

export function skillFollowLines(mode, ctx = {}) {
  const activity = activityFromMode(mode, ctx);
  return [
    ...workflowPreamble(activity, {
      mode,
      suiteId: ctx.suiteId,
      storyId: ctx.storyId,
      sharedFilesTouched: ctx.sharedFilesTouched
    }),
    `Read ${SKILLS.untilPass} and ${SKILLS.investigate} — investigate BEFORE editing.`,
    "Act immediately — do NOT ask approval to start fixing."
  ];
}

/** Full prompt for Developer Agent architecture audit (Terminal CLI). */
export function developerAgentAuditPrompt() {
  return [
    "--- Developer Agent · architecture audit ---",
    ...workflowPreamble("developer_audit"),
    "",
    `Read ${SKILLS.developerAgent} and ${SKILLS.architect} in full before auditing.`,
    "Optional deep map: pathfinder skill → PATHFINDER-<date>/ artifacts.",
    "Act immediately — read-only audit; no story fixes."
  ].join("\n");
}

/**
 * @param {{ recommendations?: string[] }} [opts]
 */
export function developerAgentImplementPrompt(opts = {}) {
  const recs = opts.recommendations?.length
    ? opts.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")
    : "(Read .test-console/architecture-findings.json recommendations — implement top 1–3 safe items.)";
  return [
    "--- Developer Agent · sandbox implement ---",
    ...workflowPreamble("developer_implement"),
    "",
    `Read ${SKILLS.developerAgent} in full.`,
    "",
    "Target recommendations:",
    recs,
    "",
    "You are in an isolated git worktree. Edits stay here until the human approves.",
    "Act immediately — implement scoped recommendations; write the proposal report when done."
  ].join("\n");
}
