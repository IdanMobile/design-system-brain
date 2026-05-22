/**
 * Action metadata + recommended-next logic for the test console.
 */

export const ACTION_META = {
  "relay:start": {
    label: "Start Figma relay",
    description: "WebSocket bridge on port 3456",
    detail:
      "Starts a local bridge so the Figma Desktop plugin can send live PNG exports back to the test harness. Required before **Figma live** or **Run until pass** (phase 2). Keeps running in the background.",
    when: "Before any live Figma test",
    output: null,
    phase: "setup",
    order: 2
  },
  "storybook:serve": {
    label: "Serve Storybook",
    description: "Static Storybook on :6107",
    detail:
      "Serves the built Storybook used as the visual source of truth. Almost every test screenshots stories from here — start this first if the Storybook pill is red.",
    when: "First step for most test runs",
    output: null,
    phase: "setup",
    order: 1
  },
  "playground:serve": {
    label: "Serve Delivery showcase",
    description: "Delivery showcase on :6108",
    detail:
      "Serves the Delivery showcase — components imported from the delivery package. Required for **Delivery golden** (3-way) and **Logic audit** probes.",
    when: "Delivery / logic audit checks",
    output: null,
    phase: "setup",
    order: 4
  },
  "plugin:build": {
    label: "Build Figma plugin",
    description: "Compile code-v2 → dist/code.js",
    detail:
      "Rebuilds the importer plugin after you change `packages/figma-importer-plugin/src/code-v2.ts`. Then **reload the plugin in Figma** before re-running live tests.",
    when: "After renderer fixes (Cursor or manual)",
    output: "packages/figma-importer-plugin/dist/code.js",
    phase: "setup",
    order: 5
  },
  "pixel:golden": {
    label: "Pixel golden",
    description: "JSON schema round-trip (no images)",
    whenHint: "Extractor JSON only — not Figma visuals.",
    when: "Suspect extractor/contract bugs",
    output: "pixel-diffs/report.html",
    phase: "test",
    order: 10
  },
  "figma:golden": {
    label: "Figma emulator golden",
    description: "Mock renderer in Node (fast)",
    whenHint: "Fast renderer loop — use first.",
    when: "Day-to-day renderer fixes (phase 1)",
    output: "figma-diffs/report.html",
    phase: "test",
    order: 11
  },
  "figma:live:golden": {
    label: "Figma live golden",
    description: "Real Figma export PNGs",
    whenHint: "Real Figma PNGs — after emulator green.",
    when: "After emulator is green (phase 2)",
    output: "figma-live-diffs/report.html",
    phase: "test",
    order: 12,
    needsRelay: true
  },
  "figma:run-until-pass": {
    label: "Run until pass",
    description: "One sweep: mock → live",
    whenHint: "Both phases + Cursor queue on fail.",
    when: "Full mock→live check in one go",
    output: "figma-diffs/ + figma-live-diffs/",
    phase: "test",
    order: 0,
    sweep: true
  },
  "tests:parallel": {
    label: "Run tests (parallel)",
    description: "Pixel + Figma mock + delivery at once",
    whenHint: "Figma live stays serial — run separately.",
    when: "Refresh full portfolio quickly",
    output: "test-portfolio/report.html",
    phase: "test",
    order: 13
  },
  "delivery:golden": {
    label: "Delivery golden",
    description: "Storybook · delivery package · Figma mock",
    whenHint: "3-way: Storybook · Delivery showcase · mock Figma.",
    when: "After Figma mock is stable",
    output: "delivery-diffs/report.html",
    phase: "test",
    order: 13
  },
  "logic:golden": {
    label: "Logic audit",
    description: "Probe Delivery showcase for interactive behavior",
    whenHint: "After delivery pass — gaps drive logic specs.",
    when: "After delivery is green (Phase 2)",
    output: "logic-audit-diffs/report.html",
    phase: "test",
    order: 14
  }
};

const SUITE_HELP = {
  pixel: {
    title: "Pixel (schema)",
    blurb: "Extractor/contract only — no Figma rendering."
  },
  figma: {
    title: "Figma emulator",
    blurb: "Mock renderer — fast iteration before opening Figma."
  },
  figmaLive: {
    title: "Figma live",
    blurb: "Real Desktop export — final quality bar."
  },
  delivery: {
    title: "Delivery (3-way)",
    blurb: "Storybook vs Delivery showcase vs mock Figma."
  },
  logic: {
    title: "Logic audit",
    blurb: "Probes controls on Delivery showcase — pass or gap (needs spec)."
  }
};

