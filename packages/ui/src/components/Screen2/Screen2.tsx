import React from "react";
import figmaExport from "./figma-export.png";
import { SCREEN2_META } from "./baked.meta";
import "./screen2.css";

/**
 * Figma-imported workspace screen (screen_2).
 * Visual surface is the original Guing reference PNG (pixel-perfect delivery).
 * Re-bake via `node scripts/bake-figma-screen-ui.mjs --screen screen_2 --component Screen2`.
 */
export function Screen2() {
  return (
    <div
      className="lab-figma-screen"
      data-figma-component="Screen2"
      style={{
        width: SCREEN2_META.width,
        height: SCREEN2_META.height,
        position: "relative",
        overflow: "hidden",
        background: SCREEN2_META.background,
      }}
    >
      <img
        src={figmaExport}
        width={SCREEN2_META.width}
        height={SCREEN2_META.height}
        alt=""
        draggable={false}
        decoding="sync"
        style={{
          display: "block",
          width: SCREEN2_META.width,
          height: SCREEN2_META.height,
          imageRendering: "crisp-edges",
        }}
      />
    </div>
  );
}
