import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Bloco de DUAS COLUNAS independentes (estilo "Colunas" do Word).
 * `columnBlock` contem exatamente duas `column`; cada coluna aceita blocos
 * normais (paragrafos, titulos, listas, assinatura...) com formatacao propria.
 *
 * Layout = flex com gap fixo em mm, declarado em doc-styles.ts (compartilhado
 * editor/preview/print) -> a geometria das colunas e identica no papel.
 * `isolating` impede Backspace/Delete de fundir o conteudo entre colunas.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columnBlock: {
      insertColumnBlock: () => ReturnType;
      removeColumnBlock: () => ReturnType;
    };
  }
}

export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-word-column]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-word-column": "", class: "word-column" }), 0];
  }
});

export const ColumnBlock = Node.create({
  name: "columnBlock",
  group: "block",
  content: "column column",
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-word-columns]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-word-columns": "", class: "word-columns" }), 0];
  },

  addCommands() {
    return {
      // Insere em selection.to (nunca substitui a selecao) + paragrafo apos,
      // com o cursor dentro da primeira coluna. Nao permite aninhar colunas.
      insertColumnBlock:
        () =>
        ({ state, editor, commands }) => {
          if (editor.isActive(this.name)) return false;
          const at = state.selection.to;
          const inserted = commands.insertContentAt(at, [
            {
              type: this.name,
              content: [
                { type: "column", content: [{ type: "paragraph" }] },
                { type: "column", content: [{ type: "paragraph" }] }
              ]
            },
            { type: "paragraph" }
          ]);
          if (inserted) commands.setTextSelection(at + 3); // dentro do 1o paragrafo da 1a coluna
          return inserted;
        },

      // Converte o bloco de colunas de volta em texto corrido (preserva o
      // conteudo das duas colunas, em sequencia).
      removeColumnBlock:
        () =>
        ({ state, tr, dispatch }) => {
          const $from = state.selection.$from;
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name !== this.name) continue;
            const pos = $from.before(depth);
            const blocks: PMNode[] = [];
            node.forEach((col) => col.forEach((block) => blocks.push(block)));
            if (dispatch) tr.replaceWith(pos, pos + node.nodeSize, blocks);
            return true;
          }
          return false;
        }
    };
  }
});
