import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent as ReactMouseEvent
} from "react";
import { createPortal } from "react-dom";
import { isPreviewImageCached, preloadPreviewImage } from "./preview-image-cache";
import { ImageLightbox } from "./ImageLightbox";

type Props = {
  storyId: string;
  originalUrl?: string | null;
  children: ReactNode;
};

export function ItemPreviewTooltip({ storyId, originalUrl, children }: Props) {
  const [open, setOpen] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0, below: false });
  const leaveTimer = useRef<number | null>(null);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const updateCoords = useCallback((target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const below = rect.top < 200;
    setCoords({
      x: rect.left + rect.width / 2,
      y: below ? rect.bottom : rect.top,
      below
    });
  }, []);

  const show = useCallback(
    (target: HTMLElement) => {
      if (!originalUrl) return;
      clearLeaveTimer();
      updateCoords(target);
      setImageFailed(false);
      setOpen(true);
      void preloadPreviewImage(originalUrl);
    },
    [originalUrl, clearLeaveTimer, updateCoords]
  );

  const hideSoon = useCallback(() => {
    clearLeaveTimer();
    leaveTimer.current = window.setTimeout(() => setOpen(false), 160);
  }, [clearLeaveTimer]);

  const openEnlarged = useCallback(
    (e: ReactMouseEvent) => {
      if (!originalUrl || imageFailed) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setEnlarged(true);
    },
    [originalUrl, imageFailed]
  );

  const cached = originalUrl ? isPreviewImageCached(originalUrl) : false;

  const tooltip =
    open && originalUrl
      ? createPortal(
          <div
            className={`item-preview-tooltip${coords.below ? " item-preview-tooltip-below" : ""}`}
            style={{ left: coords.x, top: coords.y }}
            onMouseEnter={clearLeaveTimer}
            onMouseLeave={hideSoon}
            role="tooltip"
          >
            <div className="item-preview-tooltip-title">{storyId}</div>
            <button
              type="button"
              className="item-preview-tooltip-image-btn"
              onClick={openEnlarged}
              title={imageFailed ? undefined : "Click to enlarge"}
              disabled={imageFailed}
            >
              {imageFailed ? (
                <span className="item-preview-tooltip-missing">No preview available</span>
              ) : (
                <img
                  src={originalUrl}
                  alt={`Original for ${storyId}`}
                  decoding="async"
                  loading="eager"
                  className={cached ? "item-preview-tooltip-img-ready" : "item-preview-tooltip-img-loading"}
                  onLoad={(e) => {
                    e.currentTarget.classList.remove("item-preview-tooltip-img-loading");
                    e.currentTarget.classList.add("item-preview-tooltip-img-ready");
                  }}
                  onError={() => setImageFailed(true)}
                />
              )}
            </button>
            {!imageFailed ? (
              <span className="item-preview-tooltip-hint">Click image to enlarge</span>
            ) : null}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <span
        className={`item-name-trigger${originalUrl ? " item-name-trigger-preview" : ""}`}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={hideSoon}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={() => setOpen(false)}
        onClick={originalUrl && !imageFailed ? openEnlarged : undefined}
        tabIndex={originalUrl ? 0 : -1}
      >
        {children}
      </span>
      {tooltip}
      {enlarged && originalUrl ? (
        <ImageLightbox
          title={storyId}
          imageUrl={originalUrl}
          onClose={() => setEnlarged(false)}
        />
      ) : null}
    </>
  );
}
