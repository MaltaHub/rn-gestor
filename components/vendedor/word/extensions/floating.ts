import type { Editor } from "@tiptap/core";

/**
 * Suporte a "posicao livre" (flutuante) para nos do editor Word (logo, assinatura).
 * Quando `floating`, o no e posicionado em absolute a `left`/`top` em MILIMETROS
 * a partir do canto do papel. mm e unidade absoluta -> a posicao casa no editor
 * (papel com largura fixa A4) e na impressao/PDF (mesma origem).
 */
export const PX_PER_MM = 96 / 25.4;

export type FloatAttrs = { floating?: boolean; left?: number; top?: number };

function numAttr(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Atributos `floating`/`left`/`top` (compartilhados por imagem e assinatura). */
export function floatingAttributes() {
  return {
    floating: {
      default: false,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-floating") === "true",
      renderHTML: (attrs: FloatAttrs) => (attrs.floating ? { "data-floating": "true" } : {})
    },
    left: {
      default: 0,
      parseHTML: (el: HTMLElement) => numAttr(el.getAttribute("data-left"), 0),
      renderHTML: (attrs: FloatAttrs) => (attrs.floating ? { "data-left": String(attrs.left ?? 0) } : {})
    },
    top: {
      default: 0,
      parseHTML: (el: HTMLElement) => numAttr(el.getAttribute("data-top"), 0),
      renderHTML: (attrs: FloatAttrs) => (attrs.floating ? { "data-top": String(attrs.top ?? 0) } : {})
    }
  };
}

/** Trecho de CSS inline para o renderHTML (print/preview). */
export function floatStyleString(attrs: FloatAttrs): string {
  if (!attrs.floating) return "";
  return `position:absolute;left:${attrs.left ?? 0}mm;top:${attrs.top ?? 0}mm;margin:0;z-index:5`;
}

/** Aplica/limpa o posicionamento absoluto no DOM do NodeView. */
export function applyFloatStyle(dom: HTMLElement, attrs: FloatAttrs): void {
  if (attrs.floating) {
    dom.style.position = "absolute";
    dom.style.left = `${attrs.left ?? 0}mm`;
    dom.style.top = `${attrs.top ?? 0}mm`;
    dom.style.margin = "0";
    dom.style.zIndex = "5";
    dom.classList.add("is-floating");
  } else {
    dom.style.position = "";
    dom.style.left = "";
    dom.style.top = "";
    dom.style.zIndex = "";
    dom.classList.remove("is-floating");
  }
}

/**
 * Fator de escala visual aplicado sobre o papel (zoom/ajustar a largura).
 * Deltas de mouse vem em px de TELA; o layout interno fica em px "de papel".
 */
export function visualScale(dom: HTMLElement): number {
  const w = dom.offsetWidth;
  if (!w) return 1;
  const rect = dom.getBoundingClientRect().width;
  return rect > 0 ? rect / w : 1;
}

function currentAttrs(editor: Editor, getPos: (() => number | undefined) | undefined, fallback: FloatAttrs): FloatAttrs {
  const pos = typeof getPos === "function" ? getPos() : undefined;
  if (typeof pos === "number") {
    const node = editor.state.doc.nodeAt(pos);
    if (node) return node.attrs as FloatAttrs;
  }
  return fallback;
}

/**
 * Liga o arrasto livre: ao pressionar o no flutuante e mover, atualiza left/top.
 * Ignora cliques na alca de resize (`.word-img-handle`).
 */
export function attachFloatingDrag(opts: {
  dom: HTMLElement;
  editor: Editor;
  getPos: (() => number | undefined) | undefined;
  fallbackAttrs: FloatAttrs;
  /** Alvos a ignorar (ex.: conteudo editavel dentro do widget). */
  shouldIgnore?: (target: HTMLElement) => boolean;
}): void {
  const { dom, editor, getPos, fallbackAttrs, shouldIgnore } = opts;

  dom.addEventListener("mousedown", (event) => {
    const target = event.target as HTMLElement;
    if (shouldIgnore?.(target)) return;
    const attrs = currentAttrs(editor, getPos, fallbackAttrs);
    if (!attrs.floating) return;
    if (target.classList.contains("word-img-handle")) return;

    event.preventDefault();
    // Seleciona o no: Del apaga e a toolbar mostra as acoes do item.
    const selPos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof selPos === "number") editor.commands.setNodeSelection(selPos);

    const scale = visualScale(dom);
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = attrs.left ?? 0;
    const startTop = attrs.top ?? 0;

    const nextPos = (e: MouseEvent) => ({
      left: Math.round((startLeft + (e.clientX - startX) / scale / PX_PER_MM) * 10) / 10,
      top: Math.round((startTop + (e.clientY - startY) / scale / PX_PER_MM) * 10) / 10
    });

    const onMove = (e: MouseEvent) => {
      const p = nextPos(e);
      dom.style.left = `${p.left}mm`;
      dom.style.top = `${p.top}mm`;
    };
    const onUp = (e: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const p = nextPos(e);
      const pos = typeof getPos === "function" ? getPos() : undefined;
      if (typeof pos !== "number") return;
      editor
        .chain()
        .command(({ tr }) => {
          const node = tr.doc.nodeAt(pos);
          if (!node) return false;
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, left: p.left, top: p.top });
          return true;
        })
        .run();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}
