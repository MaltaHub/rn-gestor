import type { JSONContent } from "@tiptap/core";
import type { CategoriaDocumento } from "@/lib/domain/venda-documentos/categorias";
import { modelosDaCategoria } from "@/lib/domain/venda-documentos/modelos";
import type { DocumentoTemplateRow } from "@/lib/domain/db";

/** Uma forma de começar o documento: template da loja ou o modelo do sistema. */
export type OpcaoModelo = {
  key: string;
  titulo: string;
  descricao: string | null;
  origem: "loja" | "sistema";
  templateId: string | null;
  /** Feito para venda com veículo na troca (ou cópia de um modelo assim). */
  paraTroca: boolean;
  /** O mais indicado para ESTA venda (com/sem troca). */
  recomendado: boolean;
  conteudo: JSONContent;
};

/** Template personalizado a partir de um modelo do sistema guarda a origem no próprio JSON. */
export function modeloBaseDe(conteudo: unknown): string | null {
  const attrs = (conteudo as JSONContent | null)?.attrs;
  return typeof attrs?.modeloBase === "string" ? attrs.modeloBase : null;
}

/**
 * Opções de uma categoria: os templates ATIVOS da loja e os modelos do sistema
 * (que somem quando a loja já tem a versão personalizada deles). Quando a
 * categoria tem versão para troca (Recibo de Venda com Troca), a que casa com
 * a venda vem primeiro, marcada como recomendada.
 */
export function opcoesDaCategoria(categoria: CategoriaDocumento, templates: DocumentoTemplateRow[], temTroca = false): OpcaoModelo[] {
  const daLoja = templates.filter((tpl) => tpl.is_active && tpl.categoria === categoria);
  const sistema = modelosDaCategoria(categoria);
  const idsTroca = new Set(sistema.filter((modelo) => modelo.paraTroca).map((modelo) => modelo.id));
  const temVariante = idsTroca.size > 0;
  const personalizados = new Set(daLoja.map((tpl) => modeloBaseDe(tpl.conteudo)));

  const opcoes: OpcaoModelo[] = daLoja.map((tpl) => {
    const paraTroca = idsTroca.has(modeloBaseDe(tpl.conteudo) ?? "") || /troca/i.test(tpl.titulo);
    return {
      key: tpl.id,
      titulo: tpl.titulo,
      descricao: tpl.descricao,
      origem: "loja",
      templateId: tpl.id,
      paraTroca,
      recomendado: temVariante && paraTroca === temTroca,
      conteudo: (tpl.conteudo as JSONContent) ?? { type: "doc", content: [{ type: "paragraph" }] }
    };
  });
  for (const modelo of sistema) {
    if (personalizados.has(modelo.id)) continue;
    opcoes.push({
      key: modelo.id,
      titulo: daLoja.length > 0 ? `${modelo.titulo} (modelo do sistema)` : modelo.titulo,
      descricao: modelo.descricao,
      origem: "sistema",
      templateId: null,
      paraTroca: modelo.paraTroca,
      recomendado: temVariante && modelo.paraTroca === temTroca,
      conteudo: modelo.conteudo as JSONContent
    });
  }
  // Recomendado primeiro (o cursor da lista começa nele).
  return opcoes.sort((a, b) => Number(b.recomendado) - Number(a.recomendado));
}

/**
 * Qual modelo usar sem perguntar: única opção, ou — sem template da loja na
 * disputa — o modelo do sistema que casa com a venda (com/sem troca).
 */
export function escolhaAutomatica(opcoes: OpcaoModelo[]): OpcaoModelo | null {
  if (opcoes.length === 1) return opcoes[0];
  if (opcoes.every((opcao) => opcao.origem === "sistema")) {
    const recomendadas = opcoes.filter((opcao) => opcao.recomendado);
    if (recomendadas.length === 1) return recomendadas[0];
  }
  return null;
}
