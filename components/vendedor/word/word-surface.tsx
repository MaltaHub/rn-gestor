"use client";

import { promptDialog } from "@/components/ui/dialog/confirm";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import { resolveToken, VARIAVEIS_DISPONIVEIS, type VariavelInfo } from "@/lib/domain/venda-documentos/variables";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/contexto";
import { WordEditorToolbar } from "@/components/vendedor/word/word-editor-toolbar";
import { PX_PER_MM } from "@/components/vendedor/word/extensions/floating";
import { docTypographyCss } from "@/components/vendedor/word/doc-styles";
import { MARGINS, type MarginKey } from "@/components/vendedor/word/margins";
import {
  ZOOM_ATALHOS,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_PADRAO,
  degrau,
  escalaQueCabe,
  lerZoomSalvo,
  rotuloZoom,
  zoomPelaRoda,
  type ZoomEstado
} from "@/components/vendedor/word/zoom";
import { Icon } from "@/components/vendedor/ui/icons";

// Mesma tipografia do print (doc-styles.ts) aplicada ao conteudo do editor.
const EDITOR_TYPOGRAPHY_CSS = docTypographyCss(".word-paper .word-editor-content");

const LOGO_SRC = "/logo.png";
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const VARS_KEY = "rn.word.variaveis";
const ZOOM_KEY = "rn.word.zoom";
const FOLHA = { largura: PAGE_W_MM * PX_PER_MM, altura: PAGE_H_MM * PX_PER_MM };

/** O contêiner que rola o papel (o palco do /word, o corpo do editor de templates). */
function paiComRolagem(el: HTMLElement): HTMLElement | null {
  for (let atual = el.parentElement; atual; atual = atual.parentElement) {
    const { overflowY } = window.getComputedStyle(atual);
    if (overflowY === "auto" || overflowY === "scroll") return atual;
  }
  return null;
}

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
 * (formatacao + inserir + margens, estilo Word) + canvas cinza com folha(s) A4
 * e a barra de ZOOM no canto (−/+, largura, pagina inteira, Ctrl+roda) +
 * painel de variaveis. Com `contexto` (venda real ou venda de exemplo), cada
 * variavel mostra o valor que vai sair no papel.
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
  const [zoomEstado, setZoomEstado] = useState<ZoomEstado>(ZOOM_PADRAO);
  const [espaco, setEspaco] = useState({ largura: FOLHA.largura, altura: FOLHA.altura });
  const [pages, setPages] = useState(1);
  const [busca, setBusca] = useState("");
  const [painelAberto, setPainelAberto] = useState(true);

  useEffect(() => setPainelAberto(lerPainelAberto()), []);

  useEffect(() => {
    try {
      setZoomEstado(lerZoomSalvo(window.localStorage.getItem(ZOOM_KEY)));
    } catch {
      // Sem storage: começa ajustado à largura.
    }
  }, []);

  const mudarZoom = useCallback((proximo: ZoomEstado) => {
    setZoomEstado(proximo);
    try {
      window.localStorage.setItem(ZOOM_KEY, JSON.stringify(proximo));
    } catch {
      // Sem storage: vale só nesta tela.
    }
  }, []);

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

  // Espaço visível para o papel: base dos modos "largura" e "página inteira".
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const scroller = paiComRolagem(canvas);
    const update = () =>
      setEspaco({
        largura: Math.max(120, canvas.clientWidth - 40),
        altura: Math.max(160, (scroller?.clientHeight ?? window.innerHeight) - 96)
      });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(canvas);
    if (scroller) ro.observe(scroller);
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

  const zoomLargura = escalaQueCabe(espaco, FOLHA, "largura");
  const zoomPagina = escalaQueCabe(espaco, FOLHA, "pagina");
  const zoom = zoomEstado.modo === "largura" ? zoomLargura : zoomEstado.modo === "pagina" ? zoomPagina : zoomEstado.valor;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Ctrl+roda (e a pinça do touchpad) sobre o papel: zoom do papel, não da página.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      mudarZoom({ modo: "livre", valor: zoomPelaRoda(zoomRef.current, event.deltaY) });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [mudarZoom]);

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
          <div className="word-canvas-scroll">
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
          <ZoomBar zoom={zoom} estado={zoomEstado} zoomLargura={zoomLargura} zoomPagina={zoomPagina} paginas={pages} onZoom={mudarZoom} />
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

