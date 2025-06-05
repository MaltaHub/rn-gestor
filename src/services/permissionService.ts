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

  if (!rule) {
    return { hasAccess: false, reason: "Área não encontrada." };
  }

  if (!rule.requiredRoles.includes(userRole || "")) {
    return {
      hasAccess: false,
      reason: `Seu cargo (${userRole}) não permite acessar esta funcionalidade (${area}).`,
    };
  }

  if (roleLevel === null || roleLevel < rule.requiredLevel) {
    return {
      hasAccess: false,
      reason: `Seu nível hierárquico (${roleLevel}) é insuficiente para acessar esta funcionalidade (${area}).`,
    };
  }

  return { hasAccess: true };
};
