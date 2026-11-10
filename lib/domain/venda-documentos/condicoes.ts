/**
 * Condições das SEÇÕES CONDICIONAIS do editor Word: um trecho do template que
 * só aparece no documento quando a venda casa com a condição (ex.: "Somente se:
 * Financiamento"). Junto com as cláusulas prontas, é o que permite UM template
 * por categoria em vez de um por combinação de pagamento/IPVA/troca.
 *
 * Condição desconhecida (removida do catálogo) avalia como verdadeira: o texto
 * aparece em vez de sumir sem aviso.
 */
import type { VendaDocContext } from "@/lib/domain/venda-documentos/contexto";
import { entradasValidas, ipvaPago, primeiraTroca, temDebitosInformados, temTroca } from "@/lib/domain/venda-documentos/clausulas";
import { isNumero } from "@/lib/domain/venda-documentos/formato";

export type CondicaoInfo = {
  key: string;
  label: string;
  grupo: "Pagamento" | "Documentação" | "Transferência" | "Entrega";
  avaliar: (ctx: VendaDocContext) => boolean;
};

export const CONDICOES: CondicaoInfo[] = [
  { key: "tem_entrada", label: "Tem entrada", grupo: "Pagamento", avaliar: (c) => entradasValidas(c).length > 0 },
  { key: "sem_entrada", label: "Sem entrada", grupo: "Pagamento", avaliar: (c) => entradasValidas(c).length === 0 },
  { key: "tem_troca", label: "Tem veículo na troca", grupo: "Pagamento", avaliar: (c) => temTroca(c) },
  { key: "financiamento", label: "Financiamento", grupo: "Pagamento", avaliar: (c) => c.formaPagamento === "financiamento" },
  { key: "a_vista", label: "À vista (PIX)", grupo: "Pagamento", avaliar: (c) => c.formaPagamento === "a_vista_pix" },
  { key: "cartao", label: "Cartão de crédito", grupo: "Pagamento", avaliar: (c) => c.formaPagamento === "cartao_credito" },
  { key: "consorcio", label: "Consórcio", grupo: "Pagamento", avaliar: (c) => c.formaPagamento === "consorcio" },
  { key: "tem_desconto", label: "Tem desconto", grupo: "Pagamento", avaliar: (c) => isNumero(c.desconto) && c.desconto > 0 },
  { key: "ipva_pago", label: "IPVA do ano pago", grupo: "Documentação", avaliar: (c) => ipvaPago(c) },
  { key: "ipva_nao_pago", label: "IPVA do ano não pago", grupo: "Documentação", avaliar: (c) => !ipvaPago(c) },
  { key: "tem_debitos", label: "Tem débitos informados", grupo: "Documentação", avaliar: (c) => temDebitosInformados(c.debitos, c.debitosValor) },
  {
    key: "troca_tem_debitos",
    label: "Veículo da troca tem débitos",
    grupo: "Documentação",
    avaliar: (c) => {
      const troca = primeiraTroca(c);
      return Boolean(troca) && temDebitosInformados(troca?.debitos, troca?.debitosValor);
    }
  },
  {
    key: "transferencia_loja",
    label: "Transferência pela loja",
    grupo: "Transferência",
    avaliar: (c) => c.tipoTransferencia === "loja"
  },
  {
    key: "transferencia_financiamento",
    label: "Transferência pelo financiamento",
    grupo: "Transferência",
    avaliar: (c) => c.tipoTransferencia === "financiamento"
  },
  {
    key: "transferencia_cliente",
    label: "Transferência pelo comprador",
    grupo: "Transferência",
    avaliar: (c) => c.tipoTransferencia === "cliente"
  },
  { key: "entregue", label: "Com data de entrega", grupo: "Entrega", avaliar: (c) => Boolean(c.dataEntrega?.trim()) },
  { key: "tem_chave_reserva", label: "Tem chave reserva", grupo: "Entrega", avaliar: (c) => c.temChaveReserva === true },
  { key: "tem_manual", label: "Tem manual", grupo: "Entrega", avaliar: (c) => c.temManual === true }
];

const BY_KEY = new Map(CONDICOES.map((condicao) => [condicao.key, condicao]));

export const CONDICAO_PADRAO = "tem_entrada";

export function condicaoLabel(key: string | null | undefined): string {
  return (key && BY_KEY.get(key)?.label) || "Condição desconhecida";
}

export function avaliarCondicao(ctx: VendaDocContext, key: string | null | undefined): boolean {
  const condicao = key ? BY_KEY.get(key) : undefined;
  return condicao ? condicao.avaliar(ctx) : true;
}
