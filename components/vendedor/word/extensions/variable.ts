import { Node, mergeAttributes } from "@tiptap/core";

/**
 * No inline atomico que representa um token `${...}` do indexador de variaveis.
 * Guarda apenas o `token`; o valor e resolvido no preview/print (resolveToken).
 * No modo edicao o chip mostra o literal `${token}`.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    variable: {
      insertVariable: (token: string) => ReturnType;
    };
  }
}

export const Variable = Node.create({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      token: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-token") ?? "",
        renderHTML: (attributes) => ({ "data-token": String(attributes.token ?? "") })
      }
    };
  },

  parseHTML() {
    return [{ tag: "span[data-token]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "word-var" }),
      `\${${node.attrs.token}}`
    ];
  },

  renderText({ node }) {
    return `\${${node.attrs.token}}`;
  },

  addCommands() {
    return {
      // Insere em selection.to (apos a selecao) — NUNCA substitui o no/selecao
      // atual. Sem isto, inserir com uma imagem/no selecionado apagava o no.
      insertVariable:
        (token: string) =>
        ({ state, commands }) =>
          commands.insertContentAt(state.selection.to, { type: this.name, attrs: { token } })
    };
  }
});
