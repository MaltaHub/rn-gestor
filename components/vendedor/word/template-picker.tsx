"use client";

import { useEffect, useState } from "react";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { DocumentoTemplateRow } from "@/lib/domain/db";
import { fetchTemplates } from "@/components/vendedor/word/api";

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
      <div className="word-modal" onClick={(e) => e.stopPropagation()}>
        <div className="word-modal-head">
          <h3>Novo documento</h3>
          <button type="button" className="word-modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="word-modal-body">
          <button type="button" className="word-template-card is-blank" onClick={() => onPick(null)}>
            <strong>Documento em branco</strong>
            <span>Comece do zero.</span>
          </button>

          {loading ? <p className="word-hint">Carregando templates...</p> : null}
          {error ? <p className="word-error">{error}</p> : null}
          {!loading && !error && templates.length === 0 ? (
            <p className="word-hint">Nenhum template disponivel ainda.</p>
          ) : null}

          {templates.map((tpl) => (
            <button key={tpl.id} type="button" className="word-template-card" onClick={() => onPick(tpl)}>
              <strong>{tpl.titulo}</strong>
              {tpl.descricao ? <span>{tpl.descricao}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
