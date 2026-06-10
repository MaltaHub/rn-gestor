import type { GridTableName, GridTablePolicy } from "@/lib/domain/grid-policy";
import { GRID_TABLE_POLICIES } from "@/lib/domain/grid-policy";

/**
 * Tipo logico de cada coluna do grid. Usado pelo schema-system do editor de
 * fluxos pra inferir tipos disponiveis nos dropdowns e validar conexoes.
 *
 * - "string": texto, UUID, email, descricao
 * - "number": numero inteiro ou decimal
 * - "boolean": flag verdadeiro/falso
 * - "date": timestamp ISO (created_at, data_venda, etc.)
 * - "unknown": fallback pra colunas sem tipagem declarada
 */
export type ColumnType = "string" | "number" | "boolean" | "date" | "unknown";

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
  /**
   * Tipo declarado de cada coluna do `defaultHeader` (e formOnlyColumns).
   * Opcional: sheets sem essa declaracao caem em "unknown" pelo getSheetSchema.
   */
  columnTypes?: Record<string, ColumnType>;
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
  columnTypes?: Record<string, ColumnType>;
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
      "renavam",
      "nome",
      "modelo_id",
      "local",
      "estado_venda",
      "estado_anuncio",
      "estado_veiculo",
      "em_estoque",
      "participa_calculos",
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
      "renavam",
      "nome",
      "modelo_id",
      "local",
      "estado_venda",
      "estado_veiculo",
      "em_estoque",
      "participa_calculos",
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
      "renavam",
      "nome",
      "modelo_id",
      "local",
      "estado_venda",
      "estado_veiculo",
      "em_estoque",
      "participa_calculos",
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
    defaultSort: [{ column: "created_at", dir: "desc" }],
    columnTypes: {
      id: "string",
      placa: "string",
      chassi: "string",
      renavam: "string",
      nome: "string",
      modelo_id: "string",
      local: "string",
      estado_venda: "string",
      estado_anuncio: "string",
      estado_veiculo: "string",
      em_estoque: "boolean",
      participa_calculos: "boolean",
      tem_fotos: "boolean",
      tem_chave_r: "boolean",
      tem_manual: "boolean",
      os_supply_appscript_check: "boolean",
      cor: "string",
      ano_fab: "number",
      ano_mod: "number",
      hodometro: "number",
      preco_original: "number",
      ano_ipva_pago: "number",
      created_at: "date",
      updated_at: "date",
      ultima_alteracao: "date"
    }
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
  vendas: defineGridTableConfig("vendas", {
    label: "Vendas",
    primaryKey: "id",
    defaultHeader: [
      "id",
      "data_venda",
      "data_entrega",
      "carro_id",
      "vendedor_auth_user_id",
      "canal_cliente",
      "comprador_nome",
      "forma_pagamento",
      "valor_total",
      "estado_venda",
      "observacao",
      "created_at"
    ],
    editableColumns: [
      "carro_id",
      "vendedor_auth_user_id",
      "data_venda",
      "data_entrega",
      "valor_total",
      "valor_entrada",
      "forma_pagamento",
      "estado_venda",
      "canal_cliente",
      "observacao",
      "comprador_nome",
      "comprador_documento",
      "comprador_telefone",
      "comprador_email",
      "comprador_endereco",
      "financ_banco",
      "financ_parcelas_qtde",
      "financ_parcela_valor",
      "financ_taxa_mensal",
      "financ_primeira_em",
      "seguro_seguradora",
      "seguro_apolice",
      "seguro_valor",
      "seguro_validade",
      "troca_marca",
      "troca_modelo",
      "troca_ano",
      "troca_placa",
      "troca_valor"
    ],
    formColumns: [
      "carro_id",
      "vendedor_auth_user_id",
      "data_venda",
      "data_entrega",
      "valor_total",
      "valor_entrada",
      "forma_pagamento",
      "estado_venda",
      "canal_cliente",
      "comprador_nome",
      "comprador_documento",
      "comprador_telefone",
      "comprador_email",
      "comprador_endereco",
      "financ_banco",
      "financ_parcelas_qtde",
      "financ_parcela_valor",
      "financ_taxa_mensal",
      "financ_primeira_em",
      "seguro_seguradora",
      "seguro_apolice",
      "seguro_valor",
      "seguro_validade",
      "troca_marca",
      "troca_modelo",
      "troca_ano",
      "troca_placa",
      "troca_valor",
      "observacao"
    ],
    searchableColumns: [
      "comprador_nome",
      "comprador_documento",
      "estado_venda",
      "forma_pagamento",
      "canal_cliente",
      "financ_banco",
      "seguro_seguradora",
      "troca_placa",
      "observacao"
    ],
    lockedColumns: ["id", "created_at", "updated_at", "created_by_user_id"],
    defaultSort: [
      { column: "data_venda", dir: "desc" },
      { column: "created_at", dir: "desc" }
    ],
    columnTypes: {
      id: "string",
      data_venda: "date",
      data_entrega: "date",
      carro_id: "string",
      vendedor_auth_user_id: "string",
      canal_cliente: "string",
      comprador_nome: "string",
      comprador_documento: "string",
      comprador_telefone: "string",
      comprador_email: "string",
      comprador_endereco: "string",
      forma_pagamento: "string",
      valor_total: "number",
      valor_entrada: "number",
      estado_venda: "string",
      observacao: "string",
      financ_banco: "string",
      financ_parcelas_qtde: "number",
      financ_parcela_valor: "number",
      financ_taxa_mensal: "number",
      financ_primeira_em: "date",
      seguro_seguradora: "string",
      seguro_apolice: "string",
      seguro_valor: "number",
      seguro_validade: "date",
      troca_marca: "string",
      troca_modelo: "string",
      troca_ano: "number",
      troca_placa: "string",
      troca_valor: "number",
      created_at: "date",
      updated_at: "date",
      created_by_user_id: "string"
    }
  }),
  documentos: defineGridTableConfig("documentos", {
    label: "Documentos",
    primaryKey: "carro_id",
    defaultHeader: [
      "carro_id",
      "placa",
      "origem",
      "valor_compra",
      "tipo_de_processo",
      "proposito",
      "remetente_id",
      "pericia",
      "envelope",
      "recibo_compra",
      "chave_reserva",
      "estado_transferencia",
      "responsavel_virado",
      "observacao",
      "nota_entrada",
      "nota_saida",
      "__insight_message",
      "created_at",
      "updated_at"
    ],
    // placa e __insight_message vem do enriquecimento (lib/api/documentos-insights).
    virtualColumns: ["placa", "__insight_message"],
    excludedColumns: ["__finalizar_documento", "__missing_data", "__insight_code"],
    // Todos os campos do parser agora sao editaveis manualmente ("campos abertos"):
    // o reparse continua sobrescrevendo quando casa um token de nome de arquivo,
    // mas o usuario pode bloquear a automacao por pasta (botao "Automatizar") para
    // que a edicao manual fique. So carro_id e timestamps permanecem travados.
    editableColumns: [
      "carro_id",
      "origem",
      "valor_compra",
      "tipo_de_processo",
      "proposito",
      "pericia",
      "envelope",
      "recibo_compra",
      "chave_reserva",
      "estado_transferencia",
      "remetente_id",
      "responsavel_virado",
      "observacao",
      "nota_entrada",
      "nota_saida"
    ],
    formColumns: [
      "carro_id",
      "origem",
      "valor_compra",
      "tipo_de_processo",
      "proposito",
      "pericia",
      "envelope",
      "recibo_compra",
      "chave_reserva",
      "estado_transferencia",
      "remetente_id",
      "responsavel_virado",
      "observacao",
      "nota_entrada",
      "nota_saida"
    ],
    searchableColumns: ["carro_id", "responsavel_virado", "observacao"],
    lockedColumns: ["carro_id", "placa", "created_at", "updated_at", "__insight_message"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }),
  remetentes: defineGridTableConfig("remetentes", {
    label: "Remetentes",
    primaryKey: "id",
    defaultHeader: ["id", "nome", "endereco", "cpf_cnpj", "is_active", "created_at", "updated_at"],
    editableColumns: ["nome", "endereco", "cpf_cnpj", "is_active"],
    formColumns: ["nome", "endereco", "cpf_cnpj", "is_active"],
    searchableColumns: ["nome", "cpf_cnpj", "endereco"],
    lockedColumns: ["id", "created_at", "updated_at"],
    defaultSort: [{ column: "nome", dir: "asc" }]
  }),
  controle_envelopes: defineGridTableConfig("controle_envelopes", {
    label: "Controle de Envelopes",
    primaryKey: "id",
    defaultHeader: [
      "id",
      "carro_id",
      "item",
      "status",
      "usuario_auth_user_id",
      "observacao",
      "retirado_em",
      "devolvido_em",
      "created_at"
    ],
    editableColumns: ["carro_id", "item", "observacao"],
    formColumns: ["carro_id", "item", "observacao"],
    searchableColumns: ["carro_id", "item", "status", "observacao"],
    lockedColumns: ["id", "created_at", "updated_at", "retirado_em", "devolvido_em", "status", "usuario_auth_user_id"],
    defaultSort: [{ column: "retirado_em", dir: "desc" }]
  }),
  observacoes: defineGridTableConfig("observacoes", {
    label: "Observacoes (Post-its)",
    primaryKey: "id",
    defaultHeader: [
      "id",
      "carro_id",
      "tipo",
      "texto",
      "status",
      "autor_auth_user_id",
      "created_at",
      "resolvido_em"
    ],
    editableColumns: ["carro_id", "tipo", "texto"],
    formColumns: ["carro_id", "tipo", "texto"],
    searchableColumns: ["carro_id", "tipo", "texto", "status"],
    lockedColumns: ["id", "created_at", "updated_at", "resolvido_em", "status", "autor_auth_user_id"],
    defaultSort: [{ column: "created_at", dir: "desc" }]
  }),
  modelos: defineGridTableConfig("modelos", {
    label: "Modelos",
    primaryKey: "id",
    defaultHeader: ["id", "modelo", "created_at", "updated_at"],
    formColumns: ["modelo"],
    searchableColumns: ["modelo"],
    lockedColumns: ["id", "created_at", "updated_at"],
    defaultSort: [{ column: "modelo", dir: "asc" }],
    columnTypes: {
      id: "string",
      modelo: "string",
      created_at: "date",
      updated_at: "date"
    }
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
    defaultSort: [{ column: "finalizado_em", dir: "desc" }],
    columnTypes: {
      id: "string",
      placa: "string",
      modelo: "string",
      cor: "string",
      ano_fab: "number",
      ano_mod: "number",
      hodometro: "number",
      data_venda: "date",
      valor_venda: "number",
      vendedor: "string",
      finalizado_em: "date",
      created_at: "date",
      updated_at: "date"
    }
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
    editableColumns: ["code", "name", "description", "is_active", "sort_order"],
    formColumns: ["code", "name", "description", "is_active", "sort_order"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_sale_statuses: defineGridTableConfig("lookup_sale_statuses", {
    label: "Lookup Sale Statuses",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    editableColumns: ["code", "name", "description", "is_active", "sort_order"],
    formColumns: ["code", "name", "description", "is_active", "sort_order"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_announcement_statuses: defineGridTableConfig("lookup_announcement_statuses", {
    label: "Lookup Announcement Statuses",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    editableColumns: ["code", "name", "description", "is_active", "sort_order"],
    formColumns: ["code", "name", "description", "is_active", "sort_order"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_vehicle_states: defineGridTableConfig("lookup_vehicle_states", {
    label: "Lookup Vehicle States",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    editableColumns: ["code", "name", "description", "is_active", "sort_order"],
    formColumns: ["code", "name", "description", "is_active", "sort_order"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_user_roles: defineGridTableConfig("lookup_user_roles", {
    label: "Lookup User Roles",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    editableColumns: ["code", "name", "description", "is_active", "sort_order"],
    formColumns: ["code", "name", "description", "is_active", "sort_order"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_user_statuses: defineGridTableConfig("lookup_user_statuses", {
    label: "Lookup User Statuses",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    editableColumns: ["code", "name", "description", "is_active", "sort_order"],
    formColumns: ["code", "name", "description", "is_active", "sort_order"],
    searchableColumns: ["code", "name", "description"],
    lockedColumns: ["code", "created_at", "updated_at"],
    defaultSort: [{ column: "sort_order", dir: "asc" }]
  }),
  lookup_audit_actions: defineGridTableConfig("lookup_audit_actions", {
    label: "Lookup Audit Actions",
    primaryKey: "code",
    defaultHeader: ["code", "name", "description", "is_active", "sort_order", "created_at", "updated_at"],
    editableColumns: ["code", "name", "description", "is_active", "sort_order"],
    formColumns: ["code", "name", "description", "is_active", "sort_order"],
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
