"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/variables";
import { CATEGORIAS, isCategoriaDocumento, type CategoriaDocumento } from "@/lib/domain/venda-documentos/categorias";
import { buildExtensions, normalizeDoc } from "@/components/vendedor/word/tiptap-config";
import { renderDocumentHTML } from "@/components/vendedor/word/print-document";
import { conferirEImprimir } from "@/components/vendedor/word/imprimir";
import { WordSurface } from "@/components/vendedor/word/word-surface";
import { updateDocumento } from "@/components/vendedor/word/api";
import { MARGINS, asMarginKey, type MarginKey } from "@/components/vendedor/word/margins";
import { docTypographyCss } from "@/components/vendedor/word/doc-styles";
import { Icon } from "@/components/vendedor/ui/icons";

// Mesma tipografia do print aplicada ao preview (doc-styles.ts).
const PREVIEW_TYPOGRAPHY_CSS = docTypographyCss(".word-preview .word-print");

const AUTOSAVE_DELAY_MS = 900;

type SaveStatus = "idle" | "saving" | "saved" | "error";

type WordEditorProps = {
  auth: RequestAuth;
  documentoId: string;
  initialTitulo: string;
  initialConteudo: JSONContent;
  /** Categoria do documento (o seletor só aparece quando informada). */
  initialCategoria?: string | null;
  contexto: VendaDocContext;
  onSaved?: (doc: { id: string; titulo: string; categoria: CategoriaDocumento | null }) => void;
  /** Alvos na barra fixa do workspace: linha do titulo e linha do ribbon.
   *  Sem eles (lab, templates) tudo renderiza inline, na mesma ordem. */
  barHeadEl?: HTMLElement | null;
  barRibbonEl?: HTMLElement | null;
};

export function WordEditor({
  auth,
  documentoId,
  initialTitulo,
  initialConteudo,
  initialCategoria,
  contexto,
  onSaved,
  barHeadEl,
  barRibbonEl
}: WordEditorProps) {
  const [titulo, setTitulo] = useState(initialTitulo);
  const [categoria, setCategoria] = useState<CategoriaDocumento | null>(isCategoriaDocumento(initialCategoria) ? initialCategoria : null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [preview, setPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [margin, setMargin] = useState<MarginKey>(asMarginKey(initialConteudo?.attrs?.pageMargin));

  const timerRef = useRef<number | null>(null);
  const tituloRef = useRef(initialTitulo);
  const categoriaRef = useRef(categoria);
  const marginRef = useRef(margin);
  marginRef.current = margin;

  const save = useCallback(async () => {
    if (!editorRef.current) return;
    setStatus("saving");
    try {
      const tituloFinal = tituloRef.current.trim() || "Sem título";
      const json = editorRef.current.getJSON();
      json.attrs = { ...(json.attrs ?? {}), pageMargin: marginRef.current };
      await updateDocumento(auth, documentoId, {
        titulo: tituloFinal,
        conteudo: json,
        ...(initialCategoria !== undefined ? { categoria: categoriaRef.current } : {})
      });
      setStatus("saved");
      onSaved?.({ id: documentoId, titulo: tituloFinal, categoria: categoriaRef.current });
    } catch {
      setStatus("error");
    }
  }, [auth, documentoId, initialCategoria, onSaved]);

  const scheduleSave = useCallback(() => {
    setStatus("saving");
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
  }, [save]);

  const editor = useEditor({
    extensions: buildExtensions(),
    content: normalizeDoc(initialConteudo),
    immediatelyRender: false,
    // O React NÃO re-renderiza a cada tecla: o ribbon lê o estado por useEditorState.
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: "word-editor-content", spellcheck: "true", lang: "pt-BR" }
    },
    onUpdate: () => scheduleSave()
  });

  const editorRef = useRef(editor);
  editorRef.current = editor;

  // Flush pendente ao desmontar (troca de documento).
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        void save();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTituloChange(value: string) {
    setTitulo(value);
    tituloRef.current = value;
    scheduleSave();
  }

  function handleCategoriaChange(value: string) {
    const next = isCategoriaDocumento(value) ? value : null;
    setCategoria(next);
    categoriaRef.current = next;
    scheduleSave();
  }

  function openPreview() {
    if (!editor) return;
    setPreviewHtml(renderDocumentHTML(editor.getJSON(), contexto));
    setPreview(true);
  }

  function handlePrint() {
    if (!editor) return;
    const json = editor.getJSON();
    json.attrs = { ...(json.attrs ?? {}), pageMargin: marginRef.current };
    void conferirEImprimir(json, contexto, tituloRef.current || "Documento");
  }

  function changeMargin(next: MarginKey) {
    setMargin(next);
    marginRef.current = next;
    // Mantem o attr do doc em dia: o NodeView da quebra de pagina le a margem
    // de editor.state.doc.attrs ao calcular o preenchimento ate a folha nova.
    const e = editorRef.current;
    if (e) e.view.dispatch(e.state.tr.setDocAttribute("pageMargin", next));
    scheduleSave();
  }

  const statusLabel =
    status === "saving" ? "Salvando..." : status === "saved" ? "Salvo" : status === "error" ? "Erro ao salvar" : "";

  const head = (
    <>
      <input
        className="word-title-input"
        value={titulo}
        onChange={(e) => handleTituloChange(e.target.value)}
        placeholder="Título do documento"
        aria-label="Título do documento"
      />
      {initialCategoria !== undefined ? (
        <select
          className="word-tb-select word-categoria-select"
          value={categoria ?? ""}
          onChange={(e) => handleCategoriaChange(e.target.value)}
          aria-label="Categoria do documento"
          title="Categoria do documento"
        >
          <option value="">Sem categoria</option>
          {CATEGORIAS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      ) : null}
      <div className="word-editor-actions">
        <span className={`word-save-status is-${status}`} role="status">
          {statusLabel}
        </span>
        {preview ? (
          <button type="button" className="word-action-btn" onClick={() => setPreview(false)}>
            <Icon name="edit" size={16} />
            Editar
          </button>
        ) : (
          <button type="button" className="word-action-btn" onClick={openPreview}>
            <Icon name="eye" size={16} />
            Visualizar
          </button>
        )}
        <button type="button" className="word-action-btn is-primary" onClick={handlePrint}>
          <Icon name="printer" size={16} />
          Imprimir / PDF
        </button>
      </div>
    </>
  );

  return (
    <div className="word-editor">
      {barHeadEl ? createPortal(head, barHeadEl) : <div className="word-editor-head">{head}</div>}

      {preview ? (
        <div className="word-preview">
          <style dangerouslySetInnerHTML={{ __html: PREVIEW_TYPOGRAPHY_CSS }} />
          <div className="word-print" style={{ padding: `${MARGINS[margin].mm}mm` }}>
            {/* Ancora dos flutuantes = area de conteudo (igual ao editor/print). */}
            <div className="word-print-anchor" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
      ) : (
        <WordSurface
          editor={editor}
          marginMm={MARGINS[margin].mm}
          marginKey={margin}
          onMarginChange={changeMargin}
          toolbarContainer={barRibbonEl}
          contexto={contexto}
        />
      )}
    </div>
  );
}
