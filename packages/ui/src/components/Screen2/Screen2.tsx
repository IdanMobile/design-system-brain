import React from "react";
import { FigmaContractScreen, type ContractDocument } from "../../contract/FigmaContractScreen";
import rawContract from "./contract.json";
import { SCREEN2_META } from "./baked.meta";
import "./screen2.css";

const contract = rawContract as ContractDocument;

/**
 * Figma-imported screen (screen_2).
 * Real DOM from contract JSON (render-html) — not a baked PNG surface.
 * Re-bake via `node scripts/bake-figma-screen-ui.mjs --screen screen_2 --component Screen2`.
 */
export function Screen2() {
  return (
    <FigmaContractScreen
      contract={contract}
      meta={SCREEN2_META}
      componentName="Screen2"
    />
  );
}
