"use client";

import { useEffect, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { ProcessoVeiculo } from "@/lib/domain/venda-documentos/service";
import type { VendaDocumentoRow } from "@/lib/domain/db";
import { EMPTY_DOC } from "@/components/vendedor/word/tiptap-config";
import { renderDocumentHTML } from "@/components/vendedor/word/print-document";
import { fetchDocumento, fetchVendaDocContext } from "@/components/vendedor/word/api";
import { MARGINS, asMarginKey } from "@/components/vendedor/word/margins";
import { docTypographyCss } from "@/components/vendedor/word/doc-styles";

// Mesma tipografia do print nas miniaturas (sao a 1a pagina real, em escala).
const THUMB_TYPOGRAPHY_CSS = docTypographyCss(".word-thumb-page .word-print");

type GalleryDoc = { row: VendaDocumentoRow; html: string; marginMm: number };

/**
 * Galeria do processo: ao selecionar uma placa, o corpo principal mostra as
 * MINIATURAS reais dos documentos registrados (1a pagina, variaveis resolvidas)
 * — clicar numa miniatura abre o documento no editor.
 */
export function DocumentGallery({
  auth,
  processo,
  refreshKey,
  isAdmin,
  onOpen,
  onNew,
  onDeleteDoc,
  onToggleFinalize,
  onDeleteProcesso
}: {
  auth: RequestAuth;
  processo: ProcessoVeiculo;
  refreshKey: number;
  isAdmin: boolean;
  onOpen: (docId: string) => void;
  onNew: () => void;
  onDeleteDoc: (docId: string) => void;
  onToggleFinalize: () => void;
  onDeleteProcesso: () => void;
}) {
  const [docs, setDocs] = useState<GalleryDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setDocs(null);
    setError(null);
    (async () => {
      try {
        const [ctx, rows] = await Promise.all([
          fetchVendaDocContext(auth, processo.vendaId),
          Promise.all(processo.documentos.map((d) => fetchDocumento(auth, d.id)))
        ]);
        if (!alive) return;
        setDocs(
          rows.map((row) => {
            const conteudo = (row.conteudo as JSONContent) ?? EMPTY_DOC;
            return {
              row,
              html: renderDocumentHTML(conteudo, ctx),
              marginMm: MARGINS[asMarginKey(conteudo?.attrs?.pageMargin)].mm
            };
          })
        );
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Falha ao carregar os documentos.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [auth, processo, refreshKey]);

  return (
    <section className="word-gallery" aria-label={`Documentos de ${processo.placa}`}>
      <style dangerouslySetInnerHTML={{ __html: THUMB_TYPOGRAPHY_CSS }} />
      <header className="word-gallery-head">
        <div className="word-gallery-id">
          <h2 className="word-gallery-placa">{processo.placa}</h2>
          <p className="word-gallery-modelo">
            {processo.modelo ?? "—"}
            {processo.finalizado ? <span className="word-status-badge">Finalizado</span> : null}
          </p>
        </div>
        <div className="word-gallery-actions">
          <button type="button" className="word-action-btn is-primary" onClick={onNew}>
            + Novo documento
          </button>
          <button type="button" className="word-action-btn" onClick={onToggleFinalize}>
            {processo.finalizado ? "Reabrir" : "Finalizar"}
          </button>
          {isAdmin ? (
            <button type="button" className="word-action-btn is-danger" onClick={onDeleteProcesso}>
              Excluir processo
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="word-error">{error}</p> : null}

      {docs === null && !error ? (
        <p className="word-hint">Carregando documentos...</p>
      ) : (
        <div className="word-thumb-grid">
          {(docs ?? []).map((d) => (
            <div key={d.row.id} className="word-thumb">
              <div className="word-thumb-page" aria-hidden="true">
                <div className="word-print" style={{ padding: `${d.marginMm}mm` }}>
                  <div className="word-print-anchor" dangerouslySetInnerHTML={{ __html: d.html }} />
                </div>
              </div>
              <button
                type="button"
                className="word-thumb-open"
                aria-label={`Abrir documento ${d.row.titulo}`}
                title={`Abrir "${d.row.titulo}"`}
                onClick={() => onOpen(d.row.id)}
              />
              <div className="word-thumb-meta">
                <span className="word-thumb-title">{d.row.titulo}</span>
                <button
                  type="button"
                  className="word-doc-del"
                  title="Excluir documento"
                  aria-label={`Excluir documento ${d.row.titulo}`}
                  onClick={() => onDeleteDoc(d.row.id)}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="word-thumb is-new" onClick={onNew}>
            <span className="word-thumb-new-plus" aria-hidden>
              +
            </span>
            Novo documento
          </button>
        </div>
      )}
    </section>
  );
}
