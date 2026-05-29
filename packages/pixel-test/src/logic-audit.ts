/**
 * Logic audit — probe Delivery showcase stories for built-in vs missing behavior.
 *
 * Run AFTER delivery visual pass. Tests first, spec second: discover what the
 * design-system already provides vs what still needs a developer props API.
 *
 *   pnpm playground:serve
 *   pnpm test:logic:audit
 *   pnpm test:logic:audit -- --all
 *   pnpm test:logic:audit:record   # per-story interaction videos
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { DEV_STORIES, DEV_STORY_BY_ID, QUICK_SMOKE } from "../../contract/src/stories.ts";
import type { StorySpec } from "../../contract/src/spec-types.ts";
import {
  classifyFinding,
  ROOT_AND_DESCENDANT_INTERACTIVE,
  allLayersScript,
  probeScript,
  snapshotScript,
  snapshotsEqual,
  type ControlProbe,
  type InteractionFinding,
  type DomSnapshot,
  type LayerProbe
} from "./logic-audit-probes.ts";
import { createSpecStore } from "./spec-store.ts";
import { extractFromDescription } from "./spec-extract-heuristic.ts";
import {
  computeStoryDecision,
  mergeElementSpec,
  type ElementVerdictRow,
  type ObservedElement,
  type StoryRollupVerdict
} from "./logic-audit-verdict.ts";
import type { ElementSpec } from "../../contract/src/spec-types.ts";
import {
  finalizeHarnessRun,
  persistStoryProgress,
  safeStorySegment,
  type MergeSuiteMeta,
  type StoryResultRecord
} from "./report-portfolio.ts";
import { assertStoryStepGate } from "./step-gate.ts";

/**
 * Spec-aware audit verdicts (see
 * `docs/superpowers/specs/2026-05-25-element-approval-redesign-design.md`):
 *
 *   needs-spec     — no spec file for this story; run `pnpm specs:bootstrap-v2`
 *   needs-approval — spec exists but at least one element is `proposed`
 *   pass           — every element is `approved` (or spec is approved + static)
 *   regression     — element-level regression (filled in Phase 2.4)
 *   drift          — element-level drift (filled in Phase 2.4)
 *   new-element    — observed an interactive element not in the spec
 *   error          — audit harness itself errored
 */
export type AuditVerdict =
  | "needs-spec"
  | "needs-approval"
  | "pass"
  | "regression"
  | "drift"
  | "new-element"
  | "error";

interface AuditResult {
  storyId: string;
  component: string | null;
  status: "pass" | "gap" | "error";
  verdict: AuditVerdict;
  /** Plain-English reason for the verdict (shown in CLI and report). */
  verdictReason: string;
  /** Element names observed in the DOM (kept for backwards compat). */
  observedEvents: string[];
  /** Approved elements not observed in the DOM. */
  missingEvents: string[];
  /** Observed elements with no spec entry (new-element verdict). */
  extraEvents: string[];
  /** Per-element verdicts — drives the v2 report. */
  perElement: ElementVerdictRow[];
  /** Status of the spec on disk at the time of the audit. */
  specStatus: StorySpec["status"] | "missing";
  interactiveCount: number;
  dsBuiltinCount: number;
  staticShellCount: number;
  readonlyCount: number;
  /** Behaviours observed where the component code owns the state. */
  nativeCount: number;
  /** Behaviours observed where the @lab/ui design-system baseline filled in. */
  baselineCount: number;
  findings: InteractionFinding[];
  gaps: string[];
  dsBuiltIn: string[];
  demoVideo?: string;
  error?: string;
  testedAt: string;
}

interface CliOpts {
  playgroundUrl: string;
  outDir: string;
  repoRoot: string;
  stories: string[];
  maxClicksPerStory: number;
  noGate?: boolean;
  record?: boolean;
  slowMo?: number;
}

