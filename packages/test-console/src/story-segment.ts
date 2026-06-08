/** Match scripts/step-gate.mjs safeStorySegment / pixel-test path segments. */
export function safeStorySegment(storyId: string): string {
  return storyId
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
