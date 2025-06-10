
import { usePermission } from "@/contexts/PermissionContext";

export const useAdminAccess = () => {
  const { userRole, roleLevel, checkPermission } = usePermission();
  
  console.log("Admin access check:", { userRole, roleLevel });
  
  const isAdmin = userRole === "Administrador" && roleLevel && roleLevel >= 9; // Ajustado para nível 9
  const canAccessAdminPanel = checkPermission("admin_panel", 9); // Ajustado para nível 9
  
  console.log("Admin access result:", { isAdmin, canAccessAdminPanel });
  
  return {
    isAdmin,
    canAccessAdminPanel: isAdmin || canAccessAdminPanel
  };
};
