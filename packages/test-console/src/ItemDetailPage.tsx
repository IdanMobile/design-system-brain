import { useState } from "react";
import type { PortfolioCell, PortfolioRow, PortfolioStep } from "./types";
import { ImageLightbox } from "./ImageLightbox";
import { resolveRowOriginalUrl } from "./resolve-original-url";
import { StoryPackageDownload } from "./StoryPackageDownload";
import { safeStorySegment } from "./story-segment";

function statusClass(s: string): string {
  if (s === "pass") return "pass";
  if (s === "warn") return "warn";
  if (s === "not_tested") return "not_tested";
  return "fail";
}

function pctDisplay(stepId: string, cell: PortfolioCell | undefined, entryPoint?: string): string {
  const c = cell;
  if (!c || c.status === "not_tested" || c.status === "skipped" || c.percent == null) {
    return "—";
  }
  if (stepId === "logic" || (stepId === "structural" && entryPoint === "figma")) {
    return String(Math.round(c.percent));
  }
  if (c.maxRegionPercent != null && c.maxRegionPercent > 0.1 && c.status !== "pass") {
    return `${c.percent.toFixed(2)}% · hotspot ${c.maxRegionPercent.toFixed(2)}%`;
  }
  return `${c.percent.toFixed(2)}%`;
}

function stepMetricLabel(stepId: string, entryPoint?: string): string {
  if (stepId === "structural") return entryPoint === "figma" ? "Layers" : "Extract";
  if (stepId === "logic") return "Gaps";
  return "Diff";
}

function hasVisualArtifacts(stepId: string): boolean {
  return (
    stepId === "vsFigmaLive" ||
    stepId === "vsStorybook" ||
    stepId === "vsReactHtml" ||
    stepId === "vsReactTsx"
  );
}

function fourWayReportUrl(storyId: string): string {
  return `/repo/figma-screen-diffs/${safeStorySegment(storyId)}/fourWay/report.html`;
}

function Shot({ label, src }: { label: string; src: string }) {
  const [open, setOpen] = useState(false);

  return (
    <figure className="item-detail-shot">
      <figcaption>{label}</figcaption>
      <button
        type="button"
        className="item-detail-shot-link"
        title="Click to enlarge"
        onClick={() => setOpen(true)}
      >
        <img src={src} alt={label} loading="lazy" decoding="async" className="item-detail-shot-img" />
      </button>
      {open ? (
        <ImageLightbox title={label} imageUrl={src} onClose={() => setOpen(false)} />
      ) : null}
    </figure>
  );
}

function StepCard({
  step,
  cell,
  originalUrl,
  entryPoint,
  storyId
}: {
  step: PortfolioStep;
  cell: PortfolioCell | undefined;
  originalUrl: string | null;
  entryPoint?: string;
  storyId: string;
}) {
  const status = cell?.status ?? "not_tested";
  const visual = hasVisualArtifacts(step.id);
  const tested = status !== "not_tested" && status !== "skipped";
  const showOriginal = visual && originalUrl && tested;
  const showPreview = visual && cell?.previewUrl && tested;
  const showDiff = visual && cell?.compareUrl && tested;
  const showComposited = visual && cell?.compositedPreviewUrl && tested;
  const hasShots = showOriginal || showPreview || showDiff || showComposited;
  const referenceLabel = cell?.referenceLabel ?? "Reference (gate)";
  const previewLabel = cell?.previewLabel ?? "Generated (raw gate)";
  const fourWayUrl =
    step.id === "vsReactHtml" && entryPoint === "figma" ? fourWayReportUrl(storyId) : null;

  return (
    <section className={`item-detail-step item-detail-step-${statusClass(status)}`}>
      <header className="item-detail-step-header">
        <h3>{step.label}</h3>
        <span className={`badge ${statusClass(status)}`}>{status.replace("_", " ")}</span>
        <span className="item-detail-step-metric">
          {stepMetricLabel(step.id, entryPoint)}: {pctDisplay(step.id, cell, entryPoint)}
        </span>
        {cell?.testedAt && tested ? (
          <span className="item-detail-step-tested">
            {new Date(cell.testedAt).toLocaleString()}
          </span>
        ) : null}
      </header>

      {!tested ? (
        <p className="item-detail-step-blocked">
          {cell?.blockedReason ?? cell?.action ?? "Not run yet"}
        </p>
      ) : null}

      {step.id === "structural" && entryPoint === "figma" && cell?.percent != null ? (
        <p className="item-detail-step-meta">Contract layer count: {Math.round(cell.percent)}</p>
      ) : null}

      {hasShots ? (
        <div className="item-detail-shots">
          {showOriginal ? <Shot label={referenceLabel} src={originalUrl!} /> : null}
          {showPreview ? <Shot label={previewLabel} src={cell!.previewUrl!} /> : null}
          {showComposited ? (
            <Shot label="Legacy composited (debug only)" src={cell!.compositedPreviewUrl!} />
          ) : null}
          {showDiff ? <Shot label="Diff (raw gate)" src={cell!.compareUrl!} /> : null}
        </div>
      ) : visual && tested ? (
        <p className="item-detail-step-meta">No screenshot artifacts for this step.</p>
      ) : null}

      <div className="item-detail-step-links">
        {cell?.testReportUrl && tested ? (
          <a href={cell.testReportUrl} target="_blank" rel="noreferrer">
            Test report ↗
          </a>
        ) : null}
        {cell?.compareUrl &&
        cell.testReportUrl &&
        cell.compareUrl !== cell.testReportUrl &&
        tested ? (
          <a href={cell.compareUrl} target="_blank" rel="noreferrer">
            Diff PNG ↗
          </a>
        ) : null}
        {fourWayUrl ? (
          <a href={fourWayUrl} target="_blank" rel="noreferrer">
            4-way compare ↗
          </a>
        ) : null}
        {cell?.testReportJsonUrl ? (
          <a href={cell.testReportJsonUrl} target="_blank" rel="noreferrer">
            JSON ↗
          </a>
        ) : null}
      </div>
    </section>
  );
}

