import React from "react";

type CheckboxProps = {
  checked?: boolean;
  disabled?: boolean;
  label?: string;
  onChange?: (checked: boolean) => void;
};

export function Checkbox({
  checked = false,
  disabled = false,
  label,
  onChange
}: CheckboxProps) {
  return (
    <label
      className={`lab-checkbox ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}`}
      data-figma-component="Checkbox"
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="lab-checkbox-box" aria-hidden />
      {label ? <span className="lab-checkbox-label">{label}</span> : null}
    </label>
  );
}
