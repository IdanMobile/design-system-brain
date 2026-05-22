import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type StorybookIndexEntry = {
  id: string;
  title: string;
  name: string;
  type: "story" | "docs";
};

type StorybookIndex = {
  entries: Record<string, StorybookIndexEntry>;
};

function parseArgs(): Map<string, string> {
  const args = new Map<string, string>();
  const argv = process.argv.slice(2).filter((token) => token !== "--");
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key?.startsWith("--") && value !== undefined) args.set(key, value);
  }
  return args;
}

function safeSegment(input: string): string {
  return input
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const args = parseArgs();
const baseUrl = args.get("--url") ?? "http://127.0.0.1:6107";
const outDir = resolve(process.cwd(), args.get("--outDir") ?? "../../artifacts-v2");
const indexUrl = `${baseUrl}/index.json`;

const response = await fetch(indexUrl);
if (!response.ok) throw new Error(`Failed to load Storybook index from ${indexUrl}`);
const index = (await response.json()) as StorybookIndex;

const stories = Object.values(index.entries)
  .filter((entry) => entry.type === "story")
  .sort((a, b) => `${a.title}/${a.name}`.localeCompare(`${b.title}/${b.name}`));

const manifest: Array<{ id: string; title: string; name: string; output: string }> = [];

for (const story of stories) {
  const categoryParts = story.title.split("/").map(safeSegment).filter(Boolean);
  const fileName = `${safeSegment(story.name)}.json`;
  const output = resolve(outDir, ...categoryParts, fileName);
  try {
    await execFileAsync(
      "node",
      [
        "--experimental-strip-types",
        "src/extract.ts",
        "--story",
        story.id,
        "--out",
        output,
        "--url",
        baseUrl
      ],
      { cwd: resolve(process.cwd()) }
    );
    const relative = output.replace(`${outDir}/`, "");
    manifest.push({ id: story.id, title: story.title, name: story.name, output: relative });
    console.log(`Wrote ${relative}`);
  } catch (e) {
    console.error(`Failed ${story.id}:`, (e as Error).message);
  }
}

await mkdir(outDir, { recursive: true });
await writeFile(
  resolve(outDir, "stories.index.json"),
  JSON.stringify(
    { schemaVersion: "1.0", generatedAt: new Date().toISOString(), baseUrl, stories: manifest },
    null,
    2
  )
);
console.log(`Exported ${manifest.length}/${stories.length} stories to ${outDir}`);
