import { useEffect } from "react";
import { createPortal } from "react-dom";

export function ImageLightbox({
  title,
  imageUrl,
  onClose
}: {
  title: string;
  imageUrl: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="item-preview-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="item-preview-lightbox-panel" onClick={(e) => e.stopPropagation()}>
        <div className="item-preview-lightbox-header">
          <strong>{title}</strong>
          <button type="button" className="item-preview-lightbox-close" onClick={onClose}>
            Close
          </button>
        </div>
        <img src={imageUrl} alt={title} decoding="async" />
      </div>
    </div>,
    document.body
  );
}
