import React from "react";
import { FigmaContractScreen, type ContractDocument } from "../../contract/FigmaContractScreen";
import rawContract from "./contract.json";
import { DIALOG_META } from "./baked.meta";
import "./dialog.css";

const contract = rawContract as ContractDocument;

/**
 * Figma-imported screen (screen_dialog_buttons).
 * Real DOM from contract JSON (render-html) — not a baked PNG surface.
 * Re-bake via `node scripts/bake-figma-screen-ui.mjs --screen screen_dialog_buttons --component dialog`.
 */
export function dialog() {
  return (
    <FigmaContractScreen
      contract={contract}
      meta={DIALOG_META}
      componentName="dialog"
    />
  );
}
