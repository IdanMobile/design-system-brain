/**
 * Local heuristic extractor. Pure function, no I/O.
 *
 * Rules are checked in declared order; each rule independently appends to
 * behaviour fragments and/or devApi entries. Results are joined into a single
 * sentence at the end.
 *
 * Determinism guarantee: for the same `(description, displayName, tag, role)`
 * the function returns byte-identical output for the `behaviour` and `devApi`
 * fields (used by the audit to cache and compare `aiExtracted` between runs).
 * The `extractedAt` field is the only non-deterministic field.
 */

import type { AiExtracted, DevApiEntry } from "../../contract/src/spec-types.ts";

export interface HeuristicInputs {
  displayName: string;
  description: string;
  tag: string;
  role: string;
  ariaLabel: string;
  text: string;
}

function pascalize(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function isTextInput(inputs: HeuristicInputs): boolean {
  if (inputs.tag === "textarea") return true;
  if (inputs.tag === "input") return true;
  return false;
}

/** Pull the noun phrase after a verb (e.g. "reveal a search input" → "search input"). */
function nounAfter(desc: string, verbs: string[]): string {
  const lower = desc.toLowerCase();
  for (const v of verbs) {
    const idx = lower.indexOf(v);
    if (idx === -1) continue;
    const tail = desc.slice(idx + v.length).trim();
    const cleaned = tail.replace(/^(a|an|the)\s+/i, "");
    const cut = cleaned.split(/[,.;]| and | then | so /i)[0].trim();
    if (cut) return cut;
  }
  return "";
}

function fieldNoun(inputs: HeuristicInputs): string {
  const candidate = inputs.ariaLabel || inputs.displayName || inputs.text || inputs.tag;
  return candidate.replace(/\b(field|input|textarea|button)\b/gi, "").trim() || "Value";
}

interface ExtractAcc {
  verbs: string[];
  objects: string[];
  api: DevApiEntry[];
  apiByName: Set<string>;
}

function addApi(acc: ExtractAcc, entry: DevApiEntry): void {
  if (acc.apiByName.has(entry.name)) return;
  acc.apiByName.add(entry.name);
  acc.api.push(entry);
}

export function extractFromDescription(inputs: HeuristicInputs): AiExtracted {
  const desc = (inputs.description || "").trim();
  const display = pascalize(inputs.displayName || inputs.text || inputs.role || inputs.tag || "Element");
  const acc: ExtractAcc = { verbs: [], objects: [], api: [], apiByName: new Set() };

  if (!desc) {
    return {
      behaviour: "Clicking does something — please describe what it should do.",
      devApi: [],
      extractedBy: "heuristic",
      extractedAt: new Date().toISOString()
    };
  }

  const lower = desc.toLowerCase();

  if (/\b(click|tap|press)\b/.test(lower)) {
    acc.verbs.push("On click");
    addApi(acc, { name: `on${display}Clicked`, signature: "() => void" });
  }

  if (/\b(hover|mouse over|mouseover)\b/.test(lower)) {
    acc.verbs.push("On hover");
    addApi(acc, { name: "onMouseEnter", signature: "() => void" });
    addApi(acc, { name: "onMouseLeave", signature: "() => void" });
  }

  if (/\b(select|pick|choose)\b/.test(lower) && /\b(option|item|value|row)\b/.test(lower)) {
    acc.verbs.push("On selection");
    const noun = pascalize(nounAfter(desc, ["select", "pick", "choose"]) || "Item");
    addApi(acc, { name: `on${noun || "Item"}Selected`, signature: "(id: string) => void" });
  }

  if (/\b(submit|send)\b/.test(lower) && /\bform\b/.test(lower)) {
    acc.verbs.push("On submit");
    addApi(acc, { name: "onSubmit", signature: "() => Promise<void>" });
  }

  if (/\b(loading|spinner|wait)\b/.test(lower)) {
    addApi(acc, { name: "isLoading", signature: "boolean" });
  }

  if (/\b(type|types|enter|input)\b/.test(lower) && isTextInput(inputs)) {
    acc.verbs.push("On type");
    const field = pascalize(fieldNoun(inputs));
    addApi(acc, { name: `on${field}Changed`, signature: "(value: string) => void" });
  }

  if (/\b(show|reveal|open|display)\b/.test(lower)) {
    const noun = nounAfter(desc, ["show", "reveal", "open", "display"]);
    if (noun) acc.objects.push(`show ${noun}`);
    const nounLower = noun.toLowerCase();
    if (/\b(input|search|field|textbox)\b/.test(nounLower)) {
      const fieldName = pascalize(noun.replace(/\b(input|field|textbox)\b/gi, "").trim() || "Value");
      addApi(acc, { name: `on${fieldName}Changed`, signature: "(value: string) => void" });
    }
  }

  if (/\b(navigate|go to|route)\b/.test(lower)) {
    const dest = nounAfter(desc, ["navigate to", "go to", "route to", "navigate", "go", "route"]);
    acc.objects.push(dest ? `navigate to ${dest}` : "navigate");
    addApi(acc, { name: "href", signature: "string" });
  }

  if (acc.verbs.length === 0 && acc.objects.length === 0) {
    acc.verbs.push("Click triggers action");
    addApi(acc, { name: `on${display}Clicked`, signature: "() => void" });
  }

  const verbStr = acc.verbs.join(" + ");
  const objStr = acc.objects.length ? acc.objects.join(", ") : "";
  const behaviour = objStr ? `${verbStr}: ${objStr}` : verbStr;

  return {
    behaviour,
    devApi: acc.api,
    extractedBy: "heuristic",
    extractedAt: new Date().toISOString()
  };
}
