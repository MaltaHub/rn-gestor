import { matchDocumentType } from "@/components/files/document-slots";
import { montarChecklist, type ItemChecklist } from "@/lib/domain/venda-documentos/checklist";
import type { PainelVeiculo } from "@/lib/domain/vendedor/types";

/**
 * Checklist documental a partir do painel do veículo (compartilhado por /vender
 * e /word). Módulo leve de propósito: sem o editor (Tiptap), para o /vender não
 * carregar o Word só para listar os documentos.
 */

/** Tipos de arquivo (DOCUMENT_TYPES) já presentes na pasta do veículo. */
export function tiposArquivados(painel: PainelVeiculo): Set<string> {
  const tipos = new Set<string>();
  for (const arquivo of painel.arquivos) {
    const tipo = matchDocumentType(arquivo.fileName, painel.carro.placa);
    if (tipo) tipos.add(tipo.key);
  }
  return tipos;
}

export function checklistDoPainel(painel: PainelVeiculo): ItemChecklist[] {
  const entradas = (painel.venda?.venda_entradas ?? []).filter((entrada) => (entrada.valor ?? 0) > 0);
  return montarChecklist(
    {
      situacao: painel.situacao,
      temEntrada: entradas.length > 0,
      temTroca: entradas.some((entrada) => entrada.tipo === "carro_troca"),
      tipoTransferencia: typeof painel.venda?.tipo_transferencia === "string" ? painel.venda.tipo_transferencia : null
    },
    painel.documentos,
    tiposArquivados(painel)
  );
}

/** A venda do painel tem veículo na troca (escolhe o Recibo de Venda com Troca). */
export function vendaTemTroca(painel: PainelVeiculo): boolean {
  return (painel.venda?.venda_entradas ?? []).some((entrada) => entrada.tipo === "carro_troca" && (entrada.valor ?? 0) > 0);
}

export function estadoDoItem(item: ItemChecklist): "gerado" | "obrigatorio" | "recomendado" | "opcional" {
  if (item.documentos.length > 0) return "gerado";
  return item.relevancia ?? "opcional";
}
