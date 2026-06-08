/**
 * Static behaviour presets for the showcase layer editor.
 * Designers pick a preset or "Custom" for free-form text.
 */
export type BehaviorPresetId = "click" | "hover" | "edit-text" | "search" | "select" | "submit" | "loading" | "navigate" | "toggle" | "data" | "custom";
export interface BehaviorPreset {
    id: BehaviorPresetId;
    label: string;
    /** Plain-English template; `{name}` is replaced with the layer display name. */
    descriptionTemplate: string;
}
export declare const BEHAVIOR_PRESETS: BehaviorPreset[];
export declare function applyPresetTemplate(presetId: BehaviorPresetId, displayName: string): string;
/** Guess preset from an existing description (for dropdown initial value). */
export declare function inferPresetFromDescription(description: string): BehaviorPresetId;
