import React from "react";

type SelectFieldProps = {
  label?: string;
  value?: string;
  expanded?: boolean;
};

export function SelectField({ label = "Category", value = "Spacesuits", expanded = false }: SelectFieldProps) {
  return (
    <div className="lab-select-wrap" data-figma-component="SelectField">
      <p className="lab-field-label">{label}</p>
      <div className="lab-select-field">
        <span>{value}</span>
        <span className="lab-select-chevron">▾</span>
      </div>
      {expanded && (
        <div className="lab-select-menu">
          <p>Spacesuits</p>
          <p>Helmets</p>
          <p>Gloves</p>
          <p>Boots</p>
        </div>
      )}
    </div>
  );
}
