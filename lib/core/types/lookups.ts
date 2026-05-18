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
  usuarios: []
};
