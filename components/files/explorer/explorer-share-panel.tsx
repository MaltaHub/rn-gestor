"use client";

import { copyDialog } from "@/components/ui/dialog/confirm";

import { useState } from "react";

import styles from "@/components/files/explorer/explorer.module.css";
import { Icon } from "@/components/files/explorer/explorer-icons";
import { signedUrlStore } from "@/components/files/explorer/signed-url-store";
import { fetchVehicleShareLink } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { ExplorerFile, ExplorerFolder } from "@/lib/files/explorer-types";

// Mesmo link fixo do /vendedor (GET /carros/:id/compartilhar), cacheado na sessão.
const linkCache = new Map<string, string>();

async function galleryLink(auth: RequestAuth, carroId: string) {
  const cached = linkCache.get(carroId);
  if (cached) return cached;
  const { url } = await fetchVehicleShareLink({ requestAuth: auth, carroId });
  linkCache.set(carroId, url);
  return url;
}

async function filesFromSigned(files: ExplorerFile[]) {
  await signedUrlStore.ensure(
    files.map((file) => file.id),
    "original"
  );
  const blobs = await Promise.all(
    files.map(async (file) => {
      const url = signedUrlStore.get(file.id, "original")?.url;
      if (!url) return null;
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      return new File([blob], file.name, { type: file.mimeType || blob.type });
    })
  );
  return blobs.filter((file): file is File => Boolean(file));
}

/**
 * Compartilhamento embutido no painel de detalhes:
 * - pasta de fotos do veículo → link da galeria pública (o mesmo do /vendedor);
 * - 1+ fotos selecionadas → compartilha os ARQUIVOS (Web Share; no celular vai
 *   direto pro WhatsApp), com download como alternativa.
 */
export function ExplorerSharePanel({
  auth,
  vehicleFolder,
  photos,
  allPhotos,
  onDownload,
  notify
}: {
  auth: RequestAuth;
  vehicleFolder: ExplorerFolder | null;
  /** Fotos selecionadas (vazio = nenhuma seleção). */
  photos: ExplorerFile[];
  /** Todas as fotos da pasta (para "baixar todas"). */
  allPhotos: ExplorerFile[];
  onDownload: (files: ExplorerFile[]) => void;
  notify: (kind: "info" | "error", text: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const carroId = vehicleFolder?.managedCarroId ?? null;
  const title = vehicleFolder?.vehicle?.label ?? vehicleFolder?.displayName ?? "Fotos";

  const run = async (id: string, task: () => Promise<void>) => {
    setBusy(id);
    try {
      await task();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      notify("error", error instanceof Error ? error.message : "Falha ao compartilhar.");
    } finally {
      setBusy(null);
    }
  };

  const copyLink = () =>
    run("copy", async () => {
      if (!carroId) return;
      const url = await galleryLink(auth, carroId);
      try {
        await navigator.clipboard.writeText(url);
        notify("info", "Link da galeria copiado.");
      } catch {
        void copyDialog({ title: "Copie o link da galeria", value: url });
      }
    });

  const openLink = () =>
    run("open", async () => {
      if (!carroId) return;
      window.open(await galleryLink(auth, carroId), "_blank", "noopener,noreferrer");
    });

  const shareLink = () =>
    run("share-link", async () => {
      if (!carroId) return;
      const url = await galleryLink(auth, carroId);
      if (navigator.share) await navigator.share({ title, text: `Fotos: ${title}`, url });
      else {
        await navigator.clipboard.writeText(url);
        notify("info", "Link da galeria copiado.");
      }
    });

  const shareFiles = () =>
    run("share-files", async () => {
      const files = await filesFromSigned(photos);
      if (files.length === 0) {
        notify("error", "Não foi possível carregar as fotos.");
        return;
      }
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files, title, text: title });
        return;
      }
      notify("info", "Este navegador não compartilha arquivos — baixando as fotos.");
      onDownload(photos);
    });

  if (!carroId && photos.length === 0) return null;

  return (
    <div className={styles.paneSection} data-testid="explorer-share-panel">
      <span className={styles.paneKicker}>Compartilhar</span>
      {photos.length > 0 ? (
        <div className={styles.paneActions}>
          <button type="button" className={styles.primaryBtn} onClick={() => void shareFiles()} disabled={busy !== null} data-testid="explorer-share-files">
            <Icon name="upload" size={14} />
            {busy === "share-files" ? "Preparando…" : `Compartilhar ${photos.length} foto${photos.length > 1 ? "s" : ""}`}
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={() => onDownload(photos)}>
            <Icon name="download" size={14} /> Baixar
          </button>
        </div>
      ) : null}
      {carroId ? (
        <>
          <div className={styles.paneActions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => void copyLink()} disabled={busy !== null} data-testid="explorer-share-copy">
              {busy === "copy" ? "Gerando…" : "Copiar link da galeria"}
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={() => void shareLink()} disabled={busy !== null}>
              Enviar link
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={() => void openLink()} disabled={busy !== null}>
              <Icon name="open" size={14} /> Abrir galeria
            </button>
            {photos.length === 0 && allPhotos.length > 0 ? (
              <button type="button" className={styles.secondaryBtn} onClick={() => onDownload(allPhotos)}>
                <Icon name="download" size={14} /> Baixar todas ({allPhotos.length})
              </button>
            ) : null}
          </div>
          <p className={styles.paneHint}>Link fixo da galeria do veículo — para de funcionar quando o veículo é vendido.</p>
        </>
      ) : null}
    </div>
  );
}
