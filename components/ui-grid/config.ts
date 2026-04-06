import type { SheetConfig, SheetKey } from "@/components/ui-grid/types";
import { GRID_TABLE_POLICIES } from "@/lib/domain/grid-policy";

function normalizeComparableNumber(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function hasAnnouncementPendingUpdate(row: Record<string, unknown>) {
  // Backend computes consolidated pending flag (price/reference), respecting verification
  if (typeof row.__has_pending_action === "boolean") return row.__has_pending_action;
  // Fallback to simple price mismatch if backend flag absent
  return normalizeComparableNumber(row.valor_anuncio) !== normalizeComparableNumber(row.preco_carro_atual);
}

function isMissingAnnouncementReferenceRow(row: Record<string, unknown>) {
  return row.__missing_data === true;
}

function defineSheet(
  key: SheetKey,
  config: Omit<SheetConfig, "key" | "minReadRole" | "minWriteRole" | "minDeleteRole" | "readOnly">
): SheetConfig {
  return {
    key,
    ...config,
    ...GRID_TABLE_POLICIES[key]
  };
}

export const SHEETS: SheetConfig[] = [
  defineSheet("carros", {
    label: "CARROS",
    group: "Operacional",
    description: "Estoque principal de veiculos",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at", "ultima_alteracao"],
    rowClassName: (row) => {
      if (row.em_estoque === false) return "sheet-row-sold";
      return "";
    }
  }),
  defineSheet("anuncios", {
    label: "ANUNCIOS",
    group: "Operacional",
    description: "Publicacoes de venda",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at", "preco_carro_atual"],
    rowClassName: (row) => {
      if (isMissingAnnouncementReferenceRow(row)) return "sheet-row-missing-data";
      if (hasAnnouncementPendingUpdate(row)) return "sheet-row-warning"; // yellow has precedence
      if (row.__delete_recommended === true) return "sheet-row-delete"; // purple when delete suggested
      return "";
    }
  }),
  defineSheet("modelos", {
    label: "MODELOS",
    group: "Operacional",
    description: "Catalogo de modelos",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at"]
  }),
  defineSheet("finalizados", {
    label: "FINALIZADOS",
    group: "Operacional",
    description: "Historico de vendas concluidas",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at", "finalizado_em"]
  }),
  defineSheet("grupos_repetidos", {
    label: "REPETIDOS_GRUPOS",
    group: "Analise",
    description: "Agrupamentos detectados",
    primaryKey: "grupo_id",
    lockedColumns: ["grupo_id", "created_at", "updated_at", "atualizado_em"],
    rowClassName: (row) => {
      if (typeof row.qtde === "number" && row.qtde > 1) return "sheet-row-repeated";
      return "";
    }
  }),
  defineSheet("repetidos", {
    label: "REPETIDOS",
    group: "Analise",
    description: "Itens de cada grupo repetido",
    primaryKey: "carro_id",
    lockedColumns: ["carro_id", "grupo_id", "created_at", "updated_at"]
  }),
  defineSheet("caracteristicas_tecnicas", {
    label: "CARACT_TECNICAS",
    group: "Catalogos",
    description: "Atributos tecnicos",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at"]
  }),
  defineSheet("caracteristicas_visuais", {
    label: "CARACT_VISUAIS",
    group: "Catalogos",
    description: "Atributos visuais",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at"]
  }),
  defineSheet("carro_caracteristicas_tecnicas", {
    label: "CARRO_X_TECNICAS",
    group: "Catalogos",
    description: "Relacao carro e tecnica",
    primaryKey: "__row_id",
    lockedColumns: ["__row_id", "created_at", "updated_at"]
  }),
  defineSheet("carro_caracteristicas_visuais", {
    label: "CARRO_X_VISUAIS",
    group: "Catalogos",
    description: "Relacao carro e visual",
    primaryKey: "__row_id",
    lockedColumns: ["__row_id", "created_at", "updated_at"]
  }),
  defineSheet("usuarios_acesso", {
    label: "USUARIOS",
    group: "Seguranca",
    description: "Contas e permissoes",
    primaryKey: "id",
    lockedColumns: ["id", "auth_user_id", "created_at", "updated_at"]
  }),
  defineSheet("lookup_locations", {
    label: "LKP_LOCAIS",
    group: "Dominios",
    description: "Locais de operacao",
    primaryKey: "code",
    lockedColumns: ["code", "created_at", "updated_at"]
  }),
  defineSheet("lookup_sale_statuses", {
    label: "LKP_VENDA_STATUS",
    group: "Dominios",
    description: "Estados de venda",
    primaryKey: "code",
    lockedColumns: ["code", "created_at", "updated_at"]
  }),
  defineSheet("lookup_announcement_statuses", {
    label: "LKP_ANUNCIO_STATUS",
    group: "Dominios",
    description: "Estados de anuncio",
    primaryKey: "code",
    lockedColumns: ["code", "created_at", "updated_at"]
  }),
  defineSheet("lookup_vehicle_states", {
    label: "LKP_VEICULO_ESTADO",
    group: "Dominios",
    description: "Condicao do veiculo",
    primaryKey: "code",
    lockedColumns: ["code", "created_at", "updated_at"]
  }),
  defineSheet("lookup_user_roles", {
    label: "LKP_PERFIS",
    group: "Dominios",
    description: "Perfis de acesso",
    primaryKey: "code",
    lockedColumns: ["code", "created_at", "updated_at"]
  }),
  defineSheet("lookup_user_statuses", {
    label: "LKP_STATUS_USUARIO",
    group: "Dominios",
    description: "Status de conta",
    primaryKey: "code",
    lockedColumns: ["code", "created_at", "updated_at"]
  }),
  defineSheet("lookup_audit_actions", {
    label: "LKP_AUDIT_ACAO",
    group: "Dominios",
    description: "Acoes de auditoria",
    primaryKey: "code",
    lockedColumns: ["code", "created_at", "updated_at"]
  }),
  defineSheet("log_alteracoes", {
    label: "AUDITORIA_LOG",
    group: "Auditoria",
    description: "Rastro de alteracoes",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "data_hora"]
  })
];

export const DEFAULT_SHEET: SheetConfig = SHEETS[0];
