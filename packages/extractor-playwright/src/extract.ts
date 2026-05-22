import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { UniversalDocumentV2, UniversalLayer } from "@lab/contract";

export type StoryArgs = Record<string, string | number | boolean>;

function serializeArgs(args: StoryArgs): string {
  return Object.entries(args)
    .map(([key, value]) => `${key}:${encodeURIComponent(String(value))}`)
    .join(";");
}

const ANIMATION_PAUSE_CSS = `*,*::before,*::after{animation-play-state:paused !important;transition:none !important;caret-color:transparent !important;}`;

/**
 * Extract a Storybook story into a self-contained UniversalLayer v1.0 document.
 *
 * Design constraints:
 *  - Zero component-specific code; no class-name sniffing.
 *  - Every visible CSS property that affects paint is captured.
 *  - SVG sub-trees walked per-primitive with computed styles resolved.
 *  - Pseudo-elements (::before, ::after) projected as child layers.
 *  - Images embedded as data URLs so the artifact is self-contained.
 *  - Children pre-sorted by (z-index, source-order).
 *  - Animations paused before measurement for deterministic output.
 */
export async function extractStoryV2(
  storyId: string,
  out: string,
  baseUrl = "http://127.0.0.1:6107",
  argsUsed?: StoryArgs
): Promise<string> {
  const argsQuery =
    argsUsed && Object.keys(argsUsed).length ? `&args=${serializeArgs(argsUsed)}` : "";
  const url = `${baseUrl}/iframe.html?id=${storyId}&viewMode=story${argsQuery}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 1
  });
  await page.addInitScript("var __name = (target) => target;");
  await page.goto(url, { waitUntil: "networkidle" });

  // Pause animations & transitions to make the extraction deterministic.
  await page.addStyleTag({ content: ANIMATION_PAUSE_CSS });
  await page.waitForLoadState("networkidle");
  // Wait for @font-face rules (e.g. Inter from Storybook CSS) before reading
  // computed font-family — otherwise buttons inherit Arial and every renderer
  // diff shows the wrong face.
  await page.evaluate(
    () => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready
  );

  // Collect image bytes outside the page context so we can use node's full
  // fetch (Playwright's request will obey same-origin/CORS just like the page).
  const imageUrlPromises = new Map<string, Promise<string | null>>();
  async function fetchAsDataUrl(srcUrl: string): Promise<string | null> {
    if (imageUrlPromises.has(srcUrl)) {
      const cached = imageUrlPromises.get(srcUrl);
      return cached ? await cached : null;
    }
    const pending = (async () => {
      try {
        const response = await page.request.fetch(srcUrl);
        if (!response.ok()) return null;
        const buffer = await response.body();
        const mime = response.headers()["content-type"]?.split(";")[0] ?? "image/png";
        return `data:${mime};base64,${buffer.toString("base64")}`;
      } catch {
        return null;
      }
    })();
    imageUrlPromises.set(srcUrl, pending);
    return await pending;
  }

  // Phase 1: walk the DOM tree and produce the layer JSON without image bytes.
  const tree = await page.evaluate(
    ({ storyId: sid, argsUsed: usedArgs }) => {
      const px = (v: string | null | undefined): number => {
        if (!v) return 0;
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : 0;
      };
      const snap = (n: number) => Math.round(n * 100) / 100;
      let counter = 0;
      const nextId = () => `lay-${++counter}`;

      // ────────────────────────── CSS parsers ──────────────────────────

      function splitTopLevel(value: string): string[] {
        const out: string[] = [];
        let depth = 0;
        let current = "";
        for (let i = 0; i < value.length; i += 1) {
          const ch = value[i];
          if (ch === "(") depth += 1;
          else if (ch === ")") depth -= 1;
          else if (ch === "," && depth === 0) {
            out.push(current.trim());
            current = "";
            continue;
          }
          current += ch;
        }
        if (current.trim()) out.push(current.trim());
        return out;
      }

      function parseShadowLayer(raw: string): {
        offsetX: number;
        offsetY: number;
        blur: number;
        spread: number;
        color: string;
        inset: boolean;
      } | null {
        const trimmed = raw.trim();
        if (!trimmed || trimmed === "none") return null;
        const inset = /\binset\b/i.test(trimmed);
        const colorMatch = trimmed.match(
          /(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/
        );
        let color = "rgba(0,0,0,0.25)";
        if (colorMatch && !/^(inset|outset|px|em|rem)$/i.test(colorMatch[0])) {
          color = colorMatch[0];
        }
        const numericMatches = trimmed.match(/-?\d*\.?\d+px/g) ?? [];
        const numbers = numericMatches.map((p) => Number.parseFloat(p));
        if (numbers.length < 2) return null;
        const offsetX = numbers[0];
        const offsetY = numbers[1];
        const blur = numbers[2] ?? 0;
        const spread = numbers[3] ?? 0;
        return { offsetX, offsetY, blur, spread, color, inset };
      }

      function parseShadows(raw: string): ReturnType<typeof parseShadowLayer>[] {
        if (!raw || raw === "none") return [];
        return splitTopLevel(raw)
          .map(parseShadowLayer)
          .filter((s): s is NonNullable<ReturnType<typeof parseShadowLayer>> => !!s);
      }

      function parseTransformMatrix(
        raw: string
      ): [number, number, number, number, number, number] | undefined {
        if (!raw || raw === "none") return undefined;
        const m2d = raw.match(/^matrix\(([^)]+)\)$/);
        if (m2d) {
          const parts = m2d[1].split(",").map((p) => Number.parseFloat(p.trim()));
          if (parts.length === 6 && parts.every(Number.isFinite)) {
            return parts as [number, number, number, number, number, number];
          }
        }
        const m3d = raw.match(/^matrix3d\(([^)]+)\)$/);
        if (m3d) {
          const parts = m3d[1].split(",").map((p) => Number.parseFloat(p.trim()));
          if (parts.length === 16 && parts.every(Number.isFinite)) {
            return [parts[0], parts[1], parts[4], parts[5], parts[12], parts[13]];
          }
        }
        return undefined;
      }

      function isIdentityMatrix(
        m: [number, number, number, number, number, number] | undefined
      ): boolean {
        if (!m) return true;
        return (
          Math.abs(m[0] - 1) < 1e-6 &&
          Math.abs(m[1]) < 1e-6 &&
          Math.abs(m[2]) < 1e-6 &&
          Math.abs(m[3] - 1) < 1e-6 &&
          Math.abs(m[4]) < 1e-6 &&
          Math.abs(m[5]) < 1e-6
        );
      }

      function parseFilters(raw: string): any[] {
        if (!raw || raw === "none") return [];
        const out: any[] = [];
        const re = /(\w+(?:-\w+)?)\(([^)]+)\)/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(raw)) !== null) {
          const fn = match[1].toLowerCase();
          const arg = match[2].trim();
          if (fn === "blur") {
            out.push({ kind: "blur", valuePx: px(arg) });
          } else if (fn === "hue-rotate") {
            out.push({ kind: "hue-rotate", degrees: Number.parseFloat(arg) || 0 });
          } else if (fn === "drop-shadow") {
            const s = parseShadowLayer(arg);
            if (s) out.push({ kind: "drop-shadow", shadow: s });
          } else if (
            ["brightness", "contrast", "grayscale", "invert", "saturate", "sepia", "opacity"].includes(
              fn
            )
          ) {
            const num = arg.endsWith("%")
              ? Number.parseFloat(arg) / 100
              : Number.parseFloat(arg);
            out.push({ kind: fn, value: Number.isFinite(num) ? num : 0 });
          }
        }
        return out;
      }

      function parseLinearGradient(raw: string): {
        kind: "linear-gradient";
        angleDeg: number;
        stops: Array<{ color: string; offset: number }>;
      } | null {
        const inner = raw.match(/^linear-gradient\((.*)\)$/i);
        if (!inner) return null;
        const segments = splitTopLevel(inner[1]);
        if (!segments.length) return null;
        let angleDeg = 180;
        let stopsStart = 0;
        const first = segments[0].trim();
        if (/^(\d+(\.\d+)?)deg$/.test(first)) {
          angleDeg = Number.parseFloat(first);
          stopsStart = 1;
        } else if (/^to\s+/i.test(first)) {
          // 'to top' = 0deg, 'to right' = 90deg, ...
          const dir = first.toLowerCase();
          if (dir === "to top") angleDeg = 0;
          else if (dir === "to right") angleDeg = 90;
          else if (dir === "to bottom") angleDeg = 180;
          else if (dir === "to left") angleDeg = 270;
          else if (dir === "to top right") angleDeg = 45;
          else if (dir === "to bottom right") angleDeg = 135;
          else if (dir === "to bottom left") angleDeg = 225;
          else if (dir === "to top left") angleDeg = 315;
          stopsStart = 1;
        }
        const stops: Array<{ color: string; offset: number }> = [];
        const stopSegs = segments.slice(stopsStart);
        stopSegs.forEach((seg, idx) => {
          const parts = seg.match(/^(.+?)\s+(-?\d*\.?\d+%?)$/);
          let color = seg;
          let offset = idx / Math.max(1, stopSegs.length - 1);
          if (parts) {
            color = parts[1].trim();
            const raw = parts[2];
            offset = raw.endsWith("%")
              ? Number.parseFloat(raw) / 100
              : Number.parseFloat(raw);
          }
          stops.push({ color, offset });
        });
        return { kind: "linear-gradient", angleDeg, stops };
      }

      function parseRadialGradient(raw: string): {
        kind: "radial-gradient";
        shape: "ellipse" | "circle";
        centerX: string;
        centerY: string;
        stops: Array<{ color: string; offset: number }>;
      } | null {
        const inner = raw.match(/^radial-gradient\((.*)\)$/i);
        if (!inner) return null;
        const segments = splitTopLevel(inner[1]);
        if (!segments.length) return null;
        let shape: "ellipse" | "circle" = "ellipse";
        let centerX = "50%";
        let centerY = "50%";
        let stopsStart = 0;
        const head = segments[0].trim().toLowerCase();
        if (
          head.startsWith("circle") ||
          head.startsWith("ellipse") ||
          head.startsWith("at ") ||
          head.includes("closest-") ||
          head.includes("farthest-")
        ) {
          if (head.includes("circle")) shape = "circle";
          const atMatch = head.match(/at\s+([^\s]+)\s+([^\s]+)/);
          if (atMatch) {
            centerX = atMatch[1];
            centerY = atMatch[2];
          }
          stopsStart = 1;
        }
        const stops: Array<{ color: string; offset: number }> = [];
        const stopSegs = segments.slice(stopsStart);
        stopSegs.forEach((seg, idx) => {
          const parts = seg.match(/^(.+?)\s+(-?\d*\.?\d+%?)$/);
          let color = seg;
          let offset = idx / Math.max(1, stopSegs.length - 1);
          if (parts) {
            color = parts[1].trim();
            const raw = parts[2];
            offset = raw.endsWith("%")
              ? Number.parseFloat(raw) / 100
              : Number.parseFloat(raw);
          }
          stops.push({ color, offset });
        });
        return { kind: "radial-gradient", shape, centerX, centerY, stops };
      }

      function parseConicGradient(raw: string): {
        kind: "conic-gradient";
        fromDeg: number;
        centerX: string;
        centerY: string;
        stops: Array<{ color: string; offset: number }>;
      } | null {
        const inner = raw.match(/^conic-gradient\((.*)\)$/i);
        if (!inner) return null;
        const segments = splitTopLevel(inner[1]);
        if (!segments.length) return null;
        let fromDeg = 0;
        let centerX = "50%";
        let centerY = "50%";
        let stopsStart = 0;
        const head = segments[0].trim().toLowerCase();
        if (head.startsWith("from ") || head.startsWith("at ")) {
          const fromMatch = head.match(/from\s+(-?\d+(?:\.\d+)?)deg/);
          if (fromMatch) fromDeg = Number.parseFloat(fromMatch[1]);
          const atMatch = head.match(/at\s+([^\s]+)\s+([^\s]+)/);
          if (atMatch) {
            centerX = atMatch[1];
            centerY = atMatch[2];
          }
          stopsStart = 1;
        }
        const stops: Array<{ color: string; offset: number }> = [];
        const stopSegs = segments.slice(stopsStart);
        stopSegs.forEach((seg, idx) => {
          const parts = seg.match(/^(.+?)\s+(-?\d*\.?\d+%?)$/);
          let color = seg;
          let offset = idx / Math.max(1, stopSegs.length - 1);
          if (parts) {
            color = parts[1].trim();
            const raw = parts[2];
            offset = raw.endsWith("%")
              ? Number.parseFloat(raw) / 100
              : Number.parseFloat(raw);
          }
          stops.push({ color, offset });
        });
        return { kind: "conic-gradient", fromDeg, centerX, centerY, stops };
      }

      function parseBackgroundLayers(style: CSSStyleDeclaration): any[] {
        const fills: any[] = [];
        const images = style.backgroundImage || "none";
        const positions = (style.backgroundPosition || "0% 0%").split(",").map((s) => s.trim());
        const sizes = (style.backgroundSize || "auto").split(",").map((s) => s.trim());
        const repeats = (style.backgroundRepeat || "repeat").split(",").map((s) => s.trim());
        const layers = splitTopLevel(images);
        // CSS paints LAST listed background FIRST (back) and FIRST listed LAST (front).
        // We want array order = back-to-front, matching our schema contract.
        layers.reverse();
        for (let i = 0; i < layers.length; i += 1) {
          const layer = layers[i];
          if (!layer || layer === "none") continue;
          const sizeRaw = sizes[layers.length - 1 - i] ?? sizes[0] ?? "auto";
          const posRaw = positions[layers.length - 1 - i] ?? positions[0] ?? "0% 0%";
          const repeatRaw = repeats[layers.length - 1 - i] ?? repeats[0] ?? "repeat";
          const posParts = posRaw.split(/\s+/);
          const sizeParsed: any =
            sizeRaw === "cover" || sizeRaw === "contain" || sizeRaw === "auto"
              ? sizeRaw
              : (() => {
                  const sz = sizeRaw.split(/\s+/);
                  return { width: sz[0] ?? "auto", height: sz[1] ?? sz[0] ?? "auto" };
                })();
          if (layer.startsWith("linear-gradient")) {
            const g = parseLinearGradient(layer);
            if (g) fills.push(g);
          } else if (layer.startsWith("radial-gradient")) {
            const g = parseRadialGradient(layer);
            if (g) fills.push(g);
          } else if (layer.startsWith("conic-gradient")) {
            const g = parseConicGradient(layer);
            if (g) fills.push(g);
          } else if (layer.startsWith("url(")) {
            const urlMatch = layer.match(/^url\(["']?(.+?)["']?\)$/);
            if (urlMatch) {
              fills.push({
                kind: "image",
                url: urlMatch[1],
                size: sizeParsed,
                positionX: posParts[0] ?? "0%",
                positionY: posParts[1] ?? posParts[0] ?? "0%",
                repeat: repeatRaw
              });
            }
          }
        }
        const bg = style.backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
          // Background color paints behind all background images.
          fills.unshift({ kind: "color", color: bg });
        }
        return fills;
      }

      function borderSide(
        widthRaw: string,
        colorRaw: string,
        styleRaw: string
      ): { width: number; color: string; style: string } | undefined {
        const w = px(widthRaw);
        if (w <= 0) return undefined;
        if (!styleRaw || styleRaw === "none" || styleRaw === "hidden") return undefined;
        return { width: w, color: colorRaw, style: styleRaw as any };
      }

      function buildBorders(
        style: CSSStyleDeclaration,
        legendGap: { from: number; to: number } | null
      ): any | undefined {
        const top = borderSide(style.borderTopWidth, style.borderTopColor, style.borderTopStyle);
        const right = borderSide(
          style.borderRightWidth,
          style.borderRightColor,
          style.borderRightStyle
        );
        const bottom = borderSide(
          style.borderBottomWidth,
          style.borderBottomColor,
          style.borderBottomStyle
        );
        const left = borderSide(
          style.borderLeftWidth,
          style.borderLeftColor,
          style.borderLeftStyle
        );
        if (!top && !right && !bottom && !left && !legendGap) return undefined;
        const result: any = {};
        if (top) result.top = top;
        if (right) result.right = right;
        if (bottom) result.bottom = bottom;
        if (left) result.left = left;
        if (legendGap) {
          result.gaps = [{ side: "top", from: legendGap.from, to: legendGap.to }];
        }
        return result;
      }

      function buildCorners(style: CSSStyleDeclaration): any | undefined {
        const parts = (raw: string): [number, number] => {
          const split = (raw || "0").trim().split(/\s+/);
          const x = px(split[0]);
          const y = split[1] ? px(split[1]) : x;
          return [x, y];
        };
        const [tlx, tly] = parts(style.borderTopLeftRadius);
        const [trx, tryp] = parts(style.borderTopRightRadius);
        const [brx, bry] = parts(style.borderBottomRightRadius);
        const [blx, bly] = parts(style.borderBottomLeftRadius);
        if (!tlx && !tly && !trx && !tryp && !brx && !bry && !blx && !bly) return undefined;
        return {
          topLeft: { x: tlx, y: tly },
          topRight: { x: trx, y: tryp },
          bottomRight: { x: brx, y: bry },
          bottomLeft: { x: blx, y: bly }
        };
      }

      function isHidden(el: Element): boolean {
        const html = el as HTMLElement;
        const style = getComputedStyle(html);
        if (style.display === "none") return true;
        if (style.visibility === "hidden") return true;
        if (Number(style.opacity) === 0) return true;
        const rect = html.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0) return true;
        const clip = `${style.clip || ""} ${style.clipPath || ""}`.toLowerCase();
        if (clip.includes("rect(0px, 0px, 0px, 0px)") || clip.includes("inset(50%)")) return true;
        const classText = (html.getAttribute("class") || "").toString();
        if (/(^|\s)(visuallyhidden|sr-only)(\s|$)/i.test(classText)) return true;
        return false;
      }

      function visibleTextValue(html: HTMLElement): string {
        const tag = html.tagName.toLowerCase();
        if (tag === "input") {
          const input = html as HTMLInputElement;
          if (input.type === "checkbox" || input.type === "radio" || input.type === "range")
            return "";
          return input.value || input.getAttribute("value") || input.placeholder || "";
        }
        if (tag === "textarea") return (html as HTMLTextAreaElement).value || "";
        if (tag === "select") {
          const select = html as HTMLSelectElement;
          const selected = select.options[select.selectedIndex];
          return selected?.text || "";
        }
        return (html.innerText || html.textContent || "").trim();
      }

      function isTextLeaf(el: Element): boolean {
        const html = el as HTMLElement;
        const tag = html.tagName.toLowerCase();
        if (["script", "style", "br"].includes(tag)) return false;
        if (html.children.length > 0) return false;
        if (tag === "input") {
          const input = html as HTMLInputElement;
          if (input.type === "checkbox" || input.type === "radio" || input.type === "range")
            return false;
          return Boolean(input.value || input.getAttribute("value"));
        }
        if (tag === "textarea") {
          return Boolean((html as HTMLTextAreaElement).value);
        }
        const value = visibleTextValue(html);
        return value.length > 0;
      }

      // ────────────────────────── SVG walker ──────────────────────────

      function parseSvgTransform(
        raw: string
      ): [number, number, number, number, number, number] | undefined {
        if (!raw) return undefined;
        // Try CSS matrix() first.
        const m = parseTransformMatrix(raw);
        if (m) return m;
        // Convert SVG functions to a composed matrix.
        let a = 1,
          b = 0,
          c = 0,
          d = 1,
          e = 0,
          f = 0;
        const re = /(\w+)\(([^)]+)\)/g;
        let match: RegExpExecArray | null;
        const compose = (m2: [number, number, number, number, number, number]) => {
          const [na, nb, nc, nd, ne, nf] = m2;
          const ra = a * na + c * nb;
          const rb = b * na + d * nb;
          const rc = a * nc + c * nd;
          const rd = b * nc + d * nd;
          const re2 = a * ne + c * nf + e;
          const rf = b * ne + d * nf + f;
          a = ra;
          b = rb;
          c = rc;
          d = rd;
          e = re2;
          f = rf;
        };
        while ((match = re.exec(raw)) !== null) {
          const fn = match[1].toLowerCase();
          const args = match[2].split(/[ ,]+/).map((v) => Number.parseFloat(v));
          if (fn === "translate") {
            compose([1, 0, 0, 1, args[0] || 0, args[1] || 0]);
          } else if (fn === "scale") {
            const sx = args[0] || 1;
            const sy = args[1] ?? sx;
            compose([sx, 0, 0, sy, 0, 0]);
          } else if (fn === "rotate") {
            const angle = ((args[0] || 0) * Math.PI) / 180;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const cx = args[1] || 0;
            const cy = args[2] || 0;
            if (cx || cy) {
              compose([1, 0, 0, 1, cx, cy]);
              compose([cos, sin, -sin, cos, 0, 0]);
              compose([1, 0, 0, 1, -cx, -cy]);
            } else {
              compose([cos, sin, -sin, cos, 0, 0]);
            }
          } else if (fn === "matrix" && args.length === 6) {
            compose(args as [number, number, number, number, number, number]);
          }
        }
        return [a, b, c, d, e, f];
      }

      function svgPaint(el: SVGElement): any {
        const cs = getComputedStyle(el);
        const fill = (cs.fill || "").trim();
        const stroke = (cs.stroke || "").trim();
        const paint: any = {};
        // Preserve `fill: none` regardless of where it came from (attr or
        // inherited via the SVG cascade) — otherwise the renderer falls back
        // to SVG's default black fill and outline icons become solid blobs.
        if (!fill || fill === "none") paint.fill = "none";
        else paint.fill = fill;
        if (!stroke || stroke === "none") {
          // Don't set paint.stroke; SVG default is "none" and we want to skip.
        } else {
          paint.stroke = stroke;
        }
        const sw = cs.strokeWidth;
        if (sw && sw !== "0px") paint.strokeWidth = px(sw);
        const opacity = cs.opacity;
        if (opacity && Number(opacity) < 1) paint.opacity = Number(opacity);
        const fo = (cs as any).fillOpacity;
        if (fo && Number(fo) < 1) paint.fillOpacity = Number(fo);
        const so = (cs as any).strokeOpacity;
        if (so && Number(so) < 1) paint.strokeOpacity = Number(so);
        const lc = (cs as any).strokeLinecap;
        if (lc && lc !== "butt") paint.lineCap = lc;
        const lj = (cs as any).strokeLinejoin;
        if (lj && lj !== "miter") paint.lineJoin = lj;
        const fr = (cs as any).fillRule;
        if (fr && fr !== "nonzero") paint.fillRule = fr;
        const dashRaw = (cs as any).strokeDasharray;
        if (dashRaw && dashRaw !== "none") {
          const arr = dashRaw
            .split(/[\s,]+/)
            .map((p: string) => Number.parseFloat(p))
            .filter((n: number) => Number.isFinite(n));
          if (arr.length) paint.dashArray = arr;
        }
        const dashOffsetRaw = (cs as any).strokeDashoffset;
        if (dashOffsetRaw && dashOffsetRaw !== "0px" && dashOffsetRaw !== "0") {
          paint.dashOffset = px(dashOffsetRaw);
        }
        return paint;
      }

      function svgShape(el: Element): any {
        const tag = el.tagName.toLowerCase();
        const primitive =
          tag === "path" || tag === "rect" || tag === "circle" || tag === "ellipse" ||
          tag === "line" || tag === "polyline" || tag === "polygon" || tag === "g" ||
          tag === "text"
            ? (tag === "g" ? "group" : tag)
            : null;
        if (!primitive) return null;
        const attrs: Record<string, string | number> = {};
        for (const a of Array.from(el.attributes)) {
          if (a.name === "style" || a.name === "class") continue;
          const numeric = Number.parseFloat(a.value);
          attrs[a.name] = Number.isFinite(numeric) && /^-?\d/.test(a.value) ? numeric : a.value;
        }
        const shape: any = { primitive, attrs };
        const paint = svgPaint(el as SVGElement);
        if (Object.keys(paint).length) shape.paint = paint;
        const transformAttr = el.getAttribute("transform");
        if (transformAttr) {
          const matrix = parseSvgTransform(transformAttr);
          if (matrix && !isIdentityMatrix(matrix)) shape.transform = { matrix };
        }
        if (primitive === "group" || primitive === "text") {
          const children: any[] = [];
          for (const child of Array.from(el.children)) {
            const s = svgShape(child);
            if (s) children.push(s);
          }
          if (children.length) shape.shapes = children;
        }
        if (primitive === "text") {
          shape.text = { value: (el as SVGTextElement).textContent || "" };
        }
        return shape;
      }

      function buildVectorSpec(svg: SVGSVGElement): any {
        const viewBox = svg.getAttribute("viewBox");
        const vb = viewBox
          ? (() => {
              const parts = viewBox.split(/\s+/).map(Number.parseFloat);
              return { x: parts[0] || 0, y: parts[1] || 0, width: parts[2] || 0, height: parts[3] || 0 };
            })()
          : undefined;
        const shapes: any[] = [];
        for (const child of Array.from(svg.children)) {
          const s = svgShape(child);
          if (s) shapes.push(s);
        }
        const out: any = { shapes };
        if (vb) out.viewBox = vb;
        const par = svg.getAttribute("preserveAspectRatio");
        if (par) out.preserveAspectRatio = par;
        return out;
      }

      // ────────────────────── pseudo-element capture ──────────────────────

      function pseudoLayer(
        host: HTMLElement,
        pseudo: "before" | "after",
        hostRect: DOMRect,
        diagnostics: any[]
      ): any | null {
        let cs: CSSStyleDeclaration;
        try {
          cs = getComputedStyle(host, `::${pseudo}`);
        } catch {
          return null;
        }
        const content = cs.content;
        if (!content || content === "none" || content === "normal") {
          // A pseudo without content can still paint if its display is not none AND it has
          // visible width/height + paint properties (common for slider thumbs, badges).
          if (cs.display === "none") return null;
          if (
            (px(cs.width) <= 0 || px(cs.height) <= 0) &&
            (!cs.backgroundColor || cs.backgroundColor === "rgba(0, 0, 0, 0)") &&
            cs.borderTopWidth === "0px" &&
            cs.borderRightWidth === "0px" &&
            cs.borderBottomWidth === "0px" &&
            cs.borderLeftWidth === "0px" &&
            cs.boxShadow === "none"
          ) {
            return null;
          }
        }
        const w = px(cs.width);
        const h = px(cs.height);
        if (w <= 0 && h <= 0) return null;
        const top = px(cs.top);
        const left = px(cs.left);
        const right = px(cs.right);
        const bottom = px(cs.bottom);
        // Default: pseudo lives at host's content-box origin if positioned absolutely.
        // For pseudos positioned absolutely with inset 0, we span the host.
        let x = 0;
        let y = 0;
        let width = w;
        let height = h;
        if (cs.position === "absolute" || cs.position === "fixed") {
          x = Number.isFinite(left) ? left : 0;
          y = Number.isFinite(top) ? top : 0;
          if (!w && (Number.isFinite(left) || Number.isFinite(right))) {
            width = hostRect.width - (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
          }
          if (!h && (Number.isFinite(top) || Number.isFinite(bottom))) {
            height = hostRect.height - (Number.isFinite(top) ? top : 0) - (Number.isFinite(bottom) ? bottom : 0);
          }
        } else {
          x = px(cs.marginLeft);
          y = px(cs.marginTop);
        }
        const transform = parseTransformMatrix(cs.transform);
        const paint = buildPaintFromComputed(cs, null);
        const layer: any = {
          id: nextId(),
          name: `::${pseudo}`,
          source: { kind: "pseudo", pseudo, tag: host.tagName.toLowerCase() },
          box: { x: snap(x), y: snap(y), width: snap(width || w), height: snap(height || h) }
        };
        if (Object.keys(paint || {}).length) layer.paint = paint;
        if (transform && !isIdentityMatrix(transform)) layer.transform = { matrix: transform };
        // Capture pseudo content text if present
        const contentText = cs.content && /^"(.*)"$/.test(cs.content) ? cs.content.slice(1, -1) : "";
        if (contentText) {
          layer.text = buildTextSpec(cs, contentText, diagnostics, layer.id, host);
        }
        layer.layout = buildLayoutSpec(cs);
        return layer;
      }

      // ─────────────────────── computed style → paint ───────────────────────

      function buildPaintFromComputed(
        style: CSSStyleDeclaration,
        legendGap: { from: number; to: number } | null
      ): any | undefined {
        const fills = parseBackgroundLayers(style);
        const borders = buildBorders(style, legendGap);
        const corners = buildCorners(style);
        const shadows = parseShadows(style.boxShadow);
        const filters = parseFilters(style.filter);
        const backdropFilters = parseFilters((style as any).backdropFilter || "");
        const opacity = Number(style.opacity);
        const blend = style.mixBlendMode;
        const isolation = (style as any).isolation;
        const visibility = style.visibility as any;

        const paint: any = {};
        if (fills.length) paint.fills = fills;
        if (borders) paint.borders = borders;
        if (corners) paint.cornerRadii = corners;
        if (shadows.length) paint.shadows = shadows;
        if (filters.length) paint.filters = filters;
        if (backdropFilters.length) paint.backdropFilters = backdropFilters;
        if (Number.isFinite(opacity) && opacity < 1) paint.opacity = opacity;
        if (blend && blend !== "normal") paint.blendMode = blend;
        if (isolation && isolation !== "auto") paint.isolation = isolation;
        if (visibility && visibility !== "visible") paint.visibility = visibility;
        const outlineW = px(style.outlineWidth);
        if (outlineW > 0 && style.outlineStyle && style.outlineStyle !== "none") {
          paint.outline = {
            width: outlineW,
            color: style.outlineColor,
            style: style.outlineStyle as any,
            offset: px(style.outlineOffset)
          };
        }
        const clipPath = style.clipPath;
        if (clipPath && clipPath !== "none") {
          paint.clipPath = { kind: "path", value: clipPath };
        }
        return Object.keys(paint).length ? paint : undefined;
      }

      // ─────────────────────── computed style → text ───────────────────────

      function pickFontFamily(familyRaw: string): string {
        const parts = familyRaw
          .split(",")
          .map((f) => f.replace(/['"]/g, "").trim())
          .filter(Boolean);
        const generic = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-monospace|ui-sans-serif)$/i;
        const named = parts.find((p) => !generic.test(p));
        return named || parts[0] || "Inter";
      }

      function textMeasureEl(el: Element): Element {
        if (el.children.length === 1 && el.firstElementChild) {
          const child = el.firstElementChild;
          const childStyle = getComputedStyle(child);
          if (
            childStyle.display !== "none" &&
            (child.textContent || "").trim() === (el.textContent || "").trim()
          ) {
            return textMeasureEl(child);
          }
        }
        return el;
      }

      function resolveLineHeight(style: CSSStyleDeclaration, el?: Element): number | undefined {
        const lh = style.lineHeight;
        if (lh && lh !== "normal") {
          const n = px(lh);
          if (n > 0) return n;
        }
        if (!el) return undefined;
        const fs = px(style.fontSize);
        if (fs <= 0) return undefined;
        try {
          const range = document.createRange();
          range.selectNodeContents(el);
          const r = range.getBoundingClientRect();
          if (r.height > 0 && r.height <= fs * 1.5) return px(String(r.height));
        } catch {
          /* ignore */
        }
        return undefined;
      }

      function isSystemUiFont(familyRaw: string): boolean {
        const first = familyRaw.split(",")[0]?.trim().replace(/['"]/g, "") || "";
        return /^arial\b|^system-ui\b|^-apple-system\b|^\.?apple-system\b|^ui-sans-serif\b/i.test(
          first
        );
      }

      function resolveFontFamilyRaw(
        measureEl: Element | undefined,
        style: CSSStyleDeclaration,
        measureStyle: CSSStyleDeclaration
      ): string {
        let familyRaw = measureStyle.fontFamily || style.fontFamily || "Inter";
        // Buttons and their label spans often resolve to Arial/system-ui even
        // when the page declares Inter — walk up for the authored stack.
        if (measureEl && isSystemUiFont(familyRaw)) {
          let ancestor = measureEl.parentElement;
          while (ancestor) {
            const inherited = getComputedStyle(ancestor).fontFamily;
            if (inherited && !isSystemUiFont(inherited)) {
              familyRaw = inherited;
              break;
            }
            ancestor = ancestor.parentElement;
          }
        }
        return familyRaw;
      }

      function buildTextSpec(
        style: CSSStyleDeclaration,
        value: string,
        diagnostics: any[],
        _layerId: string,
        el?: Element
      ): any {
        const measureEl = el ? textMeasureEl(el) : el;
        const measureStyle =
          measureEl && measureEl !== el ? getComputedStyle(measureEl) : style;
        const familyRaw = resolveFontFamilyRaw(measureEl ?? undefined, style, measureStyle);
        const family = pickFontFamily(familyRaw);
        const stack = familyRaw.trim();
        const lineHeight = resolveLineHeight(measureStyle, measureEl || el);
        const ls = style.letterSpacing;
        const letterSpacing = !ls || ls === "normal" ? undefined : px(ls);
        const ws = (style as any).wordSpacing;
        const wordSpacing = !ws || ws === "normal" ? undefined : px(ws);

        const decoLine = style.textDecorationLine || "";
        const lines: any[] = [];
        if (decoLine.includes("underline")) lines.push("underline");
        if (decoLine.includes("line-through")) lines.push("line-through");
        if (decoLine.includes("overline")) lines.push("overline");
        const decoration = lines.length
          ? {
              lines,
              color: style.textDecorationColor || style.color,
              style: (style.textDecorationStyle as any) || "solid",
              thicknessPx: px((style as any).textDecorationThickness)
            }
          : undefined;

        const shadows = parseShadows(style.textShadow);

        return {
          value,
          font: {
            family,
            stack,
            size: px(style.fontSize),
            weight: Number(style.fontWeight) || 400,
            style: (style.fontStyle as any) || "normal",
            variant: style.fontVariant,
            featureSettings: (style as any).fontFeatureSettings
          },
          color: style.color,
          lineHeight,
          letterSpacing,
          wordSpacing,
          align: (style.textAlign as any) || "start",
          verticalAlign: style.verticalAlign,
          decoration,
          transform: (style.textTransform as any) || "none",
          whiteSpace: (style.whiteSpace as any) || "normal",
          overflow:
            style.textOverflow === "ellipsis"
              ? "ellipsis"
              : style.overflow === "hidden"
              ? "clip"
              : "visible",
          wordBreak: (style.wordBreak as any) || "normal",
          direction: (style.direction as any) || "ltr",
          shadows: shadows.length ? shadows : undefined
        };
      }

      // ─────────────────────── computed style → layout ───────────────────────

      function buildLayoutSpec(style: CSSStyleDeclaration): any {
        const display = (style.display as any) || "block";
        const position = (style.position as any) || "static";
        const overflow = {
          x: (style.overflowX as any) || "visible",
          y: (style.overflowY as any) || "visible"
        };
        const layout: any = { display, position, overflow };
        layout.padding = {
          top: px(style.paddingTop),
          right: px(style.paddingRight),
          bottom: px(style.paddingBottom),
          left: px(style.paddingLeft)
        };
        layout.margin = {
          top: px(style.marginTop),
          right: px(style.marginRight),
          bottom: px(style.marginBottom),
          left: px(style.marginLeft)
        };
        const inset: any = {};
        if (style.top && style.top !== "auto") inset.top = px(style.top);
        if (style.right && style.right !== "auto") inset.right = px(style.right);
        if (style.bottom && style.bottom !== "auto") inset.bottom = px(style.bottom);
        if (style.left && style.left !== "auto") inset.left = px(style.left);
        if (Object.keys(inset).length) layout.inset = inset;
        const z = style.zIndex;
        if (z && z !== "auto") layout.zIndex = Number(z) || 0;
        if (display.includes("flex")) {
          layout.flex = {
            direction: (style.flexDirection as any) || "row",
            wrap: (style.flexWrap as any) || "nowrap",
            justify: (style.justifyContent as any) || "start",
            align: (style.alignItems as any) || "stretch",
            rowGap: px(style.rowGap),
            columnGap: px(style.columnGap)
          };
        } else if (display.includes("grid")) {
          layout.grid = {
            templateRows: style.gridTemplateRows,
            templateColumns: style.gridTemplateColumns,
            templateAreas: style.gridTemplateAreas,
            rowGap: px(style.rowGap),
            columnGap: px(style.columnGap),
            autoFlow: style.gridAutoFlow,
            justify: style.justifyContent,
            align: style.alignItems
          };
        }
        const fg = Number(style.flexGrow);
        if (Number.isFinite(fg) && fg > 0) layout.flexGrow = fg;
        const fs = Number(style.flexShrink);
        if (Number.isFinite(fs) && fs !== 1) layout.flexShrink = fs;
        if (style.flexBasis && style.flexBasis !== "auto") layout.flexBasis = style.flexBasis;
        if (style.order && style.order !== "0") layout.order = Number(style.order) || 0;
        if (style.alignSelf && style.alignSelf !== "auto") layout.alignSelf = style.alignSelf;
        if (style.justifySelf && style.justifySelf !== "auto") layout.justifySelf = style.justifySelf;
        if (style.gridColumn && style.gridColumn !== "auto") layout.gridColumn = style.gridColumn;
        if (style.gridRow && style.gridRow !== "auto") layout.gridRow = style.gridRow;
        return layout;
      }

      // ───────────────────── legend → border gap detection ─────────────────────

      function detectLegendGap(
        el: Element,
        rect: DOMRect
      ): { from: number; to: number } | null {
        if (el.tagName.toLowerCase() !== "fieldset") return null;
        const legends = Array.from(el.querySelectorAll(":scope > legend"));
        for (const legend of legends) {
          const inner = legend.querySelector("span") || legend;
          const innerRect = inner.getBoundingClientRect();
          if (innerRect.width <= 0) continue;
          const pad = 4;
          const from = innerRect.left - rect.left - pad;
          const to = innerRect.left - rect.left + innerRect.width + pad;
          if (to <= from) continue;
          return { from: snap(from), to: snap(to) };
        }
        return null;
      }

      // ─────────────────────── source metadata helpers ───────────────────────

      function captureSource(el: Element): any {
        const html = el as HTMLElement;
        const classListArr = (html.getAttribute("class") || "")
          .split(/\s+/)
          .filter(Boolean);
        const ds: Record<string, string> = {};
        if (html.dataset) {
          for (const k of Object.keys(html.dataset)) {
            const v = html.dataset[k];
            if (v != null) ds[k] = v;
          }
        }
        const inlineHeight = html.style?.height;
        if (inlineHeight && inlineHeight.endsWith("%")) {
          ds.heightPercent = inlineHeight;
        }
        const source: any = {
          kind: el.tagName.toLowerCase() === "svg" ? "svg" : "dom",
          tag: el.tagName.toLowerCase()
        };
        if (html.id) source.id = html.id;
        if (classListArr.length) source.classList = classListArr;
        const role = html.getAttribute("role");
        if (role) source.role = role;
        const aria = html.getAttribute("aria-label");
        if (aria) source.ariaLabel = aria;
        if (source.tag === "input") {
          const inp = html as HTMLInputElement;
          if (inp.type) source.inputType = inp.type;
          if (inp.placeholder) source.placeholder = inp.placeholder;
        }
        if (Object.keys(ds).length) source.dataset = ds;
        return source;
      }

      // ─────────────────────── walker ───────────────────────

      const diagnostics: any[] = [];
      const warnings: string[] = [];

      function walk(el: Element, parentRect: DOMRect, parentDisplay?: string): any | null {
        if (isHidden(el)) return null;
        const html = el as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === "br" || tag === "script" || tag === "style" || tag === "noscript") return null;
        if (tag === "input") {
          const t = (html as HTMLInputElement).type?.toLowerCase() || "";
          if (t === "hidden") return null;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0) return null;
        const style = getComputedStyle(html);
        const source = captureSource(el);
        const legendGap = detectLegendGap(el, rect);
        const paint = buildPaintFromComputed(style, legendGap);
        const layout = buildLayoutSpec(style);
        const transformMatrix = parseTransformMatrix(style.transform);
        const id = nextId();

        const box = {
          x: snap(rect.left - parentRect.left),
          y: snap(rect.top - parentRect.top),
          width: snap(rect.width),
          height: snap(rect.height)
        };
        if (parentDisplay === "grid") {
          const maxW = snap(parentRect.width) - box.x;
          if (box.width > maxW + 0.5) box.width = Math.max(1, maxW);
        }
        const computedBox = {
          x: snap(rect.left),
          y: snap(rect.top),
          width: box.width,
          height: snap(rect.height)
        };

        const layer: any = {
          id,
          name: html.dataset?.figmaName || html.dataset?.figmaComponent || tag,
          source,
          box,
          computedBox,
          layout
        };
        if (paint) layer.paint = paint;
        if (transformMatrix && !isIdentityMatrix(transformMatrix)) {
          layer.transform = { matrix: transformMatrix };
          const origin = style.transformOrigin;
          if (origin) layer.transform.origin = parseOrigin(origin);
        }

        // SVG capture (recursive, per-primitive paint)
        if (tag === "svg") {
          layer.vector = buildVectorSpec(el as unknown as SVGSVGElement);
          return layer;
        }

        // Image capture
        if (tag === "img") {
          const img = html as HTMLImageElement;
          layer.image = {
            src: img.currentSrc || img.src,
            intrinsic: {
              width: img.naturalWidth || rect.width,
              height: img.naturalHeight || rect.height
            },
            mode:
              style.objectFit === "contain"
                ? "contain"
                : style.objectFit === "cover"
                ? "cover"
                : style.objectFit === "none"
                ? "none"
                : "fill",
            positionX: style.objectPosition?.split(" ")[0],
            positionY: style.objectPosition?.split(" ")[1],
            alt: img.alt || undefined
          };
          return layer;
        }

        // Text-leaf: keep the text on the parent layer. The renderer applies
        // the parent's flex/grid layout to align it within the box (matches
        // how the browser laid out the text in the original DOM).
        if (isTextLeaf(el)) {
          const value = visibleTextValue(html);
          layer.text = buildTextSpec(style, value, diagnostics, id, el);
          return layer;
        }

        // Children: real DOM children + pseudo-elements + (for some inputs) synthetic text.
        const children: any[] = [];

        // ::before pseudo
        const beforeLayer = pseudoLayer(html, "before", rect, diagnostics);
        if (beforeLayer) children.push(beforeLayer);

        for (const child of Array.from(el.children)) {
          if (child.tagName.toLowerCase() === "input") {
            const t = (child as HTMLInputElement).type?.toLowerCase() || "";
            if (t === "range" || t === "hidden") continue;
          }
          const out = walk(child, rect, layout.display);
          if (out) children.push(out);
        }

        // Inputs/textarea: synthesize a text leaf for their value (not placeholder).
        if (tag === "input" || tag === "textarea") {
          const actualValue =
            tag === "input"
              ? (html as HTMLInputElement).value || (html as HTMLInputElement).getAttribute("value") || ""
              : (html as HTMLTextAreaElement).value || "";
          if (actualValue) {
            const value = actualValue;
            const padTop = px(style.paddingTop);
            const padLeft = px(style.paddingLeft);
            const padRight = px(style.paddingRight);
            const padBottom = px(style.paddingBottom);
            const textRect = document.createRange();
            textRect.selectNodeContents(html);
            const tr = textRect.getBoundingClientRect();
            const width = Math.max(1, rect.width - padLeft - padRight);
            const height = Math.max(1, rect.height - padTop - padBottom);
            children.push({
              id: nextId(),
              name: `${tag}-text`,
              source: { kind: "synthetic", tag, pseudo: undefined },
              box: {
                x: snap(padLeft),
                y: snap(padTop),
                width: snap(Math.min(tr.width || width, width)),
                height: snap(Math.min(tr.height || height, height))
              },
              text: buildTextSpec(style, value, diagnostics, "synthetic")
            });
          }
        }

        // Direct text + element children mixed: emit text as a synthetic leaf if no
        // element child duplicates it.
        if (
          !["input", "textarea", "select", "button"].includes(tag) &&
          el.children.length > 0
        ) {
          const hasBr = Array.from(el.children).some((c) => c.tagName.toLowerCase() === "br");
          const directText = hasBr
            ? (html.innerText || "").replace(/\r\n/g, "\n").trim()
            : Array.from(html.childNodes)
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => (n.textContent || "").trim())
                .filter((t) => t.length > 0)
                .join(" ");
          if (directText) {
            // Measure only direct text nodes — selectNodeContents() spans inline
            // children and produces a union box that misplaces synthetic text.
            const textNodes = Array.from(html.childNodes).filter(
              (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim().length > 0
            );
            const ranges =
              textNodes.length > 0
                ? textNodes.map((n) => {
                    const r = document.createRange();
                    r.selectNodeContents(n);
                    return r.getBoundingClientRect();
                  })
                : (() => {
                    const r = document.createRange();
                    r.selectNodeContents(html);
                    return [r.getBoundingClientRect()];
                  })();
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const tr of ranges) {
              if (tr.width <= 0 && tr.height <= 0) continue;
              minX = Math.min(minX, tr.left);
              minY = Math.min(minY, tr.top);
              maxX = Math.max(maxX, tr.right);
              maxY = Math.max(maxY, tr.bottom);
            }
            const tr =
              minX !== Infinity
                ? {
                    left: minX,
                    top: minY,
                    width: maxX - minX,
                    height: maxY - minY
                  }
                : { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
            children.push({
              id: nextId(),
              name: `${tag}-text`,
              source: { kind: "synthetic", tag },
              box: {
                x: snap(tr.left - rect.left),
                y: snap(tr.top - rect.top),
                width: snap(Math.max(1, tr.width)),
                height: snap(Math.max(1, tr.height))
              },
              text: buildTextSpec(style, directText, diagnostics, "synthetic", el)
            });
          }
        }

        // ::after pseudo
        const afterLayer = pseudoLayer(html, "after", rect, diagnostics);
        if (afterLayer) children.push(afterLayer);

        // Pre-sort children by (z-index ascending, then DOM source order which we
        // already preserve via insertion).
        children.sort((a, b) => {
          const az = a.layout?.zIndex ?? 0;
          const bz = b.layout?.zIndex ?? 0;
          if (az !== bz) return az - bz;
          return 0; // stable insertion order
        });

        if (children.length) layer.children = children;
        return layer;
      }

      function parseOrigin(raw: string): { x: string; y: string } {
        const parts = raw.split(/\s+/);
        return { x: parts[0] || "50%", y: parts[1] || "50%" };
      }

      function getCanvasBackground(start: HTMLElement): string {
        let current: HTMLElement | null = start.parentElement;
        while (current) {
          const bg = getComputedStyle(current).backgroundColor;
          if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return bg;
          current = current.parentElement;
        }
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        return bodyBg && bodyBg !== "transparent" && bodyBg !== "rgba(0, 0, 0, 0)"
          ? bodyBg
          : "rgb(255, 255, 255)";
      }

      const rootEl = document.querySelector("[data-figma-component]") as HTMLElement | null;
      if (!rootEl) throw new Error("No [data-figma-component] root found");

      const rootRect = rootEl.getBoundingClientRect();
      const canvasBg = getCanvasBackground(rootEl);

      const root = walk(rootEl, rootRect);
      if (!root) throw new Error("Root element walk produced no layer");

      // Collect all image URLs to fetch outside (data URL pass)
      const imageUrls = new Set<string>();
      function collectImages(layer: any) {
        if (layer.image?.src) imageUrls.add(layer.image.src);
        if (layer.paint?.fills) {
          for (const f of layer.paint.fills) {
            if (f.kind === "image" && f.url) imageUrls.add(f.url);
          }
        }
        for (const c of layer.children || []) collectImages(c);
      }
      collectImages(root);

      return {
        root,
        imageUrls: Array.from(imageUrls),
        canvasBackground: canvasBg,
        viewport: {
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: window.innerHeight
        },
        devicePixelRatio: window.devicePixelRatio,
        sourceUrl: location.href,
        componentName: rootEl.dataset.figmaComponent || "Unknown",
        diagnostics: { warnings: [], unmappedProperties: diagnostics }
      };
    },
    { storyId, argsUsed: argsUsed ?? {} }
  );

  // Phase 2: fetch image bytes & embed as data URLs.
  const dataUrlByImage = new Map<string, string>();
  await Promise.all(
    tree.imageUrls.map(async (url) => {
      const data = await fetchAsDataUrl(url);
      if (data) dataUrlByImage.set(url, data);
    })
  );

  function attachImageData(layer: UniversalLayer): void {
    if (layer.image && dataUrlByImage.has(layer.image.src)) {
      layer.image.dataUrl = dataUrlByImage.get(layer.image.src);
    }
    if (layer.paint?.fills) {
      for (const f of layer.paint.fills) {
        if (f.kind === "image" && dataUrlByImage.has(f.url)) {
          f.dataUrl = dataUrlByImage.get(f.url);
        }
      }
    }
    for (const child of layer.children ?? []) attachImageData(child);
  }
  attachImageData(tree.root as UniversalLayer);

  const doc: UniversalDocumentV2 = {
    schemaVersion: "1.0",
    meta: {
      storyId,
      componentName: tree.componentName,
      extractedAt: new Date().toISOString(),
      sourceUrl: tree.sourceUrl,
      argsUsed,
      viewport: tree.viewport,
      devicePixelRatio: tree.devicePixelRatio,
      canvasBackground: tree.canvasBackground
    },
    root: tree.root as UniversalLayer,
    diagnostics: tree.diagnostics
  };

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(doc, null, 2));
  await browser.close();
  return out;
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith("/extract.ts");
if (isDirectRun) {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
  const storyId = args.get("--story") ?? "lab-button--primary";
  const baseUrl = args.get("--url") ?? "http://127.0.0.1:6107";
  const out = resolve(process.cwd(), args.get("--out") ?? `../../artifacts/${storyId}.v2.json`);
  const argsRaw = args.get("--args");
  const parsedArgs = argsRaw ? (JSON.parse(argsRaw) as StoryArgs) : undefined;
  const path = await extractStoryV2(storyId, out, baseUrl, parsedArgs);
  console.log(`Wrote ${path}`);
}
