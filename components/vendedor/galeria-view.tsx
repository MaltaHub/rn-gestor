"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VehicleFlag } from "@/lib/domain/carros/flags";
import { WhatsappButton, type WhatsappSeller } from "@/components/vendedor/whatsapp-button";

export type GaleriaPhoto = { id: string; previewUrl: string };

export function GaleriaView({
  vehicleName,
  whatsappUrl,
  photos,
  flags = [],
  seller
}: {
  vehicleName: string;
  whatsappUrl: string;
  photos: GaleriaPhoto[];
  flags?: VehicleFlag[];
  seller?: WhatsappSeller | null;
}) {
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const closeFocus = useCallback(() => setFocusIndex(null), []);

  // Ao abrir o modo focus, posiciona no slide clicado e trava o scroll do body.
  useEffect(() => {
    if (focusIndex == null) return;
    const scroller = scrollerRef.current;
    const slide = scroller?.children[focusIndex] as HTMLElement | undefined;
    if (scroller && slide) scroller.scrollLeft = slide.offsetLeft;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFocus();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [focusIndex, closeFocus]);

  function nudge(direction: 1 | -1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: direction * scroller.clientWidth, behavior: "smooth" });
  }

  return (
    <>
      <header className="galeria-head">
        <div className="galeria-head-main">
          <h1 className="galeria-veiculo" title={vehicleName}>
            {vehicleName}
          </h1>
          {flags.length > 0 ? (
            <div className="galeria-flags">
              {flags.map((flag) => (
                <span key={flag.label} className={`galeria-flag${flag.highlight ? " is-ipva" : ""}`}>
                  {flag.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <WhatsappButton
          href={whatsappUrl}
          seller={seller}
          className="galeria-whatsapp"
          sellerPrefix="Tenho interesse — falar com "
          fallbackLabel="Tenho interesse — falar no WhatsApp"
          testId="galeria-whatsapp"
        />
      </header>

      {photos.length > 0 ? (
        <div className="galeria-grid">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              className="galeria-thumb"
              onClick={() => setFocusIndex(index)}
              aria-label={`Abrir foto ${index + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.previewUrl} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : (
        <p className="galeria-empty">Nenhuma foto disponivel.</p>
      )}

      {focusIndex != null ? (
        <div className="galeria-focus" role="dialog" aria-modal="true" data-testid="galeria-focus">
          <button type="button" className="galeria-focus-close" onClick={closeFocus} aria-label="Fechar">
            ×
          </button>
          {photos.length > 1 ? (
            <button type="button" className="galeria-focus-nav is-prev" onClick={() => nudge(-1)} aria-label="Foto anterior">
              ‹
            </button>
          ) : null}
          <div className="galeria-focus-scroller" ref={scrollerRef}>
            {photos.map((photo) => (
              <div className="galeria-focus-slide" key={photo.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt={vehicleName} />
              </div>
            ))}
          </div>
          {photos.length > 1 ? (
            <button type="button" className="galeria-focus-nav is-next" onClick={() => nudge(1)} aria-label="Proxima foto">
              ›
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
