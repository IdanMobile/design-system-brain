import type { UniversalDocumentV2 } from "@lab/contract";
import { renderToBodyMarkup } from "./render-html.ts";
import { htmlMarkupToJsx } from "./html-to-jsx.ts";

export type RenderTsxOptions = {
  /** `eval` omits import/export for in-browser Babel transform. */
  moduleFormat?: "file" | "eval";
};

function rootStyleBlock(width: number, height: number, background: string): string {
  return `{
        width: ${width},
        height: ${height},
        position: "relative",
        overflow: "hidden",
        background: ${JSON.stringify(background)}
      }`;
}

function componentBody(doc: UniversalDocumentV2, componentName: string): {
  jsxBody: string;
  rootStyle: string;
} {
  const rendered = renderToBodyMarkup(doc);
  return {
    jsxBody: htmlMarkupToJsx(rendered.bodyMarkup),
    rootStyle: rootStyleBlock(rendered.width, rendered.height, rendered.background)
  };
}

/**
 * Generate a React function component from a Universal JSON contract.
 * Layout mirrors render-html.ts (Tier B codegen — real element tree, no innerHTML).
 */
export function renderToReactComponentSource(
  doc: UniversalDocumentV2,
  componentName: string,
  options: RenderTsxOptions = {}
): string {
  const { jsxBody, rootStyle } = componentBody(doc, componentName);
  const fn = `function ${componentName}() {
  return (
    <div
      className="lab-figma-screen lab-figma-tsx-screen"
      data-figma-component="${componentName}"
      style={${rootStyle}}
    >
${jsxBody}
    </div>
  );
}`;

  if (options.moduleFormat === "eval") {
    return fn;
  }

  return `import React from "react";

/**
 * Codegen layout TSX from Universal JSON contract (render-html parity).
 * Regenerate via \`node scripts/contract-to-tsx.mjs --component ${componentName}\`.
 */
export ${fn}
`;
}

/** Full .tsx file contents (always includes import/export). */
export function renderToReactComponentFile(
  doc: UniversalDocumentV2,
  componentName: string
): string {
  return renderToReactComponentSource(doc, componentName, { moduleFormat: "file" });
}

export { renderToBodyMarkup };
