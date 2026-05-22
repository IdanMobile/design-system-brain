/**
 * Node-side mock of the Figma plugin API surface used by
 * `packages/figma-importer-plugin/src/code-v2.ts`.
 *
 * The mock exposes the SAME methods/getters/setters that the plugin reads &
 * writes, and records every operation as a "scene tree" that can later be
 * serialized to HTML/SVG and diff'd against a Storybook screenshot.
 *
 * Only the surface the renderer actually touches is implemented — and that
 * surface is small. Anything outside it throws so future regressions are
 * caught loudly rather than silently mis-rendering.
 */

type Color = { r: number; g: number; b: number; a?: number };

export interface MockBaseNode {
  __id: number;
  __kind: "FRAME" | "TEXT" | "RECTANGLE" | "SVG";
  type: "FRAME" | "TEXT" | "RECTANGLE";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  blendMode: string;
  rotation: number;
  relativeTransform: number[][];
  parent: MockNode | null;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
  remove(): void;
}

export interface MockFrameNode extends MockBaseNode {
  type: "FRAME";
  /** Present when the frame mirrors a DOM source node (scene-to-html heuristics). */
  source?: { tag?: string; inputType?: string; value?: string; fontStack?: string };
  layout?: { display?: string };
  fills: Paint[];
  strokes: Paint[];
  strokeWeight: number;
  strokeAlign: "INSIDE" | "OUTSIDE" | "CENTER";
  strokeTopWeight: number;
  strokeRightWeight: number;
  strokeBottomWeight: number;
  strokeLeftWeight: number;
  dashPattern: number[];
  topLeftRadius: number;
  topRightRadius: number;
  bottomLeftRadius: number;
  bottomRightRadius: number;
  cornerRadius: number;
  effects: Effect[];
  clipsContent: boolean;
  layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
  children: MockNode[];
  /** Raw SVG string when this node was produced by createNodeFromSvg(). */
  svgSource?: string;
}

export interface MockRectangleNode extends MockBaseNode {
  type: "RECTANGLE";
  fills: Paint[];
  strokes: Paint[];
  strokeWeight: number;
  strokeAlign: "INSIDE" | "OUTSIDE" | "CENTER";
  topLeftRadius: number;
  topRightRadius: number;
  bottomLeftRadius: number;
  bottomRightRadius: number;
  cornerRadius: number;
  effects: Effect[];
  children: never[];
}

export interface MockTextNode extends MockBaseNode {
  type: "TEXT";
  characters: string;
  fontSize: number;
  fontName: { family: string; style: string };
  fills: Paint[];
  effects: Effect[];
  letterSpacing: { unit: "PIXELS" | "PERCENT"; value: number };
  lineHeight: { unit: "PIXELS" | "PERCENT" | "AUTO"; value?: number };
  textAlignHorizontal: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
  textAlignVertical: "TOP" | "CENTER" | "BOTTOM";
  textAutoResize: "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE";
  textCase: "ORIGINAL" | "UPPER" | "LOWER" | "TITLE";
  textDecoration: "NONE" | "UNDERLINE" | "STRIKETHROUGH";
  children: never[];
}

export type MockNode = MockFrameNode | MockRectangleNode | MockTextNode;

type Paint =
  | {
      type: "SOLID";
      color: Color;
      opacity?: number;
      visible?: boolean;
      blendMode?: string;
    }
  | {
      type: "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND";
      gradientStops: Array<{ position: number; color: Color }>;
      gradientTransform: number[][];
      opacity?: number;
      visible?: boolean;
      blendMode?: string;
    }
  | {
      type: "IMAGE";
      imageHash: string;
      scaleMode: "FILL" | "FIT" | "TILE" | "CROP";
      visible?: boolean;
      opacity?: number;
    };

type Effect =
  | {
      type: "DROP_SHADOW" | "INNER_SHADOW";
      color: Color;
      offset: { x: number; y: number };
      radius: number;
      spread?: number;
      blendMode?: string;
      visible?: boolean;
    }
  | {
      type: "LAYER_BLUR" | "BACKGROUND_BLUR";
      radius: number;
      visible?: boolean;
    };

let nextId = 0;
const allNodes: MockNode[] = [];
/** Image hash → raw bytes the renderer handed to figma.createImage(). */
const imageBytes = new Map<string, Uint8Array>();

function freshId(): number {
  nextId += 1;
  return nextId;
}

const IDENTITY: number[][] = [
  [1, 0, 0],
  [0, 1, 0]
];

function baseShared(): Pick<
  MockBaseNode,
  | "x"
  | "y"
  | "width"
  | "height"
  | "visible"
  | "opacity"
  | "blendMode"
  | "rotation"
  | "relativeTransform"
  | "parent"