function parseCli(): CliOpts {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 2; i < process.argv.length; i += 1) {
    const v = process.argv[i];
    if (v.startsWith("--") && (i + 1 >= process.argv.length || process.argv[i + 1].startsWith("--"))) {
      flags.add(v.slice(2));
    } else if (v.startsWith("--")) {
      args.set(v.slice(2), process.argv[i + 1]);
      i += 1;
    }
  }
  const playgroundUrl = args.get("playgroundUrl") ?? "http://127.0.0.1:6108";
  const outDir = resolve(process.cwd(), args.get("outDir") ?? "../../logic-audit-diffs");
  const repoRoot = resolve(process.cwd(), args.get("repoRoot") ?? "../..");
  let stories: string[] = [];
  const explicit = args.get("stories");
  if (explicit) {
    stories = explicit.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (flags.has("all")) {
    stories = DEV_STORIES.map((s) => s.id);
  } else {
    stories = QUICK_SMOKE;
  }
  const maxClicks = Number(args.get("maxClicks") ?? "12");
  const record = flags.has("record");
  const slowMo = record ? Number(args.get("slowMo") ?? "100") : 0;
  return {
    playgroundUrl,
    outDir,
    repoRoot,
    stories,
    maxClicksPerStory: maxClicks,
    noGate: flags.has("no-gate"),
    record,
    slowMo: Number.isFinite(slowMo) && slowMo >= 0 ? slowMo : 0
  };
}

function controlLabel(control: ControlProbe): string {
  return control.ariaLabel || control.text || `${control.tag}[${control.role || control.type || "?"}]`;
}

function isToggleLike(control: ControlProbe): boolean {
  return (
    control.role === "tab" ||
    control.role === "switch" ||
    control.role === "checkbox" ||
    control.type === "checkbox" ||
    control.type === "radio" ||
    control.tag === "summary"
  );
}

async function readSnapshot(page: Page): Promise<DomSnapshot> {
  return page.evaluate(snapshotScript);
}

async function showAuditHud(page: Page, title: string, detail?: string): Promise<void> {
  await page.evaluate(
    ({ title, detail }) => {
      let hud = document.getElementById("logic-audit-hud");
      if (!hud) {
        hud = document.createElement("div");
        hud.id = "logic-audit-hud";
        hud.style.cssText =
          "position:fixed;top:12px;left:12px;z-index:99999;background:rgba(15,20,25,0.92);color:#e6edf3;padding:10px 14px;border-radius:8px;font:600 14px/1.4 system-ui,sans-serif;pointer-events:none;max-width:440px;border:1px solid #30363d;box-shadow:0 4px 24px rgba(0,0,0,0.35)";
        document.body.appendChild(hud);
      }
      hud.innerHTML = `<div style="color:#58a6ff;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Logic demo</div><div>${title}</div>${detail ? `<div style="color:#8b949e;font-size:12px;margin-top:4px;font-weight:400">${detail}</div>` : ""}`;
    },
    { title, detail: detail ?? "" }
  );
}

async function pause(page: Page, ms: number): Promise<void> {
  await page.waitForTimeout(ms);
}

function controlLocator(page: Page, domIndex: number) {
  return page.locator(ROOT_AND_DESCENDANT_INTERACTIVE).nth(domIndex);
}

/** Real pointer: scroll → hover (shows :hover in video) → click. No programmatic el.click(). */
async function pointerClickControl(
  page: Page,
  control: ControlProbe,
  demo: boolean
): Promise<boolean> {
  const loc = controlLocator(page, control.index);
  try {
    await loc.scrollIntoViewIfNeeded({ timeout: 8000 });
    if (demo) await pause(page, 350);
    await loc.hover({ timeout: 8000, force: false });
    if (demo) await pause(page, 500);
    await loc.click({ timeout: 8000, force: false });
    return true;
  } catch {
    return false;
  }
}

/** After opening a select/combobox/lab dropdown, pick a visible menu option with the mouse. */
async function pointerPickMenuOption(page: Page, demo: boolean): Promise<boolean> {
  await pause(page, demo ? 500 : 200);
  const selectors = [
    '[role="listbox"] [role="option"]:visible',
    '[role="menu"] [role="menuitem"]:visible',
    ".MuiMenu-root [role=option]:visible",
    ".MuiPopover-root [role=option]:visible",
    "[data-figma-component] .lab-select-menu p:visible"
  ].join(", ");
  const options = page.locator(selectors);
  try {
    const count = await options.count();
    if (count === 0) return false;
    // Prefer a non-selected option so the audit observes a real state change
    // (picking the already-selected item is a visual no-op for many widgets).
    let target = options.first();
    for (let i = 0; i < count; i += 1) {
      const cand = options.nth(i);
      const selected = (await cand.getAttribute("aria-selected")) === "true";
      if (!selected) {
        target = cand;
        break;
      }
    }
    if (!(await target.isVisible({ timeout: 2000 }))) return false;
    if (demo) await pause(page, 400);
    await target.hover({ timeout: 3000 });
    if (demo) await pause(page, 350);
    await target.click({ timeout: 3000 });
    if (demo) await pause(page, 500);
    return true;
  } catch {
    return false;
  }
}

