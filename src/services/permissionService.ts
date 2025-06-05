import { permissionRules } from "@/utils/permissionRules";
import { AppArea } from "@/types/permission";

interface PermissionCheckResult {
  hasAccess: boolean;
  reason?: string;
}

export const checkPermission = (
  area: AppArea,
  userRole: string | null,
  roleLevel: number | null
): PermissionCheckResult => {
  const rule = permissionRules[area];

  // Liberar acesso se não houver regra definida para a área
  if (!rule) {
    console.warn(`Área "${area}" não possui regras definidas. Acesso liberado.`);
    return { hasAccess: true };
  }

  const requiredLevel = rule.roles[userRole || ""];

  if (requiredLevel === undefined) {
    console.warn(`Cargo "${userRole}" não encontrado nas regras de permissão para a área "${area}".`);
    return {
      hasAccess: false,
      reason: `Seu cargo (${userRole}) não permite acessar esta funcionalidade (${area}).`,
    };
  }

  if (roleLevel === null || roleLevel < requiredLevel) {
    console.warn(`Nível hierárquico insuficiente: necessário ${requiredLevel}, atual ${roleLevel}.`);
    return {
      hasAccess: false,
      reason: `Seu nível hierárquico (${roleLevel}) é insuficiente para acessar esta funcionalidade (${area}).`,
    };
  }

  return { hasAccess: true };
};
