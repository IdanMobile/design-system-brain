import React from "react";

type PricingPanelProps = {
  plan?: "starter" | "pro";
};

export function PricingPanel({ plan = "starter" }: PricingPanelProps) {
  const isPro = plan === "pro";
  return (
    <div className={`lab-pricing ${plan}`} data-figma-component="PricingPanel">
      <div className="lab-pricing-tag">{isPro ? "Most Popular" : "For Teams"}</div>
      <h3>{isPro ? "Pro Plan" : "Starter Plan"}</h3>
      <p className="lab-pricing-price">{isPro ? "$49" : "$19"}<span>/month</span></p>
      <div className="lab-pricing-list">
        <p>Unlimited exports</p>
        <p>{isPro ? "Priority review queue" : "Shared workspace"}</p>
        <p>{isPro ? "Component diff dashboard" : "Basic visual checks"}</p>
      </div>
      <button className="lab-pricing-cta">{isPro ? "Upgrade now" : "Start free trial"}</button>
    </div>
  );
}
