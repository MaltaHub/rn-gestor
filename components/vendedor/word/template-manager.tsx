"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { FocusDialog, dialogStyles } from "@/components/ui/dialog/focus-dialog";
import { confirmDialog } from "@/components/ui/dialog/confirm";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { DocumentoTemplateRow } from "@/lib/domain/db";
import { CATEGORIAS, categoriaLabel, isCategoriaDocumento, sugerirCategoria, type CategoriaDocumento } from "@/lib/domain/venda-documentos/categorias";
import { amostrasVenda } from "@/lib/domain/venda-documentos/amostras";
import { modeloDaCategoria } from "@/lib/domain/venda-documentos/modelos";
import { buildExtensions, EMPTY_DOC, normalizeDoc } from "@/components/vendedor/word/tiptap-config";
import { renderDocumentHTML } from "@/components/vendedor/word/print-document";
import { WordSurface } from "@/components/vendedor/word/word-surface";
import { DocThumbPage, THUMB_TYPOGRAPHY_CSS } from "@/components/vendedor/word/doc-thumb";
import { docTypographyCss } from "@/components/vendedor/word/doc-styles";
import { MARGINS, asMarginKey, type MarginKey } from "@/components/vendedor/word/margins";
import { modeloBaseDe } from "@/components/vendedor/word/use-novo-documento";
import { createTemplate, deleteTemplate, fetchTemplates, updateTemplate } from "@/components/vendedor/word/api";
import { Icon } from "@/components/vendedor/ui/icons";

const PREVIEW_TYPOGRAPHY_CSS = docTypographyCss(".word-preview .word-print");

type EditState = {
  id: string | null;
  titulo: string;
  descricao: string;
  categoria: CategoriaDocumento | "";
  isActive: boolean;
  modeloBase: string | null;
};

/**
 * Gestão de templates (GERENTE+): templates da loja por categoria e os modelos
 * do sistema ("Personalizar" copia para um template editável). Na edição,
 * "Simular venda" mostra o mesmo template se ajustando a cada dinâmica (à
 * vista, financiado, troca...) — no painel de variáveis e na visualização.
 */
