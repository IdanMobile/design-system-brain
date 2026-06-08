/**
 * React component prop models for the showcase developer panel.
 * Curated from `@lab/ui` component source — update when props change.
 */
import type { DevComponentName } from "./stories";
export interface ComponentPropDef {
    name: string;
    type: string;
    optional?: boolean;
}
export declare function propsForComponent(component: DevComponentName): ComponentPropDef[];
export declare function formatPropsInterface(component: DevComponentName): string;
/** JSX usage for this story's component + args. */
export declare function formatJsxUsage(storyId: string): string | null;
export declare function reactModelForStory(storyId: string): {
    component: DevComponentName | null;
    propsInterface: string;
    jsxUsage: string;
} | null;
