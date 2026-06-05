"use client";

import { useEffect, useState } from "react";
import type { VehiclePhotoItem } from "@/components/ui-grid/api";

export function VehiclePhotoCarousel({ photos, alt }: { photos: VehiclePhotoItem[]; alt: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [photos]);

  if (photos.length === 0) {
    return (
      <div className="vendedor-carousel is-empty" data-testid="vendedor-carousel-empty">
        <span>Veiculo sem fotos cadastradas.</span>
      </div>
    );
  }

  const safeIndex = Math.min(index, photos.length - 1);
  const current = photos[safeIndex];
  const go = (delta: number) => setIndex((prev) => (prev + delta + photos.length) % photos.length);

  return (
    <div className="vendedor-carousel" data-testid="vendedor-carousel">
      <div className="vendedor-carousel-stage">
        {photos.length > 1 ? (
          <button type="button" className="vendedor-carousel-nav is-prev" onClick={() => go(-1)} aria-label="Foto anterior">
            ‹
          </button>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="vendedor-carousel-image" src={current.previewUrl ?? ""} alt={`${alt} — foto ${safeIndex + 1}`} />
        {photos.length > 1 ? (
          <button type="button" className="vendedor-carousel-nav is-next" onClick={() => go(1)} aria-label="Proxima foto">
            ›
          </button>
        ) : null}
        <span className="vendedor-carousel-counter">
          {safeIndex + 1} / {photos.length}
        </span>
      </div>
      {photos.length > 1 ? (
        <div className="vendedor-carousel-thumbs">
          {photos.map((photo, idx) => (
            <button
              key={photo.id}
              type="button"
              className={`vendedor-carousel-thumb ${idx === safeIndex ? "is-active" : ""}`.trim()}
              onClick={() => setIndex(idx)}
              aria-label={`Ir para foto ${idx + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.previewUrl ?? ""} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
