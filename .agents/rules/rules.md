# Cursor Rules — Storybook to Figma Lab

## Mission
Build a real editable Storybook → Universal JSON → Figma pipeline.
The final goal is pixel-perfect editable Figma nodes, not screenshots.

## Hard Rules
- Do not use screenshot fallback as final output.
- Every visual element must attempt native node extraction first.
- Preserve both semantic data and visual truth.
- Browser rendered DOM/computed CSS is the source of truth.
- React props are helpful metadata, not enough for Figma.
- Figma output must use real nodes: FRAME, TEXT, RECTANGLE, ELLIPSE, LINE, VECTOR, IMAGE.
- Every extracted node must include geometry, style, layout, source, and children.
- Every style should support token reference plus computed value.
- If something cannot be extracted, add a warning to report.unsupportedCss or report.warnings.
- Keep adapters small and testable.

## Current Scope
Start with Button only.
Then add Chip, ProductCard, IconTile, Histogram.

## Extraction Strategy
- Use Playwright, not Chrome extension, for the first lab.
- Open Storybook iframe URL.
- Find `[data-figma-component]` as root.
- Walk DOM recursively.
- Read getBoundingClientRect.
- Read getComputedStyle.
- Convert DOM nodes to UniversalNode.
- Convert SVG to vector node.
- Convert img to image node.
- Convert text-only spans/headings/paragraphs to text nodes.

## Figma Strategy
- Import UniversalDocument JSON.
- Recreate tree recursively.
- Map frame layout to Figma auto-layout where possible.
- Also preserve absolute x/y/width/height.
- Apply fills, strokes, radius, typography, opacity.
- Load fonts before creating text.

## Testing Rule
Each component test must output:
- extracted JSON
- node count
- fallback count must be 0
- missing styles
- unsupported CSS
- pixel diff report later

## Quality Bar
Button is not done until:
- size matches
- radius matches
- fill matches
- text matches
- font size matches
- padding/gap matches
- icon vector imports
- no fallback nodes
