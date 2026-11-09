/**
 * Catálogo dos documentos da venda de um veículo usado por loja (curadoria).
 *
 * Cada categoria diz o que o documento prova e QUANDO ele entra no ciclo da
 * venda — é o que alimenta o checklist do /vender e o "Novo documento" do Word
 * (o vendedor só escolhe a categoria). A lista de chaves é a mesma do CHECK de
 * `documento_templates.categoria` / `venda_documentos.categoria`
 * (migration 20261109180000) — mude os dois juntos.
 *
 * Referências: Código Civil arts. 417–420 (sinal/arras), CDC art. 26, II
 * (garantia legal de 90 dias em bem durável, contada da entrega), CTB art. 123
 * §1º (30 dias para o comprador transferir) e art. 134 (comunicação de venda).
 * Fora do Word (registrados como ARQUIVO na pasta do veículo): nota fiscal de
 * saída, ATPV-e, documento de identidade e comprovante de endereço do comprador.
 */
import type { SituacaoVenda } from "@/lib/domain/vendas/situacao";

export const CATEGORIA_KEYS = [
  "recibo_sinal",
  "recibo_venda",
  "contrato_venda",
  "termo_troca",
  "procuracao_transferencia",
  "termo_entrega",
  "termo_garantia",
  "outro"
] as const;

export type CategoriaDocumento = (typeof CATEGORIA_KEYS)[number];

export type Relevancia = "obrigatorio" | "recomendado" | "opcional";

export type ChecklistVendaInput = {
  situacao: SituacaoVenda;
  temEntrada: boolean;
  temTroca: boolean;
  /** vendas.tipo_transferencia */
  tipoTransferencia: string | null;
};

export type CategoriaInfo = {
  key: CategoriaDocumento;
  label: string;
  /** O que o documento prova (uma linha, mostrada no checklist). */
  resumo: string;
  /** Momento do ciclo em que ele costuma ser emitido. */
  momento: string;
  /** Tipo de ARQUIVO (DOCUMENT_TYPES) quando a via assinada é arquivada na pasta do veículo. */
  arquivoTipo?: string;
  /** null = não entra no checklist desta venda. */
  relevancia: (venda: ChecklistVendaInput) => Relevancia | null;
};

const VENDIDA = new Set<SituacaoVenda>(["vendido", "entregue", "finalizado"]);
const EM_NEGOCIO = new Set<SituacaoVenda>(["reservado", "vendido", "entregue", "finalizado"]);
const ENTREGUE = new Set<SituacaoVenda>(["entregue", "finalizado"]);

export const CATEGORIAS: CategoriaInfo[] = [
  {
    key: "recibo_sinal",
    label: "Recibo de Sinal",
    resumo: "Comprova o sinal pago para reservar o veículo e o prazo para concluir a compra.",
    momento: "Reserva",
    relevancia: (v) => (v.situacao !== "reservado" ? null : v.temEntrada ? "recomendado" : "opcional")
  },
  {
    key: "recibo_venda",
    label: "Recibo de Venda",
    resumo: "Comprova a venda: comprador, veículo, valor e condições de pagamento.",
    momento: "Venda",
    arquivoTipo: "recibo_venda",
    relevancia: (v) => (VENDIDA.has(v.situacao) ? "obrigatorio" : v.situacao === "reservado" ? "opcional" : null)
  },
  {
    key: "contrato_venda",
    label: "Contrato de Compra e Venda",
    resumo: "Formaliza estado do veículo, garantia, transferência e quem responde por multas e débitos.",
    momento: "Venda",
    relevancia: (v) => (VENDIDA.has(v.situacao) ? "recomendado" : v.situacao === "reservado" ? "opcional" : null)
  },
  {
    key: "termo_troca",
    label: "Termo da Troca",
    resumo: "Registra o veículo recebido como parte do pagamento, o valor e a declaração de que está livre de ônus.",
    momento: "Venda",
    relevancia: (v) => (v.temTroca && EM_NEGOCIO.has(v.situacao) ? "obrigatorio" : null)
  },
  {
    key: "procuracao_transferencia",
    label: "Procuração para Transferência",
    resumo: "Autoriza a loja (despachante) a transferir o veículo para o nome do comprador.",
    momento: "Venda",
    relevancia: (v) => (v.tipoTransferencia === "loja" && VENDIDA.has(v.situacao) ? "recomendado" : null)
  },
  {
    key: "termo_entrega",
    label: "Termo de Entrega",
    resumo: "Marca a data e o KM da entrega: dali em diante multas e despesas do veículo são do comprador.",
    momento: "Entrega",
    arquivoTipo: "termo_entrega",
    relevancia: (v) => (ENTREGUE.has(v.situacao) ? "obrigatorio" : v.situacao === "vendido" ? "recomendado" : null)
  },
  {
    key: "termo_garantia",
    label: "Termo de Garantia",
    resumo: "Garantia legal de 90 dias (CDC, art. 26, II), contada da entrega do veículo.",
    momento: "Entrega",
    relevancia: (v) => (ENTREGUE.has(v.situacao) ? "recomendado" : v.situacao === "vendido" ? "opcional" : null)
  },
  {
    key: "outro",
    label: "Outro documento",
    resumo: "Declarações e documentos avulsos da venda.",
    momento: "Qualquer",
    relevancia: () => null
  }
];

const BY_KEY = new Map(CATEGORIAS.map((categoria) => [categoria.key, categoria]));

export function isCategoriaDocumento(value: unknown): value is CategoriaDocumento {
  return typeof value === "string" && (CATEGORIA_KEYS as readonly string[]).includes(value);
}

export function categoriaInfo(key: string | null | undefined): CategoriaInfo | null {
  return key ? BY_KEY.get(key as CategoriaDocumento) ?? null : null;
}

export function categoriaLabel(key: string | null | undefined): string {
  return categoriaInfo(key)?.label ?? "Sem categoria";
}

/**
 * Categoria provável de um template/documento antigo (sem categoria) pelo
 * título — usado só como sugestão na tela de templates.
 */
export function sugerirCategoria(titulo: string | null | undefined): CategoriaDocumento | null {
  const t = (titulo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (!t.trim()) return null;
  if (/\bsinal\b|\breserva\b|\barras\b/.test(t)) return "recibo_sinal";
  if (/\brecibo\b/.test(t)) return "recibo_venda";
  if (/\bcontrato\b/.test(t)) return "contrato_venda";
  if (/\btroca\b/.test(t)) return "termo_troca";
  if (/\bprocuracao\b/.test(t)) return "procuracao_transferencia";
  if (/\bentrega\b/.test(t)) return "termo_entrega";
  if (/\bgarantia\b/.test(t)) return "termo_garantia";
  return null;
}
