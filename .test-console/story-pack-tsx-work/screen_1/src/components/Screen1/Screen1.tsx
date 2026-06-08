import React from "react";
import { FigmaContractScreen, type ContractDocument } from "../../contract/FigmaContractScreen";
import rawContract from "./contract.json";
import { SCREEN1_META } from "./baked.meta";
import "./screen1.css";

const contract = rawContract as ContractDocument;

/**
 * Figma-imported screen (screen_1).
 * Real DOM from contract JSON (render-html) — not a baked PNG surface.
 * Re-bake via `node scripts/bake-figma-screen-ui.mjs --screen screen_1 --component Screen1`.
 */
export function Screen1() {
  return (
    <FigmaContractScreen
      contract={contract}
      meta={SCREEN1_META}
      componentName="Screen1"
    />
  );
}
