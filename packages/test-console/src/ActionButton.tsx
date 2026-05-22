import type { ActionDef } from "./types";

export function ActionButton({
  action,
  disabled,
  recommended,
  layout = "stack",
  onRun
}: {
  action: ActionDef;
  disabled: boolean;
  recommended?: boolean;
  layout?: "stack" | "split";
  onRun: (id: string) => void;
}) {
  const rightHint = action.whenHint ?? action.when;

  if (layout === "split") {
    return (
      <button
        type="button"
        className={`action action-split ${action.sweep ? "sweep-action" : ""} ${recommended ? "recommended-action" : ""}`}
        disabled={disabled}
        onClick={() => onRun(action.id)}
      >
        <div className="action-left">
          <div className="action-head">
            <strong>{action.label}</strong>
            {recommended && <span className="rec-tag">Recommended</span>}
            {action.sweep && !recommended && (
              <span className="rec-tag sweep-tag">Full pipeline</span>
            )}
          </div>
          <span className="action-short">{action.description}</span>
        </div>
        {rightHint && <span className="action-when-hint">{rightHint}</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`action ${action.sweep ? "sweep-action" : ""} ${recommended ? "recommended-action" : ""}`}
      disabled={disabled}
      onClick={() => onRun(action.id)}
    >
      <div className="action-head">
        <strong>{action.label}</strong>
        {recommended && <span className="rec-tag">Recommended</span>}
      </div>
      <span className="action-short">{action.description}</span>
      {rightHint && <span className="action-when-hint action-when-hint--stack">{rightHint}</span>}
    </button>
  );
}
