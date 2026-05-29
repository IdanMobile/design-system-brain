/**
 * Figma plugin entry point — UniversalLayer v1.0 only.
 *
 * Every artifact must declare `"schemaVersion": "1.0"`.  Legacy v0.1 artifacts
 * are not accepted — re-extract them with the current extractor.
 */

import {
  bytesToBase64,
  contentFrameFromCanvas,
  exportContentPng,
  isUniversalDocumentV2,
  renderDocumentV2,
  type UniversalDocumentV2
} from "./code-v2";
figma.showUI(__html__, { width: 520, height: 600 });

type BatchImportItem = { name: string; json: string };
type ParsedBatchItem = { name: string; doc: UniversalDocumentV2 };

function sortBatchItems(items: BatchImportItem[]): BatchImportItem[] {
  const manifest = items.find((item) => {
    const normalized = item.name.replace(/\\/g, "/");
    return (
      normalized === "stories.index.json" || normalized.endsWith("/stories.index.json")
    );
  });
  if (!manifest) return [...items].sort((a, b) => a.name.localeCompare(b.name));

  try {
    const parsed = JSON.parse(manifest.json) as { stories?: Array<{ output?: string }> };
    const order = new Map<string, number>();
    (parsed.stories ?? []).forEach((s, index) => {
      if (!s.output) return;
      const normalized = s.output.replace(/\\/g, "/");
      order.set(normalized, index);
      order.set(normalized.split("/").pop() || normalized, index);
    });
    return [...items]
      .filter((item) => {
        const normalized = item.name.replace(/\\/g, "/");
        return (
          normalized !== "stories.index.json" &&
          !normalized.endsWith("/stories.index.json")
        );
      })
      .sort((a, b) => {
        const aScore =
          order.get(a.name.replace(/\\/g, "/")) ??
          order.get(a.name.split("/").pop() || a.name) ??
          Number.MAX_SAFE_INTEGER;
        const bScore =
          order.get(b.name.replace(/\\/g, "/")) ??
          order.get(b.name.split("/").pop() || b.name) ??
          Number.MAX_SAFE_INTEGER;
        return aScore - bScore || a.name.localeCompare(b.name);
      });
  } catch (_error) {
    return [...items]
      .filter((item) => {
        const normalized = item.name.replace(/\\/g, "/");
        return (
          normalized !== "stories.index.json" &&
          !normalized.endsWith("/stories.index.json")
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

function argsLabel(
  argsUsed: Record<string, string | number | boolean> | undefined
): string {
  if (!argsUsed) return "default";
  const entries = Object.entries(argsUsed);
  if (!entries.length) return "default";
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}

async function importDocument(json: string): Promise<{
  node: SceneNode;
  name: string;
  canvasBackground?: string;
}> {
  const parsed = JSON.parse(json) as unknown;
  if (!isUniversalDocumentV2(parsed)) {
    throw new Error(
      `Unsupported schema. Expected UniversalLayer v1.0 ("schemaVersion": "1.0").`
    );
  }
  // Deep-clone so render never mutates relay/deserializer-frozen diagnostics.
  const doc = JSON.parse(JSON.stringify(parsed)) as typeof parsed;
  const node = await renderDocumentV2(doc);
  return {
    node,
    name: doc.meta.componentName,
    canvasBackground: doc.meta.canvasBackground
  };
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === "import-and-export-png") {
    let canvas: SceneNode | null = null;
    try {
      const result = await importDocument(msg.json);
      canvas = result.node;
      const target = contentFrameFromCanvas(canvas);
      const bytes = await exportContentPng(canvas, result.canvasBackground);
      figma.ui.postMessage({
        type: "export-png",
        requestId: msg.requestId,
        ok: true,
        pngBase64: bytesToBase64(bytes),
        width: Math.round(target.width),
        height: Math.round(target.height),
        name: result.name
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      figma.ui.postMessage({
        type: "export-png",
        requestId: msg.requestId,
        ok: false,
        error: reason
      });
    } finally {
      if (canvas) canvas.remove();
    }
    return;
  }

  if (msg.type === "import-json") {
    try {
      const result = await importDocument(msg.json);
      figma.currentPage.appendChild(result.node);
      figma.viewport.scrollAndZoomIntoView([result.node]);
      figma.notify(`Imported ${result.name}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      figma.notify(`Import failed: ${reason}`, { error: true });
    }
    return;
  }

  if (msg.type === "import-json-batch") {
    const rawItems = (msg.items ?? []) as BatchImportItem[];
    const items = sortBatchItems(rawItems).filter((item) =>
      item.name.toLowerCase().endsWith(".json")
    );
    if (!items.length) {
      figma.notify("No JSON files selected.");
      return;
    }

    const imported: SceneNode[] = [];
    const errors: string[] = [];
    const parsed: ParsedBatchItem[] = [];

    for (const item of items) {
      try {
        const doc = JSON.parse(JSON.stringify(JSON.parse(item.json))) as UniversalDocumentV2;
        if (!isUniversalDocumentV2(doc)) {
          errors.push(`${item.name}: Not a UniversalLayer v1.0 artifact.`);
          continue;
        }
        parsed.push({ name: item.name, doc });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${item.name}: ${reason}`);
      }
    }

    const byComponent = new Map<string, ParsedBatchItem[]>();
    for (const item of parsed) {
      const key = item.doc.meta.componentName || "UnknownComponent";
      const list = byComponent.get(key) ?? [];
      list.push(item);
      byComponent.set(key, list);
    }

    let sectionY = 0;
    const sectionGap = 120;
    const rowGap = 40;
    const itemGap = 28;

    for (const [componentName, componentItems] of byComponent.entries()) {
      try {
        const byStory = new Map<string, ParsedBatchItem[]>();
        for (const item of componentItems) {
          const storyKey = item.doc.meta.storyId ?? item.name;
          const storyItems = byStory.get(storyKey) ?? [];
          storyItems.push(item);
          byStory.set(storyKey, storyItems);
        }

        const sectionMarker = figma.createFrame();
        sectionMarker.name = `${componentName} Variants`;
        sectionMarker.layoutMode = "NONE";
        sectionMarker.fills = [];
        sectionMarker.resize(1, 1);
        sectionMarker.x = 0;
        sectionMarker.y = sectionY;
        figma.currentPage.appendChild(sectionMarker);
        imported.push(sectionMarker);

        let rowY = sectionY + 24;
        for (const [storyId, storyItems] of byStory.entries()) {
          let rowX = 0;
          let rowHeight = 0;

          for (const item of storyItems) {
            const doc = JSON.parse(JSON.stringify(item.doc)) as typeof item.doc;
            const node = await renderDocumentV2(doc);
            node.name = `${componentName} / ${storyId} — ${argsLabel(item.doc.meta.argsUsed)}`;
            node.x = rowX;
            node.y = rowY;
            figma.currentPage.appendChild(node);
            imported.push(node);
            rowX += node.width + itemGap;
            rowHeight = Math.max(rowHeight, node.height);
          }
          rowY += rowHeight + rowGap;
        }
        sectionY = rowY + sectionGap;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${componentName}: ${reason}`);
      }
    }

    if (imported.length) figma.viewport.scrollAndZoomIntoView(imported);
    if (errors.length) {
      figma.notify(`Imported ${imported.length}/${items.length}. Some files failed.`);
      figma.ui.postMessage({ type: "batch-import-errors", errors });
    } else {
      figma.notify(`Imported ${imported.length} files.`);
    }
    return;
  }

};
