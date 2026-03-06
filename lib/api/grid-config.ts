import type { SupportedRole } from "@/lib/api/auth";
import type { TableName } from "@/lib/domain/db";

export type GridTableName = Extract<TableName, "carros" | "anuncios" | "modelos" | "grupos_repetidos" | "repetidos">;

export type GridTableConfig = {
  table: GridTableName;
  label: string;
  primaryKey: string;
  defaultHeader: string[];
  minWriteRole: SupportedRole;
  minDeleteRole: SupportedRole;
  readOnly?: boolean;
  searchableColumns: string[];
  lockedColumns: string[];
  defaultSort: Array<{ column: string; dir: "asc" | "desc" }>;
};

const GRID_TABLES: Record<GridTableName, GridTableConfig> = {
  carros: {
    table: "carros",
    label: "Carros",
    primaryKey: "id",
    defaultHeader: [
      "id",
      "placa",
      "nome",
      "modelo_id",
      "local",
      "estado_venda",
      "estado_anuncio",
      "estado_veiculo",
      "em_estoque",
      "cor",
      "ano_fab",
      "ano_mod",
      "hodometro",
      "preco_original",
      "created_at",
      "updated_at"
    ],
    minWriteRole: "SECRETARIO",
    minDeleteRole: "GERENTE",
    searchableColumns: ["placa", "nome", "cor"],
    lockedColumns: ["id", "created_at", "updated_at", "ultima_alteracao"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  },
  anuncios: {
    table: "anuncios",
    label: "Anuncios",
    primaryKey: "id",
    defaultHeader: ["id", "target_id", "estado_anuncio", "valor_anuncio", "created_at", "updated_at"],
    minWriteRole: "SECRETARIO",
    minDeleteRole: "GERENTE",
    searchableColumns: ["estado_anuncio", "target_id"],
    lockedColumns: ["id", "created_at", "updated_at"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  },
  modelos: {
    table: "modelos",
    label: "Modelos",
    primaryKey: "id",
    defaultHeader: ["id", "modelo", "created_at", "updated_at"],
    minWriteRole: "SECRETARIO",
    minDeleteRole: "GERENTE",
    searchableColumns: ["modelo"],
    lockedColumns: ["id", "created_at", "updated_at"],
    defaultSort: [{ column: "modelo", dir: "asc" }]
  },
  grupos_repetidos: {
    table: "grupos_repetidos",
    label: "Repetidos Grupos",
    primaryKey: "grupo_id",
    defaultHeader: [
      "grupo_id",
      "modelo_id",
      "cor",
      "ano_mod",
      "preco_original",
      "preco_min",
      "preco_max",
      "hodometro_min",
      "hodometro_max",
      "qtde",
      "atualizado_em",
      "created_at",
      "updated_at"
    ],
    minWriteRole: "GERENTE",
    minDeleteRole: "ADMINISTRADOR",
    readOnly: true,
    searchableColumns: ["grupo_id", "cor"],
    lockedColumns: ["grupo_id", "created_at", "updated_at", "atualizado_em"],
    defaultSort: [{ column: "qtde", dir: "desc" }]
  },
  repetidos: {
    table: "repetidos",
    label: "Repetidos",
    primaryKey: "carro_id",
    defaultHeader: ["carro_id", "grupo_id", "created_at", "updated_at"],
    minWriteRole: "GERENTE",
    minDeleteRole: "ADMINISTRADOR",
    readOnly: true,
    searchableColumns: ["carro_id", "grupo_id"],
    lockedColumns: ["carro_id", "grupo_id", "created_at", "updated_at"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }
};

export function getGridTableConfig(table: string): GridTableConfig | null {
  if (!(table in GRID_TABLES)) {
    return null;
  }

  return GRID_TABLES[table as GridTableName];
}

export function listGridTableConfigs() {
  return Object.values(GRID_TABLES);
}

export type GridSortRule = {
  column: string;
  dir: "asc" | "desc";
};

export type GridFilters = Record<string, string>;

export function parseGridSort(raw: string | null): GridSortRule[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Array<{ column?: string; dir?: string }>;
    return parsed
      .filter((item) => typeof item.column === "string" && (item.dir === "asc" || item.dir === "desc"))
      .map((item) => ({
        column: item.column as string,
        dir: item.dir as "asc" | "desc"
      }));
  } catch {
    return [];
  }
}

export function parseGridFilters(raw: string | null): GridFilters {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const output: GridFilters = {};

    for (const [column, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        output[column] = value.trim();
      }
    }

    return output;
  } catch {
    return {};
  }
}
