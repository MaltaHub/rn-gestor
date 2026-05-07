import type { GridTableName, GridTablePolicy } from "@/lib/domain/grid-policy";
import { GRID_TABLE_POLICIES } from "@/lib/domain/grid-policy";

export type GridTableConfig = GridTablePolicy & {
  table: GridTableName;
  label: string;
  primaryKey: string;
  defaultHeader: string[];
  excludedColumns?: string[];
  searchableColumns: string[];
  lockedColumns: string[];
  readableColumns: string[];
  editableColumns: string[];
  formColumns: string[];
  formOnlyColumns: string[];
  virtualColumns: string[];
  filterableColumns: string[];
  sortableColumns: string[];
  defaultSort: Array<{ column: string; dir: "asc" | "desc" }>;
};

type GridTableConfigInput = Omit<
  GridTableConfig,
  | "table"
  | "minReadRole"
  | "minWriteRole"
  | "minDeleteRole"
  | "readOnly"
  | "readableColumns"
  | "editableColumns"
  | "formColumns"
  | "formOnlyColumns"
  | "virtualColumns"
  | "filterableColumns"
  | "sortableColumns"
> & {
  readableColumns?: string[];
  editableColumns?: string[];
  formColumns?: string[];
  formOnlyColumns?: string[];
  virtualColumns?: string[];
  filterableColumns?: string[];
  sortableColumns?: string[];
};

function defineGridTableConfig(table: GridTableName, config: GridTableConfigInput): GridTableConfig {
  const policy = GRID_TABLE_POLICIES[table];
  const excludedColumns = config.excludedColumns ?? [];
  const formOnlyColumns = config.formOnlyColumns ?? [];
  const virtualColumns = config.virtualColumns ?? [];
  const virtualColumnSet = new Set(virtualColumns);
  const readableColumns =
    config.readableColumns ??
    Array.from(
      new Set([...config.defaultHeader, ...config.searchableColumns, ...config.lockedColumns, ...excludedColumns, ...formOnlyColumns])
    );
  const editableColumns =
    config.editableColumns ??
    config.defaultHeader.filter(
      (column) => !config.lockedColumns.includes(column) && !column.startsWith("__") && !virtualColumnSet.has(column)
    );
  const formColumns = config.formColumns ?? (policy.readOnly ? [] : editableColumns);
  const filterableColumns =
    config.filterableColumns ??
    Array.from(
      new Set(
        readableColumns.filter(
          (column) => !column.startsWith("__") && !virtualColumnSet.has(column) && !excludedColumns.includes(column)
        )
      )
    );
  const sortableColumns =
    config.sortableColumns ??
    Array.from(
      new Set(
        [...config.defaultSort.map((rule) => rule.column), ...config.defaultHeader].filter(
          (column) => !column.startsWith("__") && !virtualColumnSet.has(column)
        )
      )
    );

  return {
    table,
    ...config,
    excludedColumns,
    readableColumns,
    editableColumns,
    formColumns,
    formOnlyColumns,
    virtualColumns,
    filterableColumns,
    sortableColumns,
    ...policy
  };
}

