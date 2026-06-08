import type { UniversalDocumentV2, UniversalLayer } from "../../contract/src/v2.ts";
import type {
  SemanticComponentId,
  SemanticComponentNode,
  SemanticDocument
} from "../../contract/src/semantic-graph.ts";
import { DEV_STORY_BY_ID, type DevComponentName } from "../../contract/src/stories.ts";
import { bindingProps, matchBinding } from "./figma-component-bindings.ts";
import { renderToBodyMarkup } from "./render-html.ts";
import { htmlMarkupToJsx } from "./html-to-jsx.ts";

export interface ContractToSemanticOptions {
  /** Portfolio / delivery story id */
  storyId?: string;
  /** Root export component name */
  rootComponent: SemanticComponentId;
  storyArgs?: Record<string, unknown>;
  ingress?: "figma" | "storybook";
}

function layerBox(layer: UniversalLayer) {
  return {
    x: layer.box.x,
    y: layer.box.y,
    width: layer.box.width,
    height: layer.box.height
  };
}

function collectBindings(root: UniversalLayer, out: SemanticComponentNode[] = []): SemanticComponentNode[] {
  const rule = matchBinding(root);
  if (rule) {
    out.push({
      kind: "component",
      componentId: rule.componentId,
      props: bindingProps(rule, root),
      layerId: root.id,
      box: layerBox(root)
    });
    return out;
  }
  for (const child of root.children ?? []) {
    collectBindings(child, out);
  }
  return out;
}

function subtreeDoc(doc: UniversalDocumentV2, root: UniversalLayer): UniversalDocumentV2 {
  return {
    ...doc,
    root: { ...root, box: { ...root.box, x: 0, y: 0 } }
  };
}

function layoutJsxForLayer(doc: UniversalDocumentV2, layer: UniversalLayer, boundIds: Set<string>): string {
  if (boundIds.has(layer.id)) return "";
  const sub = subtreeDoc(doc, layer);
  const rendered = renderToBodyMarkup(sub, { skipLayerIds: boundIds });
  return htmlMarkupToJsx(rendered.bodyMarkup);
}

function isSingleComponentRoot(doc: UniversalDocumentV2, component: DevComponentName): boolean {
  const rootTag = doc.root.source.tag;
  const figmaComp = doc.root.source.dataset?.figmaComponent;
  if (figmaComp === component) return true;
  if (rootTag === "button" && component === "Button") return true;
  const entry = Object.values(DEV_STORY_BY_ID).find((e) => e.component === component);
  if (!entry) return false;
  return doc.root.source.dataset?.figmaComponent === component || hasComponentMarker(doc.root, component);
}

function hasComponentMarker(layer: UniversalLayer, component: string): boolean {
  if (layer.source.dataset?.figmaComponent === component) return true;
  if (component === "Button" && layer.source.tag === "button") return true;
  return (layer.children ?? []).some((c) => hasComponentMarker(c, component));
}

/**
 * Lower Universal JSON → SemanticDocument (same shape for Figma and Storybook ingress).
 */
export function contractToSemantic(
  doc: UniversalDocumentV2,
  options: ContractToSemanticOptions
): SemanticDocument {
  const ingress =
    options.ingress ??
    (doc.root.source.kind === "figma" || doc.root.source.dataset?.figmaNodeType ? "figma" : "storybook");

  const storyEntry = options.storyId ? DEV_STORY_BY_ID[options.storyId] : undefined;
  const storyArgs = options.storyArgs ?? storyEntry?.args ?? {};
  const rootComponent = options.rootComponent;

  if (storyEntry && storyEntry.component === rootComponent && isSingleComponentRoot(doc, storyEntry.component)) {
    const props = { ...storyArgs };
    if (!props.children && doc.root.text?.value) {
      props.children = doc.root.text.value;
    }
    if (!props.children) {
      const walkText = (layer: UniversalLayer): string => {
        if (layer.text?.value) return layer.text.value;
        for (const c of layer.children ?? []) {
          const t = walkText(c);
          if (t) return t;
        }
        return "";
      };
      const label = walkText(doc.root);
      if (label) props.children = label;
    }
    return {
      schemaVersion: "1.0",
      rootComponent,
      storyArgs,
      ingress,
      root: {
        kind: "component",
        componentId: rootComponent,
        props
      }
    };
  }

  const bindings = collectBindings(doc.root);
  const boundIds = new Set(bindings.map((b) => b.layerId).filter(Boolean) as string[]);
  const layoutJsx = layoutJsxForLayer(doc, doc.root, boundIds);

  return {
    schemaVersion: "1.0",
    rootComponent,
    storyArgs,
    ingress,
    bindings,
    layoutRoot: {
      kind: "layout",
      layerId: doc.root.id,
      layoutJsx,
      box: {
        x: 0,
        y: 0,
        width: Math.ceil(doc.root.box.width),
        height: Math.ceil(doc.root.box.height)
      }
    }
  };
}
