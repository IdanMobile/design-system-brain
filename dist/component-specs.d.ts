/**
 * Component API specs — hand-authored prop + behaviour signatures for every
 * delivery-package component.
 *
 * This is the **single source of truth** the dev playground showcase renders
 * on the right side of each story (the user-facing API). The logic audit also
 * uses it to expose a "baseline behaviour inventory" so missing wiring is
 * visible per component, not just observed via DOM probes.
 *
 * Why hand-authored and not auto-derived from TypeScript?
 *   - Components carry runtime semantics (e.g. "click latches", "input
 *     submits the form") that the type system doesn't capture.
 *   - We want the showcase to read like docs, not raw TS types.
 *   - Adding a component here is the audit checklist for shipping a real
 *     interactive component (props + events + states + a11y roles).
 */
import type { DevComponentName } from "./stories.ts";
export interface PropSpec {
    name: string;
    type: string;
    /** TS-ish default literal (e.g. `"primary"`, `false`, `[]`). */
    default?: string;
    description?: string;
    /** If true, the prop is required (no default). */
    required?: boolean;
}
export interface EventSpec {
    name: string;
    signature: string;
    description?: string;
}
export interface BehaviourSpec {
    id: string;
    label: string;
    /** What the user does ("clicks Login", "types into email"). */
    trigger: string;
    /** What the component does in response (state machine, DOM change). */
    effect: string;
    /**
     * Where the behaviour comes from:
     *   - `component`: hand-written in the component file (React state,
     *     controlled inputs, real handlers). Use for domain logic.
     *   - `baseline`: provided automatically by the @lab/ui design-system
     *     runtime (behaviour-baseline.ts). Use for fire-and-forget
     *     interactions like generic button pressed-toggle.
     */
    source?: "component" | "baseline";
}
export interface ComponentSpec {
    /** Component display name (matches `DevComponentName`). */
    component: DevComponentName;
    /** One-line plain-English summary for the showcase header. */
    summary: string;
    props: PropSpec[];
    events?: EventSpec[];
    /** Real behaviours the component implements (verified by the logic audit). */
    behaviours: BehaviourSpec[];
}
export declare const COMPONENT_SPECS: Record<DevComponentName, ComponentSpec>;
export declare function getComponentSpec(name: DevComponentName): ComponentSpec | undefined;
