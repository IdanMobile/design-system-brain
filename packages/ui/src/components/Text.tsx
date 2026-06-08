import React from "react";

type TextProps = {
  variant?: "body" | "caption" | "title";
  children?: React.ReactNode;
  className?: string;
};

export function Text({ variant = "body", children, className }: TextProps) {
  return (
    <span
      className={className ? `lab-text ${variant} ${className}` : `lab-text ${variant}`}
      data-figma-component="Text"
    >
      {children}
    </span>
  );
}