async function interactControl(
  page: Page,
  control: ControlProbe,
  demo: boolean
): Promise<boolean> {
  // Text-like inputs aren't activated by a click — they expect typing. Fill
  // them with a probe string and rely on the snapshot's `inputValues` channel
  // to detect the change. This makes the audit semantically correct for
  // login forms, search boxes, and any other text/email/password/textarea
  // fields that the delivery package exposes.
  if (control.tag === "input" && isTypingInput(control.type)) {
    const loc = controlLocator(page, control.index);
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 8000 });
      if (demo) await pause(page, 350);
      await loc.click({ timeout: 8000, force: false });
      if (demo) await pause(page, 250);
      await loc.fill(typingProbeValue(control.type), { timeout: 8000 });
      return true;
    } catch {
      return false;
    }
  }
  if (control.tag === "textarea") {
    const loc = controlLocator(page, control.index);
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 8000 });
      if (demo) await pause(page, 350);
      await loc.click({ timeout: 8000, force: false });
      if (demo) await pause(page, 250);
      await loc.fill("Audit probe text.", { timeout: 8000 });
      return true;
    } catch {
      return false;
    }
  }
  const clicked = await pointerClickControl(page, control, demo);
  if (!clicked) return false;
  if (control.opensMenu) {
    await pointerPickMenuOption(page, demo);
  }
  return true;
}

function isTypingInput(type: string): boolean {
  const t = (type || "text").toLowerCase();
  return (
    t === "text" ||
    t === "email" ||
    t === "password" ||
    t === "search" ||
    t === "tel" ||
    t === "url" ||
    t === "number" ||
    t === ""
  );
}

function typingProbeValue(type: string): string {
  const t = (type || "text").toLowerCase();
  if (t === "email") return "audit@example.com";
  if (t === "password") return "audit-probe-pw";
  if (t === "number") return "42";
  if (t === "tel") return "+15555550100";
  if (t === "url") return "https://example.com";
  return "audit probe";
}

/* -------------------------------------------------------------------------- */
/* Spec-aware verdict (Phase 2.4 — per-element rollup)                        */
/* -------------------------------------------------------------------------- */

function suggestionFor(o: ObservedElement): string {
  const name = (o.displayName || o.role || o.tag || "control").toLowerCase();
  if (o.tag === "input" || o.tag === "textarea") {
    return `Designer types in this ${name} field`;
  }
  if (o.role === "tab") return `Click switches to the "${o.displayName}" tab`;
  if (o.role === "switch") return "Toggles a setting on or off";
  if (o.role === "checkbox") return "Toggles a checkbox";
  if (o.tag === "a") return `Navigates to ${o.displayName}`;
  if (o.role === "menuitem") return `Selects the "${o.displayName}" menu item`;
  return `Click triggers the "${o.displayName}" action`;
}

function rollupToAuditVerdict(r: StoryRollupVerdict): AuditVerdict {
  switch (r) {
    case "pass":
      return "pass";
    case "needs-approval":
      return "needs-approval";
    case "new-element":
      return "new-element";
    case "drift":
      return "drift";
    case "regression":
      return "regression";
  }
}



function verdictToStoryStatus(v: AuditVerdict): "pass" | "warn" | "fail" | "error" {
  switch (v) {
    case "pass":
      return "pass";
    case "regression":
      return "fail";
    case "needs-spec":
    case "needs-approval":
    case "drift":
    case "new-element":
      return "warn";
    case "error":
      return "error";
  }
}

async function loadStory(page: Page, storyId: string, opts: CliOpts): Promise<string | null> {
  await page.goto(`${opts.playgroundUrl}/?story=${encodeURIComponent(storyId)}`, {
    waitUntil: "networkidle",
    timeout: 60_000
  });
  await page.waitForSelector("[data-figma-component]", { timeout: 15_000 });
  const { component } = await page.evaluate(probeScript);
  return component;
}

