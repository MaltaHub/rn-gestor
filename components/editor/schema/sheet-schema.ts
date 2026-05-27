/**
 * Schema das sheets pra uso no editor de fluxos.
 *
 * Wrapper finissimo em volta de `getGridTableConfig` que devolve um shape
 * ergonomico pra UI do editor (dropdowns de coluna, validacao de tipos, etc).
 *
 * **Fonte da verdade:** `lib/api/grid-config.ts:GRID_TABLES`. Sheets que ja
 * declararam `columnTypes` produzem schemas tipados; sheets sem declaracao
 * caem em `type: "unknown"` (que ainda funciona pros dropdowns, so nao da
 * validacao de tipo nas conexoes).
 */

import { getGridTableConfig, type ColumnType } from "@/lib/api/grid-config";
import type { SheetKey } from "@/components/ui-grid/types";

export type { ColumnType };

export type SheetColumnDef = {
  name: string;
  type: ColumnType;
  /** Coluna esta em `lockedColumns` (nao editavel, geralmente id/timestamps). */
  locked: boolean;
  /** Coluna esta em `editableColumns` (escrita permitida via grid). */
  editable: boolean;
};

export type SheetSchema = {
  sheet: SheetKey;
  label: string;
  columns: SheetColumnDef[];
};

// Cache em-memoria — a fonte e estatica em runtime, entao calculo 1x por sheet.
const schemaCache = new Map<SheetKey, SheetSchema | null>();

/**
 * Devolve o schema de uma sheet (colunas + tipos). Cacheado.
 * Retorna `null` se a sheet nao existe no GRID_TABLES.
 */
export function getSheetSchema(sheet: SheetKey): SheetSchema | null {
  if (schemaCache.has(sheet)) {
    return schemaCache.get(sheet) ?? null;
  }
  const config = getGridTableConfig(sheet);
  if (!config) {
    schemaCache.set(sheet, null);
    return null;
  }
  const lockedSet = new Set(config.lockedColumns);
  const editableSet = new Set(config.editableColumns);
  // Inclui defaultHeader + formOnlyColumns + editableColumns + formColumns
  // pra que dropdowns vejam toda coluna escrevivel/visivel do grid (ex.: vendas
  // tem financ_*/seguro_*/troca_* em editableColumns mas nao em defaultHeader).
  const allColumns = Array.from(
    new Set([
      ...config.defaultHeader,
      ...config.formOnlyColumns,
      ...config.editableColumns,
      ...config.formColumns
    ])
  );
  const columns: SheetColumnDef[] = allColumns.map((name) => ({
    name,
    type: config.columnTypes?.[name] ?? "unknown",
    locked: lockedSet.has(name),
    editable: editableSet.has(name)
  }));
  const schema: SheetSchema = {
    sheet,
    label: config.label,
    columns
  };
  schemaCache.set(sheet, schema);
  return schema;
}

/** Util pra UI: retorna so o nome+tipo de cada coluna selecionavel. */
export function listSheetColumns(sheet: SheetKey): Array<{ name: string; type: ColumnType }> {
  const schema = getSheetSchema(sheet);
  if (!schema) return [];
  return schema.columns.map((c) => ({ name: c.name, type: c.type }));
}
