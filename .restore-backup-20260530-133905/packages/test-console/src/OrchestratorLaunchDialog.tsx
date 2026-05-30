import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentModelOption,
  OrchestratorScope,
  OrchestratorSort,
  PortfolioState,
  RunSettings
} from "./types";

const UNIFIED_STEPS = [
  { id: "structural", label: "Structural" },
  { id: "vsFigmaLive", label: "→ Figma live" },
  { id: "vsStorybook", label: "→ Storybook" },
  { id: "vsReactHtml", label: "→ ReactHtml" },
  { id: "logic", label: "Logic audit" }
] as const;

const DEFAULT_DRAFT: RunSettings = {
  skipPass: true,
  onlyNotTested: false,
  parallelWorkers: 20,
  processPool: false,
  applyToOrchestrator: true,
  agentModel: "composer-2.5-fast",
  agentCli: "cursor",
  scope: "failures_only",
  singleStepId: null,
  sortBy: "step_first",
  maxFixRoundsPerStep: 10,
  maxAutoRetriesWhenStuck: 3,
  maxAgentCallsPerLaunch: 100,
  launchAutoMode: true
};

type Props = {
  open: boolean;
  onClose: () => void;
  initialSettings: RunSettings;
  portfolio: PortfolioState | null;
  agentModelOptions: AgentModelOption[];
  maxParallelWorkers: number;
  orchestratorRunning: boolean;
  onLaunch: (settings: RunSettings, options: { invalidateAll: boolean }) => Promise<void>;
};

function scopeSummary(scope: OrchestratorScope | undefined): string {
  switch (scope) {
    case "full":
      return "Test every item that is not PASS (including warn/fail/not tested).";
    case "fresh_only":
      return "Only rows with no result yet (after Invalidate all).";
    case "single_step":
      return "One pipeline column only.";
    default:
      return "Skip PASS — test and fix fail/warn/not tested only.";
  }
}

