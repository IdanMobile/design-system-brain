import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const artifactsDir = path.resolve(workspaceRoot, process.argv[2] || "artifacts");
const storiesIndexPath = path.join(artifactsDir, "stories.index.json");

async function listArtifactJsonFiles(dir) {
  const out = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".json")) continue;
      if (entry.name === "stories.index.json") continue;
      out.push(absolute);
    }
  }
  await walk(dir);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function stableStringify(value) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number" || t === "boolean" || t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (t === "object") {
    const entries = Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function rootSignature(root) {
  const canonical = stableStringify(root);
  return `${canonical.length}:${canonical}`;
}

async function cleanupArtifacts() {
  const files = await listArtifactJsonFiles(artifactsDir);
  const bySignature = new Map();
  const duplicateAbsPaths = [];

  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      console.warn(`Skipping unreadable JSON: ${path.relative(workspaceRoot, file)} (${String(error)})`);
      continue;
    }

    if (!parsed || typeof parsed !== "object" || !parsed.root) {
      continue;
    }

    const signature = rootSignature(parsed.root);
    const existing = bySignature.get(signature);
    if (!existing) {
      bySignature.set(signature, file);
      continue;
    }
    duplicateAbsPaths.push(file);
  }

  for (const dupPath of duplicateAbsPaths) {
    await fs.unlink(dupPath);
  }

  let indexPruned = 0;
  try {
    const indexRaw = await fs.readFile(storiesIndexPath, "utf8");
    const indexJson = JSON.parse(indexRaw);
    if (indexJson && Array.isArray(indexJson.stories)) {
      const duplicateRelPaths = new Set(
        duplicateAbsPaths.map((p) => path.relative(artifactsDir, p).replace(/\\/g, "/"))
      );
      const before = indexJson.stories.length;
      indexJson.stories = indexJson.stories.filter((story) => !duplicateRelPaths.has(story.output));
      indexPruned = before - indexJson.stories.length;
      await fs.writeFile(storiesIndexPath, `${JSON.stringify(indexJson, null, 2)}\n`, "utf8");
    }
  } catch (error) {
    console.warn(`Could not update stories.index.json (${String(error)})`);
  }

  console.log(`Scanned ${files.length} artifact files.`);
  console.log(`Removed ${duplicateAbsPaths.length} duplicate files.`);
  console.log(`Pruned ${indexPruned} stories.index.json entries.`);
}

cleanupArtifacts().catch((error) => {
  console.error("Artifact cleanup failed:", error);
  process.exitCode = 1;
});