export function ItemDetailPage({
  row,
  steps,
  onClose,
  onFixStory,
  fixStoryActive,
  fixStoryDisabled,
  fixStoryTitle,
  showFixStory,
  layout = "panel",
  onDeleteRow,
  deleteRowDisabled,
  deleteRowActive
}: {
  row: PortfolioRow;
  steps: PortfolioStep[];
  onClose: () => void;
  onFixStory?: () => void;
  fixStoryActive?: boolean;
  fixStoryDisabled?: boolean;
  fixStoryTitle?: string;
  showFixStory?: boolean;
  layout?: "page" | "panel";
  onDeleteRow?: () => void;
  deleteRowDisabled?: boolean;
  deleteRowActive?: boolean;
}) {
  const originalUrl = resolveRowOriginalUrl(row);
  const entryPoint = row.entryPoint ?? "storybook";
  const isPanel = layout === "panel";

  const header = (
    <header className={`item-detail-header${isPanel ? " inspect-panel-header" : ""}`}>
      <button
        type="button"
        className="item-detail-close"
        onClick={onClose}
        aria-label="Close inspection panel"
      >
        {isPanel ? "×" : "← Portfolio"}
      </button>
      <div className="item-detail-title-block">
        <h1>
          <code>{row.storyId}</code>
        </h1>
        <p className="item-detail-sub">
          Entry: <span className="badge muted">{entryPoint}</span>
          {row.storybookOnly ? (
            <>
              {" "}
              · <span className="badge warn">storybook-only</span>
            </>
          ) : null}
        </p>
      </div>
      {showFixStory && onFixStory ? (
        <button
          type="button"
          className={`story-full-flow-btn item-detail-fix${fixStoryActive ? " story-fix-btn-active" : ""}`}
          disabled={fixStoryDisabled && !fixStoryActive}
          title={fixStoryTitle}
          onClick={onFixStory}
        >
          {fixStoryActive ? "Fix story…" : "Fix story"}
        </button>
      ) : null}
      {onDeleteRow ? (
        <button
          type="button"
          className="story-delete-btn item-detail-delete"
          disabled={deleteRowDisabled}
          title="Delete row and all related test artifacts"
          onClick={onDeleteRow}
        >
          {deleteRowActive ? "Deleting…" : "Delete row"}
        </button>
      ) : null}
    </header>
  );

  const body = (
    <>
      {originalUrl ? (
        <section className={`item-detail-original${isPanel ? "" : " card"}`}>
          <h2>Original reference</h2>
          <a
            href={originalUrl}
            target="_blank"
            rel="noreferrer"
            className="item-detail-original-link"
          >
            <img
              src={originalUrl}
              alt={`Original reference for ${row.storyId}`}
              loading="eager"
              decoding="async"
            />
          </a>
        </section>
      ) : null}

      <StoryPackageDownload storyId={row.storyId} />

      <section className="item-detail-steps">
        <h2 className="item-detail-steps-heading">Pipeline steps</h2>
        {steps.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            cell={row.cells[step.id]}
            originalUrl={originalUrl}
            entryPoint={entryPoint}
            storyId={row.storyId}
          />
        ))}
      </section>
    </>
  );

  if (isPanel) {
    return (
      <div className="item-detail item-detail-panel inspect-panel-inner">
        {header}
        <div className="inspect-panel-body">{body}</div>
      </div>
    );
  }

  return (
    <div className="item-detail">
      {header}
      {body}
    </div>
  );
}
