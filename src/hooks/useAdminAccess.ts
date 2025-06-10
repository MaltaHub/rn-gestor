
import { usePermission } from "@/contexts/PermissionContext";

export const useAdminAccess = () => {
  const { userRole, roleLevel } = usePermission();
  
  const isAdmin = userRole === "Administrador" && roleLevel >= 10;
  
  return {
    isAdmin,
    canAccessAdminPanel: isAdmin
  };
};
