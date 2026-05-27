/**
 * Merge live DOM interactive layers into the story spec for the showcase.
 * Designers see clickable items immediately — no audit run required.
 */

import type { ElementSpec } from "../../contract/src/spec-types.ts";
import type { LayerNode } from "./layer-tree";

export function suggestionForLayer(layer: LayerNode): string {
  const name = layer.displayName || layer.tag;
  if (layer.tag === "input" || layer.tag === "textarea") {
    return `Designer types in this ${name} field`;
  }
  if (layer.role === "tab") return `Click switches to the "${name}" tab`;
  if (layer.role === "link" || layer.tag === "a") {
    return `Click toggles or navigates via "${name}"`;
  }
  if (layer.role === "switch" || layer.role === "checkbox") {
    return `Toggles ${name} on or off`;
  }
  return `Click triggers the "${name}" action`;
}

export function elementSpecFromLayer(layer: LayerNode): ElementSpec {
  return {
    id: layer.id,
    selector: layer.labId ? `[data-lab-id="${layer.labId}"]` : "",
    displayName: layer.displayName,
    description: "",
    behaviorPreset: "click",
    source: "ai",
    aiSuggestion: suggestionForLayer(layer),
    aiExtracted: null,
    status: "proposed",
    approvedAt: null,
  };
}

/** Spec entries + any interactive layers in the preview not yet in the spec. */
export function mergeInteractiveWithSpec(
  elements: ElementSpec[],
  flatLayers: LayerNode[]
): ElementSpec[] {
  const byId = new Map<string, ElementSpec>();
  for (const el of elements) byId.set(el.id, el);
  for (const layer of flatLayers) {
    if (!layer.isInteractive) continue;
    if (!byId.has(layer.id)) byId.set(layer.id, elementSpecFromLayer(layer));
  }
  return [...byId.values()].sort((a, b) => {
    if (a.status === b.status) return a.displayName.localeCompare(b.displayName);
    return a.status === "approved" ? 1 : -1;
  });
}

export function newElementsFromLayers(
  elements: ElementSpec[],
  flatLayers: LayerNode[]
): ElementSpec[] {
  const known = new Set(elements.map((e) => e.id));
  return flatLayers
    .filter((l) => l.isInteractive && !known.has(l.id))
    .map(elementSpecFromLayer);
}
