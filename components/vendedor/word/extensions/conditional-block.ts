import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { ViewMutationRecord } from "@tiptap/pm/view";
import { findWrapping } from "@tiptap/pm/transform";
import { CONDICAO_PADRAO, CONDICOES, condicaoLabel } from "@/lib/domain/venda-documentos/condicoes";

/**
 * SEÇÃO CONDICIONAL: trecho do template que só sai no documento quando a venda
 * casa com a condição ("Somente se: Financiamento", "Tem veículo na troca"...).
 * No editor aparece com a etiqueta e um seletor da condição; no preview/print
 * (resolveDoc) o bloco é desembrulhado ou some. É o que deixa UM template por
 * categoria no lugar de um por combinação de pagamento/IPVA/troca.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    conditionalBlock: {
      /** Embrulha o(s) bloco(s) da seleção numa seção condicional. */
      insertConditionalBlock: (condicao?: string) => ReturnType;
      /** Tira a condição: o conteúdo volta a valer sempre. */
      removeConditionalBlock: () => ReturnType;
    };
  }
}

function grupos() {
  const map = new Map<string, typeof CONDICOES>();
  for (const condicao of CONDICOES) map.set(condicao.grupo, [...(map.get(condicao.grupo) ?? []), condicao]);
  return Array.from(map.entries());
}

export const ConditionalBlock = Node.create({
  name: "conditionalBlock",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      condicao: {
        default: CONDICAO_PADRAO,
        parseHTML: (element) => element.getAttribute("data-condicao") ?? CONDICAO_PADRAO,
        renderHTML: (attributes) => ({ "data-condicao": String(attributes.condicao ?? CONDICAO_PADRAO) })
      }
    };
  },

  parseHTML() {
    return [{ tag: "div[data-conditional]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-conditional": "", class: "word-cond" }), 0];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("div");
      dom.className = "word-cond";
      dom.setAttribute("data-conditional", "");

      const tag = document.createElement("div");
      tag.className = "word-cond-tag";
      tag.contentEditable = "false";

      const label = document.createElement("span");
      label.className = "word-cond-label";
      label.textContent = "Somente se:";

      const select = document.createElement("select");
      select.className = "word-cond-select";
      select.setAttribute("aria-label", "Condição da seção");
      for (const [grupo, itens] of grupos()) {
        const optgroup = document.createElement("optgroup");
        optgroup.label = grupo;
        for (const item of itens) {
          const option = document.createElement("option");
          option.value = item.key;
          option.textContent = item.label;
          optgroup.appendChild(option);
        }
        select.appendChild(optgroup);
      }
      select.value = String(node.attrs.condicao);
      select.title = condicaoLabel(String(node.attrs.condicao));
      select.addEventListener("change", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return;
        const atual = editor.state.doc.nodeAt(pos);
        if (!atual) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...atual.attrs, condicao: select.value }));
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "word-cond-remove";
      remove.title = "Tirar a condição (o texto passa a sair sempre)";
      remove.setAttribute("aria-label", "Tirar a condição");
      remove.textContent = "×";
      remove.addEventListener("mousedown", (event) => event.preventDefault());
      remove.addEventListener("click", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return;
        editor.chain().focus().setTextSelection(pos + 2).removeConditionalBlock().run();
      });

      tag.append(label, select, remove);
      const content = document.createElement("div");
      content.className = "word-cond-content";
      dom.append(tag, content);

      return {
        dom,
        contentDOM: content,
        update: (updated: PMNode) => {
          if (updated.type.name !== "conditionalBlock") return false;
          select.value = String(updated.attrs.condicao);
          select.title = condicaoLabel(String(updated.attrs.condicao));
          return true;
        },
        // O seletor e o botão cuidam dos próprios eventos (fora do ProseMirror).
        stopEvent: (event: Event) => event.target instanceof HTMLElement && tag.contains(event.target),
        ignoreMutation: (mutation: ViewMutationRecord) => {
          if (mutation.type === "selection") return false;
          return tag.contains(mutation.target);
        }
      };
    };
  },

  addCommands() {
    return {
      insertConditionalBlock:
        (condicao = CONDICAO_PADRAO) =>
        ({ state, tr, dispatch }) => {
          const { $from, $to } = state.selection;
          const range = $from.blockRange($to);
          if (!range) return false;
          const wrapping = findWrapping(range, this.type, { condicao });
          if (!wrapping) return false;
          if (dispatch) tr.wrap(range, wrapping).scrollIntoView();
          return true;
        },

      removeConditionalBlock:
        () =>
        ({ state, tr, dispatch }) => {
          const $from = state.selection.$from;
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name !== this.name) continue;
            const pos = $from.before(depth);
            if (dispatch) tr.replaceWith(pos, pos + node.nodeSize, node.content);
            return true;
          }
          return false;
        }
    };
  }
});