export function OrchestratorLaunchDialog({
  open,
  onClose,
  initialSettings,
  portfolio,
  agentModelOptions,
  maxParallelWorkers,
  orchestratorRunning,
  onLaunch
}: Props) {
  const [draft, setDraft] = useState<RunSettings>({ ...DEFAULT_DRAFT, ...initialSettings });
  const [invalidateAll, setInvalidateAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraft({ ...DEFAULT_DRAFT, ...initialSettings });
      setInvalidateAll(false);
      setBusy(false);
      setShowAdvanced(false);
    }
    wasOpenRef.current = open;
  }, [open, initialSettings]);

  const fixModelOptions = useMemo(() => {
    const current = draft.agentModel ?? "composer-2.5-fast";
    if (!current || agentModelOptions.some((o) => o.id === current)) {
      return agentModelOptions;
    }
    return [{ id: current, label: `${current} (saved)` }, ...agentModelOptions];
  }, [agentModelOptions, draft.agentModel]);

  if (!open) return null;

  const patch = (partial: Partial<RunSettings>) =>
    setDraft((prev) => ({ ...prev, ...partial }));

  const handleLaunch = async () => {
    setBusy(true);
    try {
      await onLaunch(draft, { invalidateAll });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="orch-launch-backdrop" role="presentation" onClick={onClose}>
      <div
        className="orch-launch-dialog"
        role="dialog"
        aria-labelledby="orch-launch-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="orch-launch-header">
          <div>
            <h2 id="orch-launch-title">Launch orchestrator</h2>
            <p className="orch-launch-sub">
              Automated test → fix → rebuild over the unified portfolio until all PASS, a safety
              limit, or a human action is required.
            </p>
          </div>
          <button type="button" className="orch-launch-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <p className="orch-launch-meta">
          {portfolio?.storyCount ?? 0} items · Structural → Figma live → Storybook → ReactHtml →
          Logic
        </p>

        <div className="orch-launch-section">
          <h3>Scope</h3>
          <div className="orch-launch-scope-grid">
            {(
              [
                ["failures_only", "Failures & untested"],
                ["full", "Full portfolio"],
                ["fresh_only", "Fresh only"],
                ["single_step", "Single step"]
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="orch-launch-radio">
                <input
                  type="radio"
                  name="scope"
                  checked={(draft.scope ?? "failures_only") === id}
                  onChange={() => patch({ scope: id })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p className="orch-launch-hint">{scopeSummary(draft.scope)}</p>
          {draft.scope === "single_step" ? (
            <label className="orch-launch-field">
              Step
              <select
                value={draft.singleStepId ?? "structural"}
                onChange={(e) => patch({ singleStepId: e.target.value })}
              >
                {UNIFIED_STEPS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="orch-launch-field">
            Work order
            <select
              value={draft.sortBy ?? "step_first"}
              onChange={(e) => patch({ sortBy: e.target.value as OrchestratorSort })}
            >
              <option value="step_first">Pipeline order (Structural first)</option>
              <option value="worst_first">Worst diff % first</option>
            </select>
          </label>
        </div>

        <div className="orch-launch-section">
          <h3>Fix agent</h3>
          <label className="orch-launch-field">
            Agent CLI
            <select
              value={draft.agentCli ?? "cursor"}
              onChange={(e) =>
                patch({
                  agentCli: e.target.value,
                  agentModel:
                    e.target.value === "gemini" ? "gemini-2.5-flash" : "composer-2.5-fast"
                })
              }
            >
              <option value="cursor">Cursor CLI</option>
              <option value="gemini">Gemini CLI</option>
            </select>
          </label>
          <label className="orch-launch-field">
            Fix agent model
            <select
              value={draft.agentModel ?? "composer-2.5-fast"}
              onChange={(e) => patch({ agentModel: e.target.value })}
            >
              {fixModelOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="orch-launch-section">
          <button
            type="button"
            className="orch-launch-advanced-toggle"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide" : "Show"} speed &amp; safety limits
          </button>
          {showAdvanced ? (
            <div className="orch-launch-advanced">
              <label className="run-settings-option">
                <input
                  type="checkbox"
                  checked={draft.processPool}
                  onChange={(e) => patch({ processPool: e.target.checked })}
                />
                <span>
                  <strong>Process pool</strong>
                  <small>Separate Node process per chunk</small>
                </span>
              </label>
              <label className="orch-launch-field">
                Parallel workers
                <input
                  type="range"
                  min={1}
                  max={maxParallelWorkers}
                  value={Math.min(draft.parallelWorkers, maxParallelWorkers)}
                  onChange={(e) => patch({ parallelWorkers: Number(e.target.value) })}
                />
                <output>{draft.parallelWorkers}</output>
              </label>
              <label className="orch-launch-field">
                Max fix rounds per step
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={draft.maxFixRoundsPerStep ?? 10}
                  onChange={(e) => patch({ maxFixRoundsPerStep: Number(e.target.value) })}
                />
              </label>
              <label className="orch-launch-field">
                Max auto-retries when stuck
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={draft.maxAutoRetriesWhenStuck ?? 3}
                  onChange={(e) => patch({ maxAutoRetriesWhenStuck: Number(e.target.value) })}
                />
              </label>
              <label className="orch-launch-field">
                Max agent calls per launch
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={draft.maxAgentCallsPerLaunch ?? 100}
                  onChange={(e) => patch({ maxAgentCallsPerLaunch: Number(e.target.value) })}
                />
              </label>
            </div>
          ) : null}
        </div>

        <label className="orch-launch-invalidate">
          <input
            type="checkbox"
            checked={invalidateAll}
            onChange={(e) => setInvalidateAll(e.target.checked)}
          />
          <span>
            <strong>Invalidate all tests before launch</strong>
            <small>Clears result.json files — every row starts not tested (keeps PNGs)</small>
          </span>
        </label>

        <footer className="orch-launch-footer">
          <button type="button" className="orch-launch-cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="orch-launch-go"
            disabled={busy || orchestratorRunning}
            title={
              orchestratorRunning
                ? "Orchestrator already running"
                : "Save settings, start supervisor in Terminal"
            }
            onClick={() => void handleLaunch()}
          >
            {busy ? "Launching…" : "Launch"}
          </button>
        </footer>
      </div>
    </div>
  );
}
