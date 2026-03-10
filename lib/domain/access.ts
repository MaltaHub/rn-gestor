export const ROLE_ORDER = ["VENDEDOR", "SECRETARIO", "GERENTE", "ADMINISTRADOR"] as const;

export type AppRole = (typeof ROLE_ORDER)[number];

export function parseAppRole(value: string | null | undefined): AppRole | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  return ROLE_ORDER.includes(normalized as AppRole) ? (normalized as AppRole) : null;
}

export function hasRequiredRole(role: AppRole, minRole: AppRole) {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minRole);
}
