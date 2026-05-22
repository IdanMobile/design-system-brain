import React from "react";

type LoadingStatesProps = {
  mode?: "card" | "list";
};

export function LoadingStates({ mode = "card" }: LoadingStatesProps) {
  if (mode === "list") {
    return (
      <div className="lab-loading-list" data-figma-component="LoadingStates">
        <div className="line long" />
        <div className="line" />
        <div className="line short" />
        <div className="line long" />
        <div className="line" />
      </div>
    );
  }

  return (
    <div className="lab-loading-card" data-figma-component="LoadingStates">
      <div className="thumb shimmer" />
      <div className="line long shimmer" />
      <div className="line shimmer" />
      <div className="line short shimmer" />
    </div>
  );
}
