import React from "react";

export function ComplexDashboardCard() {
  return (
    <div className="lab-dashboard" data-figma-component="ComplexDashboardCard">
      <div className="toolbar">
        <h3>Engagement Overview</h3>
        <div className="chips">
          <span>24h</span>
          <span className="active">7d</span>
          <span>30d</span>
        </div>
      </div>
      <div className="cards">
        <article>
          <p>Visitors</p>
          <strong>124.2K</strong>
        </article>
        <article>
          <p>Conversions</p>
          <strong>8.7%</strong>
        </article>
        <article>
          <p>Bounce</p>
          <strong>27%</strong>
        </article>
      </div>
      <div className="chart">
        <div className="bar" style={{ height: "45%" }} />
        <div className="bar" style={{ height: "68%" }} />
        <div className="bar" style={{ height: "39%" }} />
        <div className="bar" style={{ height: "82%" }} />
        <div className="bar" style={{ height: "61%" }} />
        <div className="bar" style={{ height: "76%" }} />
      </div>
    </div>
  );
}
