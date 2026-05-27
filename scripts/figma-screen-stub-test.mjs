#!/usr/bin/env node
/** Placeholder runner for Figma screen pipeline steps not yet implemented. */

import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { step: { type: "string" } }
});

const step = values.step ?? "unknown";
console.log(`[figma-screen-stub] Step "${step}" is not wired yet.`);
process.exit(0);
