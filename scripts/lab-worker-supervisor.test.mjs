#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  investigatorGateAllowsFixer,
  writeStructuredJobResult,
  loadStructuredJobResults
} from "./test-console-worker-supervisor.mjs";
import {
  initFleetAgents,
  detectDuplicateAssignments,
  emitFleetEvent,
  loadFleetEvents,
  updateAgentStatus,
  fixerAgentIdForSuite,
  loadFleetAgents,
  buildFleetAgentView
} from "./lab-worker-supervisor.mjs";
import { appendTestInvestigation } from "./lab-memory-vault.mjs";

describe("investigatorGateAllowsFixer", () => {
  let repo;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "gate-"));
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("blocks fixer when no investigation", () => {
    const gate = investigatorGateAllowsFixer(repo, "lab-button--primary", "pixel");
    assert.equal(gate.allowed, false);
    assert.equal(gate.reason, "investigator_required");
  });

  it("allows fixer when root cause filled", () => {
    appendTestInvestigation({
      repoRoot: repo,
      storyId: "lab-button--primary",
      suiteId: "pixel",
      story: { storyId: "lab-button--primary", status: "fail", percent: 1.2 },
      resultRow: { status: "fail", percent: 1.2, failReason: "diff" }
    });
    const path = join(
      repo,
      "lab-memory/visual/investigations/active/lab-button--primary.md"
    );
    let body = readFileSync(path, "utf8");
    body = body.replace(
      /### Root cause\s*\n\n[\s\S]*?(?=\n### )/,
      "### Root cause\n\nButton border radius mismatch in schema replay.\n\n"
    );
    writeFileSync(path, body, "utf8");

    const gate = investigatorGateAllowsFixer(repo, "lab-button--primary", "pixel");
    assert.equal(gate.allowed, true);
    assert.equal(gate.reason, "cached_investigation");
  });
});

describe("structured job results", () => {
  it("writes and loads investigator + fixer phases", () => {
    const repo = mkdtempSync(join(tmpdir(), "jobres-"));
    try {
      const jobId = "job-abc";
      writeStructuredJobResult(repo, jobId, "lab-card--default", "investigator", 1, {
        status: "completed",
        investigationComplete: true
      });
      writeStructuredJobResult(repo, jobId, "lab-card--default", "fixer", 1, {
        status: "completed",
        agentExitCode: 0,
        filesChanged: ["packages/pixel-test/src/render-html.ts"]
      });
      const rows = loadStructuredJobResults(repo, jobId, "lab-card--default");
      assert.equal(rows.length, 2);
      const phases = rows.map((r) => r.phase).sort();
      assert.deepEqual(phases, ["fixer", "investigator"]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("lab-worker-supervisor fleet", () => {
  let repo;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "fleet-"));
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("initializes roster", () => {
    const data = initFleetAgents(repo);
    assert.equal(data.agents.length, 9);
    const captain = data.agents.find((a) => a.id === "merge-captain");
    assert.equal(captain.status, "idle");
    assert.deepEqual(captain.capabilities, ["review", "merge-gate"]);
    assert.ok(existsSync(join(repo, ".test-console/fleet/agents.json")));
  });

  it("emits events to jsonl", () => {
    initFleetAgents(repo);
    emitFleetEvent(repo, "orchestrator.assign", { agentId: "investigator", storyId: "x" });
    const events = loadFleetEvents(repo, 5);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "orchestrator.assign");
  });

  it("maps suite to fixer agent id", () => {
    assert.equal(fixerAgentIdForSuite("pixel"), "pixel-fixer");
    assert.equal(fixerAgentIdForSuite("figmaLive"), "live-figma-fixer");
  });

  it("updates agent status", () => {
    initFleetAgents(repo);
    updateAgentStatus(repo, "investigator", { status: "working", currentTask: { storyId: "s1" } });
    const { agents } = loadFleetAgents(repo);
    const inv = agents.find((a) => a.id === "investigator");
    assert.equal(inv.status, "working");
    assert.equal(inv.currentTask.storyId, "s1");
  });

  it("reconciles persisted fleet files when new roster agents are added", () => {
    initFleetAgents(repo);
    const path = join(repo, ".test-console/fleet/agents.json");
    const persisted = JSON.parse(readFileSync(path, "utf8"));
    persisted.agents = persisted.agents.filter((a) => a.id !== "merge-captain");
    writeFileSync(path, JSON.stringify(persisted, null, 2), "utf8");

    const { agents } = loadFleetAgents(repo);
    const captain = agents.find((a) => a.id === "merge-captain");

    assert.equal(captain.status, "idle");
    assert.equal(captain.purpose, "Review sandbox code changes before promotion");
  });

  it("detects duplicate work assignments across active agents", () => {
    initFleetAgents(repo);
    updateAgentStatus(repo, "investigator", {
      status: "working",
      currentTask: { storyId: "screen_1", suiteId: "vsFigmaLive", phase: "investigator" }
    });
    updateAgentStatus(repo, "live-figma-fixer", {
      status: "working",
      currentTask: { storyId: "screen_1", suiteId: "vsFigmaLive", phase: "fixer" }
    });

    const duplicates = detectDuplicateAssignments(repo);

    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0].storyId, "screen_1");
    assert.deepEqual(duplicates[0].agentIds.sort(), ["investigator", "live-figma-fixer"]);
  });

  it("aggregates active workers into one roster row and dedupes stale repeated tasks", () => {
    const now = "2026-05-29T21:14:11.000Z";
    const data = initFleetAgents(repo);
    const events = [
      {
        type: "orchestrator.assign",
        at: now,
        agentId: "investigator",
        jobId: "running-job",
        storyId: "screen_1",
        suiteId: "vsFigmaLive",
        attempt: 1,
        phase: "investigator"
      },
      {
        type: "agent.complete",
        at: now,
        agentId: "investigator",
        jobId: "running-job",
        storyId: "screen_1",
        suiteId: "vsFigmaLive",
        attempt: 1,
        status: "incomplete"
      },
      {
        type: "orchestrator.assign",
        at: now,
        agentId: "investigator",
        jobId: "running-job",
        storyId: "screen_1",
        suiteId: "vsFigmaLive",
        attempt: 2,
        phase: "investigator"
      },
      {
        type: "orchestrator.assign",
        at: now,
        agentId: "investigator",
        jobId: "old-job",
        storyId: "screen_1",
        suiteId: "vsFigmaLive",
        attempt: 1,
        phase: "investigator"
      },
      {
        type: "orchestrator.assign",
        at: now,
        agentId: "investigator",
        jobId: "running-job",
        storyId: "screen_2",
        suiteId: "vsFigmaLive",
        attempt: 1,
        phase: "investigator"
      }
    ];

    const agents = buildFleetAgentView(data.agents, events, new Set(["running-job"]));
    const investigator = agents.find((a) => a.id === "investigator");

    assert.equal(agents.filter((a) => a.id.startsWith("investigator")).length, 1);
    assert.equal(investigator.status, "working");
    assert.equal(investigator.workerCount, 2);
    assert.deepEqual(
      investigator.activeTasks.map((task) => `${task.storyId}:${task.attempt}`).sort(),
      ["screen_1:2", "screen_2:1"]
    );
  });
});