export function TemplateManager({ auth, onClose }: { auth: RequestAuth; onClose: () => void }) {
  const [templates, setTemplates] = useState<DocumentoTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [margin, setMargin] = useState<MarginKey>("normal");
  const [saving, setSaving] = useState(false);
  const [amostraKey, setAmostraKey] = useState<string>("");
  const [preview, setPreview] = useState<string | null>(null);
  const amostras = useMemo(() => amostrasVenda(), []);
  const amostra = amostras.find((item) => item.key === amostraKey) ?? null;
  const pendingContent = useRef<JSONContent | null>(null);

  const editor = useEditor({
    extensions: buildExtensions(),
    content: EMPTY_DOC,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
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

  // O editor monta depois do primeiro render: aplica o conteúdo pendente.
  useEffect(() => {
    if (editor && pendingContent.current) {
      editor.commands.setContent(normalizeDoc(pendingContent.current));
      pendingContent.current = null;
    }
  }, [editor, edit]);

  function abrirEdicao(state: EditState, conteudo: JSONContent) {
    setError(null);
    setPreview(null);
    setEdit(state);
    setMargin(asMarginKey(conteudo?.attrs?.pageMargin));
    if (editor) editor.commands.setContent(normalizeDoc(conteudo));
    else pendingContent.current = conteudo;
  }

  function startNew() {
    abrirEdicao({ id: null, titulo: "", descricao: "", categoria: "", isActive: true, modeloBase: null }, EMPTY_DOC);
  }

  function startEdit(tpl: DocumentoTemplateRow) {
    const conteudo = (tpl.conteudo as JSONContent) ?? EMPTY_DOC;
    abrirEdicao(
      {
        id: tpl.id,
        titulo: tpl.titulo,
        descricao: tpl.descricao ?? "",
        categoria: isCategoriaDocumento(tpl.categoria) ? tpl.categoria : sugerirCategoria(tpl.titulo) ?? "",
        isActive: tpl.is_active,
        modeloBase: modeloBaseDe(conteudo)
      },
      conteudo
    );
  }

  function personalizar(categoria: CategoriaDocumento) {
    const modelo = modeloDaCategoria(categoria);
    abrirEdicao(
      { id: null, titulo: modelo.titulo, descricao: modelo.descricao, categoria, isActive: true, modeloBase: modelo.id },
      modelo.conteudo as JSONContent
    );
  }

  function applyMargin(next: MarginKey) {
    setMargin(next);
    // Mantém o attr do doc em dia (o NodeView da quebra de página lê a margem).
    if (editor) editor.view.dispatch(editor.state.tr.setDocAttribute("pageMargin", next));
  }

  function alternarPreview() {
    if (preview != null || !editor) {
      setPreview(null);
      return;
    }
    const json = editor.getJSON();
    setPreview(renderDocumentHTML(json, amostra?.contexto ?? {}, amostra ? {} : { condicoes: "todas" }));
  }

  async function handleSave() {
    if (!edit || !editor) return;
    setSaving(true);
    setError(null);
    try {
      const conteudo = editor.getJSON();
      conteudo.attrs = { ...(conteudo.attrs ?? {}), pageMargin: margin, modeloBase: edit.modeloBase };
      const payload = {
        titulo: edit.titulo.trim() || "Template",
        descricao: edit.descricao.trim() || null,
        categoria: edit.categoria || null,
        conteudo,
        is_active: edit.isActive
      };
      if (edit.id) await updateTemplate(auth, edit.id, payload);
      else await createTemplate(auth, payload);
      setEdit(null);
      setPreview(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar template.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tpl: DocumentoTemplateRow) {
    const ok = await confirmDialog({
      title: `Excluir "${tpl.titulo}"?`,
      message: "Documentos já gerados com ele continuam como estão.",
      confirmLabel: "Excluir",
      tone: "danger"
    });
    if (!ok) return;
    try {
      await deleteTemplate(auth, tpl.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir template.");
    }
  }

  const grupos = useMemo(() => {
    const ordem = new Map(CATEGORIAS.map((categoria, index) => [categoria.key as string, index]));
    const map = new Map<string, DocumentoTemplateRow[]>();
    for (const tpl of templates) {
      const key = isCategoriaDocumento(tpl.categoria) ? tpl.categoria : "";
      map.set(key, [...(map.get(key) ?? []), tpl]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (ordem.get(a) ?? 99) - (ordem.get(b) ?? 99));
  }, [templates]);

  const personalizados = useMemo(() => new Set(templates.map((tpl) => modeloBaseDe(tpl.conteudo)).filter(Boolean)), [templates]);

  const footer = edit ? (
    <>
      <button type="button" className={dialogStyles.btn} onClick={() => setEdit(null)} disabled={saving}>
        Voltar
      </button>
      <span className={dialogStyles.spacer} />
      <button type="button" className={`${dialogStyles.btn} ${dialogStyles.primary}`} onClick={() => void handleSave()} disabled={saving} data-testid="template-salvar">
        {saving ? "Salvando..." : "Salvar template"}
      </button>
    </>
  ) : null;

  return (
    <FocusDialog
      open
      onClose={onClose}
      title={edit ? (edit.id ? "Editar template" : "Novo template") : "Templates de documentos"}
      subtitle={edit ? undefined : "Um template por categoria basta: forma de pagamento, IPVA e troca se ajustam à venda."}
      size="xl"
      closeOnBackdrop={false}
      busy={saving}
      footer={footer}
      testId="template-manager"
    >
      {error ? <p className={dialogStyles.error}>{error}</p> : null}

      {edit ? (
        <div className="word-tpl-edit">
          <div className="word-tpl-form">
            <input
              className="word-title-input"
              placeholder="Título do template"
              value={edit.titulo}
              onChange={(e) => setEdit({ ...edit, titulo: e.target.value })}
              aria-label="Título do template"
            />
            <select
              className="word-tb-select"
              value={edit.categoria}
              onChange={(e) => setEdit({ ...edit, categoria: isCategoriaDocumento(e.target.value) ? e.target.value : "" })}
              aria-label="Categoria do template"
              data-testid="template-categoria"
            >
              <option value="">Sem categoria</option>
              {CATEGORIAS.map((categoria) => (
                <option key={categoria.key} value={categoria.key}>
                  {categoria.label}
                </option>
              ))}
            </select>
            <input
              className="word-desc-input"
              placeholder="Descrição (opcional)"
              value={edit.descricao}
              onChange={(e) => setEdit({ ...edit, descricao: e.target.value })}
              aria-label="Descrição do template"
            />
            <label className="word-check">
              <input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />
              Ativo
            </label>
          </div>
          <div className="word-tpl-sim">
            <label className="word-tpl-sim-label">
              <Icon name="sale" size={16} />
              Simular venda
              <select
                className="word-tb-select"
                value={amostraKey}
                onChange={(e) => {
                  setAmostraKey(e.target.value);
                  setPreview(null);
                }}
                aria-label="Simular venda"
                data-testid="template-simular"
              >
                <option value="">Sem simulação</option>
                {amostras.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="word-action-btn" onClick={alternarPreview} data-testid="template-visualizar">
              <Icon name={preview != null ? "edit" : "eye"} size={16} />
              {preview != null ? "Editar" : amostra ? "Ver como fica nesta venda" : "Visualizar"}
            </button>
          </div>
          {preview != null ? (
            <div className="word-preview">
              <style dangerouslySetInnerHTML={{ __html: PREVIEW_TYPOGRAPHY_CSS }} />
              <div className="word-print" style={{ padding: `${MARGINS[margin].mm}mm` }}>
                <div className="word-print-anchor" dangerouslySetInnerHTML={{ __html: preview }} />
              </div>
            </div>
          ) : (
            <div className="word-editor">
              <WordSurface editor={editor} marginMm={MARGINS[margin].mm} marginKey={margin} onMarginChange={applyMargin} contexto={amostra?.contexto ?? null} />
            </div>
          )}
        </div>
      ) : (
        <div className="word-tpl-list">
          <style dangerouslySetInnerHTML={{ __html: THUMB_TYPOGRAPHY_CSS }} />
          <div className="word-tpl-list-head">
            <h3>Templates da loja</h3>
            <button type="button" className="word-action-btn is-primary" onClick={startNew}>
              <Icon name="plus" size={16} />
              Novo template
            </button>
          </div>
          {loading ? <p className={dialogStyles.hint}>Carregando...</p> : null}
          {!loading && templates.length === 0 ? (
            <p className={dialogStyles.hint}>Nenhum template próprio ainda — os modelos do sistema abaixo já atendem; personalize se quiser.</p>
          ) : null}
          {grupos.map(([categoria, itens]) => (
            <div key={categoria || "sem"} className="word-tpl-group">
              <span className="word-tpl-group-label">{categoria ? categoriaLabel(categoria) : "Sem categoria"}</span>
              <div className="word-thumb-grid">
                {itens.map((tpl) => (
                  <div key={tpl.id} className={`word-thumb ${!tpl.is_active ? "is-inactive" : ""}`.trim()}>
                    <DocThumbPage conteudo={tpl.conteudo as JSONContent} />
                    <button type="button" className="word-thumb-open" aria-label={`Editar template ${tpl.titulo}`} title={`Editar "${tpl.titulo}"`} onClick={() => startEdit(tpl)} />
                    <div className="word-thumb-meta">
                      <span className="word-thumb-title" title={tpl.descricao ?? undefined}>
                        {tpl.titulo}
                        {!tpl.is_active ? <span className="word-badge"> inativo</span> : null}
                      </span>
                      <button type="button" className="word-doc-del" title="Excluir template" aria-label={`Excluir template ${tpl.titulo}`} onClick={() => void handleDelete(tpl)}>
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="word-tpl-list-head">
            <h3>Modelos do sistema</h3>
            <span className={dialogStyles.hint}>Prontos e dinâmicos. Usados quando a categoria não tem template próprio.</span>
          </div>
          <div className="word-thumb-grid">
            {CATEGORIAS.map((categoria) => {
              const modelo = modeloDaCategoria(categoria.key);
              const jaPersonalizado = personalizados.has(modelo.id);
              return (
                <div key={categoria.key} className="word-thumb">
                  <DocThumbPage conteudo={modelo.conteudo as JSONContent} />
                  <button
                    type="button"
                    className="word-thumb-open"
                    aria-label={`Personalizar ${categoria.label}`}
                    title={jaPersonalizado ? "Já personalizado — cria outra cópia" : "Personalizar (cria um template editável)"}
                    onClick={() => personalizar(categoria.key)}
                  />
                  <div className="word-thumb-meta">
                    <span className="word-thumb-title">{categoria.label}</span>
                    {jaPersonalizado ? <span className="word-badge">personalizado</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </FocusDialog>
  );
}
