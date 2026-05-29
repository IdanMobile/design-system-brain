# Preserve `whiteSpace: pre` in schema replay

## Symptom

Pixel fail on ASCII art, `<pre>`, or monospace blocks: columns collapse, leading spaces vanish, or lines misalign vs Storybook.

## Rule

Respect schema `whiteSpace` when replaying text. Use `pre` / `pre-wrap` for `"pre"` / `"pre-wrap"`; do not force `white-space: pre-line` or `<br>` splitting that collapses leading spaces. Route `<pre>` through the same inline/leaf path as other text leaves.

## Fix area

- Primary: `packages/pixel-test/src/render-html.ts` (`textToHtml`, inline leaf routing)
- Also check: `packages/contract/src/v2.ts` if `whiteSpace` not extracted

## Stories

- lab-retroterminalscreen--default
