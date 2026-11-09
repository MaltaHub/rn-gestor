/**
 * Contrato das rotas /api/v1/vendedor/** (lista de veículos e painel da venda).
 * Só tipos — importável no cliente.
 */
import type { SituacaoVenda } from "@/lib/domain/vendas/situacao";
import type { DocumentoResumo } from "@/lib/domain/venda-documentos/checklist";
import type { EntradaTipo, VendaEstagio } from "@/lib/domain/vendas/schemas";

export type SituacaoFiltro = Exclude<SituacaoVenda, "indisponivel"> | "todos";

export const SITUACAO_FILTROS: SituacaoFiltro[] = ["disponivel", "reservado", "vendido", "entregue", "finalizado", "todos"];

export type VendaResumoLista = {
  id: string;
  estadoVenda: string;
  estagio: VendaEstagio;
  compradorNome: string | null;
  dataVenda: string | null;
  dataEntrega: string | null;
  valorTotal: number | null;
};

export type VeiculoVendedorItem = {
  carroId: string;
  placa: string;
  modelo: string | null;
  anoFab: number | null;
  anoMod: number | null;
  cor: string | null;
  hodometro: number | null;
  preco: number | null;
  estadoVenda: string;
  coverUrl: string | null;
  situacao: SituacaoVenda;
  venda: VendaResumoLista | null;
  /** Documentos Word da venda ativa. */
  documentos: number;
};

export type ContagemSituacoes = Record<Exclude<SituacaoFiltro, "todos">, number>;

export type ListaVeiculosVendedor = {
  itens: VeiculoVendedorItem[];
  total: number;
  /** Só quando pedido (`contagens=1`). */
  contagens: ContagemSituacoes | null;
};

export type VendaEntradaDetalhe = {
  id: string;
  tipo: EntradaTipo;
  valor: number | null;
  cartao_parcelas_qtde: number | null;
  cartao_parcela_valor: number | null;
  carro_troca_id: string | null;
  descricao: string | null;
  /** Carro da troca já cadastrado (para exibir no form). */
  troca: { placa: string | null; modelo: string | null; anoMod: number | null; cor: string | null } | null;
};

/** Linha de `vendas` + entradas (forma usada pelo fluxo de venda). */
export type VendaAtiva = Record<string, unknown> & {
  id: string;
  carro_id: string;
  estado_venda: string;
  estagio: VendaEstagio;
  venda_entradas: VendaEntradaDetalhe[];
};

export type CarroPainel = {
  id: string;
  placa: string;
  modelo: string | null;
  anoFab: number | null;
  anoMod: number | null;
  cor: string | null;
  hodometro: number | null;
  preco: number | null;
  chassi: string | null;
  renavam: string | null;
  estadoVenda: string;
  anoIpvaPago: number | null;
  temChaveReserva: boolean | null;
  temManual: boolean | null;
  local: string | null;
  coverUrl: string | null;
};

/** Arquivo da pasta de documentos do veículo (o tipo sai do nome, no cliente: matchDocumentType). */
export type ArquivoVeiculo = {
  id: string;
  fileName: string;
  mimeType: string;
  previewUrl: string | null;
  downloadUrl: string | null;
  updatedAt: string;
};

export type PainelVeiculo = {
  carro: CarroPainel;
  situacao: SituacaoVenda;
  venda: VendaAtiva | null;
  documentos: DocumentoResumo[];
  arquivos: ArquivoVeiculo[];
};
