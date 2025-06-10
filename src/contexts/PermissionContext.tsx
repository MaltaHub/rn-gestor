
import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { AppArea, PermissionContextType } from "@/types/permission";
import { fetchUserProfileAndPermissions } from "@/utils/permissionUtils";
import { loadPermissionsFromDatabase } from "@/utils/permissionSync";

// Create the context
const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [permissionLevels, setPermissionLevels] = useState<Record<AppArea, number>>({
    inventory: 1,
    vehicle_details: 0,
    add_vehicle: 0,
    sales: 1,
    sales_dashboard: 0,
    edit_vehicle: 0,
    advertisements: 0,
    pendings: 1,
    admin_panel: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [profileExists, setProfileExists] = useState(false);
  const [roleLevel, setRoleLevel] = useState<number | null>(null);

  // Function to create a user profile if it doesn't exist
  const createUserProfile = async (userId: string, name: string, birthdate?: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          name,
          role: 'Usuario',
          role_level: 1,
          birthdate: birthdate || null
        });

      if (error) {
        console.error("Error creating user profile:", error);
        toast.error("Error creating user profile");
        return;
      }

      // Reload permissions
      loadUserProfileAndPermissions();
    } catch (error) {
      console.error("Error creating user profile:", error);
      toast.error("Error creating user profile");
    }
  };

  // Function to complete the profile of the logged-in user
  const completeUserProfile = async (name: string, birthdate: string) => {
    if (!user) return false;
    
    try {
      setIsLoading(true);
      
      // Get the current user to ensure we have the correct ID
      const { data: authData, error: authError } = await supabase.auth.getUser();
      
      if (authError || !authData.user) {
        console.error("Error getting authenticated user:", authError);
        toast.error("Error verifying authentication");
        return false;
      }
      
      const userId = authData.user.id;
      console.log("Completing profile for user ID:", userId);
      
      const { error } = await supabase
        .from('user_profiles')
        .update({
          name,
          birthdate
        })
        .eq('id', userId);
        
      if (error) {
        console.error("Error updating profile:", error);
        toast.error("Error updating profile");
        return false;
      }
      
      toast.success("Profile updated successfully");
      
      // Reload permissions after updating profile
      await loadUserProfileAndPermissions();
      return true;
    } catch (error) {
      console.error("Error completing profile:", error);
      toast.error("Error completing user profile");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Load user profile and permissions with database integration
  const loadUserProfileAndPermissions = async () => {
    if (!user) {
      setIsLoading(false);
      setProfileExists(false);
      setPermissionLevels({
        inventory: 1,
        vehicle_details: 0,
        add_vehicle: 0,
        sales: 1,
        sales_dashboard: 0,
        edit_vehicle: 0,
        advertisements: 0,
        pendings: 1,
        admin_panel: 0
      });
      setRoleLevel(null);
      return;
    }

    try {
      setIsLoading(true);
      
      // Carregar permissões do banco de dados
      const permissionMatrix = await loadPermissionsFromDatabase();
      
      const result = await fetchUserProfileAndPermissions(user.id);

      console.log("Result from fetchUserProfileAndPermissions:", result);

      setProfileExists(result.profileExists);
      setUserRole(result.userRole);
      setRoleLevel(result.roleLevel);
      console.log("Role level set in context:", result.roleLevel);

      // Usar permissões do banco se disponíveis, senão usar do arquivo
      const finalPermissions: Record<AppArea, number> = {
        inventory: 1,
        vehicle_details: 0,
        add_vehicle: 0,
        sales: 1,
        sales_dashboard: 0,
        edit_vehicle: 0,
        advertisements: 0,
        pendings: 1,
        admin_panel: 0
      };

      // Aplicar permissões do banco baseadas no role do usuário
      if (result.userRole && permissionMatrix) {
        Object.keys(finalPermissions).forEach(area => {
          const areaKey = area as AppArea;
          if (permissionMatrix[area] && permissionMatrix[area][result.userRole!]) {
            finalPermissions[areaKey] = permissionMatrix[area][result.userRole!];
          }
        });
      }

      // Garantir níveis mínimos para áreas críticas
      finalPermissions.inventory = Math.max(finalPermissions.inventory, 1);
      finalPermissions.sales = Math.max(finalPermissions.sales, 1);
      finalPermissions.pendings = Math.max(finalPermissions.pendings, 1);

      setPermissionLevels(finalPermissions);
      console.log("Permissões carregadas do banco:", finalPermissions);
    } catch (error) {
      console.error("Erro ao carregar permissões:", error);
      setPermissionLevels({
        inventory: 1,
        vehicle_details: 0,
        add_vehicle: 0,
        sales: 1,
        sales_dashboard: 0,
        edit_vehicle: 0,
        advertisements: 0,
        pendings: 1,
        admin_panel: 0
      });
      setRoleLevel(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Load profile and permissions when user changes
  useEffect(() => {
    loadUserProfileAndPermissions();
  }, [user]);

  // Function to check if the user has sufficient permission for an area
  const checkPermission = (area: AppArea, requiredLevel: number): boolean => {
    console.log(`Verificando permissão: área=${area}, nível requerido=${requiredLevel}, nível atual=${permissionLevels[area]}, role_level=${roleLevel}`);
    
    if (!user) return false;

    // Verificar role_level como fallback
    if (roleLevel !== null && roleLevel >= requiredLevel) {
      return true;
    }

    return permissionLevels[area] >= requiredLevel;
  };

  return (
    <PermissionContext.Provider value={{ 
      userRole, 
      permissionLevels, 
      checkPermission, 
      isLoading,
      createUserProfile,
      completeUserProfile,
      profileExists,
      roleLevel
    }}>
      {children}
    </PermissionContext.Provider>
  );
};

// Hook to use the permission context
export const usePermission = () => {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error("usePermission must be used within a PermissionProvider");
  }
  return context;
};
