import React from "react";

type PricingPanelProps = {
  plan?: "starter" | "pro";
};

type CtaState = "idle" | "loading" | "done";

export function PricingPanel({ plan = "starter" }: PricingPanelProps) {
  const isPro = plan === "pro";
  const [ctaState, setCtaState] = React.useState<CtaState>("idle");

  const handleCta = (): void => {
    if (ctaState !== "idle") return;
    setCtaState("loading");
    window.setTimeout(() => setCtaState("done"), 400);
  };

  const idleLabel = isPro ? "Upgrade now" : "Start free trial";
  const loadingLabel = isPro ? "Upgrading…" : "Starting trial…";
  const doneLabel = isPro ? "Plan upgraded" : "Trial started";
  const ctaLabel =
    ctaState === "loading" ? loadingLabel : ctaState === "done" ? doneLabel : idleLabel;

  return (
    <div
      className={`lab-pricing ${plan}`}
      data-figma-component="PricingPanel"
      data-cta-state={ctaState}
    >
      <div className="lab-pricing-tag">{isPro ? "Most Popular" : "For Teams"}</div>
      <h3>{isPro ? "Pro Plan" : "Starter Plan"}</h3>
      <p className="lab-pricing-price">{isPro ? "$49" : "$19"}<span>/month</span></p>
      <div className="lab-pricing-list">
        <p>Unlimited exports</p>
        <p>{isPro ? "Priority review queue" : "Shared workspace"}</p>
        <p>{isPro ? "Component diff dashboard" : "Basic visual checks"}</p>
      </div>
      <button
        type="button"
        className="lab-pricing-cta"
        aria-busy={ctaState === "loading"}
        aria-pressed={ctaState !== "idle"}
        data-pressed-managed="true"
        disabled={ctaState !== "idle"}
        onClick={handleCta}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
