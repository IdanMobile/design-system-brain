/**
 * Static behaviour presets for the showcase layer editor.
 * Designers pick a preset or "Custom" for free-form text.
 */

export type BehaviorPresetId =
  | "click"
  | "hover"
  | "edit-text"
  | "search"
  | "select"
  | "submit"
  | "loading"
  | "navigate"
  | "toggle"
  | "data"
  | "custom";

export interface BehaviorPreset {
  id: BehaviorPresetId;
  label: string;
  /** Plain-English template; `{name}` is replaced with the layer display name. */
  descriptionTemplate: string;
}

export const BEHAVIOR_PRESETS: BehaviorPreset[] = [
  { id: "click", label: "Click", descriptionTemplate: "click to trigger the {name} action" },
  { id: "hover", label: "Hover", descriptionTemplate: "on hover over {name}, show additional details" },
  { id: "edit-text", label: "Edit text", descriptionTemplate: "user can type into this {name} field" },
  { id: "search", label: "Search", descriptionTemplate: "search — typing in {name} filters results" },
  { id: "select", label: "Select option", descriptionTemplate: "select an option from {name}" },
  { id: "submit", label: "Submit", descriptionTemplate: "submit the form when {name} is clicked" },
  { id: "loading", label: "Loading", descriptionTemplate: "show loading state on {name}" },
  { id: "navigate", label: "Navigate", descriptionTemplate: "navigate when {name} is clicked" },
  { id: "toggle", label: "Toggle", descriptionTemplate: "toggle on or off when {name} is clicked" },
  { id: "data", label: "Data / display", descriptionTemplate: "display data bound to {name}" },
  { id: "custom", label: "Custom…", descriptionTemplate: "" }
];

export function applyPresetTemplate(
  presetId: BehaviorPresetId,
  displayName: string
): string {
  const preset = BEHAVIOR_PRESETS.find((p) => p.id === presetId);
  if (!preset || preset.id === "custom" || !preset.descriptionTemplate) return "";
  const name = displayName.trim() || "this layer";
  return preset.descriptionTemplate.replace(/\{name\}/g, name);
}

/** Guess preset from an existing description (for dropdown initial value). */
export function inferPresetFromDescription(description: string): BehaviorPresetId {
  const d = description.toLowerCase().trim();
  if (!d) return "custom";
  if (/\b(hover|mouse over)\b/.test(d)) return "hover";
  if (/\b(search)\b/.test(d)) return "search";
  if (/\b(type|types|enter|edit)\b/.test(d) && /\b(field|input|text)\b/.test(d)) return "edit-text";
  if (/\b(select|pick|choose)\b/.test(d)) return "select";
  if (/\b(submit)\b/.test(d)) return "submit";
  if (/\b(loading|spinner)\b/.test(d)) return "loading";
  if (/\b(navigate|go to|route)\b/.test(d)) return "navigate";
  if (/\b(toggle|switch)\b/.test(d)) return "toggle";
  if (/\b(data|display|show)\b/.test(d) && !/\b(click)\b/.test(d)) return "data";
  if (/\b(click|tap|press)\b/.test(d)) return "click";
  return "custom";
}
