/**
 * components/ui-grid/config.ts
 *
 * Configuracao das sheets da grid.
 * rowClassName de anuncios usa getAnuncioRowClass do dominio - nao defina
 * logica de cor de linha aqui diretamente.
 */

import type { SheetConfig, SheetKey } from "@/components/ui-grid/types";
import {
  extractInsightFlagsFromRow,
  getAnuncioRowClass,
} from "@/lib/domain/anuncios-insights";
import {
  extractDocumentoInsightFlagsFromRow,
  getDocumentoRowClass,
} from "@/lib/domain/documentos-insights";
import { COMPLIANCE_ROW_CLASS, rowHasMissingImportant } from "@/lib/domain/compliance";
import { GRID_TABLE_POLICIES } from "@/lib/domain/grid-policy";

/** Junta a classe de compliance (fonte amarela) quando falta campo importante. */
function withCompliance(table: string, row: Record<string, unknown>, base: string): string {
  return rowHasMissingImportant(table, row) ? `${base} ${COMPLIANCE_ROW_CLASS}`.trim() : base;
}

function defineSheet(
  key: SheetKey,
  config: Omit<SheetConfig, "key" | "minReadRole" | "minWriteRole" | "minDeleteRole" | "readOnly">
): SheetConfig {
  return {
    key,
    ...config,
    ...GRID_TABLE_POLICIES[key],
  };
}

