/**
 * Convert render-html markup into JSX (subset used by contract → React TSX codegen).
 */

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

const SVG_ATTR_CAMEL: Record<string, string> = {
  "clip-path": "clipPath",
  "clip-rule": "clipRule",
  "fill-opacity": "fillOpacity",
  "fill-rule": "fillRule",
  "font-family": "fontFamily",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "letter-spacing": "letterSpacing",
  "stroke-dasharray": "strokeDasharray",
  "stroke-dashoffset": "strokeDashoffset",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-miterlimit": "strokeMiterlimit",
  "stroke-opacity": "strokeOpacity",
  "stroke-width": "strokeWidth",
  "text-anchor": "textAnchor",
  "xlink:href": "xlinkHref",
  "xml:space": "xmlSpace"
};

function camelCaseCssProp(prop: string): string {
  return prop.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function camelCaseAttr(name: string, inSvg: boolean): string {
  if (name === "class") return "className";
  if (name === "for") return "htmlFor";
  if (inSvg && SVG_ATTR_CAMEL[name]) return SVG_ATTR_CAMEL[name];
  if (name.includes("-") && !name.startsWith("data-") && !name.startsWith("aria-")) {
    return camelCaseCssProp(name);
  }
  return name;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function styleStringToObject(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of style.split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const key = part.slice(0, colon).trim();
    const val = part.slice(colon + 1).trim();
    if (!key || !val) continue;
    out[camelCaseCssProp(key)] = val;
  }
  return out;
}

function formatJsValue(value: unknown, indent: string): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, string>);
    if (entries.length === 0) return "{}";
    const inner = entries.map(([k, v]) => `${indent}  ${k}: ${JSON.stringify(v)}`).join(",\n");
    return `{\n${inner}\n${indent}}`;
  }
  return JSON.stringify(value);
}

function parseAttributes(raw: string, inSvg: boolean): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=/>]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1];
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    attrs[camelCaseAttr(name, inSvg)] = value;
  }
  return attrs;
}

type HtmlNode =
  | { type: "text"; value: string }
  | { type: "element"; tag: string; attrs: Record<string, string>; children: HtmlNode[] };

function readTagAt(html: string, start: number): {
  end: number;
  tag: string;
  attrsRaw: string;
  selfClosing: boolean;
  isClose: boolean;
} | null {
  if (html[start] !== "<") return null;
  if (html.startsWith("<!--", start)) {
    const end = html.indexOf("-->", start + 4);
    return end < 0 ? null : { end: end + 3, tag: "!--", attrsRaw: "", selfClosing: true, isClose: false };
  }
  const close = html.indexOf(">", start);
  if (close < 0) return null;
  const inner = html.slice(start + 1, close).trim();
  if (inner.startsWith("/")) {
    return {
      end: close + 1,
      tag: inner.slice(1).trim().split(/\s/)[0]?.toLowerCase() ?? "",
      attrsRaw: "",
      selfClosing: false,
      isClose: true
    };
  }
  const selfClosing = inner.endsWith("/");
  const openBody = selfClosing ? inner.slice(0, -1).trim() : inner;
  const space = openBody.search(/\s/);
  const tag = (space < 0 ? openBody : openBody.slice(0, space)).toLowerCase();
  const attrsRaw = space < 0 ? "" : openBody.slice(space + 1);
  return { end: close + 1, tag, attrsRaw, selfClosing: selfClosing || VOID_TAGS.has(tag), isClose: false };
}

function parseHtmlFragment(html: string, parentTag?: string): HtmlNode[] {
  const nodes: HtmlNode[] = [];
  let i = 0;
  const inSvg = parentTag === "svg" || parentTag === "g" || parentTag === "defs";

  while (i < html.length) {
    if (html[i] !== "<") {
      const next = html.indexOf("<", i);
      const text = decodeHtmlEntities((next < 0 ? html.slice(i) : html.slice(i, next)).trim());
      if (text) nodes.push({ type: "text", value: text });
      i = next < 0 ? html.length : next;
      continue;
    }

    const tagInfo = readTagAt(html, i);
    if (!tagInfo) break;
    i = tagInfo.end;

    if (tagInfo.tag === "!--") continue;
    if (tagInfo.isClose) break;

    const attrs = parseAttributes(tagInfo.attrsRaw, inSvg || tagInfo.tag === "svg");
    if (tagInfo.selfClosing) {
      nodes.push({ type: "element", tag: tagInfo.tag, attrs, children: [] });
      continue;
    }

    let depth = 1;
    let j = i;
    let contentEnd = i;
    while (depth > 0 && j < html.length) {
      if (html[j] !== "<") {
        j++;
        continue;
      }
      const nested = readTagAt(html, j);
      if (!nested) break;
      if (nested.tag === "!--") {
        j = nested.end;
        continue;
      }
      if (nested.isClose) {
        depth -= 1;
        if (depth === 0) {
          contentEnd = j;
          j = nested.end;
          break;
        }
        j = nested.end;
        continue;
      }
      if (!nested.selfClosing) depth += 1;
      j = nested.end;
    }

    const children = parseHtmlFragment(html.slice(i, contentEnd), tagInfo.tag);
    nodes.push({ type: "element", tag: tagInfo.tag, attrs, children });
    i = j;
  }

  return nodes;
}

function emitTextNode(value: string): string {
  if (value.includes("<br>") || value.includes("<br/>") || value.includes("<br />")) {
    const parts = value.split(/<br\s*\/?>/i);
    const chunks: string[] = [];
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (part) chunks.push(JSON.stringify(part));
      if (i < parts.length - 1) chunks.push("<br />");
    }
    return chunks.length === 1 ? chunks[0] : `{[${chunks.join(", ")}]}`;
  }
  return JSON.stringify(value);
}

function emitNode(node: HtmlNode, indent: string): string {
  if (node.type === "text") {
    return `${indent}{${emitTextNode(node.value)}}`;
  }

  const { tag, attrs, children } = node;
  const attrParts: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "style") {
      attrParts.push(`style={${formatJsValue(styleStringToObject(value), indent + "  ")}}`);
    } else {
      attrParts.push(`${key}={${JSON.stringify(value)}}`);
    }
  }
  const attrStr = attrParts.length ? ` ${attrParts.join(" ")}` : "";

  if (children.length === 0) {
    return `${indent}<${tag}${attrStr} />`;
  }

  if (children.length === 1 && children[0].type === "text" && !children[0].value.includes("<")) {
    return `${indent}<${tag}${attrStr}>{${JSON.stringify(children[0].value)}}</${tag}>`;
  }

  const childLines = children.map((child) => emitNode(child, indent + "  ")).join("\n");
  return `${indent}<${tag}${attrStr}>\n${childLines}\n${indent}</${tag}>`;
}

/** Convert render-html body markup into indented JSX fragment lines. */
export function htmlMarkupToJsx(html: string, baseIndent = "      "): string {
  const nodes = parseHtmlFragment(html.trim());
  return nodes.map((node) => emitNode(node, baseIndent)).join("\n");
}
