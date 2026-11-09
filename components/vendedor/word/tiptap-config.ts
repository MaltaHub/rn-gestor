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
import { ConditionalBlock } from "@/components/vendedor/word/extensions/conditional-block";
import { avaliarCondicao } from "@/lib/domain/venda-documentos/condicoes";
import { resolveToken, type VendaDocContext } from "@/lib/domain/venda-documentos/variables";

// Doc com atributos de margem de pagina e do modelo de origem (persistidos no JSON).
const DocWithMargin = Document.extend({
  addAttributes() {
    return { pageMargin: { default: "normal" }, modeloBase: { default: null } };
  }
});

/**
 * Conjunto de extensoes do editor Word. Compartilhado entre a edicao (useEditor)
 * e a geracao de HTML para preview/impressao — assim o que se ve no editor casa
 * com o que imprime.
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
    Column,
    ConditionalBlock
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

export type ResolveOptions = {
  /**
   * "avaliar" (padrao): seções condicionais saem só quando a venda casa.
   * "todas": mostra todas (miniatura de template, sem venda para avaliar).
   */
  condicoes?: "avaliar" | "todas";
};

/** Texto resolvido -> nós de texto; "\n" vira quebra de linha (mesmas marks). */
function textoComQuebras(text: string, marks: JSONContent["marks"]): JSONContent[] {
  const extra = marks ? { marks } : {};
  return text.split("\n").flatMap((linha, index) => {
    const nodes: JSONContent[] = index > 0 ? [{ type: "hardBreak", ...extra }] : [];
    if (linha) nodes.push({ type: "text", text: linha, ...extra });
    return nodes;
  });
}

function resolveNodes(node: JSONContent, ctx: VendaDocContext, options: ResolveOptions): JSONContent[] {
  if (node.type === "variable") {
    const token = typeof node.attrs?.token === "string" ? node.attrs.token : "";
    const text = resolveToken(ctx, token).toLocaleUpperCase("pt-BR");
    return text ? textoComQuebras(text, node.marks) : [];
  }
  if (node.type === "conditionalBlock") {
    const vale = options.condicoes === "todas" || avaliarCondicao(ctx, String(node.attrs?.condicao ?? ""));
    return vale ? (node.content ?? []).flatMap((child) => resolveNodes(child, ctx, options)) : [];
  }
  if (Array.isArray(node.content)) {
    return [{ ...node, content: node.content.flatMap((child) => resolveNodes(child, ctx, options)) }];
  }
  return [node];
}

/**
 * Substitui nos `variable` pelo texto resolvido contra o contexto do processo e
 * resolve as seções condicionais. Tokens que resolvem para vazio sao removidos
 * (texto vazio e invalido no PM). O valor sai em CAIXA ALTA (indexadores sempre
 * UPPERCASE) e HERDA as marks do chip (negrito, fonte, tamanho...).
 */
export function resolveDoc(node: JSONContent, ctx: VendaDocContext, options: ResolveOptions = {}): JSONContent | null {
  return resolveNodes(node, ctx, options)[0] ?? null;
}
