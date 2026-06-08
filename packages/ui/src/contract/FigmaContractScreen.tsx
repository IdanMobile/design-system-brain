import React, { useEffect, useMemo } from "react";
import type { UniversalDocumentV2, UniversalLayer } from "@lab/contract";
import { renderToBodyMarkup } from "@lab/pixel-test/render-html";

export type FigmaContractScreenMeta = {
  width: number;
  height: number;
  background: string;
  screenId?: string;
};

function collectFontFamilies(node: UniversalLayer | undefined, out = new Set<string>()): Set<string> {
  if (node?.text?.font?.family) out.add(String(node.text.font.family).trim());
  for (const child of node?.children ?? []) collectFontFamilies(child, out);
  return out;
}

function contractUsesRtl(doc: UniversalDocumentV2): boolean {
  const walk = (node: UniversalLayer): boolean => {
    if (node.text?.direction === "rtl") return true;
    if (node.text?.value && /[\u0590-\u05FF\u0600-\u06FF]/.test(node.text.value)) return true;
    return (node.children ?? []).some(walk);
  };
  return walk(doc.root);
}

function googleFontsCssUrl(families: Set<string>): string | null {
  const params = [...families]
    .filter((f) => f && !/^(serif|sans-serif|monospace|inherit)$/i.test(f))
    .map((f) => `family=${encodeURIComponent(f.replace(/\s+/g, " "))}:wght@400;500;600;700`)
    .join("&");
  return params ? `https://fonts.googleapis.com/css2?${params}&display=swap` : null;
}

export type ContractDocument = Omit<UniversalDocumentV2, "diagnostics"> & {
  diagnostics?: UniversalDocumentV2["diagnostics"];
};

type Props = {
  contract: ContractDocument;
  meta: FigmaContractScreenMeta;
  componentName: string;
  className?: string;
};

/**
 * Renders a Figma screen contract as real DOM (via render-html), not a flat PNG.
 */
export function FigmaContractScreen({ contract, meta, componentName, className }: Props) {
  const rendered = useMemo(() => renderToBodyMarkup(contract as UniversalDocumentV2), [contract]);
  const rtl = useMemo(() => contractUsesRtl(contract as UniversalDocumentV2), [contract]);

  useEffect(() => {
    if (!rtl) return;
    document.documentElement.setAttribute("dir", "rtl");
    document.documentElement.setAttribute("lang", "he");
    return () => {
      document.documentElement.removeAttribute("dir");
      document.documentElement.removeAttribute("lang");
    };
  }, [rtl]);

  useEffect(() => {
    const url = googleFontsCssUrl(collectFontFamilies(contract.root));
    if (!url) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, [contract]);

  return (
    <div
      className={className ? `lab-figma-screen lab-figma-contract-screen ${className}` : "lab-figma-screen lab-figma-contract-screen"}
      data-figma-component={componentName}
      style={{
        width: meta.width,
        height: meta.height,
        position: "relative",
        overflow: "hidden",
        background: meta.background ?? rendered.background,
      }}
      dangerouslySetInnerHTML={{ __html: rendered.bodyMarkup }}
    />
  );
}
