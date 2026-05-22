import React from "react";

type NavigationBarsProps = {
  mobile?: boolean;
};

export function NavigationBars({ mobile = false }: NavigationBarsProps) {
  if (mobile) {
    return (
      <div className="lab-bottom-nav" data-figma-component="NavigationBars">
        <button className="active">Home</button>
        <button>Search</button>
        <button>Create</button>
        <button>Profile</button>
      </div>
    );
  }

  return (
    <div className="lab-top-nav" data-figma-component="NavigationBars">
      <div className="brand">Orbital UI</div>
      <div className="links">
        <a>Components</a>
        <a>Tokens</a>
        <a>Templates</a>
      </div>
      <button className="cta">Get Started</button>
    </div>
  );
}
