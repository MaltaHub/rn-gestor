/**
 * Situação do veículo no ciclo da venda, como o vendedor enxerga:
 *
 *   Disponível → Reservado → Vendido → Entregue → Finalizado
 *
 * Deriva de `vendas.estado_venda` ('aberta' = reserva, 'concluida' = venda) e
 * `vendas.estagio` ('aberto' = vendida aguardando entrega, 'fechado'/'na_garantia'
 * = entregue, 'finalizado' = 90 dias após a entrega). Sem venda ativa, vale o
 * `carros.estado_venda` (há vendidos antigos sem linha em `vendas`).
 */
export type SituacaoVenda = "disponivel" | "reservado" | "vendido" | "entregue" | "finalizado" | "indisponivel";

export const SITUACOES_VENDA: SituacaoVenda[] = ["disponivel", "reservado", "vendido", "entregue", "finalizado", "indisponivel"];

export const SITUACAO_LABEL: Record<SituacaoVenda, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
  entregue: "Entregue",
  finalizado: "Finalizado",
  indisponivel: "Indisponível"
};

/** Etapas da linha do tempo (o "indisponível" fica fora: é um desvio, não uma etapa). */
export const ETAPAS_VENDA: SituacaoVenda[] = ["disponivel", "reservado", "vendido", "entregue", "finalizado"];

export type VendaSituacaoInput = { estado_venda?: string | null; estagio?: string | null } | null | undefined;

function token(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export function situacaoDaVenda(venda: VendaSituacaoInput, carroEstadoVenda?: string | null): SituacaoVenda {
  if (venda?.estado_venda === "aberta") return "reservado";
  if (venda?.estado_venda === "concluida") {
    if (venda.estagio === "finalizado") return "finalizado";
    if (venda.estagio === "fechado" || venda.estagio === "na_garantia") return "entregue";
    return "vendido";
  }
  const estado = token(carroEstadoVenda);
  if (estado === "vendido") return "vendido";
  if (estado === "reservado") return "reservado";
  if (estado === "disponivel" || estado === "novo") return "disponivel";
  return "indisponivel";
}

/** Data de hoje (fuso local) como YYYY-MM-DD — para data_venda/data_entrega. */
export function hojeIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Ano de uma data YYYY-MM-DD (sem passar por Date, evitando o desvio de fuso). */
export function anoDaData(iso: string | null | undefined): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}/.exec((iso ?? "").trim());
  return match ? Number(match[1]) : null;
}
