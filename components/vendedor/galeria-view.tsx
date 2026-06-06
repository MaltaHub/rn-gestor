"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GaleriaPhoto = { id: string; previewUrl: string };

export function GaleriaView({
  vehicleName,
  whatsappUrl,
  photos
}: {
  vehicleName: string;
  whatsappUrl: string;
  photos: GaleriaPhoto[];
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
        <h1 className="galeria-veiculo" title={vehicleName}>
          {vehicleName}
        </h1>
        <a
          className="galeria-whatsapp"
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="galeria-whatsapp"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
            <path
              fill="currentColor"
              d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.02ZM12.04 20.2h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.16 8.16 0 0 1-1.25-4.35c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.23 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.48-1.38-1.73-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z"
            />
          </svg>
          Tenho interesse — falar no WhatsApp
        </a>
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
