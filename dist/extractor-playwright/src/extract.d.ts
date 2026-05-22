export type StoryArgs = Record<string, string | number | boolean>;
/**
 * Extract a Storybook story into a self-contained UniversalLayer v1.0 document.
 *
 * Design constraints:
 *  - Zero component-specific code; no class-name sniffing.
 *  - Every visible CSS property that affects paint is captured.
 *  - SVG sub-trees walked per-primitive with computed styles resolved.
 *  - Pseudo-elements (::before, ::after) projected as child layers.
 *  - Images embedded as data URLs so the artifact is self-contained.
 *  - Children pre-sorted by (z-index, source-order).
 *  - Animations paused before measurement for deterministic output.
 */
export declare function extractStoryV2(storyId: string, out: string, baseUrl?: string, argsUsed?: StoryArgs): Promise<string>;
