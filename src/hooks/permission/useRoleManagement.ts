
import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { UserRoleType } from "@/types/permission";
import { 
  updateUserRole, 
  canChangeUserRole, 
  canDeleteRole, 
  canEditRole 
} from "@/services/permission/roleManagementService";

/**
 * Hook for managing user role operations
 * 
 * @param currentUserRole The role of the current user
 * @returns Role management functions and state
 */
export const useRoleManagement = (currentUserRole: UserRoleType) => {
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Change a user's role with business rule validations
   */
  const changeUserRole = async (userId: string, newRole: UserRoleType, currentRole: UserRoleType) => {
    try {
      setIsProcessing(true);
      
      // Validate if current user can change the target user's role
      if (!canChangeUserRole(currentRole, currentUserRole)) {
        if (currentRole === 'Administrador') {
          toast.error("Não é possível alterar o cargo de um Administrador");
        } else if (currentUserRole === 'Gerente' && currentRole === 'Gerente') {
          toast.error("Gerentes não podem alterar o cargo de outros Gerentes");
        } else {
          toast.error("Você não tem permissão para alterar este cargo");
        }
        return false;
      }
      
      // If promoting to Administrador, confirm as this will demote the current Admin
      if (newRole === 'Administrador') {
        // In a real app, we would show a confirmation dialog here
        console.log("Esta ação irá rebaixar o Administrador atual para Vendedor.");
      }
      
      const result = await updateUserRole(userId, newRole);
      
      if (result.success) {
        toast.success(result.message || "Cargo atualizado com sucesso");
        return true;
      } else {
        toast.error(result.message || "Erro ao atualizar cargo");
        return false;
      }
    } catch (err) {
      console.error("Erro ao atualizar cargo:", err);
      toast.error("Erro ao processar atualização de cargo");
      return false;
    } finally {
      setIsProcessing(false);
    }
  };
  
  /**
   * Check if current user can edit the specified role
   */
  const checkCanEditRole = (role: string): boolean => {
    return canEditRole(role, currentUserRole);
  };
  
  /**
   * Check if current user can delete the specified role
   */
  const checkCanDeleteRole = (role: string): boolean => {
    return canDeleteRole(role, currentUserRole);
  };

  return {
    changeUserRole,
    canEditRole: checkCanEditRole,
    canDeleteRole: checkCanDeleteRole,
    isProcessing
  };
};
