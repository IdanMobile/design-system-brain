#!/usr/bin/env node
/**
 * Refresh .cursor/agent-context.auto.md — unified portfolio snapshot.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { UNIFIED_STEP_ORDER } from "./build-unified-portfolio.mjs";
import { loadUnifiedPortfolio, summarizeUnifiedStep, effectiveOrchestratorFilters } from "./unified-orchestrator-work.mjs";
import { loadRunSettings } from "./test-console-run-settings.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".cursor/agent-context.auto.md");

function activePhase(portfolio) {
  const settings = loadRunSettings();
  const filters = effectiveOrchestratorFilters(settings);
  for (const stepId of ["vsFigmaLive", "vsStorybook", "vsReactHtml", "structural"]) {
    const s = summarizeUnifiedStep(portfolio, stepId, filters);
    if (s.failing.length > 0) {
      return `ROADMAP §1.2 — unified ${stepId} (${s.failing.length} fail/warn)`;
    }
  }
  return "ROADMAP §1.2+ unified portfolio validation";
}

function main() {
  const portfolio = loadUnifiedPortfolio(ROOT);
  const settings = loadRunSettings();
  const filters = effectiveOrchestratorFilters(settings);
  const phase = activePhase(portfolio);

  const lines = [
    "# Agent context (auto-generated)",
    "",
    `Updated: ${new Date().toISOString()}`,
    "",
    "**Read with:** `.cursor/skills/project-orchestrator/SKILL.md` on every fix / test / adapter edit.",
    "",
    "## Active phase",
    phase,
    "",
    "## Unified portfolio",
    "",
    `Items: ${portfolio.storyCount ?? portfolio.rows?.length ?? 0} · tolerance ${portfolio.tolerance ?? 0.1}%`,
    "",
    "| Step | Pass | Warn | Fail | Error | Not tested |",
    "| --- | ---: | ---: | ---: | ---: | ---: |"
  ];

  for (const stepId of UNIFIED_STEP_ORDER) {
    const s = summarizeUnifiedStep(portfolio, stepId, {
      skipPass: false,
      onlyNotTested: false,
      applyToOrchestrator: true
    });
    const counts = { pass: 0, warn: 0, fail: 0, error: 0, not_tested: 0 };
    for (const row of portfolio.rows ?? []) {
      const st = row.cells?.[stepId]?.status ?? "not_tested";
      counts[st] = (counts[st] ?? 0) + 1;
    }
    const label =
      stepId === "structural"
        ? "Structural"
        : stepId === "logic"
          ? "Logic audit"
          : stepId;
    lines.push(
      `| ${label} | ${counts.pass} | ${counts.warn} | ${counts.fail} | ${counts.error} | ${counts.not_tested} |`
    );
  }

  lines.push(
    "",
    "## Automatic roles (always)",
    "",
    "| Activity | Skills |",
    "| --- | --- |",
    "| Fix (console / run until pass) | orchestrator → investigate → until-pass → Tier A/C → verification |",
    "| Test only | run test → on fail switch to fix workflow → portfolio refresh |",
    "| Status / what's next | orchestrator orient only |",
    "",
    "## North star",
    "",
    "Universal JSON hub → pixel-perfect Figma + `@lab/ui`; devs use props-only API (`ds.list(…)`).",
    "",
    "Full plan: `docs/ROADMAP.md`."
  );

  mkdirSync(join(ROOT, ".cursor"), { recursive: true });
  writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(`Orchestrator context → ${OUT}`);
}

main();
