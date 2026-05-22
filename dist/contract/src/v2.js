/**
 * UniversalLayer v1.0 — a pixel-perfect, lossless intermediate representation
 * for any DOM/SVG/canvas surface.
 *
 * Contract rules (read before consuming):
 * 1. `box.x / box.y / box.width / box.height` are the POST-TRANSFORM bounding
 *    rect in the parent layer's local coordinate space (matches the browser's
 *    `getBoundingClientRect()` minus the parent offset).
 * 2. `transform` carries the CSS `transform` matrix that the source already
 *    applied. A renderer may EITHER bake it into resolved values OR pass it
 *    through as a native transform — both are legal.
 * 3. `paint.fills` is painted back-to-front in array order (first listed paints
 *    LAST — matching CSS `background-image: a, b` painting order).
 * 4. All colors are resolved to absolute values at extraction. `currentColor`
 *    and CSS variables never appear.
 * 5. Children are PRE-SORTED by `(zIndex ascending, source-order)`. Renderers
 *    paint children in array order; they must not re-sort.
 * 6. Per-primitive SVG paint is captured by `getComputedStyle()` on each
 *    primitive at extraction. Renderers never re-resolve CSS.
 * 7. Image bytes are embedded as `dataUrl` so artifacts are self-contained.
 */
export function isUniversalDocumentV2(value) {
    if (!value || typeof value !== "object")
        return false;
    const v = value;
    return v.schemaVersion === "1.0";
}
