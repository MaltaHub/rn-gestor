export type GridRelationTable = "carro_caracteristicas_tecnicas" | "carro_caracteristicas_visuais";

const RELATION_ROW_ID_SEPARATOR = "::";

export function isGridRelationTable(table: string): table is GridRelationTable {
  return table === "carro_caracteristicas_tecnicas" || table === "carro_caracteristicas_visuais";
}

export function buildGridRelationRowId(carroId: unknown, caracteristicaId: unknown) {
  if (typeof carroId !== "string" || !carroId.trim()) return "";
  if (typeof caracteristicaId !== "string" || !caracteristicaId.trim()) return "";
  return `${carroId}${RELATION_ROW_ID_SEPARATOR}${caracteristicaId}`;
}

export function parseGridRelationRowId(rowId: string) {
  const separatorIndex = rowId.indexOf(RELATION_ROW_ID_SEPARATOR);
  if (separatorIndex <= 0) return null;

  const carroId = rowId.slice(0, separatorIndex).trim();
  const caracteristicaId = rowId.slice(separatorIndex + RELATION_ROW_ID_SEPARATOR.length).trim();
  if (!carroId || !caracteristicaId) return null;

  return { carroId, caracteristicaId };
}

export function withGridRelationRowId<T extends Record<string, unknown>>(table: string, row: T) {
  if (!isGridRelationTable(table)) return row;

  const rowId = buildGridRelationRowId(row.carro_id, row.caracteristica_id);
  if (!rowId) return row;

  return {
    ...row,
    __row_id: rowId
  };
}
