import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildInvestigatorSection,
  formatFixerActionBlock,
  isStructuralTestId,
  shouldRunAgentInvestigator,
} from "./test-report-investigator.mjs";
import {
  buildStructuredDiagnosis,
  auditManifestContractKinds,
} from "./fixer-pipeline-trace.mjs";

describe("test-report investigator section", () => {
  it("merges automatic + agent in section text", () => {
    const section = buildInvestigatorSection({
      itemId: "screen_x",
      testedAt: "2026-01-01T00:00:00Z",
      structuredDiagnosis: {
        rootCauseLayer: "contract-to-figma",
        pipelineKindOk: true,
        mandatoryFixSurface: "contract-to-figma",
        conclusions: ["RTL TEXT mis-render"],
        editRouting: [],
      },
      mismatches: [{ images: { compareSideBySide: "/tmp/cmp.png" } }],
      investigator: {
        agent: {
          status: "complete",
          rootCause: "Hebrew RTL font",
          recommendedFixArea: "code-v2.ts — createTextNode",
          resolution: "Load Open Sans Hebrew",
          visualNotes: "label shifted left",
        },
      },
    });
    assert.match(section.sectionText, /Automatic \(test harness\)/);
    assert.match(section.sectionText, /Hebrew RTL font/);
    assert.match(section.sectionText, /PREFER AGENT/);
    assert.match(section.sectionText, /Fixer action/);
  });

  it("fixer action block prefers agent primary edit", () => {
    const block = formatFixerActionBlock({
      investigator: {
        agent: {
          status: "complete",
          primaryEdit: "code-v2.ts — pinFigmaFlexCrossEndBareText",
          resolution: "Geometry-pin RTL text to childRight.",
          refinesAutomatic: true,
        },
      },
      investigationBrief: {
        editRouting: [{ symbol: "createTextNode", check: "wrong hint" }],
      },
    });
    assert.match(block, /PREFER AGENT/);
    assert.match(block, /pinFigmaFlexCrossEndBareText/);
    assert.match(block, /FORBIDDEN: Read code-v2.ts/);
  });

  it("skips agent for structural tests", () => {
    assert.equal(isStructuralTestId("manifestContract"), true);
    assert.equal(
      shouldRunAgentInvestigator({ global: { status: "fail" }, failedTest: { testId: "manifestContract" } }),
      false
    );
  });
});

describe("buildStructuredDiagnosis", () => {
  it("routes to contract-to-figma when pipeline kinds OK on vsFigmaLive", () => {
    const diagnosis = buildStructuredDiagnosis({
      trace: { hasBlocker: false, audit: { kindMismatches: [], adapterVsDisk: [], manifestVsDisk: [] } },
      report: { failedTest: { testId: "vsFigmaLive", primaryFixer: "contract-to-figma" } },
      brief: {
        editRouting: [
          {
            layer: "fig-5",
            name: "Hebrew label",
            symbol: "createTextNode",
            check: "RTL TEXT",
          },
        ],
        contractLayers: [{ id: "fig-5", name: "label", flags: ["align:right"] }],
      },
    });
    assert.equal(diagnosis.pipelineKindOk, true);
    assert.equal(diagnosis.rootCauseLayer, "contract-to-figma");
    assert.equal(diagnosis.investigatorRequired, true);
    assert.equal(diagnosis.editRouting[0].layer, "fig-5");
    assert.match(diagnosis.conclusions.join(" "), /importer rendering/i);
  });

  it("blocks code-v2 when pipeline has kind mismatch", () => {
    const diagnosis = buildStructuredDiagnosis({
      trace: {
        hasBlocker: true,
        effectiveFixer: { primaryFixer: "pipeline-enrichment", upstreamStep: "liveTestHarness" },
        audit: {
          kindMismatches: [
            {
              layerId: "fig-5",
              name: "label",
              manifestType: "TEXT",
              contractSignals: ["layer.image PNG"],
              recommendedStep: "liveTestHarness",
            },
          ],
          adapterVsDisk: [],
          manifestVsDisk: [],
        },
      },
      report: { failedTest: { testId: "vsFigmaLive" } },
      brief: null,
    });
    assert.equal(diagnosis.pipelineKindOk, false);
    assert.equal(diagnosis.rootCauseLayer, "pipeline-enrichment");
    assert.equal(diagnosis.forbidCodeV2UntilPipelineOk, true);
    assert.match(diagnosis.conclusions[0], /BLOCKER/);
  });
});

describe("auditManifestContractKinds", () => {
  it("returns empty when paths missing", () => {
    const r = auditManifestContractKinds(null, null);
    assert.deepEqual(r.kindMismatches, []);
  });
});