function reportStats(r) {
  if (!r?.exists || !r.counts) return { hasReport: false, failing: 0, passing: 0, total: 0, strictGreen: false };
  const failing =
    (r.counts.fail ?? 0) + (r.counts.warn ?? 0) + (r.counts.error ?? 0);
  return {
    hasReport: true,
    failing,
    passing: r.counts.pass ?? 0,
    total: r.total ?? 0,
    strictGreen: failing === 0 && (r.total ?? 0) > 0
  };
}

/**
 * @param {object} input
 * @param {object} input.storybook
 * @param {object} input.playground
 * @param {object} input.relay
 * @param {boolean} input.pluginBuilt
 * @param {Array<object>} input.reports
 */
export function computeRecommendation(input) {
  const mock = reportStats(input.reports?.find((r) => r.suiteId === "figma"));
  const live = reportStats(input.reports?.find((r) => r.suiteId === "figmaLive"));

  if (!input.storybook?.ok) {
    return {
      actionId: "storybook:serve",
      title: "Serve Storybook",
      reason: "Storybook (:6107) is off. Tests need it to capture reference screenshots.",
      step: 1,
      totalSteps: 5
    };
  }

  if (!mock.hasReport) {
    return {
      actionId: "figma:golden",
      title: "Figma emulator golden",
      reason:
        "No emulator report yet. Run mock tests first — they are fast and do not need Figma Desktop.",
      step: 2,
      totalSteps: 5
    };
  }

  if (mock.failing > 0) {
    return {
      actionId: "figma:golden",
      title: "Re-run emulator golden",
      reason: `${mock.failing} story/stories still fail or warn in figma-diffs. Fix in Cursor (compare PNGs), rebuild plugin if needed, then re-run.`,
      altActionId: "figma:run-until-pass",
      altLabel: "Or: Run until pass (full sweep)",
      step: 2,
      totalSteps: 5
    };
  }

  if (!input.relay?.ok) {
    return {
      actionId: "relay:start",
      title: "Start Figma relay",
      reason:
        "Emulator is green. Start the relay before live tests so the plugin can talk to the harness.",
      step: 3,
      totalSteps: 5
    };
  }

  if (!input.relay?.pluginConnected) {
    return {
      actionId: null,
      title: "Connect Figma plugin",
      reason:
        "Relay is up but the plugin is not connected. In Figma: Development → Universal JSON Importer Lab → wait for “bridge connected”.",
      checklist: [
        "Figma Desktop open",
        "Development → Universal JSON Importer Lab",
        "Plugin UI shows live bridge connected",
        "Then run Figma live golden or Run until pass"
      ],
      step: 4,
      totalSteps: 5
    };
  }

  if (!live.hasReport) {
    return {
      actionId: "figma:live:golden",
      title: "Figma live golden",
      reason:
        "Mock is green and plugin is connected. Run live golden to compare real Figma exports to Storybook.",
      step: 5,
      totalSteps: 5
    };
  }

  if (live.failing > 0) {
    return {
      actionId: "figma:live:golden",
      title: "Re-run live golden",
      reason: `${live.failing} live story/stories still fail or warn. Cursor can fix from figma-live-diffs compare PNGs; reload plugin after rebuild.`,
      altActionId: "figma:run-until-pass",
      altLabel: "Or: Run until pass",
      step: 5,
      totalSteps: 5
    };
  }

  if (mock.strictGreen && live.strictGreen) {
    return {
      actionId: "delivery:golden",
      title: "Optional: Delivery golden",
      reason: "Mock and live are all PASS. Optional 3-way delivery check, or you are done.",
      step: 5,
      totalSteps: 5,
      done: true
    };
  }

  return {
    actionId: "figma:run-until-pass",
    title: "Run until pass",
    reason: "Run the full mock → live sweep and let Cursor handle failures automatically.",
    step: 2,
    totalSteps: 5
  };
}

export function enrichActions(rawActions) {
  return rawActions
    .map((a) => {
      const meta = ACTION_META[a.id] ?? {};
      return {
        ...a,
        ...meta,
        description: meta.description ?? a.description,
        needsRelay: meta.needsRelay ?? a.needsRelay,
        sweep: meta.sweep ?? a.sweep
      };
    })
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

export { SUITE_HELP };
