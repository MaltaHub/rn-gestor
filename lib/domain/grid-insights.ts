import {
  ANUNCIO_INSIGHT_CODE,
  ANUNCIO_INSIGHT_WEIGHT,
  buildInsightItemsFromRow,
  type AnuncioInsightCode
} from "@/lib/domain/anuncios-insights";
import { humanizeColumn } from "@/lib/domain/column-labels";
import { getMissingImportantFields, hasComplianceFields, parseCarroInfoConfirmada, rowHasPendencia } from "@/lib/domain/compliance";

/**
 * Insights do grid como OCORRÊNCIAS (1 problema × 1 linha). O painel de
 * insights agrupa as mesmas ocorrências de dois jeitos:
 *  - FILA: por problema (card com a quantidade e o caso da vez; resolveu, sai);
 *  - PESQUISA: por placa (placa → os problemas dela).
 * Puro: recebe as linhas já carregadas da tabela ativa (nada de carga nova).
 */

export type GridInsightTone = "danger" | "warning" | "info";

export type GridInsightOccurrence = {
  /** Problema (grupo da fila). */
  key: string;
  title: string;
  tone: GridInsightTone;
  /** Ordem da fila: maior primeiro. */
  weight: number;
  /** Linha do grid (para rolar até ela). */
  rowId: string;
  placa: string | null;
  /** O caso desta linha (o card da fila descreve a ocorrência da vez). */
  detail: string;
  /** Anúncio: o insight pode ser marcado como verificado. */
  anuncioCode?: AnuncioInsightCode;
};

export type GridInsightGroup = {
  key: string;
  title: string;
  tone: GridInsightTone;
  occurrences: GridInsightOccurrence[];
};

export type GridInsightPlateGroup = { placa: string; occurrences: GridInsightOccurrence[] };

type Row = Record<string, unknown>;

const TONE_RANK: Record<GridInsightTone, number> = { danger: 3, warning: 2, info: 1 };

const ANUNCIO_META: Record<AnuncioInsightCode, { title: string; tone: GridInsightTone }> = {
  [ANUNCIO_INSIGHT_CODE.SUBSTITUIR_ANUNCIO_REPRESENTANTE]: { title: "Substituir anúncio de vendido", tone: "danger" },
  [ANUNCIO_INSIGHT_CODE.APAGAR_ANUNCIO_RECOMENDADO]: { title: "Apagar anúncio", tone: "danger" },
  [ANUNCIO_INSIGHT_CODE.ATUALIZAR_ANUNCIO]: { title: "Preço divergente", tone: "warning" },
  [ANUNCIO_INSIGHT_CODE.AUSENTE_EXTRA]: { title: "Repetido sem anúncio, preço diferente", tone: "info" },
  [ANUNCIO_INSIGHT_CODE.ANUNCIO_PRECO_EXTRA]: { title: "Preço extra no grupo anunciado", tone: "info" },
  [ANUNCIO_INSIGHT_CODE.ANUNCIO_SEM_REFERENCIA]: { title: "Veículo sem anúncio", tone: "info" }
};

function money(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(number)) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(number);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function anuncioOccurrences(row: Row, rowId: string, placa: string | null): GridInsightOccurrence[] {
  return buildInsightItemsFromRow(row).map((item) => {
    const meta = ANUNCIO_META[item.code];
    let detail = item.message;
    if (item.code === ANUNCIO_INSIGHT_CODE.ATUALIZAR_ANUNCIO) {
      const anuncio = money(row.valor_anuncio);
      const carro = money(row.preco_carro_atual);
      if (anuncio && carro) detail = `Anúncio ${anuncio} · carro ${carro}`;
    }
    return {
      key: `anuncio:${item.code}`,
      title: meta.title,
      tone: meta.tone,
      weight: TONE_RANK[meta.tone] * 1000 + (ANUNCIO_INSIGHT_WEIGHT[item.code] ?? 0),
      rowId,
      placa,
      detail,
      anuncioCode: item.code
    };
  });
}

function documentoOccurrences(row: Row, rowId: string, placa: string | null): GridInsightOccurrence[] {
  const out: GridInsightOccurrence[] = [];
  if (row.__crlv_aguardando === true) {
    out.push({
      key: "documentos:crlv",
      title: "PRONTO com CRLV aguardando",
      tone: "danger",
      weight: 3075,
      rowId,
      placa,
      detail: "Veículo PRONTO e o CRLV ainda não chegou — envie o CRLV na pasta de documentos."
    });
  }
  if (row.__finalizar_documento === true) {
    out.push({
      key: "documentos:finalizar",
      title: "Finalizar documentação",
      tone: "warning",
      weight: 2100,
      rowId,
      placa,
      detail: `Vendido com envelope ${text(row.envelope) ?? "não fechado"} — finalize e feche o envelope.`
    });
  }
  if (row.__missing_data === true) {
    out.push({
      key: "documentos:sem-linha",
      title: "Sem linha de documentos",
      tone: "info",
      weight: 1050,
      rowId,
      placa,
      detail: "Veículo sem registro em documentos — abra a linha destacada para criar."
    });
  }
  return out;
}