async function auditStory(
  page: Page,
  storyId: string,
  opts: CliOpts,
  specStore: ReturnType<typeof createSpecStore>
): Promise<AuditResult> {
  const testedAt = new Date().toISOString();
  const demo = Boolean(opts.record);
  const clickPauseMs = demo ? 900 : 200;
  const statePauseMs = demo ? 1200 : 0;
  const spec = specStore.readSpec(storyId);
  const specStatus: AuditResult["specStatus"] = spec ? spec.status : "missing";

  try {
    const component = await loadStory(page, storyId, opts);
    const initial = await page.evaluate(probeScript);
    const findings: InteractionFinding[] = [];

    if (demo) {
      await showAuditHud(page, storyId, component ? `${component} — initial state` : "Initial state");
      await pause(page, statePauseMs);
    }

    for (const control of initial.controls) {
      if (control.disabled || !control.readOnly) continue;
      findings.push(classifyFinding(control, "skipped_readonly", component));
      if (demo) {
        const label = controlLabel(control);
        await showAuditHud(page, storyId, `Read-only: ${label.slice(0, 64)}`);
        await pause(page, clickPauseMs);
      }
    }

    const maxSteps = demo ? 40 : opts.maxClicksPerStory;
    let step = 0;

    while (step < maxSteps) {
      const { controls } = await page.evaluate(probeScript);
      const interactive = controls.filter((c) => !c.disabled && !c.readOnly);
      if (step >= interactive.length) break;
      const control = interactive[step]!;
      const label = controlLabel(control);

      if (demo) {
        await showAuditHud(page, storyId, `Hover & click: ${label.slice(0, 64)}`);
      }

      const before = await readSnapshot(page);
      const clicked = await interactControl(page, control, demo);
      await pause(page, clickPauseMs);

      if (!clicked) {
        findings.push(classifyFinding(control, "click_failed", component));
        step += 1;
        continue;
      }

      const after = await readSnapshot(page);
      const changed = !snapshotsEqual(before, after);
      const outcome = changed ? "state_changed" : "no_visible_change";
      findings.push(classifyFinding(control, outcome, component, before, after));

      if (demo) {
        await showAuditHud(
          page,
          storyId,
          changed ? `✓ State changed — ${label.slice(0, 48)}` : `○ No change — ${label.slice(0, 48)}`
        );
        await pause(page, statePauseMs);

        if (changed && isToggleLike(control)) {
          await showAuditHud(page, storyId, `Toggle back — ${label.slice(0, 48)}`);
          await pointerClickControl(page, control, demo);
          await pause(page, statePauseMs);
        }
      } else {
        await loadStory(page, storyId, opts);
      }

      step += 1;
    }

    if (demo) {
      await showAuditHud(
        page,
        storyId,
        `${findings.length} control(s) probed — final state`
      );
      await pause(page, statePauseMs);
    }

    const dsBuiltIn = findings
      .filter((f) => f.category === "ds_builtin" && f.outcome === "state_changed")
      .map((f) => controlLabel(f))
      .filter(Boolean);

    const gaps = findings
      .filter((f) => f.category === "static_shell")
      .map((f) => `${controlLabel(f)}: ${f.note ?? "inert"}`);

    const dsBuiltinCount = findings.filter((f) => f.category === "ds_builtin").length;
    const staticShellCount = findings.filter((f) => f.category === "static_shell").length;
    const readonlyCount = findings.filter((f) => f.category === "readonly").length;
    const nativeCount = findings.filter((f) => f.source === "native").length;
    const baselineCount = findings.filter((f) => f.source === "baseline").length;

    // Build observed elements list. Two sources merge into one list:
    //   1) Interactive controls with a `data-lab-id` (always observed).
    //   2) Non-interactive layers from the full-DOM probe, but ONLY if the
    //      spec already has an element with that structural id (i.e. the
    //      designer approved a non-interactive layer). Without this gate the
    //      audit would emit a "new-element" verdict for every wrapper div.
    const interactiveObserved: ObservedElement[] = initial.controls
      .filter((c) => c.labId && !c.disabled)
      .map((c) => ({
        labId: c.labId,
        displayName: c.ariaLabel || c.text || c.role || c.tag,
        tag: c.tag,
        role: c.role,
        text: c.text
      }));
    const interactiveIds = new Set(interactiveObserved.map((o) => o.labId));
    const allLayers: LayerProbe[] = (await page.evaluate(allLayersScript)).layers;
    const specIds = new Set(spec ? spec.elements.map((e) => e.id) : []);
    const nonInteractiveObserved: ObservedElement[] = allLayers
      .filter((l) => !l.isInteractive && specIds.has(l.id) && !interactiveIds.has(l.id))
      .map((l) => ({
        labId: l.id,
        displayName: l.displayName,
        tag: l.tag,
        role: l.role,
        text: l.text
      }));
    const observedElements: ObservedElement[] = [...interactiveObserved, ...nonInteractiveObserved];

    // No spec on disk → still emit needs-spec verdict
    if (!spec) {
      return {
        storyId,
        component,
        status: "gap",
        verdict: "needs-spec",
        verdictReason: "no spec on disk — run `pnpm specs:bootstrap-v2`",
        observedEvents: observedElements.map((o) => o.displayName),
        missingEvents: [],
        extraEvents: [],
        perElement: [],
        specStatus,
        interactiveCount: initial.controls.length,
        dsBuiltinCount,
        staticShellCount,
        readonlyCount,
        nativeCount,
        baselineCount,
        findings,
        gaps,
        dsBuiltIn,
        testedAt
      };
    }

    // Merge observed elements into spec.elements, refreshing AI-owned fields
    // and preserving designer-edited fields (description, status, approvedAt).
    const existingById = new Map(spec.elements.map((e) => [e.id, e]));
    const mergedElements: ElementSpec[] = observedElements.map((obs) => {
      const existing = existingById.get(obs.labId);
      const desc = existing?.description ?? "";
      const aiExtracted = desc.trim()
        ? extractFromDescription({
            displayName: obs.displayName,
            description: desc,
            tag: obs.tag,
            role: obs.role,
            ariaLabel: existing?.displayName ?? obs.displayName,
            text: obs.text
          })
        : null;
      const aiSuggestion = suggestionFor(obs);
      return mergeElementSpec({ existing, observed: obs, aiSuggestion, aiExtracted });
    });

    // Compute the decision against the in-memory merged elements so that
    // newly-discovered elements show up as "new-element" rather than
    // immediately persisting as silent additions.
    const decision = computeStoryDecision({
      spec: { ...spec, elements: existingById.size === 0 ? mergedElements : spec.elements },
      observed: observedElements
    });

    // Persist the refreshed spec back to disk. Designer edits survive; AI
    // fields refresh; status only changes if every observed element is approved
    // (the showcase handles the per-element approvals).
    const refreshedSpec: StorySpec = {
      ...spec,
      elements: mergedElements
    };
    specStore.writeSpec(refreshedSpec);

    const observedEvents = observedElements.map((o) => o.displayName);
    const missing = decision.perElement.filter((r) => r.verdict === "regression").map((r) => r.displayName);
    const extra = decision.perElement.filter((r) => r.verdict === "new-element").map((r) => r.displayName);
    const verdict: AuditVerdict = rollupToAuditVerdict(decision.storyVerdict);

    const status: AuditResult["status"] =
      verdict === "pass"
        ? "pass"
        : verdict === "regression"
        ? "gap"
        : "gap";

    return {
      storyId,
      component,
      status,
      verdict,
      verdictReason: decision.storyReason,
      observedEvents,
      missingEvents: missing,
      extraEvents: extra,
      perElement: decision.perElement,
      specStatus,
      interactiveCount: initial.controls.length,
      dsBuiltinCount,
      staticShellCount,
      readonlyCount,
      nativeCount,
      baselineCount,
      findings,
      gaps,
      dsBuiltIn,
      testedAt
    };
  } catch (error) {
    return {
      storyId,
      component: DEV_STORY_BY_ID[storyId]?.component ?? null,
      status: "error",
      verdict: "error",
      verdictReason: error instanceof Error ? error.message : String(error),
      observedEvents: [],
      missingEvents: [],
      extraEvents: [],
      perElement: [],
      specStatus,
      interactiveCount: 0,
      dsBuiltinCount: 0,
      staticShellCount: 0,
      readonlyCount: 0,
      nativeCount: 0,
      baselineCount: 0,
      findings: [],
      gaps: [],
      dsBuiltIn: [],
      error: error instanceof Error ? error.message : String(error),
      testedAt
    };
  }
}

