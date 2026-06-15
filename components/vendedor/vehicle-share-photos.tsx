"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ApiClientError,
  fetchVehicleShareLink,
  fetchVehiclePhotos,
  type VehiclePhotoItem
} from "@/components/ui-grid/api";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";

function triggerDownload(url: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function VehicleSharePhotos({
  carroId,
  carroName,
  onClose
}: {
  carroId: string;
  carroName: string;
  onClose: () => void;
}) {
  const auth = useVendedorAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [photos, setPhotos] = useState<VehiclePhotoItem[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchVehicleShareLink({ requestAuth: auth, carroId }),
      fetchVehiclePhotos({ requestAuth: auth, carroId })
    ])
      .then(([link, photosData]) => {
        if (!active) return;
        setUrl(link.url);
        setPhotos(photosData.photos);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof ApiClientError || err instanceof Error ? err.message : "Falha ao carregar o link.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auth, carroId]);

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copiado.");
    } catch {
      setStatus("Nao foi possivel copiar — selecione e copie manualmente.");
    }
  }

  async function shareNative() {
    if (!url) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: carroName, text: `Fotos: ${carroName}`, url });
        return;
      } catch {
        /* usuário cancelou ou indisponível: cai para copiar */
      }
    }
    await copyLink();
  }

  function downloadAll() {
    const downloadable = photos.filter((photo) => photo.downloadUrl);
    if (downloadable.length === 0) {
      setStatus("Nenhuma foto disponivel para baixar.");
      return;
    }
    downloadable.forEach((photo, index) => {
      window.setTimeout(() => triggerDownload(photo.downloadUrl as string, photo.fileName), index * 300);
    });
    setStatus(`Baixando ${downloadable.length} foto(s)...`);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="vendedor-modal-overlay" data-testid="vendedor-share-overlay">
      <div className="vendedor-modal is-sm" role="dialog" aria-modal="true">
        <header className="vendedor-modal-head">
          <div>
            <strong>Compartilhar fotos</strong>
            <p>{carroName}</p>
          </div>
          <button type="button" className="vendedor-btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </header>

        <div className="vendedor-modal-body">
          {loading ? <p className="vendedor-hint">Carregando link...</p> : null}

          {url ? (
            <>
              <label className="vendedor-field">
                <span>Link das fotos</span>
                <input readOnly value={url} onFocus={(event) => event.currentTarget.select()} data-testid="vendedor-share-url" />
              </label>
              <div className="vendedor-share-actions">
                <button
                  type="button"
                  className="vendedor-btn-primary"
                  onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                  data-testid="vendedor-share-open"
                >
                  Abrir link
                </button>
                <button type="button" className="vendedor-btn-ghost" onClick={() => void copyLink()} data-testid="vendedor-share-copy">
                  Copiar
                </button>
                <button type="button" className="vendedor-btn-ghost" onClick={() => void shareNative()} data-testid="vendedor-share-native">
                  Compartilhar
                </button>
                <button type="button" className="vendedor-btn-ghost" onClick={downloadAll} data-testid="vendedor-share-download">
                  Baixar fotos
                </button>
              </div>
              <p className="vendedor-hint">Link fixo — para de funcionar automaticamente quando o veiculo for vendido.</p>
            </>
          ) : null}

          {error ? <p className="vendedor-error">{error}</p> : null}
          {status ? <p className="vendedor-ok">{status}</p> : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
