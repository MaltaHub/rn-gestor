"use client";

import { useEffect, useState } from "react";
import { useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { DocumentoTemplateRow } from "@/lib/domain/db";
import { buildExtensions, EMPTY_DOC, normalizeDoc } from "@/components/vendedor/word/tiptap-config";
import { WordSurface } from "@/components/vendedor/word/word-surface";
import {
  createTemplate,
  deleteTemplate,
  fetchTemplates,
  updateTemplate
} from "@/components/vendedor/word/api";

type EditState = { id: string | null; titulo: string; descricao: string; isActive: boolean };

/** Gestao de templates (GERENTE+). Lista + formulario de edicao com o editor. */
export function TemplateManager({ auth, onClose }: { auth: RequestAuth; onClose: () => void }) {
  const [templates, setTemplates] = useState<DocumentoTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const editor = useEditor({
    extensions: buildExtensions(),
    content: EMPTY_DOC,
    immediatelyRender: false,
    editorProps: { attributes: { class: "word-editor-content", spellcheck: "true", lang: "pt-BR" } }
  });

  function load() {
    setLoading(true);
    fetchTemplates(auth, true)
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar templates."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth]);

  function startNew() {
    setError(null);
    setEdit({ id: null, titulo: "", descricao: "", isActive: true });
    editor?.commands.setContent(EMPTY_DOC);
  }

  function startEdit(tpl: DocumentoTemplateRow) {
    setError(null);
    setEdit({ id: tpl.id, titulo: tpl.titulo, descricao: tpl.descricao ?? "", isActive: tpl.is_active });
    editor?.commands.setContent(normalizeDoc((tpl.conteudo as JSONContent) ?? EMPTY_DOC));
  }

  async function handleSave() {
    if (!edit || !editor) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        titulo: edit.titulo.trim() || "Template",
        descricao: edit.descricao.trim() || null,
        conteudo: editor.getJSON(),
        is_active: edit.isActive
      };
      if (edit.id) await updateTemplate(auth, edit.id, payload);
      else await createTemplate(auth, payload);
      setEdit(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar template.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir este template? Esta acao nao pode ser desfeita.")) return;
    try {
      await deleteTemplate(auth, id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir template.");
    }
  }

  return (
    <div className="word-modal-overlay" role="dialog" aria-modal="true" aria-label="Gerenciar templates">
      <div className="word-modal is-wide" onClick={(e) => e.stopPropagation()}>
        <div className="word-modal-head">
          <h3>{edit ? (edit.id ? "Editar template" : "Novo template") : "Gerenciar templates"}</h3>
          <button type="button" className="word-modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        {error ? <p className="word-error">{error}</p> : null}

        {edit ? (
          <div className="word-modal-body">
            <div className="word-template-form">
              <input
                className="word-title-input"
                placeholder="Titulo do template"
                value={edit.titulo}
                onChange={(e) => setEdit({ ...edit, titulo: e.target.value })}
              />
              <input
                className="word-desc-input"
                placeholder="Descricao (opcional)"
                value={edit.descricao}
                onChange={(e) => setEdit({ ...edit, descricao: e.target.value })}
              />
              <label className="word-check">
                <input
                  type="checkbox"
                  checked={edit.isActive}
                  onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })}
                />
                Ativo (aparece no seletor)
              </label>
            </div>
            <div className="word-editor">
              <WordSurface editor={editor} />
            </div>
            <div className="word-modal-foot">
              <button type="button" className="word-action-btn" onClick={() => setEdit(null)} disabled={saving}>
                Cancelar
              </button>
              <button type="button" className="word-action-btn is-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Salvando..." : "Salvar template"}
              </button>
            </div>
          </div>
        ) : (
          <div className="word-modal-body">
            <button type="button" className="word-action-btn is-primary" onClick={startNew}>
              + Novo template
            </button>
            {loading ? <p className="word-hint">Carregando...</p> : null}
            {!loading && templates.length === 0 ? <p className="word-hint">Nenhum template ainda.</p> : null}
            <ul className="word-template-list">
              {templates.map((tpl) => (
                <li key={tpl.id} className="word-template-row">
                  <div className="word-template-info">
                    <strong>{tpl.titulo}</strong>
                    {!tpl.is_active ? <span className="word-badge">inativo</span> : null}
                    {tpl.descricao ? <span className="word-template-desc">{tpl.descricao}</span> : null}
                  </div>
                  <div className="word-template-row-actions">
                    <button type="button" className="word-action-btn" onClick={() => startEdit(tpl)}>
                      Editar
                    </button>
                    <button type="button" className="word-action-btn is-danger" onClick={() => void handleDelete(tpl.id)}>
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
