import React from "react";

type FeatureCardProps = {
  variant?: "default" | "success" | "warning";
  title?: string;
  description?: string;
  statLabel?: string;
  statValue?: string;
};

export function FeatureCard({
  variant = "default",
  title = "Realtime Sync",
  description = "Keep design and Storybook output aligned in every release.",
  statLabel = "Uptime",
  statValue = "99.98%"
}: FeatureCardProps) {
  return (
    <div className={`lab-feature-card ${variant}`} data-figma-component="FeatureCard">
      <div className="lab-feature-header">
        <span className="lab-feature-icon" data-figma-name="featureIcon">
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path d="M4 10h12M10 4v12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="lab-feature-footer">
        <span>{statLabel}</span>
        <strong>{statValue}</strong>
      </div>
    </div>
  );
}