export const SHEETS: SheetConfig[] = [
  defineSheet("carros", {
    label: "CARROS",
    group: "Operacional",
    description: "Estoque principal de veiculos",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at", "ultima_alteracao"],
    bulkSelectColumn: "placa",
    rowClassName: (row) => {
      const isReserved = String(row.estado_venda ?? "").toUpperCase() === "RESERVADO";
      const base = isReserved ? "sheet-row-reserved" : row.em_estoque === false ? "sheet-row-sold" : "";
      return withCompliance("carros", row, base);
    },
  }),

  defineSheet("anuncios", {
    label: "ANUNCIOS",
    group: "Operacional",
    description: "Publicacoes de venda",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at", "preco_carro_atual"],
    /**
     * rowClassName derivado inteiramente do dominio.
     * Para alterar qual insight "ganha" visualmente, edite ANUNCIO_INSIGHT_PRIORITY
     * em lib/domain/anuncios-insights.ts - nao altere aqui.
     */
    rowClassName: (row) => getAnuncioRowClass(extractInsightFlagsFromRow(row)),
  }),

  defineSheet("documentos", {
    label: "DOCUMENTOS",
    group: "Operacional",
    description: "Checklist documental por veiculo",
    primaryKey: "carro_id",
    lockedColumns: ["carro_id", "placa", "created_at", "updated_at"],
    /**
     * rowClassName derivado do dominio (lib/domain/documentos-insights.ts):
     * FINALIZAR_DOCUMENTO (vendido, envelope != FECHADO) e DOCUMENTO_SEM_LINHA.
     */
    rowClassName: (row) =>
      withCompliance("documentos", row, getDocumentoRowClass(extractDocumentoInsightFlagsFromRow(row))),
  }),

  defineSheet("modelos", {
    label: "MODELOS",
    group: "Operacional",
    description: "Catalogo de modelos",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at"],
    bulkSelectColumn: "modelo",
  }),

  defineSheet("controle_envelopes", {
    label: "ENVELOPES",
    group: "Operacional",
    description: "Controle de retirada/devolucao de envelope e chave reserva",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at", "retirado_em", "devolvido_em"],
  }),

  defineSheet("observacoes", {
    label: "POST-ITS",
    group: "Operacional",
    description: "Observacoes (post-its) por veiculo",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at", "resolvido_em"],
  }),

  defineSheet("vendas", {
    label: "VENDAS",
    group: "Operacional",
    description: "Registros de vendas com vendedor, comprador, pagamento, transferencia e seguro",
    primaryKey: "id",
    // valor_entrada e denormalizado (soma de venda_entradas via trigger).
    lockedColumns: ["id", "valor_entrada", "created_at", "updated_at", "created_by_user_id"],
    bulkSelectColumn: "comprador_nome",
    rowClassName: (row) =>
      withCompliance(
        "vendas",
        row,
        row.estado_venda === "cancelada"
          ? "sheet-row-canceled"
          : row.estado_venda === "obsoleta"
            ? "sheet-row-obsolete"
            : ""
      ),
  }),

  defineSheet("venda_entradas", {
    label: "ENTRADAS",
    group: "Operacional",
    description: "Entradas (sinal) por venda: pix, cartao de credito, carro na troca",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at"],
  }),

  defineSheet("finalizados", {
    label: "FINALIZADOS",
    group: "Operacional",
    description: "Historico de vendas concluidas",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at", "finalizado_em"],
    bulkSelectColumn: "placa",
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
    },
  }),

  defineSheet("repetidos", {
    label: "REPETIDOS",
    group: "Analise",
    description: "Itens de cada grupo repetido",
    primaryKey: "carro_id",
    lockedColumns: ["carro_id", "grupo_id", "created_at", "updated_at"],
  }),

  defineSheet("remetentes", {
    label: "REMETENTES",
    group: "Catalogos",
    description: "Remetentes da documentacao (nome, endereco, CPF/CNPJ)",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at"],
  }),

  defineSheet("caracteristicas_tecnicas", {
    label: "CARACT_TECNICAS",
    group: "Catalogos",
    description: "Atributos tecnicos",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at"],
  }),

  defineSheet("caracteristicas_visuais", {
    label: "CARACT_VISUAIS",
    group: "Catalogos",
    description: "Atributos visuais",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at"],
  }),

  defineSheet("carro_caracteristicas_tecnicas", {
    label: "CARRO_X_TECNICAS",
    group: "Catalogos",
    description: "Relacao carro e tecnica",
    primaryKey: "__row_id",
    lockedColumns: ["__row_id", "created_at", "updated_at"],
  }),

  defineSheet("carro_caracteristicas_visuais", {
    label: "CARRO_X_VISUAIS",
    group: "Catalogos",
    description: "Relacao carro e visual",
    primaryKey: "__row_id",
    lockedColumns: ["__row_id", "created_at", "updated_at"],
  }),

  defineSheet("usuarios_acesso", {
    label: "USUARIOS",
    group: "Seguranca",
    description: "Contas e permissoes",
    primaryKey: "id",
    lockedColumns: ["id", "auth_user_id", "created_at", "updated_at"],
  }),

  defineSheet("lookup_locations", {
    label: "LKP_LOCAIS",
    group: "Dominios",
    description: "Locais de operacao",
    primaryKey: "code",
    lockedColumns: ["code", "created_at", "updated_at"],
  }),

  defineSheet("lookup_sale_statuses", {
    label: "LKP_VENDA_STATUS",
    group: "Dominios",
    description: "Estados de venda",
    primaryKey: "code",
    lockedColumns: ["code", "created_at", "updated_at"],
  }),

  defineSheet("lookup_announcement_statuses", {
    label: "LKP_ANUNCIO_STATUS",
    group: "Dominios",
    description: "Estados de anuncio",
    primaryKey: "code",
    lockedColumns: ["code", "created_at", "updated_at"],
  }),

  defineSheet("lookup_vehicle_states", {
    label: "LKP_VEICULO_ESTADO",
    group: "Dominios",
    description: "Condicao do veiculo",
    primaryKey: "code",
    lockedColumns: ["code", "created_at", "updated_at"],
  }),

  defineSheet("lookup_user_roles", {
    label: "LKP_PERFIS",
    group: "Dominios",
    description: "Perfis de acesso",
    primaryKey: "code",
    lockedColumns: ["code", "created_at", "updated_at"],
  }),

  defineSheet("lookup_user_statuses", {
    label: "LKP_STATUS_USUARIO",
    group: "Dominios",
    description: "Status de conta",
    primaryKey: "code",
    lockedColumns: ["code", "created_at", "updated_at"],
  }),

  defineSheet("lookup_audit_actions", {
    label: "LKP_AUDIT_ACAO",
    group: "Dominios",
    description: "Acoes de auditoria",
    primaryKey: "code",
    lockedColumns: ["code", "created_at", "updated_at"],
  }),

  defineSheet("log_alteracoes", {
    label: "AUDITORIA_LOG",
    group: "Auditoria",
    description: "Rastro de alteracoes",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "data_hora"],
  }),
];

export const DEFAULT_SHEET: SheetConfig = SHEETS[0];
