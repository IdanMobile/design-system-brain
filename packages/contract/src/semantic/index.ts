export * from "./list";

/** Registry of semantic component ids exposed via ds.* (grows per Phase 2). */
export const SEMANTIC_COMPONENT_IDS = ["list"] as const;

export type SemanticComponentId = (typeof SEMANTIC_COMPONENT_IDS)[number];
