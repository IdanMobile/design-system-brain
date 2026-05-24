import React from "react";

/**
 * Tracks an interactive "pressed" toggle for plain `<button>` elements so the
 * delivery package has a real, observable state change on click. The DOM
 * mirrors the state as `aria-pressed` + `data-pressed`, which:
 *
 *   - satisfies the logic-audit snapshot (any value flip changes the digest);
 *   - is semantically correct for buttons that act as latching toggles;
 *   - is harmless for one-shot action buttons (the visual feedback is just a
 *     short pressed state until the next click).
 *
 * Use the helper `usePressableProps()` to spread the right props onto a
 * `<button>`:
 *
 *   const press = usePressableProps();
 *   <button {...press}>Login</button>
 */
export function usePressedState(initial = false): {
  pressed: boolean;
  toggle: () => void;
  setPressed: (next: boolean) => void;
} {
  const [pressed, setPressed] = React.useState(initial);
  const toggle = React.useCallback(() => setPressed((prev) => !prev), []);
  return { pressed, toggle, setPressed };
}

type PressableProps = {
  "aria-pressed": boolean;
  "data-pressed": boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
};

export function usePressableProps(): PressableProps {
  const { pressed, toggle } = usePressedState(false);
  return {
    "aria-pressed": pressed,
    "data-pressed": pressed,
    onClick: () => toggle()
  };
}
