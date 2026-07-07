/**
 * lib/domain/compliance.ts
 *
 * "Protetor de compliance visual": campos IMPORTANTES que o usuario precisa
 * lembrar de preencher em CARROS, DOCUMENTOS e VENDAS. Nao da pra preencher
 * tudo de uma vez, entao o app avisa (tarja amarela no form, fonte amarela no
 * grid, e um botao no header pra selecionar so quem tem campo faltando).
 *
 * Regra de "faltando": valor null/undefined ou string vazia. Booleanos (true/
 * false) contam como PREENCHIDO (a decisao foi tomada). Numeros, inclusive 0,
 * contam como preenchidos.
 */

export const COMPLIANCE_IMPORTANT_FIELDS: Record<string, string[]> = {
  // carros inclui modelo_id: a confirmacao das informacoes cobre o modelo.
  // preco_original NAO entra: preco nao e criterio de confirmacao (2026-07-02).
  carros: ["ano_mod", "chassi", "renavam", "hodometro", "modelo_id"],
  documentos: ["origem", "valor_compra", "remetente_id", "pericia", "responsavel_virado"],
  vendas: ["data_venda", "data_entrega", "valor_total", "forma_pagamento"],
};

/** Classe CSS da linha do grid quando ha pendencia (fonte amarela). */
export const COMPLIANCE_ROW_CLASS = "sheet-row-compliance-missing";

/**
 * Tupla de confirmacao de CARROS (jsonb no banco):
 *  - campos: informacoes importantes conferidas (o trigger zera se faltar campo).
 *  - chave_manual: chave reserva + manual conferidos (o trigger zera se
 *    tem_chave_r/tem_manual mudarem).
 */
export type CarroInfoConfirmada = { campos: boolean; chave_manual: boolean };

export const CARRO_CONFIRMACAO_ALVOS = ["campos", "chave_manual"] as const;
export type CarroConfirmacaoAlvo = (typeof CARRO_CONFIRMACAO_ALVOS)[number];

/**
 * Normaliza o valor vindo do banco/mocks. Booleano legado (pre-tupla) vale so
 * para 'campos'; chave_manual nasce pendente.
 */
export function parseCarroInfoConfirmada(value: unknown): CarroInfoConfirmada {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const tuple = value as Record<string, unknown>;
    return { campos: tuple.campos === true, chave_manual: tuple.chave_manual === true };
  }
  return { campos: value === true, chave_manual: false };
}

/**
 * Pendencia (fonte amarela) por linha:
 *  - carros: qualquer posicao da tupla info_confirmada em false. O trigger do
 *    banco ja zera 'campos' enquanto faltar campo importante e 'chave_manual'
 *    quando chave/manual mudam, entao isso cobre "falta campo", "chave/manual
 *    alterados" E "ainda nao confirmado".
 *  - demais (documentos/vendas): falta algum campo importante.
 */
export function rowHasPendencia(table: string, row: Record<string, unknown>): boolean {
  if (table === "carros") {
    const info = parseCarroInfoConfirmada(row.info_confirmada);
    return !(info.campos && info.chave_manual);
  }
  return rowHasMissingImportant(table, row);
}

export function hasComplianceFields(table: string): boolean {
  return (COMPLIANCE_IMPORTANT_FIELDS[table]?.length ?? 0) > 0;
}

export function isImportantValueMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

/** Campos importantes ausentes numa linha (vazio = tudo preenchido / N/A). */
export function getMissingImportantFields(table: string, row: Record<string, unknown>): string[] {
  const fields = COMPLIANCE_IMPORTANT_FIELDS[table];
  if (!fields) return [];
  return fields.filter((field) => isImportantValueMissing(row[field]));
}

export function rowHasMissingImportant(table: string, row: Record<string, unknown>): boolean {
  return getMissingImportantFields(table, row).length > 0;
}
