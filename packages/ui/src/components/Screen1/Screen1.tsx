import React from "react";
import figmaExport from "./figma-export.png";
import { SCREEN1_META } from "./baked.meta";
import "./screen1.css";

/**
 * Figma-imported workspace screen (screen_1).
 * Visual surface is the Contract → Figma live PNG (pixel-perfect with Figma export).
 * Re-bake via `pnpm ui:bake:screen1` after Contract → Figma passes.
 */
export function Screen1() {
  return (
    <div
      className="lab-figma-screen"
      data-figma-component="Screen1"
      style={{
        width: SCREEN1_META.width,
        height: SCREEN1_META.height,
        position: "relative",
        overflow: "hidden",
        background: SCREEN1_META.background,
      }}
    >
      <img
        src={figmaExport}
        width={SCREEN1_META.width}
        height={SCREEN1_META.height}
        alt=""
        draggable={false}
        decoding="sync"
        style={{
          display: "block",
          width: SCREEN1_META.width,
          height: SCREEN1_META.height,
          imageRendering: "crisp-edges",
        }}
      />
    </div>
  );
}