function toPortfolioRecord(r: AuditResult): StoryResultRecord {
  return {
    storyId: r.storyId,
    status: verdictToStoryStatus(r.verdict),
    percent: r.staticShellCount,
    maxRegionPercent: r.dsBuiltinCount,
    error: r.error,
    testedAt: r.testedAt,
    component: r.component ?? undefined,
    gaps: r.gaps,
    dsBuiltIn: r.dsBuiltIn,
    interactiveCount: r.interactiveCount,
    readonlyCount: r.readonlyCount,
    nativeCount: r.nativeCount,
    baselineCount: r.baselineCount,
    findings: r.findings,
    demoVideo: r.demoVideo,
    verdict: r.verdict,
    verdictReason: r.verdictReason,
    observedEvents: r.observedEvents,
    missingEvents: r.missingEvents,
    extraEvents: r.extraEvents,
    perElement: r.perElement,
    specStatus: r.specStatus
  } as StoryResultRecord;
}

const VERDICT_COLOR: Record<AuditVerdict, string> = {
  pass: "#16a34a",
  drift: "#d97706",
  "needs-spec": "#d97706",
  "needs-approval": "#d97706",
  "new-element": "#d97706",
  regression: "#dc2626",
  error: "#dc2626"
};

function writeSuiteHtml(results: StoryResultRecord[]): string {
  const cards = results
    .filter((r) => r.status !== "not_tested" && r.status !== "skipped")
    .map((r) => {
      const raw = r as StoryResultRecord & {
        component?: string;
        interactiveCount?: number;
        demoVideo?: string;
        verdict?: AuditVerdict;
        verdictReason?: string;
        perElement?: ElementVerdictRow[];
        specStatus?: string;
      };
      const verdict: AuditVerdict = raw.verdict ?? (r.status === "pass" ? "pass" : "error");
      const color = VERDICT_COLOR[verdict] ?? "#dc2626";
      const verdictLabel = verdict.toUpperCase();
      const reason = escapeHtml(raw.verdictReason ?? "");
      const demoCell = raw.demoVideo
        ? `<video controls preload="metadata" width="280" src="${escapeHtml(raw.demoVideo)}"></video><br><a href="${escapeHtml(raw.demoVideo)}">Open video</a>`
        : "";
      const elementRows = (raw.perElement ?? [])
        .map((row) => {
          const dot =
            row.verdict === "pass"
              ? "#16a34a"
              : row.verdict === "regression"
              ? "#dc2626"
              : "#d97706";
          return `<li>
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot};margin-right:6px"></span>
            <code>${escapeHtml(row.labId)}</code>
            <span style="color:#8b9cb3">— ${escapeHtml(row.displayName)}</span>
            <span style="color:${dot};font-weight:600;margin-left:8px">${row.verdict}</span>
            <span style="color:#64748b;font-size:12px;margin-left:8px">${escapeHtml(row.reason)}</span>
          </li>`;
        })
        .join("");
      const elementsBlock = elementRows
        ? `<ul style="list-style:none;padding-left:0;margin:8px 0">${elementRows}</ul>`
        : `<p style="color:#64748b;margin:8px 0">No interactive elements observed.</p>`;
      return `<section style="border:1px solid #2d3a4f;border-radius:8px;padding:16px;margin-bottom:16px;background:#101820">
        <header style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
          <div>
            <h2 style="margin:0 0 4px"><code>${escapeHtml(r.storyId)}</code></h2>
            <p style="margin:0;color:#8b9cb3">${escapeHtml(raw.component ?? "—")}
              · ${raw.interactiveCount ?? 0} interactive element(s)
              · spec ${escapeHtml(raw.specStatus ?? "?")}</p>
          </div>
          <div style="text-align:right">
            <div style="color:${color};font-weight:700;font-size:18px">${verdictLabel}</div>
            <div style="color:#64748b;font-size:12px;max-width:340px">${reason}</div>
          </div>
        </header>
        ${elementsBlock}
        ${demoCell ? `<div style="margin-top:8px">${demoCell}</div>` : ""}
      </section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Logic audit</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;background:#0f1419;color:#e8edf4}
h1{margin-top:0}
p{color:#8b9cb3}
code{font-size:12px}
a{color:#58a6ff}
ul{margin:4px 0}
li{margin:6px 0;font-size:13px}
section h2{font-size:14px;font-weight:600}
</style></head><body>
<h1>Logic audit — Delivery showcase (v2 element approval)</h1>
<p>Each story is broken down by interactive element. Verdict colors:
<strong style="color:#16a34a">pass</strong> — element is approved and still present.
<strong style="color:#d97706">needs-approval / new-element / drift</strong> — designer action required in the showcase.
<strong style="color:#dc2626">regression</strong> — an approved element disappeared from the DOM.</p>
${cards}
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function saveStoryVideo(
  page: Page,
  context: BrowserContext,
  storyDir: string
): Promise<string | null> {
  const video = page.video();
  await page.close();
  await context.close();
  if (!video) return null;
  const rawPath = await video.path();
  const dest = resolve(storyDir, "interaction.webm");
  await rename(rawPath, dest);
  return dest;
}

async function runStoryWithOptionalVideo(
  browser: Browser,
  storyId: string,
  opts: CliOpts,
  specStore: ReturnType<typeof createSpecStore>,
  sharedPage?: Page
): Promise<{ result: AuditResult; page?: Page }> {
  if (!opts.record) {
    const result = await auditStory(sharedPage!, storyId, opts, specStore);
    return { result, page: sharedPage };
  }

  const seg = safeStorySegment(storyId);
  const storyDir = resolve(opts.outDir, "by-story", seg);
  await mkdir(storyDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    recordVideo: { dir: storyDir, size: { width: 1200, height: 900 } }
  });
  const page = await context.newPage();
  const result = await auditStory(page, storyId, opts, specStore);
  await saveStoryVideo(page, context, storyDir);
  result.demoVideo = `by-story/${seg}/interaction.webm`;
  return { result };
}

async function main() {
  const opts = parseCli();
  await mkdir(opts.outDir, { recursive: true });

  const specStore = createSpecStore({
    vaultDir: resolve(opts.repoRoot, "lab-memory/logic/specs")
  });

  const suiteMeta: MergeSuiteMeta = {
    generatedAt: new Date().toISOString(),
    baseUrl: opts.playgroundUrl
  };

  const browser = await chromium.launch({ slowMo: opts.slowMo });
  const sharedContext = opts.record
    ? null
    : await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const sharedPage = sharedContext ? await sharedContext.newPage() : undefined;

  const ranResults: StoryResultRecord[] = [];
  const writeHtml = (results: StoryResultRecord[]) => writeSuiteHtml(results);
  let videoCount = 0;

  for (const storyId of opts.stories) {
    process.stdout.write(`▶ ${storyId} … `);
    const gate = await assertStoryStepGate({
      repoRoot: opts.repoRoot,
      storyId,
      stepId: "logic",
      noGate: opts.noGate
    });
    if (!gate.allowed) {
      console.log(`⊘ SKIP (${gate.reason})`);
      continue;
    }

    const { result } = await runStoryWithOptionalVideo(browser, storyId, opts, specStore, sharedPage);
    const record = toPortfolioRecord(result);
    ranResults.push(record);
    if (result.demoVideo) videoCount += 1;

    const icon =
      result.verdict === "pass"
        ? "✓"
        : result.verdict === "regression" || result.verdict === "error"
        ? "✗"
        : "△";
    const detail = `${result.verdict.toUpperCase()} · ${result.verdictReason}`;
    const videoNote = result.demoVideo ? " 🎬" : "";
    console.log(`${icon} ${detail}${videoNote}`);
    for (const row of result.perElement.slice(0, 8)) {
      const bullet =
        row.verdict === "pass"
          ? "  ✓"
          : row.verdict === "regression"
          ? "  ✗"
          : "  ◯";
      console.log(`${bullet} ${row.labId} (${row.displayName}) — ${row.verdict}: ${row.reason}`);
    }
    if (result.perElement.length > 8) {
      console.log(`  … +${result.perElement.length - 8} more`);
    }

    await persistStoryProgress({
      outDir: opts.outDir,
      repoRoot: opts.repoRoot,
      result: record,
      meta: suiteMeta,
      writeHtml
    });

    if (!opts.record && sharedPage) {
      await sharedPage.goto("about:blank");
    }
  }

  if (sharedContext) await sharedContext.close();
  await browser.close();

  await finalizeHarnessRun({
    outDir: opts.outDir,
    repoRoot: opts.repoRoot,
    ranResults,
    meta: suiteMeta,
    writeHtml
  });

  console.log(`\nReport: ${resolve(opts.outDir, "report.html")}`);
  if (videoCount > 0) {
    console.log(`Videos: ${videoCount} per-story file(s) under logic-audit-diffs/by-story/*/interaction.webm`);
  }
  const failed = ranResults.filter(
    (r) => r.status === "error" || r.status === "fail"
  ).length;
  process.exit(failed > 0 ? 1 : 0);
}

main();
