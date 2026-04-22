import { ApiHttpError } from "@/lib/api/errors";

export function createGridBusinessError(status: number, code: string, message: string, details?: unknown) {
  return new ApiHttpError(status, code, message, details);
}

export function createGridTableNotFoundError(table: string) {
  return createGridBusinessError(404, "GRID_TABLE_NOT_FOUND", "Tabela de grid nao suportada.", { table });
}

export function createGridReadOnlyError() {
  return createGridBusinessError(405, "GRID_TABLE_READ_ONLY", "Esta planilha e somente leitura.");
}
