// ARQUIVO GERADO — nao editar a mao.
// Origem: lib/supabase/database.types.ts (Relationships do typegen do Supabase).
// Regerar com: node scripts/generate-relations.mjs
import type { SheetKey } from "@/components/ui-grid/types";

export type GeneratedRelationRef = { table: SheetKey; keyColumn: string };

/**
 * Todas as FKs declaradas no banco, coluna -> tabela/coluna alvo, filtradas para
 * tabelas servidas pelo grid. Eh mesclado com overrides manuais em grid-rules.
 */
export const GENERATED_RELATION_BY_SHEET_COLUMN: Partial<Record<SheetKey, Record<string, GeneratedRelationRef>>> = {
  "anuncios": {
    "carro_id": { table: "carros", keyColumn: "id" },
    "estado_anuncio": { table: "lookup_announcement_statuses", keyColumn: "code" }
  },
  "carro_caracteristicas_tecnicas": {
    "caracteristica_id": { table: "caracteristicas_tecnicas", keyColumn: "id" },
    "carro_id": { table: "carros", keyColumn: "id" }
  },
  "carro_caracteristicas_visuais": {
    "caracteristica_id": { table: "caracteristicas_visuais", keyColumn: "id" },
    "carro_id": { table: "carros", keyColumn: "id" }
  },
  "carros": {
    "estado_anuncio": { table: "lookup_announcement_statuses", keyColumn: "code" },
    "estado_veiculo": { table: "lookup_vehicle_states", keyColumn: "code" },
    "estado_venda": { table: "lookup_sale_statuses", keyColumn: "code" },
    "local": { table: "lookup_locations", keyColumn: "code" },
    "modelo_id": { table: "modelos", keyColumn: "id" }
  },
  "controle_envelopes": {
    "carro_id": { table: "carros", keyColumn: "id" }
  },
  "documentos": {
    "carro_id": { table: "carros", keyColumn: "id" },
    "remetente_id": { table: "remetentes", keyColumn: "id" }
  },
  "grupos_repetidos": {
    "modelo_id": { table: "modelos", keyColumn: "id" }
  },
  "log_alteracoes": {
    "acao": { table: "lookup_audit_actions", keyColumn: "code" },
    "autor_cargo": { table: "lookup_user_roles", keyColumn: "code" },
    "autor_usuario_id": { table: "usuarios_acesso", keyColumn: "id" }
  },
  "observacoes": {
    "carro_id": { table: "carros", keyColumn: "id" }
  },
  "repetidos": {
    "carro_id": { table: "carros", keyColumn: "id" },
    "grupo_id": { table: "grupos_repetidos", keyColumn: "grupo_id" }
  },
  "usuarios_acesso": {
    "cargo": { table: "lookup_user_roles", keyColumn: "code" },
    "status": { table: "lookup_user_statuses", keyColumn: "code" }
  },
  "venda_entradas": {
    "carro_troca_id": { table: "carros", keyColumn: "id" },
    "venda_id": { table: "vendas", keyColumn: "id" }
  },
  "vendas": {
    "carro_id": { table: "carros", keyColumn: "id" }
  }
};
