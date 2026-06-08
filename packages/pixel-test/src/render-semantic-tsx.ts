import type { SemanticComponentId, SemanticDocument } from "../../contract/src/semantic-graph.ts";
import { contractToSemantic, type ContractToSemanticOptions } from "./contract-to-semantic.ts";
import type { UniversalDocumentV2 } from "../../contract/src/v2.ts";

const UI_IMPORTS: Record<SemanticComponentId, string> = {
  Button: "Button",
  Checkbox: "Checkbox",
  Text: "Text",
  AnalyticsCharts: "AnalyticsCharts",
  CalendarScheduler: "CalendarScheduler",
  ComplexDashboardCard: "ComplexDashboardCard",
  ContentListBoard: "ContentListBoard",
  FeatureCard: "FeatureCard",
  FilterSidePanel: "FilterSidePanel",
  LoadingStates: "LoadingStates",
  LoginPage: "LoginPage",
  MeetingHomePage: "MeetingHomePage",
  NavigationBars: "NavigationBars",
  OverlayStates: "OverlayStates",
  PricingPanel: "PricingPanel",
  ProductCard: "ProductCard",
  RadioGroupField: "RadioGroupField",
  SelectField: "SelectField",
  SnackbarStack: "SnackbarStack",
  TabsPanel: "TabsPanel",
  Screen1: "Screen1",
  Screen2: "Screen2",
  ScreenNotificationAvater: "ScreenNotificationAvater",
  MUIShowcase: "MUIShowcase",
  MUIWorkspaceScreen: "MUIWorkspaceScreen",
  NeonArcadeScreen: "NeonArcadeScreen",
  CryptoChaosDashboard: "CryptoChaosDashboard",
  FoodFrenzyScreen: "FoodFrenzyScreen",
  SpaceMissionControl: "SpaceMissionControl",
  RetroTerminalScreen: "RetroTerminalScreen"
};

function formatProps(props: Record<string, unknown>, indent: string): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (key === "children" && typeof value === "string") {
      lines.push(`${indent}${key}=${JSON.stringify(value)}`);
    } else if (typeof value === "string") {
      lines.push(`${indent}${key}=${JSON.stringify(value)}`);
    } else if (typeof value === "boolean") {
      lines.push(value ? `${indent}${key}` : `${indent}${key}={false}`);
    } else if (typeof value === "number") {
      lines.push(`${indent}${key}={${value}}`);
    } else {
      lines.push(`${indent}${key}={${JSON.stringify(value)}}`);
    }
  }
  return lines.join("\n");
}

function importSpec(componentId: string, exportName: string): { importName: string; jsxName: string } {
  if (componentId === exportName) {
    return { importName: `${componentId} as Ui${componentId}`, jsxName: `Ui${componentId}` };
  }
  return { importName: componentId, jsxName: componentId };
}

function collectUsedComponents(doc: SemanticDocument): Set<SemanticComponentId> {
  const used = new Set<SemanticComponentId>();
  if (doc.root) used.add(doc.root.componentId);
  for (const b of doc.bindings ?? []) used.add(b.componentId);
  return used;
}

export type RenderSemanticOptions = {
  /** `eval` omits import/export for in-browser Babel transform. */
  moduleFormat?: "file" | "eval";
};

function positionedWrapper(
  componentId: string,
  propsBlock: string,
  box?: { x: number; y: number; width: number; height: number }
): string {
  if (!box) {
    return propsBlock.length > 0
      ? `<${componentId}\n${propsBlock}\n        />`
      : `<${componentId} />`;
  }
  return `<div
          style={{
            position: "absolute",
            left: ${box.x},
            top: ${box.y},
            width: ${box.width},
            height: ${box.height},
            pointerEvents: "auto"
          }}
        >
          <${componentId}${propsBlock.length > 0 ? `\n${propsBlock}\n          ` : " "}/>
        </div>`;
}

export function renderSemanticComponentSource(
  doc: SemanticDocument,
  exportName: string,
  options: RenderSemanticOptions = {}
): string {
  const used = collectUsedComponents(doc);
  const imports = [...used]
    .filter((id) => UI_IMPORTS[id])
    .sort();

  const importLines =
    imports.length > 0
      ? `import { ${imports.map((id) => importSpec(id, exportName).importName).join(", ")} } from "@lab/ui";\n`
      : "";

  let body: string;
  if (doc.root) {
    const props = formatProps(doc.root.props, "    ");
    const jsxName = importSpec(doc.root.componentId, exportName).jsxName;
    body =
      props.length > 0
        ? `<${jsxName}\n${props}\n  />`
        : `<${jsxName} />`;
  } else {
    const w = doc.layoutRoot?.box?.width ?? 800;
    const h = doc.layoutRoot?.box?.height ?? 600;
    const layoutLines = doc.layoutRoot?.layoutJsx ?? "";
    const bindingLines = (doc.bindings ?? [])
      .map((b) => {
        const props = formatProps(b.props, "            ");
        const jsxName = importSpec(b.componentId, exportName).jsxName;
        return positionedWrapper(jsxName, props, b.box);
      })
      .join("\n");

    body = `<div
      className="lab-semantic-screen"
      data-figma-component="${exportName}"
      style={{
        width: ${w},
        height: ${h},
        position: "relative",
        overflow: "hidden"
      }}
    >
${layoutLines}
${bindingLines}
    </div>`;
  }

  const fn = `function ${exportName}() {
  return (
    ${body}
  );
}`;

  if (options.moduleFormat === "eval") {
    return fn;
  }

  return `import React from "react";
${importLines}
/**
 * Semantic React delivery — @lab/ui components (ingress: ${doc.ingress}).
 * Regenerated by story-package semantic emitter.
 */
export ${fn}
`;
}

export function renderSemanticComponentFile(doc: SemanticDocument, exportName: string): string {
  return renderSemanticComponentSource(doc, exportName, { moduleFormat: "file" });
}

export function renderSemanticFromContract(
  contract: UniversalDocumentV2,
  options: ContractToSemanticOptions & { exportName: string }
): { semantic: SemanticDocument; source: string; usedComponents: SemanticComponentId[] } {
  const semantic = contractToSemantic(contract, options);
  const source = renderSemanticComponentFile(semantic, options.exportName);
  return { semantic, source, usedComponents: [...collectUsedComponents(semantic)] };
}

export { contractToSemantic };
