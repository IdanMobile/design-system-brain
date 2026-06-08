import React from "react";
import { FigmaContractScreen, type ContractDocument } from "../../contract/FigmaContractScreen";
import rawContract from "./contract.json";
import { SCREEN_NOTIFICATION_AVATER_META } from "./baked.meta";
import "./screen-notification-avater.css";

const contract = rawContract as ContractDocument;

/**
 * Figma-imported screen (screen_notification_avater).
 * Real DOM from contract JSON (render-html) — not a baked PNG surface.
 * Re-bake via `node scripts/bake-figma-screen-ui.mjs --screen screen_notification_avater --component ScreenNotificationAvater`.
 */
export function ScreenNotificationAvater() {
  return (
    <FigmaContractScreen
      contract={contract}
      meta={SCREEN_NOTIFICATION_AVATER_META}
      componentName="ScreenNotificationAvater"
    />
  );
}
