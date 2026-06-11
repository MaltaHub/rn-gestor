import { Node, mergeAttributes } from "@tiptap/core";

/**
 * No inline atomico que representa um token `${...}` do indexador de variaveis.
 * Guarda apenas o `token`; o valor e resolvido no preview/print (resolveToken).
 * No modo edicao o chip mostra o literal `${TOKEN}` em CAIXA ALTA (pedido do
 * Kaic: indexadores sempre UPPERCASE — o valor resolvido tambem sai em caixa
 * alta, ver resolveDoc em tiptap-config.ts).
 *
 * `marks: "_"` permite formatar o chip como texto comum (negrito, fonte,
 * tamanho, cor...). As marks ficam no no e sao COPIADAS para o texto resolvido
 * no print — a formatacao "atravessa" a substituicao.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    variable: {
      insertVariable: (token: string) => ReturnType;
    };
  }
}

/** Exibicao canonica do token no documento (sempre caixa alta). */
export function displayToken(token: string): string {
  return `\${${String(token ?? "").toLocaleUpperCase("pt-BR")}}`;
}

export const Variable = Node.create({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  marks: "_",

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
    return ["span", mergeAttributes(HTMLAttributes, { class: "word-var" }), displayToken(node.attrs.token)];
  },

  renderText({ node }) {
    return displayToken(node.attrs.token);
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
