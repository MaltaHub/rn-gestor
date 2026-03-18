import type { GridTableName, GridTablePolicy } from "@/lib/domain/grid-policy";
import { GRID_TABLE_POLICIES } from "@/lib/domain/grid-policy";

export type GridTableConfig = GridTablePolicy & {
  table: GridTableName;
  label: string;
  primaryKey: string;
  defaultHeader: string[];
  searchableColumns: string[];
  lockedColumns: string[];
  defaultSort: Array<{ column: string; dir: "asc" | "desc" }>;
};

function defineGridTableConfig(
  table: GridTableName,
  config: Omit<GridTableConfig, "table" | "minReadRole" | "minWriteRole" | "minDeleteRole" | "readOnly">
): GridTableConfig {
  return {
    table,
    ...config,
    ...GRID_TABLE_POLICIES[table]
  };
}

const GRID_TABLES: Record<GridTableName, GridTableConfig> = {
  carros: defineGridTableConfig("carros", {
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
      "os_supply_appscript_check",
      "cor",
      "ano_fab",
      "ano_mod",
      "hodometro",
      "preco_original",
      "created_at",
      "updated_at"
    ],
    searchableColumns: ["placa", "nome", "cor"],
    lockedColumns: ["id", "created_at", "updated_at", "ultima_alteracao", "os_supply_appscript_check"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }),
  anuncios: defineGridTableConfig("anuncios", {
    label: "Anuncios",
    primaryKey: "id",
    defaultHeader: ["id", "carro_id", "estado_anuncio", "valor_anuncio", "created_at", "updated_at"],
    searchableColumns: ["estado_anuncio", "carro_id"],
    lockedColumns: ["id", "created_at", "updated_at"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }),
  modelos: defineGridTableConfig("modelos", {
    label: "Modelos",
    primaryKey: "id",
    defaultHeader: ["id", "modelo", "created_at", "updated_at"],
    searchableColumns: ["modelo"],
    lockedColumns: ["id", "created_at", "updated_at"],
    defaultSort: [{ column: "modelo", dir: "asc" }]
  }),
  finalizados: defineGridTableConfig("finalizados", {
    label: "Finalizados",
    primaryKey: "id",
    defaultHeader: [
      "id",
      "placa",
      "modelo",
      "cor",
      "ano_fab",
      "ano_mod",
      "hodometro",
      "data_venda",
      "valor_venda",
      "vendedor",
      "finalizado_em",
      "created_at",
      "updated_at"
    ],
    searchableColumns: ["placa", "modelo", "cor", "vendedor"],
    lockedColumns: ["id", "created_at", "updated_at", "finalizado_em"],
    defaultSort: [{ column: "finalizado_em", dir: "desc" }]
  }),
  grupos_repetidos: defineGridTableConfig("grupos_repetidos", {
    label: "Repetidos Grupos",
    primaryKey: "grupo_id",
    defaultHeader: [
      "grupo_id",
      "modelo_id",
      "cor",
      "ano_mod",
      "ano_fab",
      "caracteristicas_visuais_resumo",
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
    searchableColumns: ["grupo_id", "cor", "caracteristicas_visuais_resumo"],
    lockedColumns: ["grupo_id", "created_at", "updated_at", "atualizado_em"],
    defaultSort: [{ column: "qtde", dir: "desc" }]
  }),
  repetidos: defineGridTableConfig("repetidos", {
    label: "Repetidos",
    primaryKey: "carro_id",
    defaultHeader: ["carro_id", "grupo_id", "created_at", "updated_at"],
    searchableColumns: ["carro_id", "grupo_id"],
    lockedColumns: ["carro_id", "grupo_id", "created_at", "updated_at"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }),
  caracteristicas_tecnicas: defineGridTableConfig("caracteristicas_tecnicas", {
    label: "Caracteristicas Tecnicas",
    primaryKey: "id",
    defaultHeader: ["id", "caracteristica", "created_at", "updated_at"],
    searchableColumns: ["caracteristica"],
    lockedColumns: ["id", "created_at", "updated_at"],
    defaultSort: [{ column: "caracteristica", dir: "asc" }]
  }),
  caracteristicas_visuais: defineGridTableConfig("caracteristicas_visuais", {
    label: "Caracteristicas Visuais",
    primaryKey: "id",
    defaultHeader: ["id", "caracteristica", "created_at", "updated_at"],
    searchableColumns: ["caracteristica"],
    lockedColumns: ["id", "created_at", "updated_at"],
    defaultSort: [{ column: "caracteristica", dir: "asc" }]
  }),
  carro_caracteristicas_tecnicas: defineGridTableConfig("carro_caracteristicas_tecnicas", {
    label: "Carro x Caracteristicas Tecnicas",
    primaryKey: "__row_id",
    defaultHeader: ["carro_id", "caracteristica_id", "created_at", "updated_at"],
    searchableColumns: ["carro_id", "caracteristica_id"],
    lockedColumns: ["__row_id", "created_at", "updated_at"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }),
  carro_caracteristicas_visuais: defineGridTableConfig("carro_caracteristicas_visuais", {
    label: "Carro x Caracteristicas Visuais",
    primaryKey: "__row_id",
    defaultHeader: ["carro_id", "caracteristica_id", "created_at", "updated_at"],
    searchableColumns: ["carro_id", "caracteristica_id"],
    lockedColumns: ["__row_id", "created_at", "updated_at"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }),
  usuarios_acesso: defineGridTableConfig("usuarios_acesso", {
    label: "Usuarios de Acesso",
    primaryKey: "id",
    defaultHeader: [
      "id",
      "auth_user_id",
      "nome",
      "email",
      "cargo",
      "status",
      "foto",
      "obs",
      "ultimo_login",
      "aprovado_em",
      "created_at",
      "updated_at"
    ],
    searchableColumns: ["nome", "email", "cargo", "status"],
    lockedColumns: ["id", "auth_user_id", "created_at", "updated_at"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }),
  lookup_locations: defineGridTableConfig("lookup_locations", {
    label: "Lookup Locations",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_sale_statuses: defineGridTableConfig("lookup_sale_statuses", {
    label: "Lookup Sale Statuses",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_announcement_statuses: defineGridTableConfig("lookup_announcement_statuses", {
    label: "Lookup Announcement Statuses",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_vehicle_states: defineGridTableConfig("lookup_vehicle_states", {
    label: "Lookup Vehicle States",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_user_roles: defineGridTableConfig("lookup_user_roles", {
    label: "Lookup User Roles",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_user_statuses: defineGridTableConfig("lookup_user_statuses", {
    label: "Lookup User Statuses",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_audit_actions: defineGridTableConfig("lookup_audit_actions", {
    label: "Lookup Audit Actions",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  log_alteracoes: defineGridTableConfig("log_alteracoes", {
    label: "Log de Alteracoes",
    primaryKey: "id",
    defaultHeader: [
      "id",
      "tabela",
      "pk",
      "acao",
      "autor",
      "autor_cargo",
      "autor_email",
      "em_lote",
      "lote_id",
      "detalhes",
      "data_hora",
      "created_at"
    ],
    searchableColumns: ["tabela", "pk", "acao", "autor", "autor_email"],
    lockedColumns: ["id", "created_at", "data_hora"],
    defaultSort: [{ column: "data_hora", dir: "desc" }]
  })
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
