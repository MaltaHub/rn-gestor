import { Node } from "@tiptap/core";
import { PX_PER_MM } from "@/components/vendedor/word/extensions/floating";
import { MARGINS, asMarginKey } from "@/components/vendedor/word/margins";

/**
 * Quebra de pagina manual (Ctrl+Enter ou botao da toolbar).
 *
 * No print vira `break-before: page` + um espacador com a altura da margem
 * superior (recriando a margem no topo da pagina nova). No editor o NodeView
 * "preenche" ate o inicio da proxima folha A4 + margem — o conteudo seguinte
 * comeca exatamente onde comecara no papel (WYSIWYG).
 */
const PAGE_H_MM = 297;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      insertPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  marks: "",

  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },

  renderHTML() {
    return ["div", { "data-page-break": "", class: "word-page-break" }];
  },

  addNodeView() {
    return ({ editor, getPos }) => {
      const dom = document.createElement("div");
      dom.className = "word-page-break";
      dom.setAttribute("data-page-break", "");
      dom.contentEditable = "false";

      const tag = document.createElement("span");
      tag.className = "word-page-break-tag";
      tag.textContent = "Quebra de página";
      dom.appendChild(tag);

      // Clique seleciona o no (Del apaga).
      dom.addEventListener("mousedown", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos === "number") editor.commands.setNodeSelection(pos);
      });

      let raf = 0;
      const recalc = () => {
        raf = 0;
        const paper = dom.closest(".word-paper") as HTMLElement | null;
        if (!paper) return;
        const paperRect = paper.getBoundingClientRect();
        // Compensa o zoom/ajuste visual: rects vem em px de tela.
        const scale = paper.offsetWidth > 0 ? paperRect.width / paper.offsetWidth : 1;
        if (scale <= 0) return;
        const top = (dom.getBoundingClientRect().top - paperRect.top) / scale;
        const pageH = PAGE_H_MM * PX_PER_MM;
        const marginMm = MARGINS[asMarginKey(editor.state.doc.attrs?.pageMargin)].mm;
        const boundary = Math.max(1, Math.ceil((top + 1) / pageH)) * pageH;
        const fill = Math.max(boundary - top + marginMm * PX_PER_MM, 18);
        if (Math.abs(fill - dom.offsetHeight) > 1) dom.style.height = `${fill}px`;
      };
      const schedule = () => {
        if (!raf) raf = window.requestAnimationFrame(recalc);
      };

      // Recalcula quando o layout do documento muda (digitacao, margens, ...).
      const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
      ro?.observe(editor.view.dom);
      schedule();

      return {
        dom,
        ignoreMutation: () => true,
        destroy: () => {
          ro?.disconnect();
          if (raf) window.cancelAnimationFrame(raf);
        }
      };
    };
  },

  addCommands() {
    return {
      // Insere em selection.to + paragrafo apos (cursor segue na pagina nova).
      insertPageBreak:
        () =>
        ({ state, commands }) =>
          commands.insertContentAt(state.selection.to, [{ type: this.name }, { type: "paragraph" }])
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => this.editor.commands.insertPageBreak()
    };
  }
});
