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
import {
  classifyFinding,
  ROOT_AND_DESCENDANT_INTERACTIVE,
  probeScript,
  snapshotScript,
  snapshotsEqual,
  type ControlProbe,
  type InteractionFinding,
  type DomSnapshot
} from "./logic-audit-probes.ts";
import {
  finalizeHarnessRun,
  persistStoryProgress,
  safeStorySegment,
  type MergeSuiteMeta,
  type StoryResultRecord
} from "./report-portfolio.ts";
import { assertStoryStepGate } from "./step-gate.ts";

interface AuditResult {
  storyId: string;
  component: string | null;
  status: "pass" | "gap" | "error";
  interactiveCount: number;
  dsBuiltinCount: number;
  staticShellCount: number;
  readonlyCount: number;
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
  const option = page
    .locator(
      [
        '[role="listbox"] [role="option"]:visible',
        '[role="menu"] [role="menuitem"]:visible',
        ".MuiMenu-root [role=option]:visible",
        ".MuiPopover-root [role=option]:visible",
        "[data-figma-component] .lab-select-menu p:visible"
      ].join(", ")
    )
    .first();
  try {
    if (!(await option.isVisible({ timeout: 2000 }))) return false;
    if (demo) await pause(page, 400);
    await option.hover({ timeout: 3000 });
    if (demo) await pause(page, 350);
    await option.click({ timeout: 3000 });
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
  const clicked = await pointerClickControl(page, control, demo);
  if (!clicked) return false;
  if (control.opensMenu) {
    await pointerPickMenuOption(page, demo);
  }
  return true;
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

async function auditStory(page: Page, storyId: string, opts: CliOpts): Promise<AuditResult> {
  const testedAt = new Date().toISOString();
  const demo = Boolean(opts.record);
  const clickPauseMs = demo ? 900 : 200;
  const statePauseMs = demo ? 1200 : 0;

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
      findings.push(classifyFinding(control, outcome, component));

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

    const status: AuditResult["status"] =
      staticShellCount > 0 && dsBuiltinCount === 0 ? "gap" : staticShellCount > 0 ? "gap" : "pass";

    return {
      storyId,
      component,
      status,
      interactiveCount: initial.controls.length,
      dsBuiltinCount,
      staticShellCount,
      readonlyCount,
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
      interactiveCount: 0,
      dsBuiltinCount: 0,
      staticShellCount: 0,
      readonlyCount: 0,
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
    status: r.status === "gap" ? "warn" : r.status,
    percent: r.staticShellCount,
    maxRegionPercent: r.dsBuiltinCount,
    error: r.error,
    testedAt: r.testedAt,
    component: r.component ?? undefined,
    gaps: r.gaps,
    dsBuiltIn: r.dsBuiltIn,
    interactiveCount: r.interactiveCount,
    readonlyCount: r.readonlyCount,
    findings: r.findings,
    demoVideo: r.demoVideo
  } as StoryResultRecord;
}

function writeSuiteHtml(results: StoryResultRecord[]): string {
  const rows = results
    .filter((r) => r.status !== "not_tested" && r.status !== "skipped")
    .map((r) => {
      const raw = r as StoryResultRecord & {
        component?: string;
        gaps?: string[];
        dsBuiltIn?: string[];
        interactiveCount?: number;
        demoVideo?: string;
      };
      const displayStatus =
        r.status === "warn" ? "GAP" : (r.status ?? "error").toUpperCase();
      const color =
        r.status === "pass" ? "#16a34a" : r.status === "warn" ? "#d97706" : "#dc2626";
      const gapList =
        raw.gaps && raw.gaps.length > 0
          ? `<ul>${raw.gaps.slice(0, 8).map((g) => `<li>${escapeHtml(g)}</li>`).join("")}</ul>`
          : "<span style='color:#64748b'>—</span>";
      const dsList =
        raw.dsBuiltIn && raw.dsBuiltIn.length > 0
          ? `<ul>${raw.dsBuiltIn.slice(0, 8).map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>`
          : "<span style='color:#64748b'>—</span>";
      const demoCell = raw.demoVideo
        ? `<video controls preload="metadata" width="280" src="${escapeHtml(raw.demoVideo)}"></video><br><a href="${escapeHtml(raw.demoVideo)}">Open video</a>`
        : "<span style='color:#64748b'>—</span>";
      return `<tr>
        <td><code>${escapeHtml(r.storyId)}</code></td>
        <td>${escapeHtml(raw.component ?? "—")}</td>
        <td style="color:${color};font-weight:600">${displayStatus}</td>
        <td>${demoCell}</td>
        <td>${raw.interactiveCount ?? 0}</td>
        <td>${r.maxRegionPercent ?? 0}</td>
        <td>${r.percent ?? 0}</td>
        <td>${dsList}</td>
        <td>${gapList}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Logic audit</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;background:#0f1419;color:#e8edf4}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid #2d3a4f;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#1a2332}
code{font-size:12px}
h1{margin-top:0}
p{color:#8b9cb3}
ul{margin:4px 0;padding-left:18px}
video{border-radius:6px;background:#000;max-width:280px}
a{color:#58a6ff}
</style></head><body>
<h1>Logic audit — Delivery showcase</h1>
<p>Each row can include an <strong>interaction video</strong> (when recorded) showing every control exercised and its visible state.
<strong>DS built-in</strong> = design-system behavior works. <strong>Gaps</strong> = inert control needing a developer props API.</p>
<table>
<thead><tr>
<th>Story</th><th>Component</th><th>Status</th><th>Interaction video</th><th>Controls</th><th>DS built-in</th><th>Gaps</th><th>Working</th><th>Missing API</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
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
  sharedPage?: Page
): Promise<{ result: AuditResult; page?: Page }> {
  if (!opts.record) {
    const result = await auditStory(sharedPage!, storyId, opts);
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
  const result = await auditStory(page, storyId, opts);
  await saveStoryVideo(page, context, storyDir);
  result.demoVideo = `by-story/${seg}/interaction.webm`;
  return { result };
}

async function main() {
  const opts = parseCli();
  await mkdir(opts.outDir, { recursive: true });

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

    const { result } = await runStoryWithOptionalVideo(browser, storyId, opts, sharedPage);
    const record = toPortfolioRecord(result);
    ranResults.push(record);
    if (result.demoVideo) videoCount += 1;

    const icon = result.status === "pass" ? "✓" : result.status === "gap" ? "△" : "✗";
    const detail =
      result.status === "error"
        ? result.error
        : `${result.dsBuiltinCount} ds / ${result.staticShellCount} gap / ${result.interactiveCount} controls`;
    const videoNote = result.demoVideo ? " 🎬" : "";
    console.log(`${icon} ${detail}${videoNote}`);

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
  const failed = ranResults.filter((r) => r.status === "error").length;
  process.exit(failed > 0 ? 1 : 0);
}

main();
