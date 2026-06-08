import { ItemPreviewTooltip } from "./ItemPreviewTooltip";
import { PortfolioStepDonut } from "./PortfolioStepDonut";
import { StepPreviewThumb } from "./StepPreviewThumb";
import { resolveRowOriginalUrl } from "./resolve-original-url";
import {
  UNIFIED_STEP_ORDER,
  cellStatusTitle,
  pctColumnLabel,
  portfolioRowKey,
  itemInspectTitle,
  statusClass,
  stepColSpan,
  stepHasCompare,
  unifiedStepSummaryStats
} from "./portfolio-table-utils";
import type { PortfolioRow, PortfolioState } from "./types";

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none">
      <path
        d="M2.5 4h11M6 4V3.25A.75.75 0 0 1 6.75 2.5h2.5a.75.75 0 0 1 .75.75V4M6.25 7v4.5M9.75 7v4.5M4 4l.65 8.45a.75.75 0 0 0 .75.69h5.6a.75.75 0 0 0 .75-.69L12.5 4"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type PortfolioTableMode = "test" | "quick";

export type PortfolioTableActions = {
  inspectStoryId?: string | null;
  onInspectStory?: (storyId: string) => void;
  onFixStory?: (storyId: string, entryPoint?: "figma" | "storybook") => void;
  onDeleteRow?: (row: PortfolioRow) => void;
  rowFixJob?: (storyId: string) => unknown;
  rowPipelineComplete?: (row: PortfolioRow) => boolean;
  isPortfolioOrchestratorRunning?: boolean;
  anyRowFixJob?: () => unknown;
  rowNeedsRelay?: (row: PortfolioRow) => boolean;
  pluginConnected?: boolean;
  deletingRowKey?: string | null;
};

type Props = {
  portfolio: PortfolioState;
  mode?: PortfolioTableMode;
  totalCaption?: string;
  actions?: PortfolioTableActions;
};