const GRID_TABLES: Record<GridTableName, GridTableConfig> = {
  carros: defineGridTableConfig("carros", {
    label: "Carros",
    primaryKey: "id",
    defaultHeader: [
      "id",
      "placa",
      "chassi",
      "nome",
      "modelo_id",
      "local",
      "estado_venda",
      "estado_anuncio",
      "estado_veiculo",
      "em_estoque",
      "tem_fotos",
      "os_supply_appscript_check",
      "cor",
      "ano_fab",
      "ano_mod",
      "hodometro",
      "preco_original",
      "ano_ipva_pago",
      "created_at",
      "updated_at"
    ],
    excludedColumns: ["os_supply_appscript_check"],
    formOnlyColumns: ["tem_chave_r", "tem_manual"],
    editableColumns: [
      "placa",
      "chassi",
      "nome",
      "modelo_id",
      "local",
      "estado_venda",
      "estado_veiculo",
      "em_estoque",
      "tem_chave_r",
      "tem_manual",
      "cor",
      "ano_fab",
      "ano_mod",
      "hodometro",
      "preco_original",
      "ano_ipva_pago"
    ],
    formColumns: [
      "placa",
      "chassi",
      "nome",
      "modelo_id",
      "local",
      "estado_venda",
      "estado_veiculo",
      "em_estoque",
      "tem_chave_r",
      "tem_manual",
      "cor",
      "ano_fab",
      "ano_mod",
      "hodometro",
      "preco_original",
      "ano_ipva_pago"
    ],
    searchableColumns: ["placa", "chassi", "nome", "cor"],
    lockedColumns: ["id", "created_at", "updated_at", "ultima_alteracao", "os_supply_appscript_check"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }),
  anuncios: defineGridTableConfig("anuncios", {
    label: "Anuncios",
    primaryKey: "id",
    defaultHeader: [
      "id",
      "carro_id",
      "anuncio_legado",
      "id_anuncio_legado",
      "no_instagram",
      "estado_anuncio",
      "valor_anuncio",
      "descricao",
      "preco_carro_atual",
      "__insight_message",
      "created_at",
      "updated_at"
    ],
    virtualColumns: ["preco_carro_atual", "__insight_message"],
    editableColumns: [
      "carro_id",
      "estado_anuncio",
      "valor_anuncio",
      "descricao",
      "anuncio_legado",
      "id_anuncio_legado",
      "no_instagram"
    ],
    formColumns: [
      "carro_id",
      "estado_anuncio",
      "valor_anuncio",
      "descricao",
      "anuncio_legado",
      "id_anuncio_legado",
      "no_instagram"
    ],
    excludedColumns: [
      "__has_pending_action",
      "__delete_recommended",
      "__replace_recommended",
      "__replacement_carro_id",
      "__missing_data",
      "__insight_code",
      "__valor_anuncio_sugerido",
      "__reference_group_id",
      "__reference_kind",
      "__reference_from_repeated"
    ],
    searchableColumns: ["estado_anuncio", "carro_id", "id_anuncio_legado", "descricao"],
    lockedColumns: ["id", "created_at", "updated_at", "preco_carro_atual"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }),
  documentos: defineGridTableConfig("documentos", {
    label: "Documentos",
    primaryKey: "carro_id",
    defaultHeader: ["carro_id", "doc_entrada", "envelope", "pericia", "created_at", "updated_at"],
    editableColumns: ["carro_id", "doc_entrada", "envelope", "pericia"],
    formColumns: ["carro_id", "doc_entrada", "envelope", "pericia"],
    searchableColumns: ["carro_id"],
    lockedColumns: ["carro_id", "created_at", "updated_at"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }),
  modelos: defineGridTableConfig("modelos", {
    label: "Modelos",
    primaryKey: "id",
    defaultHeader: ["id", "modelo", "created_at", "updated_at"],
    formColumns: ["modelo"],
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
    formColumns: [],
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
    formColumns: [],
    searchableColumns: ["grupo_id", "cor", "caracteristicas_visuais_resumo"],
    lockedColumns: ["grupo_id", "created_at", "updated_at", "atualizado_em"],
    defaultSort: [{ column: "qtde", dir: "desc" }]
  }),
  repetidos: defineGridTableConfig("repetidos", {
    label: "Repetidos",
    primaryKey: "carro_id",
    defaultHeader: ["carro_id", "grupo_id", "created_at", "updated_at"],
    formColumns: [],
    searchableColumns: ["carro_id", "grupo_id"],
    lockedColumns: ["carro_id", "grupo_id", "created_at", "updated_at"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }),
  caracteristicas_tecnicas: defineGridTableConfig("caracteristicas_tecnicas", {
    label: "Caracteristicas Tecnicas",
    primaryKey: "id",
    defaultHeader: ["id", "caracteristica", "created_at", "updated_at"],
    formColumns: ["caracteristica"],
    searchableColumns: ["caracteristica"],
    lockedColumns: ["id", "created_at", "updated_at"],
    defaultSort: [{ column: "caracteristica", dir: "asc" }]
  }),
  caracteristicas_visuais: defineGridTableConfig("caracteristicas_visuais", {
    label: "Caracteristicas Visuais",
    primaryKey: "id",
    defaultHeader: ["id", "caracteristica", "created_at", "updated_at"],
    formColumns: ["caracteristica"],
    searchableColumns: ["caracteristica"],
    lockedColumns: ["id", "created_at", "updated_at"],
    defaultSort: [{ column: "caracteristica", dir: "asc" }]
  }),
  carro_caracteristicas_tecnicas: defineGridTableConfig("carro_caracteristicas_tecnicas", {
    label: "Carro x Caracteristicas Tecnicas",
    primaryKey: "__row_id",
    defaultHeader: ["carro_id", "caracteristica_id", "created_at", "updated_at"],
    formColumns: ["carro_id", "caracteristica_id"],
    searchableColumns: ["carro_id", "caracteristica_id"],
    lockedColumns: ["__row_id", "created_at", "updated_at"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }),
  carro_caracteristicas_visuais: defineGridTableConfig("carro_caracteristicas_visuais", {
    label: "Carro x Caracteristicas Visuais",
    primaryKey: "__row_id",
    defaultHeader: ["carro_id", "caracteristica_id", "created_at", "updated_at"],
    formColumns: ["carro_id", "caracteristica_id"],
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
    formColumns: [],
    searchableColumns: ["nome", "email", "cargo", "status"],
    lockedColumns: ["id", "auth_user_id", "created_at", "updated_at"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }),
  lookup_locations: defineGridTableConfig("lookup_locations", {
    label: "Lookup Locations",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    formColumns: ["name", "description", "is_active", "sort_order"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_sale_statuses: defineGridTableConfig("lookup_sale_statuses", {
    label: "Lookup Sale Statuses",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    formColumns: ["name", "description", "is_active", "sort_order"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_announcement_statuses: defineGridTableConfig("lookup_announcement_statuses", {
    label: "Lookup Announcement Statuses",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    formColumns: ["name", "description", "is_active", "sort_order"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_vehicle_states: defineGridTableConfig("lookup_vehicle_states", {
    label: "Lookup Vehicle States",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    formColumns: ["name", "description", "is_active", "sort_order"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_user_roles: defineGridTableConfig("lookup_user_roles", {
    label: "Lookup User Roles",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    formColumns: ["name", "description", "is_active", "sort_order"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_user_statuses: defineGridTableConfig("lookup_user_statuses", {
    label: "Lookup User Statuses",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    formColumns: ["name", "description", "is_active", "sort_order"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_audit_actions: defineGridTableConfig("lookup_audit_actions", {
    label: "Lookup Audit Actions",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    formColumns: ["name", "description", "is_active", "sort_order"],
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
    formColumns: [],
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
