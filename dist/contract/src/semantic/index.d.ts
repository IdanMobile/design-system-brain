export * from "./list";
/** Registry of semantic component ids exposed via ds.* (grows per Phase 2). */
export declare const SEMANTIC_COMPONENT_IDS: readonly ["list"];
export type SemanticComponentId = (typeof SEMANTIC_COMPONENT_IDS)[number];
