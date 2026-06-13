"use client";

import type { JSONContent } from "@tiptap/core";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/variables";
import { EMPTY_DOC } from "@/components/vendedor/word/tiptap-config";
import { renderDocumentHTML } from "@/components/vendedor/word/print-document";
import { MARGINS, asMarginKey } from "@/components/vendedor/word/margins";
import { docTypographyCss } from "@/components/vendedor/word/doc-styles";

// Mesma tipografia do print aplicada às miniaturas (1ª página real, em escala).
export const THUMB_TYPOGRAPHY_CSS = docTypographyCss(".word-thumb-page .word-print");

const EMPTY_CTX: VendaDocContext = {};

/**
 * Miniatura real (1ª página) de um documento/template: renderiza o conteúdo
 * Tiptap como o print faz, em escala. Sem contexto de venda, os tokens ${...}
 * resolvem vazio — basta para visualizar o layout. Use junto de
 * THUMB_TYPOGRAPHY_CSS (injete uma vez no container).
 */
export function DocThumbPage({
  conteudo,
  contexto
}: {
  conteudo?: JSONContent | null;
  contexto?: VendaDocContext;
}) {
  const doc = (conteudo ?? EMPTY_DOC) as JSONContent;
  const html = renderDocumentHTML(doc, contexto ?? EMPTY_CTX);
  const marginMm = MARGINS[asMarginKey(doc?.attrs?.pageMargin)].mm;
  return (
    <div className="word-thumb-page" aria-hidden="true">
      <div className="word-print" style={{ padding: `${marginMm}mm` }}>
        <div className="word-print-anchor" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