> {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    visible: true,
    opacity: 1,
    blendMode: "NORMAL",
    rotation: 0,
    relativeTransform: IDENTITY,
    parent: null
  };
}

function resizeFn(this: MockBaseNode, w: number, h: number): void {
  this.width = Math.max(0, w);
  this.height = Math.max(0, h);
}

function appendChildFn(this: MockBaseNode, child: MockNode): void {
  if (!("children" in this)) {
    throw new Error(`appendChild called on a node that can't have children: ${this.type}`);
  }
  if (child.parent && child.parent !== this && "children" in child.parent) {
    const arr = (child.parent as MockFrameNode).children;
    const i = arr.indexOf(child);
    if (i >= 0) arr.splice(i, 1);
  }
  child.parent = this as MockNode;
  (this as MockFrameNode).children.push(child);
}

function removeFn(this: MockBaseNode): void {
  if (this.parent && "children" in this.parent) {
    const arr = (this.parent as MockFrameNode).children;
    const i = arr.indexOf(this as MockNode);
    if (i >= 0) arr.splice(i, 1);
  }
  this.parent = null;
}

function createFrame(): MockFrameNode {
  const node: MockFrameNode = {
    __id: freshId(),
    __kind: "FRAME",
    type: "FRAME",
    name: "Frame",
    ...baseShared(),
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 }, visible: true, opacity: 1 }],
    strokes: [],
    strokeWeight: 1,
    strokeAlign: "INSIDE",
    strokeTopWeight: 0,
    strokeRightWeight: 0,
    strokeBottomWeight: 0,
    strokeLeftWeight: 0,
    dashPattern: [],
    topLeftRadius: 0,
    topRightRadius: 0,
    bottomLeftRadius: 0,
    bottomRightRadius: 0,
    cornerRadius: 0,
    effects: [],
    clipsContent: true,
    layoutMode: "NONE",
    children: [],
    resize: resizeFn,
    appendChild: appendChildFn,
    remove: removeFn
  } as MockFrameNode;
  allNodes.push(node);
  return node;
}

function createRectangle(): MockRectangleNode {
  const node: MockRectangleNode = {
    __id: freshId(),
    __kind: "RECTANGLE",
    type: "RECTANGLE",
    name: "Rectangle",
    ...baseShared(),
    fills: [],
    strokes: [],
    strokeWeight: 1,
    strokeAlign: "INSIDE",
    topLeftRadius: 0,
    topRightRadius: 0,
    bottomLeftRadius: 0,
    bottomRightRadius: 0,
    cornerRadius: 0,
    effects: [],
    children: [] as never[],
    resize: resizeFn,
    appendChild: appendChildFn,
    remove: removeFn
  } as MockRectangleNode;
  allNodes.push(node);
  return node;
}

/**
 * Estimate the rendered width of a glyph run. The plugin uses `text.width`
 * to center text inside its parent frame, so we need a reasonable value
 * BEFORE the HTML actually gets measured by a real browser. The figure is
 * close enough for placement; pixel-level accuracy comes from the browser
 * when we screenshot.
 */
function estimateTextWidth(characters: string, fontSize: number, family: string): number {
  // Average glyph advance varies by family. Numbers below are eyeballed
  // against Inter / Roboto at 16px and scale linearly.
  const isMono = /mono|courier|consolas/i.test(family);
  const baseRatio = isMono ? 0.6 : 0.48;
  return Math.max(1, characters.length * fontSize * baseRatio);
}

function createText(): MockTextNode {
  const node: MockTextNode = {
    __id: freshId(),
    __kind: "TEXT",
    type: "TEXT",
    name: "Text",
    ...baseShared(),
    width: 1,
    height: 1,
    characters: "",
    fontSize: 12,
    fontName: { family: "Inter", style: "Regular" },
    fills: [],
    effects: [],
    letterSpacing: { unit: "PIXELS", value: 0 },
    lineHeight: { unit: "AUTO" },
    textAlignHorizontal: "LEFT",
    textAlignVertical: "TOP",
    textAutoResize: "WIDTH_AND_HEIGHT",
    textCase: "ORIGINAL",
    textDecoration: "NONE",
    children: [] as never[],
    resize: resizeFn,
    appendChild: appendChildFn,
    remove: removeFn
  } as MockTextNode;
  // Whenever characters, fontSize, fontName or textAutoResize change we want
  // to refresh the estimated layout. We can't intercept assignments cheaply
  // without Proxies, so we expose `__refreshTextSize()` for the serializer
  // and re-estimate on each access via a getter for width when the resize
  // mode says width grows with content.
  Object.defineProperty(node, "width", {
    get() {
      if (node.textAutoResize === "WIDTH_AND_HEIGHT") {
        return estimateTextWidth(node.characters, node.fontSize, node.fontName.family);
      }
      return (node as any).__width ?? 1;
    },
    set(v: number) {
      (node as any).__width = v;
    },
    configurable: true,
    enumerable: true
  });
  Object.defineProperty(node, "height", {
    get() {
      const lineHeight =
        node.lineHeight.unit === "PIXELS" && node.lineHeight.value
          ? node.lineHeight.value
          : node.fontSize * 1.2;
      if (node.textAutoResize === "WIDTH_AND_HEIGHT") {
        return Math.max(lineHeight, 1);
      }
      if (node.textAutoResize === "HEIGHT") {
        // Estimate the line count given the locked width set via resize().
        const w = (node as any).__width ?? estimateTextWidth(node.characters, node.fontSize, node.fontName.family);
        const natural = estimateTextWidth(node.characters, node.fontSize, node.fontName.family);
        const ratio = natural / Math.max(1, w);
        const lines = ratio <= 1.08 ? 1 : Math.max(1, Math.ceil(ratio));
        return Math.max(lineHeight * lines, lineHeight);
      }
      return (node as any).__height ?? 1;
    },
    set(v: number) {
      (node as any).__height = v;
    },
    configurable: true,
    enumerable: true
  });
  allNodes.push(node);
  return node;
}

