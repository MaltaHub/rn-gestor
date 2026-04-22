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
};

export const EMPTY_LOOKUPS: LookupsPayload = {
  user_roles: [],
  user_statuses: [],
  sale_statuses: [],
  announcement_statuses: [],
  locations: [],
  vehicle_states: []
};
