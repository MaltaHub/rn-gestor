"use client";

import { promptDialog } from "@/components/ui/dialog/confirm";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import { resolveToken, VARIAVEIS_DISPONIVEIS, type VariavelInfo } from "@/lib/domain/venda-documentos/variables";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/contexto";
import { WordEditorToolbar } from "@/components/vendedor/word/word-editor-toolbar";
import { PX_PER_MM } from "@/components/vendedor/word/extensions/floating";
import { docTypographyCss } from "@/components/vendedor/word/doc-styles";
import { MARGINS, type MarginKey } from "@/components/vendedor/word/margins";
import { Icon } from "@/components/vendedor/ui/icons";

// Mesma tipografia do print (doc-styles.ts) aplicada ao conteudo do editor.
const EDITOR_TYPOGRAPHY_CSS = docTypographyCss(".word-paper .word-editor-content");

const LOGO_SRC = "/logo.png";
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const VARS_KEY = "rn.word.variaveis";

const ZOOM_OPTIONS = [
  ["fit", "Ajustar à largura"],
  ["0.5", "50%"],
  ["0.75", "75%"],
  ["1", "100%"],
  ["1.25", "125%"],
  ["1.5", "150%"]
] as const;

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function lerPainelAberto(): boolean {
  try {
    return window.localStorage.getItem(VARS_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * Superficie de edicao compartilhada (documentos e templates): ribbon no topo
 * (formatacao + inserir + margens + zoom + paginas, estilo Word) + canvas cinza
 * com folha(s) A4 + painel de variaveis. Com `contexto` (venda real ou venda
 * de exemplo), cada variavel mostra o valor que vai sair no papel.
 */
export function WordSurface({
  editor,
  marginMm = 18,
  marginKey,
  onMarginChange,
  toolbarContainer,
  contexto
}: {
  editor: Editor | null;
  marginMm?: number;
  /** Quando presentes, o seletor de margens entra no ribbon. */
  marginKey?: MarginKey;
  onMarginChange?: (key: MarginKey) => void;
  /** Alvo do portal do ribbon (a barra fixa do topo do workspace). */
  toolbarContainer?: HTMLElement | null;
  /** Dados da venda para mostrar o valor de cada variavel. */
  contexto?: VendaDocContext | null;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [zoomSel, setZoomSel] = useState<string>("fit");
  const [fitScale, setFitScale] = useState(1);
  const [pages, setPages] = useState(1);
  const [busca, setBusca] = useState("");
  const [painelAberto, setPainelAberto] = useState(true);

  useEffect(() => setPainelAberto(lerPainelAberto()), []);

  function alternarPainel() {
    setPainelAberto((aberto) => {
      try {
        window.localStorage.setItem(VARS_KEY, aberto ? "0" : "1");
      } catch {
        // Sem storage: vale só nesta tela.
      }
      return !aberto;
    });
  }

  const grupos = useMemo(() => {
    const termo = normalizar(busca.trim());
    const map = new Map<string, VariavelInfo[]>();
    for (const variavel of VARIAVEIS_DISPONIVEIS) {
      if (termo && !normalizar(`${variavel.label} ${variavel.token} ${variavel.grupo}`).includes(termo)) continue;
      map.set(variavel.grupo, [...(map.get(variavel.grupo) ?? []), variavel]);
    }
    return Array.from(map.entries());
  }, [busca]);

  const valores = useMemo(() => {
    if (!contexto) return null;
    return new Map(VARIAVEIS_DISPONIVEIS.map((variavel) => [variavel.token, resolveToken(contexto, variavel.token)]));
  }, [contexto]);

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
    // O rotulo e texto editavel sob a linha — edita-se direto no papel.
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

  async function insertImageUrl() {
    const url = await promptDialog({ title: "Inserir imagem por URL", label: "URL da imagem", placeholder: "https://…" });
    if (url) insertImageAt(url.trim());
  }

  // Controles de pagina/visao na ponta direita do ribbon (estilo Word).
  const trailing = (
    <>
      {marginKey && onMarginChange ? (
        <select
          className="word-tb-select"
          title="Margens da página"
          aria-label="Margens da página"
          value={marginKey}
          onChange={(e) => onMarginChange(e.target.value as MarginKey)}
        >
          {(Object.keys(MARGINS) as MarginKey[]).map((key) => (
            <option key={key} value={key}>
              Margem {MARGINS[key].label.toLowerCase()}
            </option>
          ))}
        </select>
      ) : null}
      <label className="word-zoom" title="Zoom do papel">
        <Icon name="zoom" size={16} />
        <select className="word-tb-select" value={zoomSel} onChange={(e) => setZoomSel(e.target.value)} aria-label="Zoom do papel">
          {ZOOM_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <span className="word-page-count">{pages === 1 ? "1 página" : `${pages} páginas`} · A4</span>
      <button
        type="button"
        className={`word-tb-btn has-label has-icon ${painelAberto ? "is-active" : ""}`.trim()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={alternarPainel}
        aria-pressed={painelAberto}
        title={painelAberto ? "Esconder o painel de variáveis" : "Mostrar o painel de variáveis"}
        data-testid="word-toggle-variaveis"
      >
        <Icon name="panel" size={17} />
        <span className="word-tb-text">Variáveis</span>
      </button>
    </>
  );

  const toolbar = (
    <WordEditorToolbar
      editor={editor}
      onInsertSignature={insertSignature}
      onInsertLogo={() => insertImageAt(LOGO_SRC, "220px")}
      onInsertImageUrl={() => void insertImageUrl()}
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
            <div className="word-paper" style={{ padding: `${marginMm}mm`, minHeight: `${pages * PAGE_H_MM}mm` }}>
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
        {painelAberto ? (
          <aside className="word-vars" aria-label="Variáveis disponíveis">
            <div className="word-vars-head">
              <p className="word-vars-title">Variáveis</p>
              <label className="word-vars-search">
                <Icon name="search" size={14} />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar variável" aria-label="Buscar variável" />
              </label>
              <p className="word-vars-hint">
                {valores ? "Clique para inserir. Embaixo, o que sai no papel." : "Clique para inserir no cursor."}
              </p>
            </div>
            <div className="word-vars-scroll">
              {grupos.map(([grupo, itens]) => (
                <div key={grupo} className={`word-vars-group ${grupo === "Cláusulas prontas" ? "is-clausulas" : ""}`.trim()}>
                  <span className="word-vars-group-label">{grupo}</span>
                  <div className="word-vars-chips">
                    {itens.map((item) => {
                      const valor = valores?.get(item.token);
                      return (
                        <button
                          key={item.token}
                          type="button"
                          className="word-var-chip"
                          aria-label={item.label}
                          title={`\${${item.token.toLocaleUpperCase("pt-BR")}}${item.dica ? ` — ${item.dica}` : ""}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => editor?.chain().focus().insertVariable(item.token).run()}
                        >
                          <span className="word-var-chip-label">{item.label}</span>
                          {valores ? (
                            <span className={`word-var-chip-value ${valor ? "" : "is-empty"}`.trim()}>{valor || "vazio"}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {grupos.length === 0 ? <p className="word-vars-hint">Nenhuma variável com esse nome.</p> : null}
            </div>
          </aside>
        ) : null}
      </div>
    </>
  );
}