function createNodeFromSvg(svg: string): MockFrameNode {
  // A real Figma parses the SVG into a frame with vector children. For our
  // serializer it's enough to keep the raw SVG and emit it as inline `<svg>`.
  const node = createFrame();
  node.__kind = "SVG";
  node.name = "SVG";
  node.svgSource = svg;
  node.clipsContent = false;
  return node;
}

function createImage(bytes: Uint8Array): { hash: string; getBytesAsync: () => Promise<Uint8Array> } {
  // Compute a cheap deterministic "hash" from the first few bytes.
  let h = 0;
  const sample = Math.min(64, bytes.length);
  for (let i = 0; i < sample; i += 1) {
    h = ((h << 5) - h + bytes[i]) | 0;
  }
  const hash = `mock-${(h >>> 0).toString(16)}-${bytes.length}`;
  imageBytes.set(hash, bytes);
  return {
    hash,
    getBytesAsync: async () => bytes
  };
}

const DEFAULT_FONTS = [
  "Inter",
  "Roboto",
  "Roboto Mono",
  "Roboto Slab",
  "Source Code Pro",
  "Courier New",
  "Courier",
  "SF Pro",
  "Helvetica",
  "Arial",
  "Arial Black",
  "Segoe UI",
  "Georgia",
  "Times New Roman",
  "Times",
  "Merriweather",
  "JetBrains Mono",
  "Roboto Mono",
  "Impact",
  "Pacifico",
  "Dancing Script"
];
const DEFAULT_STYLES = [
  "Thin",
  "Light",
  "Regular",
  "Medium",
  "Semi Bold",
  "Bold",
  "Extra Bold",
  "Black"
];

const fontsList = DEFAULT_FONTS.flatMap((family) =>
  DEFAULT_STYLES.map((style) => ({ fontName: { family, style } }))
);

interface MockFigma {
  createFrame(): MockFrameNode;
  createRectangle(): MockRectangleNode;
  createText(): MockTextNode;
  createNodeFromSvg(svg: string): MockFrameNode;
  createImage(bytes: Uint8Array): { hash: string; getBytesAsync: () => Promise<Uint8Array> };
  loadFontAsync(name: { family: string; style: string }): Promise<void>;
  listAvailableFontsAsync(): Promise<typeof fontsList>;
  notify(message: string, options?: any): void;
  showUI(html: string, options?: any): void;
  ui: { onmessage: any; postMessage(msg: any): void };
  currentPage: MockFrameNode;
  viewport: { scrollAndZoomIntoView(nodes: any[]): void };
  __reset(): void;
  __getImageBytes(hash: string): Uint8Array | undefined;
}

const currentPage = createFrame();
currentPage.name = "Page";

export const figma: MockFigma = {
  createFrame,
  createRectangle,
  createText,
  createNodeFromSvg,
  createImage,
  loadFontAsync: async () => undefined,
  listAvailableFontsAsync: async () => fontsList,
  notify: () => undefined,
  showUI: () => undefined,
  ui: { onmessage: null, postMessage: () => undefined },
  currentPage,
  viewport: { scrollAndZoomIntoView: () => undefined },
  __reset(): void {
    nextId = 0;
    allNodes.length = 0;
    imageBytes.clear();
    currentPage.children = [];
  },
  __getImageBytes(hash: string): Uint8Array | undefined {
    return imageBytes.get(hash);
  }
};

/** Install the mock as the global `figma` for the duration of the call. */
export function installFigmaMock(): void {
  (globalThis as any).figma = figma;
  (globalThis as any).__html__ = "<!DOCTYPE html><body></body>";
}
