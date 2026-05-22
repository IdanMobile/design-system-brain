import React from "react";

type Option = { label: string; value: string };

type RadioGroupFieldProps = {
  label?: string;
  options?: Option[];
  selected?: string;
  disabled?: boolean;
};

export function RadioGroupField({
  label = "Delivery",
  options = [
    { label: "Standard", value: "standard" },
    { label: "Express", value: "express" },
    { label: "Pickup", value: "pickup" }
  ],
  selected = "express",
  disabled = false
}: RadioGroupFieldProps) {
  return (
    <div className={`lab-radio-group ${disabled ? "disabled" : ""}`} data-figma-component="RadioGroupField">
      <p className="lab-field-label">{label}</p>
      <div className="lab-radio-options">
        {options.map((option) => (
          <label key={option.value} className="lab-radio-option">
            <span className={`lab-radio-indicator ${selected === option.value ? "selected" : ""}`} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
