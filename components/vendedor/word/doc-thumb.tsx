"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/variables";
import { EMPTY_DOC } from "@/components/vendedor/word/tiptap-config";
import { renderDocumentHTML } from "@/components/vendedor/word/print-document";
import { MARGINS, asMarginKey } from "@/components/vendedor/word/margins";
import { docTypographyCss } from "@/components/vendedor/word/doc-styles";

// Mesma tipografia do print aplicada às miniaturas (1ª página real, em escala).
export const THUMB_TYPOGRAPHY_CSS = docTypographyCss(".word-thumb-page .word-print");

/**
 * Miniatura real (1ª página) de um documento/template: o conteúdo Tiptap
 * renderizado como no print, em escala. Só renderiza quando entra na tela
 * (galerias grandes não travam a abertura). Sem contexto de venda, mostra TODAS
 * as seções condicionais e as variáveis vazias — basta para ver o layout. Use
 * junto de THUMB_TYPOGRAPHY_CSS (injete uma vez no contêiner).
 */
export function DocThumbPage({ conteudo, contexto }: { conteudo?: JSONContent | null; contexto?: VendaDocContext | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visivel) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisivel(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisivel(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visivel]);

  const doc = (conteudo ?? EMPTY_DOC) as JSONContent;
  const html = useMemo(() => {
    if (!visivel) return "";
    try {
      return renderDocumentHTML(doc, contexto ?? {}, contexto ? {} : { condicoes: "todas" });
    } catch {
      return "";
    }
  }, [contexto, doc, visivel]);
  const marginMm = MARGINS[asMarginKey(doc?.attrs?.pageMargin)].mm;

  return (
    <div className="word-thumb-page" aria-hidden="true" ref={ref}>
      <div className="word-print" style={{ padding: `${marginMm}mm` }}>
        <div className="word-print-anchor" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
