import React from "react";

type ButtonProps = {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  iconLeft?: boolean;
  iconRight?: boolean;
  children?: React.ReactNode;
};

/**
 * Minimal visual shell — no JS state. Components with real domain state
 * (LoginPage submit flow, PricingPanel CTA loading state, etc.) manage
 * their own pressed/loading semantics in their own component.
 */
export function Button({
  variant = "primary",
  size = "md",
  iconLeft = false,
  iconRight = false,
  children = "Primary"
}: ButtonProps) {
  return (
    <button
      className={`lab-button ${variant} ${size}`}
      data-figma-component="Button"
      type="button"
    >
      {iconLeft && <svg data-figma-name="plusIcon" width="32" height="32" viewBox="0 0 32 32"><path d="M16 6v20M6 16h20" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>}
      <span data-figma-name="label">{children}</span>
      {iconRight && <svg data-figma-name="arrowIcon" width="28" height="28" viewBox="0 0 28 28"><path d="M8 14h12M16 9l5 5-5 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </button>
  );
}
