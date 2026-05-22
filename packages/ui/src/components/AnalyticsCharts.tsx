import React from "react";

type AnalyticsChartsProps = {
  focus?: "revenue" | "usage";
  dense?: boolean;
};

const lineHeights = [32, 42, 38, 52, 66, 58, 74, 68, 80, 62, 56, 64];
const comparisonHeights = [20, 24, 26, 30, 34, 38, 42, 44, 48, 52, 58, 62];

export function AnalyticsCharts({ focus = "revenue", dense = false }: AnalyticsChartsProps) {
  const isRevenue = focus === "revenue";
  const pieSlices = isRevenue
    ? [
        { label: "Core plan", value: "43%", color: "#4f46e5", size: 43, offset: 0 },
        { label: "Add-ons", value: "27%", color: "#6366f1", size: 27, offset: 43 },
        { label: "Enterprise", value: "19%", color: "#f97316", size: 19, offset: 70 },
        { label: "Trials", value: "11%", color: "#94a3b8", size: 11, offset: 89 }
      ]
    : [
        { label: "Core plan", value: "36%", color: "#14b8a6", size: 36, offset: 0 },
        { label: "Add-ons", value: "22%", color: "#2dd4bf", size: 22, offset: 36 },
        { label: "Enterprise", value: "31%", color: "#0f766e", size: 31, offset: 58 },
        { label: "Trials", value: "11%", color: "#94a3b8", size: 11, offset: 89 }
      ];

  const circumference = 2 * Math.PI * 45;
  return (
    <section className={`lab-analytics-charts ${dense ? "dense" : ""}`} data-figma-component="AnalyticsCharts">
      <header>
        <div>
          <p className="eyebrow">Performance</p>
          <h3>{isRevenue ? "Revenue distribution" : "Usage distribution"}</h3>
        </div>
        <span className={`chip ${isRevenue ? "indigo" : "teal"}`}>{isRevenue ? "Net +18.4%" : "DAU +9.7%"}</span>
      </header>

      <div className="lab-analytics-body">
        <article className="pie-card">
          <svg className="pie-chart-svg" viewBox="0 0 120 120" aria-label={`${focus} breakdown`} role="img">
            <circle cx="60" cy="60" r="45" fill="none" stroke="#e2e8f0" strokeWidth="24" />
            {pieSlices.map((slice) => (
              <circle
                key={slice.label}
                cx="60"
                cy="60"
                r="45"
                fill="none"
                stroke={slice.color}
                strokeWidth="24"
                strokeLinecap="butt"
                strokeDasharray={`${(slice.size / 100) * circumference} ${circumference}`}
                strokeDashoffset={`${-(slice.offset / 100) * circumference}`}
                transform="rotate(-90 60 60)"
              />
            ))}
          </svg>
          <div className="legend">
            {pieSlices.map((slice, index) => (
              <div key={slice.label} className="legend-row">
                <div className="legend-left">
                  <i className={`legend-dot ${index === 0 ? "one" : index === 1 ? "two" : index === 2 ? "three" : "four"}`} />
                  <span>{slice.label}</span>
                </div>
                <strong>{slice.value}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="trend-card">
          <h4>30-day trend</h4>
          <div className="trend-grid">
            {lineHeights.map((height, index) => (
              <div key={`main-${index}`} className="bar-wrap">
                <div className={`bar main ${isRevenue ? "indigo" : "teal"}`} style={{ height: `${height}%` }} />
                <div className="bar compare" style={{ height: `${comparisonHeights[index]}%` }} />
              </div>
            ))}
          </div>
          <div className="axis">
            <span>W1</span>
            <span>W2</span>
            <span>W3</span>
            <span>W4</span>
          </div>
        </article>
      </div>
    </section>
  );
}
