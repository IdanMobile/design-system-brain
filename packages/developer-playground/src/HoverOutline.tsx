/**
 * Draws an outline over a target DOM node — no pointer events, no capture.
 *
 * Used by Showcase to highlight whatever layer the LayerPanel is currently
 * hovering. The preview itself stays "as before" — no click capture, no
 * overlay above the component. The outline is positioned absolutely inside
 * the same `.showcase-card__preview` wrapper so it scrolls with the card.
 */

import { useEffect, useState } from "react";

export interface HoverOutlineProps {
  containerRef: React.RefObject<HTMLDivElement>;
  target: HTMLElement | null;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function HoverOutline({ containerRef, target }: HoverOutlineProps) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !target) {
      setRect(null);
      return;
    }
    function measure() {
      const containerBox = container!.getBoundingClientRect();
      const targetBox = target!.getBoundingClientRect();
      setRect({
        top: targetBox.top - containerBox.top + container!.scrollTop,
        left: targetBox.left - containerBox.left + container!.scrollLeft,
        width: targetBox.width,
        height: targetBox.height,
      });
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(target);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
    };
  }, [containerRef, target]);

  if (!rect) return null;
  return (
    <div
      className="hover-outline"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
      aria-hidden
    />
  );
}
