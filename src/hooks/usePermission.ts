
import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { UserRoleType } from "@/types/permission";
import { RoleUpdateResult, toUserRole, canChangeUserRole, canDeleteRole, canEditRole, updateUserRole } from "@/utils/permission";
import { FeatureId, FeaturePermission } from "@/types/featurePermissions";

// Hook for managing user role operations
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

/**
 * Hook to obtain the list of roles in the system
 */
export const useRoles = () => {
  const { data: roles, isLoading, error } = useQuery({
    queryKey: ['roles'],
    queryFn: async (): Promise<UserRoleType[]> => {
      try {
        // Call the edge function to fetch roles
        const { data, error } = await supabase.functions.invoke<{ roles: string[] }>('ler-cargos');
        
        if (error) {
          console.error('Erro ao buscar cargos:', error);
          throw new Error('Falha ao buscar cargos');
        }
        
        if (!data || !data.roles) {
          console.warn('Nenhum cargo encontrado, usando lista padrão');
          return ['Usuário', 'Vendedor', 'Gerente', 'Administrador'] as UserRoleType[];
        }
        
        return data.roles as UserRoleType[];
      } catch (err) {
        console.error('Erro ao buscar cargos:', err);
        toast.error('Não foi possível carregar a lista de cargos');
        // Fallback to default list in case of error
        return ['Usuário', 'Vendedor', 'Gerente', 'Administrador'] as UserRoleType[];
      }
    },
  });

  return {
    roles: roles || ['Usuário', 'Vendedor', 'Gerente', 'Administrador'] as UserRoleType[],
    isLoading,
    error
  };
};

// Mock feature permissions data since we don't have the feature_permissions table
const mockFeaturePermissions: FeaturePermission[] = [
  {
    featureId: 'view-inventory',
    area: 'inventory',
    requiredLevel: 1,
    description: 'View inventory of vehicles'
  },
  {
    featureId: 'edit-vehicle',
    area: 'inventory',
    requiredLevel: 2,
    description: 'Edit vehicle details'
  },
  {
    featureId: 'delete-vehicle',
    area: 'inventory',
    requiredLevel: 7,
    description: 'Delete vehicles from inventory'
  },
  {
    featureId: 'add-vehicle',
    area: 'add_vehicle',
    requiredLevel: 5,
    description: 'Add new vehicles to inventory'
  },
  {
    featureId: 'view-vehicle-details',
    area: 'vehicle_details',
    requiredLevel: 1,
    description: 'View detailed vehicle information'
  }
];

// Hook to fetch feature permissions
export const useFeaturePermissions = () => {
  const {
    data: featurePermissions = mockFeaturePermissions,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['featurePermissions'],
    queryFn: async () => {
      // Since the feature_permissions table doesn't exist,
      // we'll use our mock data instead of fetching from the database
      console.log('Using mock feature permissions data');
      return mockFeaturePermissions;
    },
  });

  return {
    featurePermissions,
    isLoading,
    error,
  };
};