/**
 * Barra de zoom no canto do papel (como a do Word): páginas, −, a porcentagem
 * (com os modos de ajuste e os atalhos), +, ajustar à largura e página inteira.
 * Os botões não roubam o foco do editor.
 */
function ZoomBar({
  zoom,
  estado,
  zoomLargura,
  zoomPagina,
  paginas,
  onZoom
}: {
  zoom: number;
  estado: ZoomEstado;
  zoomLargura: number;
  zoomPagina: number;
  paginas: number;
  onZoom: (proximo: ZoomEstado) => void;
}) {
  const valorSelect = estado.modo === "livre" ? `v:${estado.valor}` : estado.modo;
  const livreForaDosAtalhos = estado.modo === "livre" && !(ZOOM_ATALHOS as readonly number[]).includes(estado.valor);
  const manterFoco = (event: React.MouseEvent) => event.preventDefault();

  return (
    <div className="word-zoombar" role="toolbar" aria-label="Barra de zoom" data-testid="word-zoombar">
      <span className="word-zoombar-pages">{paginas === 1 ? "1 página" : `${paginas} páginas`}</span>
      <span className="word-zoombar-sep" aria-hidden="true" />
      <button
        type="button"
        className="word-zoombar-btn"
        onMouseDown={manterFoco}
        onClick={() => onZoom({ modo: "livre", valor: degrau(zoom, -1) })}
        disabled={zoom <= ZOOM_MIN}
        title="Diminuir o zoom (Ctrl + roda do mouse)"
        aria-label="Diminuir o zoom"
        data-testid="word-zoom-menos"
      >
        <Icon name="minus" size={16} />
      </button>
      <select
        className="word-zoombar-select"
        value={valorSelect}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "largura" || value === "pagina") onZoom({ modo: value, valor: 1 });
          else onZoom({ modo: "livre", valor: Number(value.slice(2)) });
        }}
        aria-label="Zoom do papel"
        title="Zoom do papel"
        data-testid="word-zoom-valor"
      >
        <option value="largura">{`Largura · ${rotuloZoom(zoomLargura)}`}</option>
        <option value="pagina">{`Página inteira · ${rotuloZoom(zoomPagina)}`}</option>
        {livreForaDosAtalhos ? <option value={`v:${estado.valor}`}>{rotuloZoom(estado.valor)}</option> : null}
        {ZOOM_ATALHOS.map((valor) => (
          <option key={valor} value={`v:${valor}`}>
            {rotuloZoom(valor)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="word-zoombar-btn"
        onMouseDown={manterFoco}
        onClick={() => onZoom({ modo: "livre", valor: degrau(zoom, 1) })}
        disabled={zoom >= ZOOM_MAX}
        title="Aumentar o zoom (Ctrl + roda do mouse)"
        aria-label="Aumentar o zoom"
        data-testid="word-zoom-mais"
      >
        <Icon name="plus" size={16} />
      </button>
      <span className="word-zoombar-sep" aria-hidden="true" />
      <button
        type="button"
        className="word-zoombar-btn"
        onMouseDown={manterFoco}
        onClick={() => onZoom({ modo: "largura", valor: 1 })}
        aria-pressed={estado.modo === "largura"}
        title="Ajustar à largura"
        aria-label="Ajustar à largura"
      >
        <Icon name="fitWidth" size={16} />
      </button>
      <button
        type="button"
        className="word-zoombar-btn"
        onMouseDown={manterFoco}
        onClick={() => onZoom({ modo: "pagina", valor: 1 })}
        aria-pressed={estado.modo === "pagina"}
        title="Página inteira"
        aria-label="Página inteira"
      >
        <Icon name="fitPage" size={16} />
      </button>
    </div>
  );
}
