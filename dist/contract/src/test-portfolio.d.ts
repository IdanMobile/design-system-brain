/**
 * Cross-suite test portfolio — story list and step definitions for reports / console.
 */
export type TestStepId = "pixel" | "figma" | "figmaLive" | "delivery" | "logic";
export type StepStatus = "not_tested" | "pass" | "warn" | "fail" | "error" | "skipped";
export interface TestStepDef {
    id: TestStepId;
    label: string;
    /** Report output directory under repo root */
    dir: string;
    /** Test console action id */
    actionId: string;
    /** @deprecated Figma export is queued on relay; use STORYBOOK_PARALLEL for load caps. */
    serialOnly?: boolean;
}
export declare const TEST_STEPS: TestStepDef[];
/** Default portfolio story ids (full lab registry). */
export declare const PORTFOLIO_STORY_IDS: string[];
/** Sequential pipeline order — step N requires all prior steps to pass. */
export declare const TEST_STEP_ORDER: readonly TestStepId[];
export declare function isStepPassing(status: StepStatus | undefined): boolean;
/**
 * Effective pipeline status per step — ignores downstream result files when a prior
 * step did not pass (sequential gate). Prevents illegal --no-gate runs from showing
 * as pass/warn on later columns.
 */
export declare function resolvePipelineStatuses(raw: Partial<Record<TestStepId, StepStatus>>, detail?: {
    storybookOnly?: boolean;
}): Record<TestStepId, StepStatus>;
export interface StepGateDenial {
    ok: false;
    blockedBy: TestStepId;
    reason: string;
    priorStatus: StepStatus;
}
export type StepGateResult = {
    ok: true;
} | StepGateDenial;
export declare function canRunStep(stepId: TestStepId, cells: Partial<Record<TestStepId, {
    status?: StepStatus;
}>>, detail?: {
    storybookOnly?: boolean;
}): StepGateResult;
export declare function recommendAction(stepId: TestStepId, status: StepStatus, detail?: {
    percent?: number;
    storybookOnly?: boolean;
    error?: string;
}): string;
/** Row-aware recommendation — surfaces sequential gate when a later step is not_tested. */
export declare function recommendActionForRow(stepId: TestStepId, status: StepStatus, cells: Partial<Record<TestStepId, {
    status?: StepStatus;
}>>, detail?: {
    percent?: number;
    storybookOnly?: boolean;
    error?: string;
}): string;
