#!/usr/bin/env node
/**
 * Refresh .cursor/agent-context.auto.md — snapshot for agents (session hook + after tests).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".cursor/agent-context.auto.md");

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function summarizeFromPortfolio(portfolio, stepId) {
  if (!portfolio?.rows?.length) return null;
  const counts = { pass: 0, warn: 0, fail: 0, error: 0, not_tested: 0, skipped: 0 };
  for (const row of portfolio.rows) {
    const s = row.cells?.[stepId]?.status ?? "not_tested";
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return { total: portfolio.rows.length, ...counts };
}

function summarizeSuite(dir) {
  const report = readJson(join(ROOT, dir, "report.json"));
  if (!report?.results) return null;
  const counts = { pass: 0, warn: 0, fail: 0, error: 0 };
  for (const r of report.results) {
    const s = r.status ?? "error";
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return { total: report.results.length, ...counts };
}

function activePhase(live, mock) {
  if (live && (live.fail > 0 || live.error > 0 || live.warn > 0)) return "ROADMAP §1.2 (live Figma golden)";
  if (mock && (mock.fail > 0 || mock.warn > 0)) return "ROADMAP §1.2 mock or §1.3";
  return "ROADMAP §1.2+ or Phase 1 validation";
}

function main() {
  const portfolio = readJson(join(ROOT, "test-portfolio/portfolio.json"));
  const live = portfolio
    ? summarizeFromPortfolio(portfolio, "figmaLive")
    : summarizeSuite("figma-live-diffs");
  const mock = portfolio
    ? summarizeFromPortfolio(portfolio, "figma")
    : summarizeSuite("figma-diffs");
  const pixel = portfolio
    ? summarizeFromPortfolio(portfolio, "pixel")
    : summarizeSuite("pixel-diffs");
  const delivery = portfolio
    ? summarizeFromPortfolio(portfolio, "delivery")
    : summarizeSuite("delivery-diffs");
  const logic = portfolio
    ? summarizeFromPortfolio(portfolio, "logic")
    : summarizeSuite("logic-audit-diffs");

  const phase = activePhase(live, mock);
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
    "## Suite summary",
    "",
    "| Suite | Pass | Warn | Fail | Error | Total |",
    "| --- | ---: | ---: | ---: | ---: | ---: |"
  ];

  for (const [name, s] of [
    ["pixel", pixel],
    ["figma mock", mock],
    ["figma live", live],
    ["delivery", delivery],
    ["logic audit", logic]
  ]) {
    if (!s) {
      lines.push(`| ${name} | — | — | — | — | — |`);
      continue;
    }
    lines.push(
      `| ${name} | ${s.pass ?? 0} | ${s.warn ?? 0} | ${s.fail ?? 0} | ${s.error ?? 0} | ${s.total} |`
    );
  }

  if (portfolio?.rows?.length) {
    lines.push("", `Portfolio stories: ${portfolio.rows.length}.`);
  }

  const supervisor = readJson(join(ROOT, ".test-console/orchestrator-state.json"));
  if (supervisor?.storyId && !supervisor.finished) {
    lines.push(
      "",
      "## Worker supervisor",
      "",
      `Active: ${supervisor.suiteLabel ?? supervisor.suiteId ?? "—"} · ${supervisor.storyId ?? "—"} try ${supervisor.attempt ?? "?"}/${supervisor.maxAttempts ?? "?"} · ${supervisor.verdict ?? "ON_TRACK"} → ${supervisor.nextWorkerMode ?? "continue"}`
    );
  }

  lines.push(
    "",
    "## Automatic roles (always)",
    "",
    "| Activity | Skills |",
    "| --- | --- |",
    "| Fix (console / run until pass) | agent runs all pnpm; human only Figma plugin UI → orchestrator → investigate → until-pass → Tier A/C → verification |",
    "| Test only | run test → on fail switch to fix workflow → portfolio refresh |",
    "| Edit code-v2 / scene-to-html / contract | pnpm test:regression (Tier C) after edit |",
    "| Status / what's next | orchestrator orient only |",
    "",
    "## North star",
    "",
    "Universal JSON hub → pixel-perfect Figma + `@lab/ui`; devs use props-only API (`ds.list(…)`).",
    "",
    "Full plan: `docs/ROADMAP.md`."
  );

  mkdirSync(join(ROOT, ".cursor"), { recursive: true });
  writeFileSync(OUT, lines.join("\n") + "\n");
  console.log(`Wrote ${OUT}`);
}

main();
