import type { StorySpec } from "../../contract/src/spec-types.ts";
import { SPEC_SCHEMA_VERSION } from "../../contract/src/spec-types.ts";

export function emptyStorySpec(storyId: string): StorySpec {
  return {
    storyId,
    schemaVersion: SPEC_SCHEMA_VERSION,
    intent: "",
    status: "proposed",
    approvedAt: null,
    approvedBy: null,
    specVersion: 1,
    elements: [],
  };
}
