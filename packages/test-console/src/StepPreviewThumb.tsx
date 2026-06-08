import { useState } from "react";
import { ImageLightbox } from "./ImageLightbox";

export function StepPreviewThumb({ title, previewUrl }: { title: string; previewUrl: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="step-preview-link"
        title="Click to enlarge"
        onClick={() => setOpen(true)}
      >
        <img
          className="step-preview-thumb"
          src={previewUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      </button>
      {open ? (
        <ImageLightbox title={title} imageUrl={previewUrl} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
