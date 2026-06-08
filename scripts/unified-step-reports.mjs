/**
 * HTML reports for each unified portfolio step — all items, original-parity artifacts.
 *
 *   test-portfolio/unified-steps/<stepId>/report.html
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "test-portfolio/unified-steps";

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function artifactLinks(cell) {
  if (!cell || cell.status === "not_tested" || cell.status === "skipped") return "—";
  const parts = [];
  if (cell.testReportUrl) {
    parts.push(`<a href="${escHtml(cell.testReportUrl)}">full compare</a>`);
  }
  if (cell.compareUrl && cell.compareUrl !== cell.testReportUrl) {
    parts.push(`<a href="${escHtml(cell.compareUrl)}">diff png</a>`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

function previewThumbsHtml(row, cell) {
  const generated = cell?.previewUrl ?? null;
  const original = row.originalUrl ?? null;
  const parts = [];

  if (generated) {
    parts.push(
      `<div class="thumb-wrap"><span class="thumb-label">Generated</span><a href="${escHtml(generated)}"><img class="thumb" src="${escHtml(generated)}" alt="" loading="lazy"></a></div>`
    );
  }
  if (original && original !== generated) {
    parts.push(
      `<div class="thumb-wrap thumb-original"><span class="thumb-label">Original</span><a href="${escHtml(original)}"><img class="thumb thumb-sm" src="${escHtml(original)}" alt="" loading="lazy"></a></div>`
    );
  }

  return parts.join("");
}

function pctLabel(stepId, cell, entryPoint) {
  if (!cell || cell.status === "not_tested" || cell.status === "skipped" || cell.percent == null) {
    return "—";
  }
  if (stepId === "logic" || (stepId === "structural" && entryPoint === "figma")) {
    return String(Math.round(cell.percent));
  }
  if (cell.maxRegionPercent != null && cell.maxRegionPercent > 0.1 && cell.status !== "pass") {
    return `${cell.percent.toFixed(2)}% · h ${cell.maxRegionPercent.toFixed(2)}%`;
  }
  return `${cell.percent.toFixed(2)}%`;
}

function buildStepReportHtml(step, rows, generatedAt, tolerance) {
  const counts = { pass: 0, warn: 0, fail: 0, error: 0, not_tested: 0, skipped: 0 };
  for (const row of rows) {
    const s = row.cells[step.id]?.status ?? "not_tested";
    if (s in counts) counts[s]++;
    else counts.not_tested++;
  }

  const bodyRows = rows
    .map((row) => {
      const cell = row.cells[step.id];
      const status = cell?.status ?? "not_tested";
      const cls = status === "not_tested" ? "muted" : status;
      const previews = previewThumbsHtml(row, cell);
      return `<tr>
        <td>${escHtml(row.entryPoint ?? "storybook")}</td>
        <td><code>${escHtml(row.storyId)}</code>${previews}</td>
        <td><span class="badge ${cls}">${escHtml(status)}</span></td>
        <td class="pct">${escHtml(pctLabel(step.id, cell, row.entryPoint))}</td>
        <td class="artifacts">${artifactLinks(cell)}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(step.label)} — unified portfolio</title>
<style>
:root{color-scheme:dark}
body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:24px;background:#0f1419;color:#e8edf4;line-height:1.45}
h1{margin:0 0 6px;font-size:1.4rem}
.sub{color:#8b9cb3;margin:0 0 20px;font-size:.9rem}
.summary{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.summary div{padding:8px 14px;background:#1a2332;border:1px solid #2d3a4f;border-radius:8px;font-size:.85rem}
table{border-collapse:collapse;width:100%;font-size:.82rem}
th,td{border-bottom:1px solid #2d3a4f;padding:8px 10px;vertical-align:top;text-align:left}
th{background:#1a2332;color:#8b9cb3;font-weight:600}
.badge{font-weight:600;text-transform:uppercase;font-size:.68rem;padding:2px 8px;border-radius:6px;display:inline-block}
.pass{color:#22c55e;background:rgba(34,197,94,.18)}
.warn{color:#f59e0b;background:rgba(245,158,11,.18)}
.fail,.error{color:#ef4444;background:rgba(239,68,68,.18)}
.muted{color:#8b9cb3;background:rgba(139,156,179,.15);text-transform:none}
.pct{color:#8b9cb3;white-space:nowrap}
.artifacts a{color:#3b82f6;text-decoration:none}
.artifacts a:hover{text-decoration:underline}
code{font-size:.78rem}
.thumb-wrap{margin-top:6px}
.thumb-label{display:block;font-size:.62rem;text-transform:uppercase;letter-spacing:.04em;color:#8b9cb3;margin-bottom:3px}
.thumb-original{opacity:.85}
.thumb{max-width:120px;max-height:72px;border-radius:4px;border:1px solid #2d3a4f;background:#0b1018;display:block}
.thumb-sm{max-width:88px;max-height:52px}
</style></head><body>
<h1>${escHtml(step.label)}</h1>
<p class="sub">Unified original-parity · tolerance ≤ ${tolerance ?? 0.1}% · ${rows.length} items · ${escHtml(generatedAt ?? "")}</p>
<div class="summary">
  <div>Total: <strong>${rows.length}</strong></div>
  <div style="color:#22c55e">Pass: <strong>${counts.pass}</strong></div>
  <div style="color:#f59e0b">Warn: <strong>${counts.warn}</strong></div>
  <div style="color:#ef4444">Fail: <strong>${counts.fail}</strong></div>
  <div style="color:#a855f7">Error: <strong>${counts.error}</strong></div>
  <div style="color:#8b9cb3">Not tested: <strong>${counts.not_tested + counts.skipped}</strong></div>
</div>
<table>
<thead><tr><th>EntryPoint</th><th>Item</th><th>Status</th><th>Diff %</th><th>Compare</th></tr></thead>
<tbody>
${bodyRows}
</tbody>
</table>
</body></html>`;
}

/**
 * @param {string} repoRoot
 * @param {{ generatedAt?: string, tolerance?: number, rows: Array<{ entryPoint?: string, storyId: string, originalUrl?: string | null, cells: Record<string, object> }>, steps: Array<{ id: string, label: string, dir: string, actionId?: string | null, needsRelay?: boolean }> }} portfolio
 */
