"use client";

import type { JSONContent } from "@tiptap/core";
import { confirmDialog } from "@/components/ui/dialog/confirm";
import { MARGINS, asMarginKey } from "@/components/vendedor/word/margins";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/contexto";
import { camposVazios } from "@/lib/domain/venda-documentos/preflight";

/**
 * Imprime conferindo antes os campos que sairiam em branco (CPF, endereço...).
 * O renderizador (Tiptap) é carregado sob demanda — o /vender não paga por ele
 * até alguém imprimir. Devolve false se o vendedor preferir completar a venda.
 */
export async function conferirEImprimir(conteudo: JSONContent, ctx: VendaDocContext, titulo: string): Promise<boolean> {
  const vazios = camposVazios(conteudo, ctx);
  if (vazios.length > 0) {
    const nomes = vazios.map((campo) => campo.label);
    const ok = await confirmDialog({
      title: vazios.length === 1 ? "1 campo vai sair em branco" : `${vazios.length} campos vão sair em branco`,
      message: `${nomes.join(", ")}. Complete os dados da venda no Vender ou imprima assim mesmo.`,
      confirmLabel: "Imprimir assim mesmo",
      cancelLabel: "Voltar"
    });
    if (!ok) return false;
  }
  const { printDocument, renderDocumentHTML } = await import("@/components/vendedor/word/print-document");
  printDocument(renderDocumentHTML(conteudo, ctx), titulo || "Documento", MARGINS[asMarginKey(conteudo.attrs?.pageMargin)].mm);
  return true;
}
