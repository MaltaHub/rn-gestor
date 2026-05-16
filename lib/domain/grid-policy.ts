import type { TableName } from "@/lib/domain/db";
import type { AppRole } from "@/lib/domain/access";

export type GridTableName = Extract<
  TableName,
  | "anuncios"
  | "caracteristicas_tecnicas"
  | "caracteristicas_visuais"
  | "carro_caracteristicas_tecnicas"
  | "carro_caracteristicas_visuais"
  | "carros"
  | "documentos"
  | "finalizados"
  | "grupos_repetidos"
  | "log_alteracoes"
  | "lookup_announcement_statuses"
  | "lookup_audit_actions"
  | "lookup_locations"
  | "lookup_sale_statuses"
  | "lookup_user_roles"
  | "lookup_user_statuses"
  | "lookup_vehicle_states"
  | "modelos"
  | "repetidos"
  | "usuarios_acesso"
  | "vendas"
>;

export type GridTablePolicy = {
  minReadRole: AppRole;
  minWriteRole: AppRole;
  minDeleteRole: AppRole;
  readOnly?: boolean;
};

export const GRID_TABLE_POLICIES: Record<GridTableName, GridTablePolicy> = {
  carros: {
    minReadRole: "VENDEDOR",
    minWriteRole: "SECRETARIO",
    minDeleteRole: "GERENTE"
  },
  anuncios: {
    minReadRole: "VENDEDOR",
    minWriteRole: "SECRETARIO",
    minDeleteRole: "GERENTE"
  },
  documentos: {
    minReadRole: "VENDEDOR",
    minWriteRole: "SECRETARIO",
    minDeleteRole: "GERENTE"
  },
  vendas: {
    minReadRole: "VENDEDOR",
    minWriteRole: "VENDEDOR",
    minDeleteRole: "GERENTE"
  },
  modelos: {
    minReadRole: "VENDEDOR",
    minWriteRole: "SECRETARIO",
    minDeleteRole: "GERENTE"
  },
  finalizados: {
    minReadRole: "VENDEDOR",
    minWriteRole: "GERENTE",
    minDeleteRole: "ADMINISTRADOR",
    readOnly: true
  },
  grupos_repetidos: {
    minReadRole: "VENDEDOR",
    minWriteRole: "GERENTE",
    minDeleteRole: "ADMINISTRADOR",
    readOnly: true
  },
  repetidos: {
    minReadRole: "VENDEDOR",
    minWriteRole: "GERENTE",
    minDeleteRole: "ADMINISTRADOR",
    readOnly: true
  },
  caracteristicas_tecnicas: {
    minReadRole: "VENDEDOR",
    minWriteRole: "SECRETARIO",
    minDeleteRole: "GERENTE"
  },
  caracteristicas_visuais: {
    minReadRole: "VENDEDOR",
    minWriteRole: "SECRETARIO",
    minDeleteRole: "GERENTE"
  },
  carro_caracteristicas_tecnicas: {
    minReadRole: "VENDEDOR",
    minWriteRole: "SECRETARIO",
    minDeleteRole: "GERENTE"
  },
  carro_caracteristicas_visuais: {
    minReadRole: "VENDEDOR",
    minWriteRole: "SECRETARIO",
    minDeleteRole: "GERENTE"
  },
  usuarios_acesso: {
    minReadRole: "ADMINISTRADOR",
    minWriteRole: "ADMINISTRADOR",
    minDeleteRole: "ADMINISTRADOR",
    readOnly: true
  },
  lookup_locations: {
    minReadRole: "VENDEDOR",
    minWriteRole: "ADMINISTRADOR",
    minDeleteRole: "ADMINISTRADOR"
  },
  lookup_sale_statuses: {
    minReadRole: "VENDEDOR",
    minWriteRole: "ADMINISTRADOR",
    minDeleteRole: "ADMINISTRADOR"
  },
  lookup_announcement_statuses: {
    minReadRole: "VENDEDOR",
    minWriteRole: "ADMINISTRADOR",
    minDeleteRole: "ADMINISTRADOR"
  },
  lookup_vehicle_states: {
    minReadRole: "VENDEDOR",
    minWriteRole: "ADMINISTRADOR",
    minDeleteRole: "ADMINISTRADOR"
  },
  lookup_user_roles: {
    minReadRole: "ADMINISTRADOR",
    minWriteRole: "ADMINISTRADOR",
    minDeleteRole: "ADMINISTRADOR"
  },
  lookup_user_statuses: {
    minReadRole: "ADMINISTRADOR",
    minWriteRole: "ADMINISTRADOR",
    minDeleteRole: "ADMINISTRADOR"
  },
  lookup_audit_actions: {
    minReadRole: "GERENTE",
    minWriteRole: "ADMINISTRADOR",
    minDeleteRole: "ADMINISTRADOR"
  },
  log_alteracoes: {
    minReadRole: "GERENTE",
    minWriteRole: "ADMINISTRADOR",
    minDeleteRole: "ADMINISTRADOR",
    readOnly: true
  }
};
