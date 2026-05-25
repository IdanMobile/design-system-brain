import type { StorySpec } from "../../contract/src/spec-types.ts";

const ROOT = "/api/specs";

export async function listSpecs(): Promise<StorySpec[]> {
  const res = await fetch(ROOT, { cache: "no-store" });
  if (!res.ok) throw new Error(`listSpecs failed: ${res.status}`);
  const body = (await res.json()) as { specs: StorySpec[] };
  return body.specs;
}

export async function fetchSpec(storyId: string): Promise<StorySpec | null> {
  const res = await fetch(`${ROOT}/${encodeURIComponent(storyId)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetchSpec ${storyId} failed: ${res.status}`);
  return (await res.json()) as StorySpec;
}

export async function saveSpec(spec: StorySpec): Promise<StorySpec> {
  const res = await fetch(`${ROOT}/${encodeURIComponent(spec.storyId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spec)
  });
  if (!res.ok) {
    let detail = "";
    try { detail = JSON.stringify(await res.json()); } catch { /* ignore */ }
    throw new Error(`saveSpec ${spec.storyId} failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as StorySpec;
}
