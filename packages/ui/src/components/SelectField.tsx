import React from "react";

type SelectFieldProps = {
  label?: string;
  value?: string;
  expanded?: boolean;
};

const OPTIONS = ["Spacesuits", "Helmets", "Gloves", "Boots"];

export function SelectField({ label = "Category", value = "Spacesuits", expanded = false }: SelectFieldProps) {
  const [open, setOpen] = React.useState(expanded);
  const [selected, setSelected] = React.useState(value);
  return (
    <div className="lab-select-wrap" data-figma-component="SelectField">
      <p className="lab-field-label">{label}</p>
      <div
        className="lab-select-field"
        role="combobox"
        tabIndex={0}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-pressed-managed="true"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selected}</span>
        <span className="lab-select-chevron">▾</span>
      </div>
      {open && (
        <div className="lab-select-menu" role="listbox">
          {OPTIONS.map((opt) => (
            <p
              key={opt}
              role="option"
              aria-selected={opt === selected}
              onClick={(event) => {
                event.stopPropagation();
                setSelected(opt);
                setOpen(false);
              }}
            >
              {opt}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