function vendaOccurrences(row: Row, rowId: string, placa: string | null): GridInsightOccurrence[] {
  if (row.__venda_sem_data !== true && row.__missing_data !== true) return [];
  return [
    {
      key: "vendas:sem-data",
      title: "Vendido sem data de venda",
      tone: "warning",
      weight: 2060,
      rowId,
      placa,
      detail:
        row.__missing_data === true
          ? "Sem venda registrada: registre a venda com a data (a finalização em 90 dias conta dela)."
          : "Preencha a data da venda (a finalização em 90 dias conta dela)."
    }
  ];
}

function complianceOccurrence(table: string, row: Row, rowId: string, placa: string | null): GridInsightOccurrence | null {
  if (!hasComplianceFields(table) || !rowHasPendencia(table, row)) return null;
  const missing = getMissingImportantFields(table, row).map(humanizeColumn);
  let detail = missing.length > 0 ? `Falta: ${missing.join(", ")}.` : "Preencha os campos importantes destacados.";
  if (table === "carros" && missing.length === 0) {
    const info = parseCarroInfoConfirmada(row.info_confirmada);
    detail = !info.campos ? "Campos importantes ainda não confirmados." : "Chave reserva e manual ainda não confirmados.";
  }
  return {
    key: `compliance:${table}`,
    title: table === "carros" ? "Veículo não confirmado" : "Campo importante faltando",
    tone: "warning",
    weight: 2040,
    rowId,
    placa,
    detail
  };
}

export function collectGridInsights(input: {
  table: string;
  primaryKey: string;
  rows: Row[];
  plateOf: (row: Row) => string | null;
}): GridInsightOccurrence[] {
  const out: GridInsightOccurrence[] = [];
  for (const row of input.rows) {
    const rowId = String(row[input.primaryKey] ?? "");
    if (!rowId) continue;
    const placa = input.plateOf(row);
    if (input.table === "anuncios") out.push(...anuncioOccurrences(row, rowId, placa));
    if (input.table === "vendas") out.push(...vendaOccurrences(row, rowId, placa));
    if (input.table === "documentos") {
      out.push(...documentoOccurrences(row, rowId, placa));
      continue;
    }
    // Linha virtual (registro que falta) não tem campos para conferir.
    const compliance = row.__missing_data === true ? null : complianceOccurrence(input.table, row, rowId, placa);
    if (compliance) out.push(compliance);
  }
  return out;
}

/** FILA: um grupo por problema (só os que têm ocorrência), o mais grave primeiro. */
export function groupInsightsByKey(occurrences: GridInsightOccurrence[]): GridInsightGroup[] {
  const groups = new Map<string, GridInsightGroup>();
  const weights = new Map<string, number>();
  for (const occurrence of occurrences) {
    const group = groups.get(occurrence.key);
    if (group) group.occurrences.push(occurrence);
    else {
      groups.set(occurrence.key, { key: occurrence.key, title: occurrence.title, tone: occurrence.tone, occurrences: [occurrence] });
      weights.set(occurrence.key, occurrence.weight);
    }
  }
  return Array.from(groups.values()).sort((left, right) => (weights.get(right.key) ?? 0) - (weights.get(left.key) ?? 0));
}

function plateKey(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** PESQUISA: um grupo por placa (só placas com ocorrência), filtrado pela busca. */
export function groupInsightsByPlate(occurrences: GridInsightOccurrence[], query: string): GridInsightPlateGroup[] {
  const needle = plateKey(query);
  const groups = new Map<string, GridInsightPlateGroup>();
  for (const occurrence of occurrences) {
    const placa = occurrence.placa?.trim() || "Sem placa";
    if (needle && !plateKey(placa).includes(needle)) continue;
    const group = groups.get(placa);
    if (group) group.occurrences.push(occurrence);
    else groups.set(placa, { placa, occurrences: [occurrence] });
  }
  for (const group of groups.values()) group.occurrences.sort((left, right) => right.weight - left.weight);
  return Array.from(groups.values()).sort((left, right) => left.placa.localeCompare(right.placa, "pt-BR"));
}
