
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { UserRoleType } from "@/types/permission";

/**
 * Updates a user's role with business rules enforcement
 * 
 * @param userId The ID of the user whose role is being changed
 * @param newRole The new role to assign
 * @param currentUserRole The role of the user making the change
 * @returns Result object indicating success and any message
 */
export async function updateUserRole(
  userId: string, 
  newRole: UserRoleType,
  currentUserRole: UserRoleType
): Promise<{ success: boolean; message?: string; }> {
  try {
    // Rule 1: Verify current user has permission to change roles
    if (currentUserRole !== 'Administrador' && currentUserRole !== 'Gerente') {
      return { 
        success: false, 
        message: "Você não tem permissão para alterar cargos" 
      };
    }

    // Get the current role of the target user
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single();
      
    if (userError || !userData) {
      console.error("Erro ao verificar usuário:", userError);
      return { 
        success: false, 
        message: "Erro ao verificar informações do usuário" 
      };
    }

    const currentRole = userData.role as UserRoleType;

    // Rule 2: Administradores cannot have their role changed
    if (currentRole === 'Administrador') {
      return { 
        success: false, 
        message: "Não é possível alterar o cargo de um Administrador" 
      };
    }
    
    // Rule 3: Only Administrador can change a Gerente's role
    if (currentRole === 'Gerente' && currentUserRole !== 'Administrador') {
      return { 
        success: false, 
        message: "Apenas Administradores podem alterar o cargo de um Gerente" 
      };
    }
    
    // Rule 4: Gerente cannot promote to Administrador
    if (newRole === 'Administrador' && currentUserRole !== 'Administrador') {
      return { 
        success: false, 
        message: "Apenas Administradores podem definir o cargo de Administrador" 
      };
    }

    // If changing to Administrador, demote the current admin to Vendedor first
    if (newRole === 'Administrador') {
      const { data: currentAdmin, error: adminError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('role', 'Administrador')
        .maybeSingle();

      if (adminError) {
        console.error("Erro ao verificar administrador atual:", adminError);
        return { 
          success: false, 
          message: "Erro ao verificar administrador atual" 
        };
      }

      // If there's a current admin and it's a different user, demote them
      if (currentAdmin && currentAdmin.id !== userId) {
        const { error: demoteError } = await supabase
          .from('user_profiles')
          .update({ role: 'Vendedor' })
          .eq('id', currentAdmin.id);
          
        if (demoteError) {
          console.error("Erro ao rebaixar administrador atual:", demoteError);
          return { 
            success: false, 
            message: "Erro ao atualizar hierarquia de administradores" 
          };
        }
      }
    }
    
    // Update the role
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', userId);
      
    if (updateError) {
      console.error("Erro ao atualizar cargo:", updateError);
      return { 
        success: false, 
        message: "Erro ao atualizar cargo do colaborador" 
      };
    }
    
    // Record the role change in audit log (if we had one)
    // For now, this is just a placeholder for future implementation
    console.log(`Role changed: User ${userId} changed from ${currentRole} to ${newRole} by a ${currentUserRole}`);
    
    return { 
      success: true, 
      message: `Cargo atualizado para ${newRole}` 
    };
  } catch (err) {
    console.error("Erro ao atualizar cargo:", err);
    return { 
      success: false, 
      message: "Erro ao processar atualização de cargo" 
    };
  }
}

/**
 * Gets all user roles with their associated permissions
 */
export async function getUserRolesWithPermissions() {
  try {
    const { data: rolesData, error: rolesError } = await supabase
      .from('role_permissions')
      .select('*');
      
    if (rolesError) {
      console.error("Erro ao buscar permissões:", rolesError);
      throw new Error("Erro ao carregar informações de permissões");
    }
    
    return rolesData;
  } catch (err) {
    console.error("Erro ao buscar permissões:", err);
    throw new Error("Erro ao carregar informações de permissões");
  }
}

/**
 * Checks if a role can be deleted
 * 
 * @param role The role to check
 * @param currentUserRole The role of the user attempting the deletion
 */
export function canDeleteRole(role: string, currentUserRole: string): boolean {
  // Cannot delete Usuário (base role)
  if (role === 'Usuário') return false;
  
  // Cannot delete Gerente role
  if (role === 'Gerente') return false;
  
  // Only Administrador can delete roles
  return currentUserRole === 'Administrador';
}

/**
 * Checks if a role can be edited
 * 
 * @param role The role to check
 * @param currentUserRole The role of the user attempting the edit
 */
export function canEditRole(role: string, currentUserRole: string): boolean {
  // Gerente role cannot be edited by anyone
  if (role === 'Gerente') return false;
  
  // Only Administrador can edit roles
  return currentUserRole === 'Administrador';
}

/**
 * Checks if a user's role can be changed
 * 
 * @param targetUserRole The current role of the user being changed
 * @param currentUserRole The role of the user making the change
 */
export function canChangeUserRole(targetUserRole: string, currentUserRole: string): boolean {
  // Cannot change Administrator's role
  if (targetUserRole === 'Administrador') return false;
  
  // Gerente can only change roles of Vendedor
  if (currentUserRole === 'Gerente' && targetUserRole !== 'Vendedor') {
    return false;
  }
  
  // Administrador can change any role except Administrador
  return currentUserRole === 'Administrador' || currentUserRole === 'Gerente';
}
