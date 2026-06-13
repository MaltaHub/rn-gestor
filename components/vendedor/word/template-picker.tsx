"use client";

import { useEffect, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { DocumentoTemplateRow } from "@/lib/domain/db";
import { fetchTemplates } from "@/components/vendedor/word/api";
import { DocThumbPage, THUMB_TYPOGRAPHY_CSS } from "@/components/vendedor/word/doc-thumb";

/** Modal para escolher um template (ou documento em branco) ao criar um doc. */
export function TemplatePicker({
  auth,
  onPick,
  onClose
}: {
  auth: RequestAuth;
  onPick: (template: DocumentoTemplateRow | null) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<DocumentoTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchTemplates(auth)
      .then((rows) => {
        if (alive) setTemplates(rows);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Falha ao carregar templates.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [auth]);

  return (
    <div className="word-modal-overlay" role="dialog" aria-modal="true" aria-label="Escolher template" onClick={onClose}>
      <div className="word-modal is-wide" onClick={(e) => e.stopPropagation()}>
        <div className="word-modal-head">
          <h3>Novo documento</h3>
          <button type="button" className="word-modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="word-modal-body">
          <style dangerouslySetInnerHTML={{ __html: THUMB_TYPOGRAPHY_CSS }} />

          {loading ? <p className="word-hint">Carregando templates...</p> : null}
          {error ? <p className="word-error">{error}</p> : null}

          {/* Mesma visualização em miniatura do corpo principal: cada template
              (e o documento em branco) aparece como a 1ª página real. */}
          <div className="word-thumb-grid">
            <button type="button" className="word-thumb is-pick" onClick={() => onPick(null)}>
              <DocThumbPage />
              <span className="word-thumb-meta">
                <span className="word-thumb-title">Documento em branco</span>
              </span>
            </button>

            {templates.map((tpl) => (
              <button key={tpl.id} type="button" className="word-thumb is-pick" onClick={() => onPick(tpl)}>
                <DocThumbPage conteudo={tpl.conteudo as JSONContent} />
                <span className="word-thumb-meta">
                  <span className="word-thumb-title" title={tpl.descricao ?? undefined}>
                    {tpl.titulo}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {!loading && !error && templates.length === 0 ? (
            <p className="word-hint">Nenhum template disponivel ainda. Comece com um documento em branco.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
