"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ApiClientError,
  createVehicleShareLink,
  fetchVehiclePhotos,
  type VehiclePhotoItem
} from "@/components/ui-grid/api";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";

const EXPIRY_OPTIONS = [
  { label: "1 hora", minutes: 60 },
  { label: "24 horas", minutes: 60 * 24 },
  { label: "7 dias", minutes: 60 * 24 * 7 }
];

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
  const [minutes, setMinutes] = useState(EXPIRY_OPTIONS[1].minutes);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [photos, setPhotos] = useState<VehiclePhotoItem[]>([]);

  useEffect(() => {
    let active = true;
    fetchVehiclePhotos({ requestAuth: auth, carroId })
      .then((data) => {
        if (active) setPhotos(data.photos);
      })
      .catch(() => {
        /* download apenas indisponível se as fotos não carregarem */
      });
    return () => {
      active = false;
    };
  }, [auth, carroId]);

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    setStatus(null);
    try {
      const result = await createVehicleShareLink({ requestAuth: auth, carroId, expiresInMinutes: minutes });
      setLink({ url: result.url, expiresAt: result.expiresAt });
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : "Falha ao gerar o link.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setStatus("Link copiado.");
    } catch {
      setStatus("Nao foi possivel copiar — selecione e copie manualmente.");
    }
  }

  async function shareNative() {
    if (!link) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: carroName, text: `Fotos: ${carroName}`, url: link.url });
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
          <label className="vendedor-field">
            <span>Validade do link</span>
            <select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} data-testid="vendedor-share-expiry">
              {EXPIRY_OPTIONS.map((option) => (
                <option key={option.minutes} value={option.minutes}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {!link ? (
            <button type="button" className="vendedor-btn-primary" onClick={() => void generate()} disabled={generating} data-testid="vendedor-share-generate">
              {generating ? "Gerando..." : "Gerar link"}
            </button>
          ) : (
            <>
              <label className="vendedor-field">
                <span>Link (somente fotos)</span>
                <input readOnly value={link.url} onFocus={(event) => event.currentTarget.select()} data-testid="vendedor-share-url" />
              </label>
              <div className="vendedor-share-actions">
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
              <p className="vendedor-hint">Expira em {new Date(link.expiresAt).toLocaleString("pt-BR")}.</p>
            </>
          )}

          {error ? <p className="vendedor-error">{error}</p> : null}
          {status ? <p className="vendedor-ok">{status}</p> : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
