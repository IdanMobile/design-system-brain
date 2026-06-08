/**
 * TestReport — produced by test harnesses; consumed by fixers (read-only).
 */
export type EntryPoint = "figma" | "storybook";
export type TestId = "manifestContract" | "structural" | "vsFigmaLive" | "vsStorybook" | "vsReactHtml" | "logic" | "pixel" | "figmaMock" | "figmaLive" | "delivery";
export type FixerId = "figma-manifest-export" | "manifest-to-contract" | "storybook-to-contract" | "contract-to-storybook" | "contract-to-figma" | "code-creator" | "logic-audit";
export interface CompareRef {
    reference: "original" | "storybook" | "contract" | "manifest";
    target: "figmaLive" | "storybook" | "reactHtml" | "renderedHtml" | "figmaMock" | "contract";
}
export interface FailedTestRef {
    testId: TestId;
    label: string;
    compare: CompareRef;
    primaryFixer: FixerId;
    fixerChain: FixerId[];
    verifyCommand: string;
    allowlist: string[];
    forbidden: string[];
    regressionScope: "target-only" | "tier-a" | "tier-c" | "all-screens-manifest";
}
export interface MismatchImages {
    originalCrop?: string | null;
    targetCrop?: string | null;
    diffCrop?: string | null;
    compareSideBySide?: string | null;
}
export interface MismatchEvidence {
    contractNodeIds?: string[];
    manifestNodeIds?: string[];
    message?: string;
}
export interface Mismatch {
    id: string;
    bbox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    wrongPixels: number;
    percentInRegion: number;
    images: MismatchImages;
    evidence?: MismatchEvidence;
    suspectedFixer: FixerId;
    fixPrompt: string;
}
export interface TestReport {
    schemaVersion: "1.0";
    itemId: string;
    entryPoint: EntryPoint;
    failedTest: FailedTestRef;
    tolerance: number;
    global: {
        percent: number;
        maxRegionPercent: number | null;
        status: "pass" | "warn" | "fail" | "error";
        pixelsDiffered?: number;
        pixelsTotal?: number;
    };
    images: {
        original?: string | null;
        target?: string | null;
        diff?: string | null;
        reportHtml?: string | null;
    };
    mismatches: Mismatch[];
    testedAt: string;
    testReportPath?: string;
}
