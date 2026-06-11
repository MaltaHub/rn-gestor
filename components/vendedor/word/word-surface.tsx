"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import { VARIAVEIS_DISPONIVEIS } from "@/lib/domain/venda-documentos/variables";
import { WordEditorToolbar } from "@/components/vendedor/word/word-editor-toolbar";
import { PX_PER_MM } from "@/components/vendedor/word/extensions/floating";
import { docTypographyCss } from "@/components/vendedor/word/doc-styles";
import { MARGINS, type MarginKey } from "@/components/vendedor/word/margins";

// Mesma tipografia do print (doc-styles.ts) aplicada ao conteudo do editor.
const EDITOR_TYPOGRAPHY_CSS = docTypographyCss(".word-paper .word-editor-content");

const LOGO_SRC = "/logo.png";
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;

const ZOOM_OPTIONS = [
  ["fit", "Ajustar à largura"],
  ["0.5", "50%"],
  ["0.75", "75%"],
  ["1", "100%"],
  ["1.25", "125%"],
  ["1.5", "150%"]
] as const;

/**
 * Superficie de edicao compartilhada (documentos e templates): ribbon unico no
 * topo (formatacao + inserir + margens + zoom + paginas, estilo Word) + canvas
 * cinza com folha(s) A4 + painel de variaveis ${...} clicaveis.
 */
export function WordSurface({
  editor,
  marginMm = 18,
  marginKey,
  onMarginChange,
  toolbarContainer
}: {
  editor: Editor | null;
  marginMm?: number;
  /** Quando presentes, o seletor de margens entra no ribbon. */
  marginKey?: MarginKey;
  onMarginChange?: (key: MarginKey) => void;
  /** Alvo do portal do ribbon (a barra fixa do topo do workspace). */
  toolbarContainer?: HTMLElement | null;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [zoomSel, setZoomSel] = useState<string>("fit");
  const [fitScale, setFitScale] = useState(1);
  const [pages, setPages] = useState(1);

  const variaveisPorGrupo = useMemo(() => {
    const map = new Map<string, typeof VARIAVEIS_DISPONIVEIS>();
    for (const v of VARIAVEIS_DISPONIVEIS) {
      const list = map.get(v.grupo) ?? [];
      list.push(v);
      map.set(v.grupo, list);
    }
    return Array.from(map.entries());
  }, []);

  // Zoom "ajustar a largura": a folha inteira visivel sem scroll horizontal.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const available = canvas.clientWidth - 40;
      const scale = available / (PAGE_W_MM * PX_PER_MM);
      setFitScale(Math.min(1.25, Math.max(0.4, Math.round(scale * 100) / 100)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Quantas folhas A4 o conteudo ocupa (altura do conteudo + margens).
  useEffect(() => {
    if (!editor || editor.isDestroyed || typeof ResizeObserver === "undefined") return;
    const el = editor.view.dom as HTMLElement;
    const update = () => {
      const needed = el.offsetHeight + 2 * marginMm * PX_PER_MM;
      setPages(Math.max(1, Math.ceil((needed - 6) / (PAGE_H_MM * PX_PER_MM))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor, marginMm]);

  const zoom = zoomSel === "fit" ? fitScale : Number(zoomSel);

  function insertSignature() {
    // O rotulo agora e texto editavel sob a linha — edita-se direto no papel.
    editor?.chain().focus().insertSignatureLine().run();
  }

  function insertImageAt(src: string, width?: string) {
    if (!editor) return;
    // insertContentAt em selection.to: nunca substitui o no/selecao atual.
    editor
      .chain()
      .focus()
      .insertContentAt(editor.state.selection.to, { type: "image", attrs: { src, width: width ?? null } })
      .run();
  }

  function insertLogo() {
    // Largura padrao sensata (logo nao deve entrar ocupando a largura toda).
    insertImageAt(LOGO_SRC, "220px");
  }

  function insertImageUrl() {
    const url = window.prompt("URL da imagem:");
    if (url) insertImageAt(url);
  }

  // Controles de pagina/visao na ponta direita do ribbon (estilo Word).
  const trailing = (
    <>
      {marginKey && onMarginChange ? (
        <select
          className="word-tb-select"
          title="Margens da pagina"
          aria-label="Margens da pagina"
          value={marginKey}
          onChange={(e) => onMarginChange(e.target.value as MarginKey)}
        >
          {(Object.keys(MARGINS) as MarginKey[]).map((key) => (
            <option key={key} value={key}>
              Margem: {MARGINS[key].label}
            </option>
          ))}
        </select>
      ) : null}
      <label className="word-zoom" title="Zoom do papel">
        🔍
        <select
          className="word-tb-select"
          value={zoomSel}
          onChange={(e) => setZoomSel(e.target.value)}
          aria-label="Zoom do papel"
        >
          {ZOOM_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <span className="word-page-count">{pages === 1 ? "1 página" : `${pages} páginas`} · A4</span>
    </>
  );

  const toolbar = (
    <WordEditorToolbar
      editor={editor}
      onInsertSignature={insertSignature}
      onInsertLogo={insertLogo}
      onInsertImageUrl={insertImageUrl}
      trailing={trailing}
    />
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: EDITOR_TYPOGRAPHY_CSS }} />
      {toolbarContainer ? createPortal(toolbar, toolbarContainer) : toolbar}
      <div className="word-editor-body">
        <div className="word-canvas" ref={canvasRef}>
          <div className="word-paper-zoom" style={{ zoom }}>
            <div
              className="word-paper"
              style={{ padding: `${marginMm}mm`, minHeight: `${pages * PAGE_H_MM}mm` }}
            >
              <EditorContent editor={editor} />
              <div className="word-page-guides" aria-hidden="true">
                {Array.from({ length: pages - 1 }, (_, i) => (
                  <div key={i} className="word-page-guide" style={{ top: `${(i + 1) * PAGE_H_MM}mm` }}>
                    <span>fim da página {i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <aside className="word-vars" aria-label="Variaveis disponiveis">
          <p className="word-vars-title">Variaveis</p>
          <p className="word-vars-hint">Clique para inserir no cursor.</p>
          {variaveisPorGrupo.map(([grupo, itens]) => (
            <div key={grupo} className="word-vars-group">
              <span className="word-vars-group-label">{grupo}</span>
              <div className="word-vars-chips">
                {itens.map((item) => (
                  <button
                    key={item.token}
                    type="button"
                    className="word-var-chip"
                    title={`\${${item.token.toLocaleUpperCase("pt-BR")}} — ${item.label}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => editor?.chain().focus().insertVariable(item.token).run()}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}
