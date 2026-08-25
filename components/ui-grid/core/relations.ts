import type { SheetKey } from "@/components/ui-grid/types";
import { GENERATED_RELATION_BY_SHEET_COLUMN } from "@/components/ui-grid/core/relations.generated";

export type RelationRef = {
  table: SheetKey;
  keyColumn: string;
};

/**
 * Relacoes logicas que NAO existem como FK declarada no banco (portanto nao saem
 * do typegen), mas que queremos reconhecer mesmo assim. Vencem sobre o gerado.
 * Mantenha pequeno: o ideal e a FK existir no banco e fluir pelo typegen.
 */
const MANUAL_RELATION_OVERRIDES: Partial<Record<SheetKey, Record<string, RelationRef>>> = {};

function mergeRelationMaps(
  base: Partial<Record<SheetKey, Record<string, RelationRef>>>,
  overrides: Partial<Record<SheetKey, Record<string, RelationRef>>>
): Partial<Record<SheetKey, Record<string, RelationRef>>> {
  const merged: Partial<Record<SheetKey, Record<string, RelationRef>>> = {};
  const tables = new Set<SheetKey>([
    ...(Object.keys(base) as SheetKey[]),
    ...(Object.keys(overrides) as SheetKey[])
  ]);

  for (const table of tables) {
    merged[table] = { ...(base[table] ?? {}), ...(overrides[table] ?? {}) };
  }

  return merged;
}

/**
 * Mapa coluna -> FK (tabela/coluna alvo). Base derivada automaticamente do
 * typegen do Supabase (todas as FKs declaradas, via scripts/generate-relations.mjs),
 * mesclada com overrides manuais para relacoes logicas sem constraint no banco.
 *
 * Vive num modulo proprio (e nao em grid-rules) para que `relation-path` possa
 * consumi-lo sem import circular.
 */
export const RELATION_BY_SHEET_COLUMN: Partial<Record<SheetKey, Record<string, RelationRef>>> = mergeRelationMaps(
  GENERATED_RELATION_BY_SHEET_COLUMN,
  MANUAL_RELATION_OVERRIDES
);

/** FK de uma coluna, se declarada. */
export function getRelationFor(table: SheetKey | "" | null | undefined, column: string): RelationRef | null {
  if (!table || !column) return null;
  return RELATION_BY_SHEET_COLUMN[table]?.[column] ?? null;
}
