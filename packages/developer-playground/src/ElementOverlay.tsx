import React, { useCallback, useEffect, useRef, useState } from "react";

interface ElementOverlayProps {
  /** ID stamped by `data-lab-id` on the currently-selected element, if any. */
  selectedId: string | null;
  /** Called when the designer clicks an interactive element in the preview. */
  onSelect: (labId: string | null) => void;
  /** The preview content; rendered as children. The overlay paints absolutely on top. */
  children: React.ReactNode;
}

/**
 * Renders a position:relative container with `children` (the story preview) and
 * a non-blocking overlay layer that draws hover/selected outlines on top of any
 * `[data-lab-id]` element underneath the cursor. Click is captured by the
 * overlay, mapped to the underlying labId via `document.elementsFromPoint`.
 */
export function ElementOverlay({ selectedId, onSelect, children }: ElementOverlayProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedRect, setSelectedRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selectedId || !stageRef.current) {
      setSelectedRect(null);
      return;
    }
    const el = stageRef.current.querySelector(`[data-lab-id="${selectedId}"]`);
    if (el) {
      setSelectedRect((el as HTMLElement).getBoundingClientRect());
    }
    const recompute = () => {
      const el2 = stageRef.current?.querySelector(`[data-lab-id="${selectedId}"]`);
      if (el2) setSelectedRect((el2 as HTMLElement).getBoundingClientRect());
    };
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [selectedId]);

  const findLabIdAt = useCallback((x: number, y: number): { id: string; rect: DOMRect } | null => {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      const owner = (el as HTMLElement).closest("[data-lab-id]") as HTMLElement | null;
      const id = owner?.getAttribute("data-lab-id");
      if (id && owner) {
        return { id, rect: owner.getBoundingClientRect() };
      }
    }
    return null;
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const hit = findLabIdAt(e.clientX, e.clientY);
      if (!hit) {
        setHoveredId(null);
        setHoveredRect(null);
        return;
      }
      setHoveredId(hit.id);
      setHoveredRect(hit.rect);
    },
    [findLabIdAt]
  );

  const onPointerLeave = useCallback(() => {
    setHoveredId(null);
    setHoveredRect(null);
  }, []);

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const hit = findLabIdAt(e.clientX, e.clientY);
      if (hit) {
        e.preventDefault();
        e.stopPropagation();
        onSelect(hit.id);
      } else {
        onSelect(null);
      }
    },
    [findLabIdAt, onSelect]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSelect(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelect]);

  const stageRect = stageRef.current?.getBoundingClientRect();
  const toStage = (r: DOMRect | null): React.CSSProperties | null => {
    if (!r || !stageRect) return null;
    return {
      position: "absolute",
      left: r.left - stageRect.left,
      top: r.top - stageRect.top,
      width: r.width,
      height: r.height,
      pointerEvents: "none"
    };
  };

  const hoveredStyle = toStage(hoveredRect);
  const selectedStyle = toStage(selectedRect);

  return (
    <div className="element-overlay" ref={stageRef}>
      {children}
      <div
        className="element-overlay__catcher"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
        aria-hidden="true"
      />
      {hoveredStyle && hoveredId !== selectedId && (
        <div className="element-overlay__hover" style={hoveredStyle} />
      )}
      {selectedStyle && (
        <div className="element-overlay__selected" style={selectedStyle} />
      )}
    </div>
  );
}
