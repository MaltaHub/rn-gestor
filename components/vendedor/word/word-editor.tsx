"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/variables";
import { buildExtensions, normalizeDoc } from "@/components/vendedor/word/tiptap-config";
import { renderDocumentHTML, printDocument } from "@/components/vendedor/word/print-document";
import { WordSurface } from "@/components/vendedor/word/word-surface";
import { updateDocumento } from "@/components/vendedor/word/api";
import { MARGINS, asMarginKey, type MarginKey } from "@/components/vendedor/word/margins";

const AUTOSAVE_DELAY_MS = 900;

type SaveStatus = "idle" | "saving" | "saved" | "error";

type WordEditorProps = {
  auth: RequestAuth;
  documentoId: string;
  initialTitulo: string;
  initialConteudo: JSONContent;
  contexto: VendaDocContext;
  onSaved?: (doc: { id: string; titulo: string }) => void;
};

export function WordEditor({
  auth,
  documentoId,
  initialTitulo,
  initialConteudo,
  contexto,
  onSaved
}: WordEditorProps) {
  const [titulo, setTitulo] = useState(initialTitulo);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [preview, setPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [margin, setMargin] = useState<MarginKey>(asMarginKey(initialConteudo?.attrs?.pageMargin));

  const timerRef = useRef<number | null>(null);
  const tituloRef = useRef(initialTitulo);
  const marginRef = useRef(margin);
  marginRef.current = margin;

  const save = useCallback(async () => {
    if (!editorRef.current) return;
    setStatus("saving");
    try {
      const tituloFinal = tituloRef.current.trim() || "Sem titulo";
      const json = editorRef.current.getJSON();
      json.attrs = { ...(json.attrs ?? {}), pageMargin: marginRef.current };
      await updateDocumento(auth, documentoId, {
        titulo: tituloFinal,
        conteudo: json
      });
      setStatus("saved");
      onSaved?.({ id: documentoId, titulo: tituloFinal });
    } catch {
      setStatus("error");
    }
  }, [auth, documentoId, onSaved]);

  const scheduleSave = useCallback(() => {
    setStatus("saving");
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
  }, [save]);

  const editor = useEditor({
    extensions: buildExtensions(),
    content: normalizeDoc(initialConteudo),
    immediatelyRender: false,
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

  function openPreview() {
    if (!editor) return;
    setPreviewHtml(renderDocumentHTML(editor.getJSON(), contexto));
    setPreview(true);
  }

  function handlePrint() {
    if (!editor) return;
    printDocument(renderDocumentHTML(editor.getJSON(), contexto), tituloRef.current || "Documento", MARGINS[margin].mm);
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

  return (
    <div className="word-editor">
      <div className="word-editor-head">
        <input
          className="word-title-input"
          value={titulo}
          onChange={(e) => handleTituloChange(e.target.value)}
          placeholder="Titulo do documento"
          aria-label="Titulo do documento"
        />
        <div className="word-editor-actions">
          <select
            className="word-tb-select"
            title="Margens da pagina"
            aria-label="Margens da pagina"
            value={margin}
            onChange={(e) => changeMargin(e.target.value as MarginKey)}
          >
            {(Object.keys(MARGINS) as MarginKey[]).map((key) => (
              <option key={key} value={key}>
                Margem: {MARGINS[key].label}
              </option>
            ))}
          </select>
          <span className={`word-save-status is-${status}`}>{statusLabel}</span>
          {preview ? (
            <button type="button" className="word-action-btn" onClick={() => setPreview(false)}>
              Editar
            </button>
          ) : (
            <button type="button" className="word-action-btn" onClick={openPreview}>
              Visualizar
            </button>
          )}
          <button type="button" className="word-action-btn is-primary" onClick={handlePrint}>
            Imprimir / PDF
          </button>
        </div>
      </div>

      {preview ? (
        <div className="word-preview">
          <div
            className="word-print"
            style={{ padding: `${MARGINS[margin].mm}mm` }}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      ) : (
        <WordSurface editor={editor} marginMm={MARGINS[margin].mm} />
      )}
    </div>
  );
}
