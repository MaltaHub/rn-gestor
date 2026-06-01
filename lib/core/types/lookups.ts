export type LookupItem = {
  code: string;
  name: string;
};

export type LookupsPayload = {
  user_roles: LookupItem[];
  user_statuses: LookupItem[];
  sale_statuses: LookupItem[];
  announcement_statuses: LookupItem[];
  locations: LookupItem[];
  vehicle_states: LookupItem[];
  // Canais de origem do cliente na venda (instagram, lead, indicacao, etc.).
  canais_cliente: LookupItem[];
  // Dominios de documentos (parser de nomes de arquivo + edicao manual).
  tipos_processo: LookupItem[];
  propositos: LookupItem[];
  estados_pericia: LookupItem[];
  estados_chave_reserva: LookupItem[];
  estados_transferencia: LookupItem[];
  // Lista de usuarios aprovados com auth_user_id, usada para seletor de
  // vendedor no dialog de venda. code = auth_user_id, name = nome.
  usuarios: LookupItem[];
};

export const EMPTY_LOOKUPS: LookupsPayload = {
  user_roles: [],
  user_statuses: [],
  sale_statuses: [],
  announcement_statuses: [],
  locations: [],
  vehicle_states: [],
  canais_cliente: [],
  tipos_processo: [],
  propositos: [],
  estados_pericia: [],
  estados_chave_reserva: [],
  estados_transferencia: [],
  usuarios: []
};
