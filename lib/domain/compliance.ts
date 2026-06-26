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
  carros: ["ano_mod", "chassi", "renavam", "hodometro", "preco_original"],
  documentos: ["origem", "valor_compra", "remetente_id", "pericia", "responsavel_virado"],
  vendas: ["data_venda", "data_entrega", "valor_total", "forma_pagamento"],
};

/** Classe CSS da linha do grid quando falta campo importante (fonte amarela). */
export const COMPLIANCE_ROW_CLASS = "sheet-row-compliance-missing";

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
