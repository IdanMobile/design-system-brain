type DonutCounts = {
  pass: number;
  warn: number;
  fail: number;
  error: number;
  not_tested: number;
  skipped: number;
};

type Props = {
  counts: DonutCounts;
  reportUrl?: string | null;
};

const SEGMENT_COLORS = {
  pass: "var(--pass)",
  warn: "var(--warn)",
  fail: "var(--fail)",
  idle: "var(--muted)"
} as const;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad)
  };
}

function pieSlicePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  if (endDeg - startDeg >= 359.99) {
    endDeg = startDeg + 359.99;
  }
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    "Z"
  ].join(" ");
}

export function PortfolioStepDonut({ counts, reportUrl }: Props) {
  const cx = 40;
  const cy = 40;
  const radius = 34;
  const labelR = radius * 0.62;
  const failed = counts.fail + counts.error;
  const idle = counts.not_tested + counts.skipped;

  const slices = [
    { key: "pass", count: counts.pass, color: SEGMENT_COLORS.pass },
    { key: "warn", count: counts.warn, color: SEGMENT_COLORS.warn },
    { key: "fail", count: failed, color: SEGMENT_COLORS.fail },
    { key: "idle", count: idle, color: SEGMENT_COLORS.idle }
  ].filter((s) => s.count > 0);

  const activeTotal = slices.reduce((sum, s) => sum + s.count, 0);
  let cursor = 0;

  const arcs =
    activeTotal > 0
      ? slices.map((slice) => {
          const sweep = (slice.count / activeTotal) * 360;
          const start = cursor;
          const end = cursor + sweep;
          cursor = end;
          const mid = start + sweep / 2;
          const labelPos = polar(cx, cy, labelR, mid);
          return {
            ...slice,
            path: pieSlicePath(cx, cy, radius, start, end),
            labelPos,
            showLabel: slice.count > 0 && sweep >= 10
          };
        })
      : [
          {
            key: "empty",
            count: 0,
            color: SEGMENT_COLORS.idle,
            path: pieSlicePath(cx, cy, radius, 0, 359.99),
            labelPos: { x: cx, y: cy },
            showLabel: false
          }
        ];

  const chart = (
    <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
      {arcs.map((arc) => (
        <g key={arc.key}>
          <path d={arc.path} fill={arc.color} opacity={arc.key === "empty" ? 0.35 : 1} />
          {arc.showLabel ? (
            <text
              x={arc.labelPos.x}
              y={arc.labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="portfolio-step-donut-segment-label"
            >
              {arc.count}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );

  return (
    <div className="portfolio-step-donut">
      {reportUrl ? (
        <a
          href={reportUrl}
          target="_blank"
          rel="noreferrer"
          className="portfolio-step-donut-link"
          title="Open report"
          aria-label="Open report"
        >
          {chart}
        </a>
      ) : (
        chart
      )}
    </div>
  );
}