export function attachUnifiedStepReports(repoRoot, portfolio) {
  const base = join(repoRoot, OUT_DIR);
  mkdirSync(base, { recursive: true });

  return portfolio.steps.map((step) => {
    const stepDir = join(base, step.id);
    mkdirSync(stepDir, { recursive: true });
    const htmlPath = join(stepDir, "report.html");
    const html = buildStepReportHtml(
      step,
      portfolio.rows,
      portfolio.generatedAt,
      portfolio.tolerance
    );
    writeFileSync(htmlPath, html, "utf8");
    const htmlUrl = existsSync(htmlPath)
      ? `/repo/${OUT_DIR}/${step.id}/report.html`
      : null;
    return { ...step, htmlUrl };
  });
}

export function writeUnifiedStepsIndex(repoRoot, portfolio) {
  const links = portfolio.steps
    .map(
      (step) =>
        `<li><a href="${escHtml(step.htmlUrl ?? `${step.id}/report.html`)}">${escHtml(step.label)}</a></li>`
    )
    .join("\n");
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Unified portfolio steps</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;background:#0f1419;color:#e8edf4}a{color:#3b82f6}</style></head>
<body><h1>Unified portfolio — step reports</h1>
<p>${portfolio.rows.length} items · ${escHtml(portfolio.generatedAt ?? "")}</p>
<ul>${links}</ul></body></html>`;
  writeFileSync(join(repoRoot, OUT_DIR, "index.html"), html, "utf8");
}

export { OUT_DIR as UNIFIED_STEP_REPORTS_DIR };
