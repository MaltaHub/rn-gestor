import type { GridTableConfig } from "@/lib/api/grid-config";
import type { GridRowPayload } from "@/lib/api/grid/types";

export function resolveGridHeader(config: GridTableConfig, rows: GridRowPayload[]) {
  const excludedColumns = new Set([...(config.excludedColumns ?? []), ...config.formOnlyColumns]);

  if (rows.length === 0) {
    return config.defaultHeader.filter((column) => !excludedColumns.has(column));
  }

  const discovered = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter(
    (column) => !column.startsWith("__") && !excludedColumns.has(column)
  );
  const discoveredSet = new Set(discovered);

  return [
    ...config.defaultHeader.filter((column) => discoveredSet.has(column) && !excludedColumns.has(column)),
    ...discovered.filter((column) => !config.defaultHeader.includes(column))
  ];
}
