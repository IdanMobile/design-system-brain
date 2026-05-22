import type { UniversalDocumentV2 } from "./types-v2";
export type { UniversalDocumentV2 } from "./types-v2";
export declare function isUniversalDocumentV2(value: unknown): value is UniversalDocumentV2;
export declare function renderDocumentV2(doc: UniversalDocumentV2): Promise<SceneNode>;
