import type { TableName } from "@/lib/domain/db";

/**
 * Allow-list of (table, column) pairs whose price-change context entries the
 * `price-contexts` API may read or filter on.
 *
 * Mirror in real domain code: see `lib/domain/carros/service.ts` and
 * `lib/domain/anuncios/service.ts`, which are the only writers of
 * `price_change_contexts`. If a new price column starts being audited, add it
 * here too — otherwise the new entries become invisible to the audit UI.
 */
export type PriceContextTableName = Extract<TableName, "carros" | "anuncios">;

export const PRICE_CONTEXT_TABLE_POLICY: Record<PriceContextTableName, ReadonlyArray<string>> = {
  carros: ["preco_original"],
  anuncios: ["valor_anuncio"]
};

const TABLE_NAMES = Object.keys(PRICE_CONTEXT_TABLE_POLICY) as PriceContextTableName[];

export function isAllowedPriceContextTable(table: string): table is PriceContextTableName {
  return (TABLE_NAMES as string[]).includes(table);
}

export function isAllowedPriceContextColumn(table: PriceContextTableName, column: string) {
  return PRICE_CONTEXT_TABLE_POLICY[table].includes(column);
}

export function listAllowedPriceContextTables(): ReadonlyArray<PriceContextTableName> {
  return TABLE_NAMES;
}

export type PriceContextTarget = {
  table: PriceContextTableName;
  column: string;
};

export type PriceContextValidationError =
  | { kind: "TABLE_NOT_ALLOWED"; table: string }
  | { kind: "COLUMN_NOT_ALLOWED"; table: PriceContextTableName; column: string };

/**
 * Validates a (table, column) pair against the allow-list. Both inputs must be
 * present together — partial filters (table without column) are accepted by
 * passing an empty `column` string (only the table is then validated).
 */
export function validatePriceContextTarget(input: {
  table: string;
  column: string;
}): { ok: true; target: PriceContextTarget } | { ok: false; error: PriceContextValidationError } {
  if (!isAllowedPriceContextTable(input.table)) {
    return { ok: false, error: { kind: "TABLE_NOT_ALLOWED", table: input.table } };
  }
  if (!isAllowedPriceContextColumn(input.table, input.column)) {
    return {
      ok: false,
      error: { kind: "COLUMN_NOT_ALLOWED", table: input.table, column: input.column }
    };
  }
  return { ok: true, target: { table: input.table, column: input.column } };
}
