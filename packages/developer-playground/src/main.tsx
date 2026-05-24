import React from "react";
import { createRoot } from "react-dom/client";
import "@lab/ui/styles.css";
import { App } from "./App";

// Match Storybook's iframe baseline so single-story renders match the
// Storybook screenshot pixel-for-pixel (delivery 3-way diff).
if (typeof document !== "undefined") {
  const reset = document.createElement("style");
  reset.textContent = "body{margin:0;}";
  document.head.appendChild(reset);
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
