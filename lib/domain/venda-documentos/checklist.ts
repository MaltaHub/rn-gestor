/**
 * Checklist documental de UMA venda: para cada categoria, se ela é esperada
 * nesta situação (obrigatória/recomendada/opcional), quais documentos Word já
 * foram gerados e se a via assinada já está arquivada na pasta do veículo.
 * Puro — o /vender e o /word só desenham o resultado.
 */
import {
  CATEGORIAS,
  isCategoriaDocumento,
  sugerirCategoria,
  type CategoriaDocumento,
  type CategoriaInfo,
  type ChecklistVendaInput,
  type Relevancia
} from "@/lib/domain/venda-documentos/categorias";

export type DocumentoResumo = {
  id: string;
  titulo: string;
  categoria: string | null;
  updatedAt: string;
};

export type ItemChecklist = {
  categoria: CategoriaInfo;
  /** null = não esperada nesta venda (aparece só porque já há documento). */
  relevancia: Relevancia | null;
  documentos: DocumentoResumo[];
  /** A via assinada (tipo de arquivo da categoria) já está na pasta do veículo. */
  arquivado: boolean;
  /** Esperada e ainda sem documento gerado. */
  pendente: boolean;
};

/** Categoria efetiva de um documento (os antigos, sem categoria, pelo título). */
export function categoriaDoDocumento(doc: Pick<DocumentoResumo, "categoria" | "titulo">): CategoriaDocumento {
  if (isCategoriaDocumento(doc.categoria)) return doc.categoria;
  return sugerirCategoria(doc.titulo) ?? "outro";
}

export function montarChecklist(
  venda: ChecklistVendaInput,
  documentos: DocumentoResumo[],
  /** Tipos de arquivo presentes na pasta do veículo (DOCUMENT_TYPES keys). */
  tiposArquivados: ReadonlySet<string> = new Set()
): ItemChecklist[] {
  const porCategoria = new Map<CategoriaDocumento, DocumentoResumo[]>();
  for (const doc of documentos) {
    const key = categoriaDoDocumento(doc);
    porCategoria.set(key, [...(porCategoria.get(key) ?? []), doc]);
  }

  const itens: ItemChecklist[] = [];
  for (const categoria of CATEGORIAS) {
    const relevancia = categoria.relevancia(venda);
    const docs = porCategoria.get(categoria.key) ?? [];
    if (relevancia == null && docs.length === 0) continue;
    itens.push({
      categoria,
      relevancia,
      documentos: docs,
      arquivado: Boolean(categoria.arquivoTipo && tiposArquivados.has(categoria.arquivoTipo)),
      pendente: (relevancia === "obrigatorio" || relevancia === "recomendado") && docs.length === 0
    });
  }
  return itens;
}

export function resumoChecklist(itens: ItemChecklist[]) {
  return {
    obrigatoriosPendentes: itens.filter((item) => item.pendente && item.relevancia === "obrigatorio").length,
    pendentes: itens.filter((item) => item.pendente).length,
    gerados: itens.filter((item) => item.documentos.length > 0).length
  };
}
