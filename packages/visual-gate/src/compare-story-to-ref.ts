// Stub — implemented in Task 2.
export interface VisualGateResult {
  storyId: string;
  status: "pass" | "warn" | "fail" | "error";
  percent: number;
  diffPngPath: string;
  message?: string;
}

export async function compareStoryToRef(
  _storyId: string,
  _referencePngPath: string,
  _opts: { baseUrl: string; outDir: string; tolerance: number }
): Promise<VisualGateResult> {
  throw new Error("Not implemented");
}
