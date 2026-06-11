import type { Extensions, JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Document from "@tiptap/extension-document";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import { ResizableImage } from "@/components/vendedor/word/extensions/resizable-image";
import { FontSize } from "@/components/vendedor/word/extensions/font-size";
import { Variable } from "@/components/vendedor/word/extensions/variable";
import { SignatureLine } from "@/components/vendedor/word/extensions/signature-line";
import { PageBreak } from "@/components/vendedor/word/extensions/page-break";
import { Column, ColumnBlock } from "@/components/vendedor/word/extensions/columns";
import { resolveToken, type VendaDocContext } from "@/lib/domain/venda-documentos/variables";

// Doc com atributo de margem de pagina (persistido no JSON do documento).
const DocWithMargin = Document.extend({
  addAttributes() {
    return { pageMargin: { default: "normal" } };
  }
});

/**
 * Conjunto de extensoes do editor Word. Compartilhado entre a edicao (useEditor)
 * e a geracao de HTML para preview/impressao (generateHTML) — assim o que se ve
 * no editor casa com o que imprime.
 *
 * StarterKit 2.27 NAO habilita textStyle, entao TextStyle entra explicito
 * (Color/FontFamily/FontSize dependem dele).
 */
export function buildExtensions(): Extensions {
  return [
    // document: false -> usamos o DocWithMargin (com atributo de margem).
    StarterKit.configure({ document: false }),
    DocWithMargin,
    Underline,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    FontFamily,
    FontSize,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    ResizableImage.configure({ inline: false, allowBase64: true }),
    Variable,
    SignatureLine,
    PageBreak,
    ColumnBlock,
    Column
  ];
}

export const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Compat: a signatureLine antiga era atomica com o rotulo em attrs.label.
 * Hoje o rotulo e conteudo editavel sob a linha — converte label -> texto.
 * (attrs desconhecidos sao descartados pelo ProseMirror ao carregar.)
 */
export function normalizeDoc(node: JSONContent): JSONContent {
  const copy: JSONContent = { ...node };
  if (Array.isArray(copy.content)) copy.content = copy.content.map(normalizeDoc);
  if (copy.type === "signatureLine" && (!copy.content || copy.content.length === 0)) {
    const label = typeof copy.attrs?.label === "string" ? copy.attrs.label.trim() : "";
    if (label) copy.content = [{ type: "text", text: label }];
  }
  return copy;
}

/**
 * Substitui nos `variable` pelo texto resolvido contra o contexto do processo.
 * Tokens que resolvem para vazio sao removidos (texto vazio e invalido no PM).
 * O valor sai em CAIXA ALTA (indexadores sempre UPPERCASE) e HERDA as marks do
 * chip (negrito, fonte, tamanho...) — a formatacao atravessa a substituicao.
 */
export function resolveDoc(node: JSONContent, ctx: VendaDocContext): JSONContent | null {
  if (node.type === "variable") {
    const token = typeof node.attrs?.token === "string" ? node.attrs.token : "";
    const text = resolveToken(ctx, token).toLocaleUpperCase("pt-BR");
    return text ? { type: "text", text, ...(node.marks ? { marks: node.marks } : {}) } : null;
  }
  if (Array.isArray(node.content)) {
    const content = node.content
      .map((child) => resolveDoc(child, ctx))
      .filter((child): child is JSONContent => child !== null);
    return { ...node, content };
  }
  return node;
}
