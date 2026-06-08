/**
 * Figma / contract → @lab/ui component bindings (ingress-agnostic rules).
 */

import type { UniversalLayer } from "../../contract/src/v2.ts";
import type { SemanticComponentId } from "../../contract/src/semantic-graph.ts";

export interface ComponentBindingRule {
  id: string;
  /** Match layer.name (case-insensitive substring or regex string). */
  name?: RegExp | string;
  /** Require figma node type in dataset. */
  figmaNodeType?: string;
  /** Storybook DOM: tag + class substring. */
  tag?: string;
  classIncludes?: string;
  componentId: SemanticComponentId;
  defaultProps?: Record<string, unknown>;
  /** Infer props from layer subtree. */
  inferProps?: (layer: UniversalLayer) => Record<string, unknown>;
}

function deepText(layer: UniversalLayer): string {
  if (layer.text?.value) return layer.text.value.trim();
  for (const child of layer.children ?? []) {
    const t = deepText(child);
    if (t) return t;
  }
  return "";
}

function hasClass(layer: UniversalLayer, token: string): boolean {
  return (layer.source.classList ?? []).some((c) => c.includes(token));
}

function isFigmaName(layer: UniversalLayer, pattern: RegExp | string): boolean {
  const name = layer.name ?? "";
  return typeof pattern === "string"
    ? name.toLowerCase().includes(pattern.toLowerCase())
    : pattern.test(name);
}

export const COMPONENT_BINDING_RULES: ComponentBindingRule[] = [
  {
    id: "storybook-lab-button",
    tag: "button",
    classIncludes: "lab-button",
    componentId: "Button",
    inferProps: (layer) => {
      const cls = (layer.source.classList ?? []).join(" ");
      const variant = ["primary", "secondary", "danger", "ghost"].find((v) => cls.includes(v)) ?? "primary";
      const size = (["sm", "md", "lg"] as const).find((s) => cls.includes(s)) ?? "md";
      return {
        variant,
        size,
        iconLeft: cls.includes("icon-left") || Boolean(layer.children?.some((c) => c.source.tag === "svg")),
        iconRight: cls.includes("icon-right"),
        children: deepText(layer) || "Button"
      };
    }
  },
  {
    id: "figma-primary-button",
    name: /^primary button$/i,
    componentId: "Button",
    defaultProps: { variant: "primary", size: "md" },
    inferProps: (layer) => ({
      variant: "primary",
      size: "md",
      children: deepText(layer) || "Primary"
    })
  },
  {
    id: "figma-button-generic",
    name: /^buttons$/i,
    componentId: "Button",
    inferProps: (layer) => {
      const text = deepText(layer);
      const lower = text.toLowerCase();
      let variant: string = "secondary";
      if (lower.includes("מחיק") || lower.includes("delete")) variant = "danger";
      else if (lower.includes("הוספ") || lower.includes("add")) variant = "primary";
      return { variant, size: "md", children: text || "Button" };
    }
  },
  {
    id: "figma-checkbox",
    name: /^checkbox$/i,
    componentId: "Checkbox",
    inferProps: (layer) => {
      const hasCheck = (layer.children ?? []).some(
        (c) => (c.name ?? "").toLowerCase().includes("check") || Boolean(c.vector)
      );
      return { checked: hasCheck, label: "" };
    }
  },
  {
    id: "figma-text-cell",
    name: /^(table cell|typography|text)$/i,
    componentId: "Text",
    inferProps: (layer) => ({
      children: deepText(layer),
      variant: "body"
    })
  }
];

export function matchBinding(layer: UniversalLayer): ComponentBindingRule | null {
  for (const rule of COMPONENT_BINDING_RULES) {
    if (rule.tag && layer.source.tag !== rule.tag) continue;
    if (rule.classIncludes && !hasClass(layer, rule.classIncludes)) continue;
    if (rule.name && !isFigmaName(layer, rule.name)) continue;
    if (rule.figmaNodeType && layer.source.dataset?.figmaNodeType !== rule.figmaNodeType) continue;
    return rule;
  }
  return null;
}

export function bindingProps(rule: ComponentBindingRule, layer: UniversalLayer): Record<string, unknown> {
  return {
    ...(rule.defaultProps ?? {}),
    ...(rule.inferProps?.(layer) ?? {})
  };
}
