import { Node, mergeAttributes } from "@tiptap/core";
import {
  applyFloatStyle,
  applyLockState,
  attachFloatingDrag,
  createLockBadge,
  floatStyleString,
  floatingAttributes,
  lockableAttributes
} from "@/components/vendedor/word/extensions/floating";

/**
 * Widget de assinatura: linha + bloco de texto EDITAVEL embaixo (nome do
 * comprador/vendedor, variaveis ${...}, etc.). A linha e a "alca" do widget:
 * clicar nela seleciona o no inteiro (Del apaga) e arrasta (no fluxo ou em
 * posicao livre). Compat: docs antigos guardavam o rotulo em attrs.label —
 * normalizeDoc (tiptap-config.ts) converte para conteudo de texto.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    signatureLine: {
      insertSignatureLine: (label?: string) => ReturnType;
    };
  }
}

export const SignatureLine = Node.create({
  name: "signatureLine",
  group: "block",
  content: "inline*",
  isolating: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return { ...floatingAttributes(), ...lockableAttributes() };
  },

  parseHTML() {
    return [{ tag: "div[data-signature-line]", contentElement: ".word-signature-label" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const fs = floatStyleString(node.attrs);
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-signature-line": "", class: "word-signature" }, fs ? { style: fs } : {}),
      ["div", { class: "word-signature-line" }],
      ["div", { class: "word-signature-label" }, 0]
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const wrapper = document.createElement("div");
      wrapper.className = "word-signature";
      wrapper.setAttribute("data-signature-line", "");

      const line = document.createElement("div");
      line.className = "word-signature-line";
      line.contentEditable = "false";
      wrapper.appendChild(line);

      const label = document.createElement("div");
      label.className = "word-signature-label";
      wrapper.appendChild(label);

      // Alca invisivel sobre a linha (a linha tem altura 0 — alvo de clique
      // inviavel). Nao entra no fluxo, entao nao desloca o layout vs print.
      const grip = document.createElement("div");
      grip.className = "word-signature-grip";
      grip.contentEditable = "false";
      grip.setAttribute("data-drag-handle", "");
      grip.title = "Clique para selecionar a assinatura; arraste para mover";
      wrapper.appendChild(grip);

      // Clicar na alca seleciona o widget inteiro (Del apaga, toolbar reage).
      grip.addEventListener("mousedown", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos === "number") editor.commands.setNodeSelection(pos);
      });

      // Drag nativo (reposicionar no fluxo) so quando o gesto comeca na alca;
      // nunca a partir do texto editavel.
      wrapper.draggable = false;
      wrapper.addEventListener("mousedown", (event) => {
        wrapper.draggable = grip === event.target;
      });

      const lockBadge = createLockBadge({ editor, getPos });
      wrapper.appendChild(lockBadge);

      applyFloatStyle(wrapper, node.attrs);
      applyLockState(wrapper, lockBadge, node.attrs);
      attachFloatingDrag({
        dom: wrapper,
        editor,
        getPos,
        fallbackAttrs: node.attrs,
        shouldIgnore: (target) => label.contains(target)
      });

      return {
        dom: wrapper,
        contentDOM: label,
        update: (updated) => {
          if (updated.type.name !== node.type.name) return false;
          applyFloatStyle(wrapper, updated.attrs);
          applyLockState(wrapper, lockBadge, updated.attrs);
          return true;
        },
        // Mutacoes de atributo/estilo do wrapper (drag, float) nao devem
        // re-parsear o no; o conteudo do label fica com o ProseMirror.
        ignoreMutation: (mutation) => {
          if (mutation.type === "selection") return false;
          return !label.contains(mutation.target);
        }
      };
    };
  },

  addCommands() {
    return {
      // Insere a assinatura + um paragrafo logo apos, e deixa o cursor no
      // paragrafo. Sem isso o no fica selecionado e digitar o substitui.
      insertSignatureLine:
        (label?: string) =>
        ({ state, commands }) => {
          const text = label?.trim() || "Assinatura";
          return commands.insertContentAt(state.selection.to, [
            { type: this.name, content: [{ type: "text", text }] },
            { type: "paragraph" }
          ]);
        }
    };
  }
});
