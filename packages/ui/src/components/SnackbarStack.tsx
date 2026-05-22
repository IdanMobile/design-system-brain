import React from "react";

type SnackbarStackProps = {
  dense?: boolean;
};

export function SnackbarStack({ dense = false }: SnackbarStackProps) {
  return (
    <div className={`lab-snackbar-stack ${dense ? "dense" : ""}`} data-figma-component="SnackbarStack">
      <div className="snackbar success">Design synced successfully</div>
      <div className="snackbar warning">2 components need review</div>
      <div className="snackbar info">New token update available</div>
    </div>
  );
}