export function PortfolioTable({
  portfolio,
  mode = "test",
  totalCaption = "Total",
  actions = {}
}: Props) {
  const {
    inspectStoryId,
    onInspectStory,
    onFixStory,
    onDeleteRow,
    rowFixJob,
    rowPipelineComplete,
    isPortfolioOrchestratorRunning,
    anyRowFixJob,
    rowNeedsRelay,
    pluginConnected,
    deletingRowKey
  } = actions;

  const stepIds = portfolio.stepIds ?? [...UNIFIED_STEP_ORDER];

  return (
    <div className="portfolio-scroll">
      <table className="portfolio-table">
        <thead>
          <tr className="portfolio-chart-row">
            <th colSpan={2} className="portfolio-meta-spacer">
              <div className="portfolio-total-badge">
                <span className="portfolio-total-number">{portfolio.storyCount}</span>
                <span className="portfolio-total-caption">{totalCaption}</span>
              </div>
            </th>
            {stepIds.map((suiteId, stepIndex) => {
              const stepStats = unifiedStepSummaryStats(portfolio, suiteId, mode);
              return (
                <th
                  key={`chart-${suiteId}`}
                  colSpan={stepColSpan(suiteId)}
                  className={
                    stepIndex > 0 ? "step-group-start portfolio-chart-cell" : "portfolio-chart-cell"
                  }
                >
                  {stepStats ? (
                    <PortfolioStepDonut counts={stepStats.counts} reportUrl={stepStats.htmlUrl} />
                  ) : (
                    <span className="portfolio-chart-empty">—</span>
                  )}
                </th>
              );
            })}
          </tr>
          <tr>
            <th rowSpan={2} className="entry-point-col">
              {portfolio.entryPointLabel ?? "EntryPoint"}
            </th>
            <th rowSpan={2} className="item-col">
              {portfolio.itemLabel ?? "Item"}
            </th>
            {portfolio.steps.map((s, stepIndex) => (
              <th
                key={s.id}
                colSpan={stepColSpan(s.id)}
                className={stepIndex > 0 ? "step-group-start" : undefined}
              >
                {s.label}
              </th>
            ))}
          </tr>
          <tr>
            {portfolio.steps.flatMap((s, stepIndex) => {
              const cols = [
                <th
                  key={`${s.id}-st`}
                  className={`subhead ${stepIndex > 0 ? "step-group-start" : ""}`}
                >
                  Status
                </th>,
                <th key={`${s.id}-pct`} className="subhead">
                  {pctColumnLabel(s.id)}
                </th>
              ];
              if (stepHasCompare(s.id)) {
                cols.push(
                  <th key={`${s.id}-cmp`} className="subhead">
                    Compare
                  </th>
                );
              }
              return cols;
            })}
          </tr>
        </thead>
        <tbody>
          {portfolio.rows.map((row) => {
            const rowKey = portfolioRowKey(row, mode);
            const fixStoryActive = rowFixJob?.(row.storyId) != null;
            const fixStoryDisabled =
              rowPipelineComplete?.(row) ||
              isPortfolioOrchestratorRunning ||
              (anyRowFixJob?.() != null && !fixStoryActive);
            const fixStoryTitle = rowPipelineComplete?.(row)
              ? "All steps pass"
              : isPortfolioOrchestratorRunning
                ? "Run all is in progress"
                : anyRowFixJob?.() && !fixStoryActive
                  ? "Another Fix story is running"
                  : rowNeedsRelay?.(row) && !pluginConnected
                    ? "Test → fix loop — waits for Figma relay at live step"
                    : "Run full row: test → fix until green, then stop";
            const rowSelected = inspectStoryId === row.storyId;
            const deleteKey =
              mode === "quick" && row.jobId
                ? `quick:${row.jobId}`
                : `${row.entryPoint ?? "storybook"}:${row.storyId}`;
            const deletingRow = deletingRowKey === deleteKey;
            const deleteDisabled =
              deletingRow ||
              (mode === "quick"
                ? row.jobStatus === "running"
                : isPortfolioOrchestratorRunning ||
                  fixStoryActive ||
                  (anyRowFixJob?.() != null && !fixStoryActive));
            const entryBadge = mode === "quick" ? "quick" : (row.entryPoint ?? "storybook");
            const deleteTitle =
              mode === "quick"
                ? deleteDisabled && !deletingRow
                  ? row.jobStatus === "running"
                    ? "Wait for the quick job to finish"
                    : "Cannot delete this run"
                  : "Remove this quick generation run (test portfolio unchanged)"
                : deleteDisabled && !deletingRow
                  ? "Stop running jobs before deleting"
                  : "Delete row and all related test artifacts";

            return (
              <tr
                key={rowKey}
                className={`portfolio-row${rowSelected ? " portfolio-row-selected" : ""}${deletingRow ? " portfolio-row-deleting" : ""}`}
              >
                <td className="entry-point-col">
                  {onDeleteRow ? (
                    <div className="entry-point-cell">
                      <span className="badge muted">{entryBadge}</span>
                      <button
                        type="button"
                        className="portfolio-row-delete"
                        disabled={deleteDisabled}
                        aria-label={
                          deletingRow
                            ? "Deleting row…"
                            : mode === "quick"
                              ? "Delete quick generation run"
                              : "Delete row and related artifacts"
                        }
                        title={deleteTitle}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRow(row);
                        }}
                      >
                        {deletingRow ? (
                          <span className="portfolio-row-delete-busy" aria-hidden>
                            …
                          </span>
                        ) : (
                          <TrashIcon />
                        )}
                      </button>
                    </div>
                  ) : (
                    <span className="badge muted">{entryBadge}</span>
                  )}
                </td>
                <td className="item-col">
                  <div className="story-col-inner">
                    {mode === "test" && onFixStory && rowPipelineComplete && !rowPipelineComplete(row) ? (
                      <div className="story-row-actions">
                        <button
                          type="button"
                          className={`story-full-flow-btn${fixStoryActive ? " story-fix-btn-active" : ""}`}
                          disabled={fixStoryDisabled && !fixStoryActive}
                          title={fixStoryTitle}
                          onClick={() => void onFixStory(row.storyId, row.entryPoint)}
                        >
                          {fixStoryActive ? "Fix story…" : "Fix story"}
                        </button>
                      </div>
                    ) : null}
                    {mode === "quick" ? (
                      <ItemPreviewTooltip
                        storyId={row.storyId}
                        originalUrl={resolveRowOriginalUrl(row)}
                      >
                        <code className="item-inspect-link" title={itemInspectTitle(row, mode)}>
                          {row.componentName ?? row.storyId}
                        </code>
                      </ItemPreviewTooltip>
                    ) : (
                      <ItemPreviewTooltip
                        storyId={row.storyId}
                        originalUrl={resolveRowOriginalUrl(row)}
                      >
                        <button
                          type="button"
                          className="item-inspect-link"
                          title={itemInspectTitle(row, mode)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectStory?.(row.storyId);
                          }}
                        >
                          <code>{row.storyId}</code>
                        </button>
                      </ItemPreviewTooltip>
                    )}
                    {mode === "quick" && (row.componentName || row.packageDownloadUrl) ? (
                      <div className="muted-artifacts quick-job-meta">
                        {row.componentName && row.componentName !== row.storyId ? (
                          <span>{row.storyId}</span>
                        ) : null}
                        {row.packageDownloadUrl ? (
                          <>
                            {row.componentName && row.componentName !== row.storyId ? " · " : null}
                            <a
                              href={`/api/quick-generation-portfolio/${row.jobId}/download`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              package
                            </a>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </td>
                {portfolio.steps.flatMap((step, stepIndex) => {
                  const c = row.cells[step.id];
                  const divider = stepIndex > 0 ? "step-group-start" : "";
                  const statusTitle =
                    mode === "quick"
                      ? cellStatusTitle(row, step.id)
                      : (c?.blockedReason ??
                        (c?.maxRegionPercent != null && c.status !== "pass"
                          ? `Global ${c.percent?.toFixed(2) ?? "?"}% · worst hotspot ${c.maxRegionPercent.toFixed(2)}%`
                          : c?.testedAt
                            ? `Last run: ${new Date(c.testedAt).toLocaleString()}`
                            : c?.action ?? undefined));
                  const cols = [
                    <td key={`${rowKey}-${step.id}-s`} className={divider}>
                      <span
                        className={`badge ${statusClass(c?.status ?? "not_tested")}`}
                        title={statusTitle}
                      >
                        {c?.status ?? "not tested"}
                      </span>
                    </td>,
                    <td key={`${rowKey}-${step.id}-pct`} className="pct-cell">
                      {c?.status === "not_tested" ||
                      c?.status === "skipped" ||
                      c?.percent == null
                        ? "—"
                        : step.id === "logic" ||
                            (step.id === "structural" && row.entryPoint === "figma")
                          ? String(Math.round(c.percent))
                          : c.maxRegionPercent != null &&
                              c.maxRegionPercent > 0.1 &&
                              c.status !== "pass"
                            ? `${c.percent.toFixed(2)}% · h ${c.maxRegionPercent.toFixed(2)}%`
                            : `${c.percent.toFixed(2)}%`}
                    </td>
                  ];
                  if (stepHasCompare(step.id)) {
                    cols.push(
                      <td key={`${rowKey}-${step.id}-cmp`}>
                        <div className="artifacts-cell">
                          {c?.previewUrl &&
                          c.status !== "not_tested" &&
                          c.status !== "skipped" ? (
                            <StepPreviewThumb
                              title={`${row.storyId} · ${step.label}`}
                              previewUrl={c.previewUrl}
                            />
                          ) : null}
                          {c?.testReportUrl && c.status !== "not_tested" && c.status !== "skipped" ? (
                            <a href={c.testReportUrl} target="_blank" rel="noreferrer">
                              compare
                            </a>
                          ) : c?.compareUrl && c.status !== "not_tested" ? (
                            <a href={c.compareUrl} target="_blank" rel="noreferrer">
                              compare
                            </a>
                          ) : (
                            <span className="muted-artifacts">—</span>
                          )}
                          {c?.compareUrl &&
                          c.testReportUrl &&
                          c.status !== "not_tested" &&
                          c.status !== "skipped" ? (
                            <>
                              {" · "}
                              <a href={c.compareUrl} target="_blank" rel="noreferrer">
                                diff
                              </a>
                            </>
                          ) : null}
                        </div>
                      </td>
                    );
                  }
                  return cols;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
