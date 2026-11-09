/**
 * Tabelas AUDITADAS — espelho da migration `20261109150000_auditoria_pelo_banco.sql`
 * (trigger `trg_00_auditoria`). Mudou a lista lá, mude aqui (e vice-versa).
 *
 * NÃO auditadas, de propósito:
 *  - log_alteracoes (a própria auditoria), client_errors (telemetria);
 *  - price_change_contexts (já é o registro da justificativa de preço);
 *  - repetidos, grupos_repetidos (recalculadas pelo banco a cada mudança: só ruído);
 *  - print_templates (layout de impressão pessoal);
 *  - lookup_audit_actions (catálogo da própria auditoria);
 *  - internal.app_settings, exceto `finalizacao_ativa` (as outras chaves são segredos).
 *
 * Retenção (pg_cron, de hora em hora): por tabela, 30 dias OU as 5.000 linhas mais novas.
 */

export type AuditTableGroup = "operacao" | "arquivos" | "configuracao";

export type AuditTable = { key: string; label: string; group: AuditTableGroup };

export const AUDIT_RETENTION = { days: 30, maxRowsPerTable: 5000 } as const;

export const AUDITED_TABLES: readonly AuditTable[] = [
  { key: "carros", label: "Carros", group: "operacao" },
  { key: "documentos", label: "Documentos", group: "operacao" },
  { key: "vendas", label: "Vendas", group: "operacao" },
  { key: "venda_entradas", label: "Entradas da venda", group: "operacao" },
  { key: "venda_documentos", label: "Documentos da venda", group: "operacao" },
  { key: "anuncios", label: "Anúncios", group: "operacao" },
  { key: "anuncios_insight_verifications", label: "Insights verificados", group: "operacao" },
  { key: "observacoes", label: "Observações", group: "operacao" },
  { key: "controle_envelopes", label: "Envelopes", group: "operacao" },
  { key: "modelos", label: "Modelos", group: "operacao" },
  { key: "remetentes", label: "Fornecedores", group: "operacao" },
  { key: "responsaveis_virado", label: "Titulares do CRLV", group: "operacao" },
  { key: "notas_fiscais", label: "Notas fiscais", group: "operacao" },
  { key: "pericias", label: "Perícias", group: "operacao" },
  { key: "carro_caracteristicas_visuais", label: "Características visuais do carro", group: "operacao" },
  { key: "carro_caracteristicas_tecnicas", label: "Características técnicas do carro", group: "operacao" },
  { key: "caracteristicas_visuais", label: "Características visuais", group: "configuracao" },
  { key: "caracteristicas_tecnicas", label: "Características técnicas", group: "configuracao" },
  { key: "finalizados", label: "Finalizados", group: "operacao" },
  { key: "arquivos_arquivos", label: "Arquivos", group: "arquivos" },
  { key: "arquivos_pastas", label: "Pastas", group: "arquivos" },
  { key: "arquivo_automacao_folders", label: "Pastas automáticas", group: "arquivos" },
  { key: "arquivo_automacao_config", label: "Automação de arquivos", group: "arquivos" },
  { key: "arquivo_automacao_regras", label: "Regras das pastas", group: "arquivos" },
  { key: "ocr_templates", label: "Templates de OCR", group: "arquivos" },
  { key: "usuarios_acesso", label: "Usuários", group: "configuracao" },
  { key: "lookups", label: "Listas de opções", group: "configuracao" },
  { key: "lookup_announcement_statuses", label: "Estados de anúncio", group: "configuracao" },
  { key: "lookup_locations", label: "Locais", group: "configuracao" },
  { key: "lookup_sale_statuses", label: "Estados de venda", group: "configuracao" },
  { key: "lookup_user_roles", label: "Cargos", group: "configuracao" },
  { key: "lookup_user_statuses", label: "Situações de usuário", group: "configuracao" },
  { key: "lookup_vehicle_states", label: "Estados do veículo", group: "configuracao" },
  { key: "documento_templates", label: "Modelos de documento", group: "configuracao" },
  { key: "internal.app_settings", label: "Configuração (finalização)", group: "configuracao" }
];

const BY_KEY = new Map(AUDITED_TABLES.map((table) => [table.key, table]));

export function isAuditedTable(key: string) {
  return BY_KEY.has(key);
}

/** Rótulo da tabela; logs antigos podem citar tabelas fora da lista. */
export function auditTableLabel(key: string) {
  return BY_KEY.get(key)?.label ?? key.replace(/_/g, " ");
}
